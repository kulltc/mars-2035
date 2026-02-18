import { type MapKey, WORKER_UPKEEP, SUSPENSION_DESTROY_TICKS } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";
import { tileKey } from "@mars-2035/shared";

export function processUpkeep(store: WorldStore) {
  // ── Destroy buildings suspended too long ──
  for (const building of [...store.buildings.values()]) {
    if (building.status !== "suspended") continue;
    if (building.suspended_at_tick == null) continue;
    if (store.tick - building.suspended_at_tick < SUSPENSION_DESTROY_TICKS) continue;
    // Don't destroy admin outposts
    if (building.class === "admin_outpost") continue;

    // Destroy the building
    store.pushEvent("building_destroyed", {
      building_id: building.entity_id,
      building_class: building.class,
      owner_id: building.owner_id,
      reason: "suspended_too_long",
    }, building.map_key);

    // Clear tile reference
    const mapTiles = store.tiles.get(building.map_key);
    if (mapTiles) {
      const tk = tileKey(building.location.x, building.location.y);
      const tile = mapTiles.get(tk);
      if (tile) delete tile.building_id;
    }

    // Remove any tasks referencing this building
    for (const [taskId, task] of store.taskQueue) {
      if (
        (task.type === "pickup" && (task.from_building_id === building.entity_id || task.to_building_id === building.entity_id)) ||
        (task.type === "dropoff" && task.building_id === building.entity_id) ||
        (task.type === "construct" && task.building_id === building.entity_id)
      ) {
        store.taskQueue.delete(taskId);
      }
    }

    // Clear worker task references to this building
    for (const worker of store.workers.values()) {
      if (!worker.current_task_id) continue;
      if (!store.taskQueue.has(worker.current_task_id)) {
        worker.current_task_id = undefined;
        worker.state = "idle";
      }
    }

    store.buildings.delete(building.entity_id);
  }

  // ── Compute upkeep by (owner, map) ──
  const byPlayerMap = new Map<string, { playerId: string; mapKey: MapKey; buildingUpkeep: number }>();

  for (const building of store.buildings.values()) {
    if (building.upkeep_per_tick <= 0) continue;
    if (building.status === "suspended" || building.status === "constructing") continue;

    const key = `${building.owner_id}:${building.map_key}`;
    const entry = byPlayerMap.get(key);
    if (entry) {
      entry.buildingUpkeep += building.upkeep_per_tick;
    } else {
      byPlayerMap.set(key, {
        playerId: building.owner_id,
        mapKey: building.map_key,
        buildingUpkeep: building.upkeep_per_tick,
      });
    }
  }

  // Ensure entries exist for players with workers but no active buildings
  for (const worker of store.workers.values()) {
    const key = `${worker.owner_id}:${worker.map_key}`;
    if (!byPlayerMap.has(key)) {
      byPlayerMap.set(key, {
        playerId: worker.owner_id,
        mapKey: worker.map_key,
        buildingUpkeep: 0,
      });
    }
  }

  // ── Charge upkeep and manage worker activation ──
  for (const { playerId, mapKey, buildingUpkeep } of byPlayerMap.values()) {
    const player = store.players.get(playerId);
    if (!player) continue;

    const account = player.map_accounts[mapKey];
    if (!account?.admin_outpost_building_id) continue;

    const adminOutpost = store.buildings.get(account.admin_outpost_building_id);
    if (!adminOutpost) continue;

    // Count active workers and total workers for this owner+map
    const mapWorkers = [...store.workers.values()].filter(
      (w) => w.owner_id === playerId && w.map_key === mapKey
    );

    // Determine how many workers we can afford
    const money = adminOutpost.inventory.money ?? 0;
    const moneyAfterBuildings = money - buildingUpkeep;

    if (moneyAfterBuildings >= 0) {
      // Can afford building upkeep — now see how many workers we can afford
      const affordableWorkers = Math.max(1, Math.floor(moneyAfterBuildings / WORKER_UPKEEP));

      // Activate/deactivate workers (keep first N active, deactivate the rest)
      let activeCount = 0;
      for (const w of mapWorkers) {
        if (activeCount < affordableWorkers) {
          if (w.worker_status !== "active") w.worker_status = "active";
          activeCount++;
        } else {
          if (w.worker_status !== "inactive") {
            w.worker_status = "inactive";
            // Cancel current task if any
            if (w.current_task_id) {
              store.taskQueue.delete(w.current_task_id);
              w.current_task_id = undefined;
            }
            w.state = "idle";
          }
        }
      }

      const workerCost = Math.min(activeCount, affordableWorkers) * WORKER_UPKEEP;
      const total = buildingUpkeep + workerCost;

      adminOutpost.inventory.money = money - total;
      store.pushEvent(
        "upkeep_charged",
        { player_id: playerId, amount: total },
        mapKey
      );
    } else {
      // Can't afford building upkeep → suspend buildings, deactivate all workers
      adminOutpost.inventory.money = 0;
      for (const building of store.buildings.values()) {
        if (
          building.owner_id === playerId &&
          building.map_key === mapKey &&
          building.status === "active" &&
          building.upkeep_per_tick > 0
        ) {
          building.status = "suspended";
          building.suspended_at_tick = store.tick;
          store.pushEvent(
            "building_suspended",
            { building_id: building.entity_id, reason: "insufficient_funds" },
            mapKey
          );
        }
      }
      // Deactivate all workers except the first one
      let kept = false;
      for (const w of mapWorkers) {
        if (!kept) {
          if (w.worker_status !== "active") w.worker_status = "active";
          kept = true;
        } else if (w.worker_status !== "inactive") {
          w.worker_status = "inactive";
          if (w.current_task_id) {
            store.taskQueue.delete(w.current_task_id);
            w.current_task_id = undefined;
          }
          w.state = "idle";
        }
      }
    }
  }

  // ── Resume buildings if admin outpost has enough money ──
  // Check total projected upkeep including worker costs
  for (const building of store.buildings.values()) {
    if (building.status !== "suspended") continue;
    const player = store.players.get(building.owner_id);
    if (!player) continue;
    const account = player.map_accounts[building.map_key];
    if (!account?.admin_outpost_building_id) continue;

    const adminOutpost = store.buildings.get(account.admin_outpost_building_id);
    if (!adminOutpost) continue;

    // Compute current active upkeep for this owner+map
    const key = `${building.owner_id}:${building.map_key}`;
    const entry = byPlayerMap.get(key);
    const currentBuildingUpkeep = entry?.buildingUpkeep ?? 0;

    // Count active workers
    const activeWorkerCount = [...store.workers.values()].filter(
      (w) => w.owner_id === building.owner_id && w.map_key === building.map_key && w.worker_status === "active"
    ).length;
    const workerUpkeep = activeWorkerCount * WORKER_UPKEEP;

    const projectedTotal = currentBuildingUpkeep + workerUpkeep + building.upkeep_per_tick;
    const money = adminOutpost.inventory.money ?? 0;

    if (money >= projectedTotal) {
      building.status = "active";
      delete building.suspended_at_tick;
      if (entry) entry.buildingUpkeep += building.upkeep_per_tick;
      store.pushEvent(
        "building_resumed",
        { building_id: building.entity_id },
        building.map_key
      );
    }
  }
}
