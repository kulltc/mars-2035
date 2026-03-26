import type { MapKey, Player } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

/**
 * Bankruptcy & decay: for each map a player is on, check if they have only
 * an empty admin outpost (no other buildings, no money in admin outpost).
 * - If they have presence on other maps: decay (remove) the empty admin outpost.
 * - If it's their last map: trigger full bankruptcy (forfeit + bankrupt flag).
 */
export function processBankruptcy(store: WorldStore) {
  for (const player of store.players.values()) {
    const mapKeys = Object.keys(player.map_accounts) as MapKey[];
    if (mapKeys.length === 0) continue;
    if (player.bankrupt) continue;

    // Gather per-map stats
    const emptyMaps: MapKey[] = [];

    for (const mapKey of mapKeys) {
      const account = player.map_accounts[mapKey];
      if (!account?.admin_outpost_building_id) continue;

      let hasNonAdmin = false;
      let adminMoney = 0;

      for (const building of store.buildings.values()) {
        if (building.owner_id !== player.entity_id) continue;
        if (building.map_key !== mapKey) continue;
        if (building.class !== "admin_outpost") {
          hasNonAdmin = true;
          break;
        } else {
          adminMoney += building.inventory.money ?? 0;
        }
      }

      if (hasNonAdmin) continue;
      if (adminMoney > 0) continue;

      emptyMaps.push(mapKey);
    }

    if (emptyMaps.length === 0) continue;

    // How many maps does the player actually have presence on?
    const activeMaps = mapKeys.filter(
      (mk) => player.map_accounts[mk]?.admin_outpost_building_id
    );

    if (emptyMaps.length < activeMaps.length) {
      // Player still has presence elsewhere — just decay the empty admin outposts
      for (const mapKey of emptyMaps) {
        decayMap(store, player.entity_id, mapKey);
        delete player.map_accounts[mapKey];
        console.log(
          `Player ${player.name} (${player.entity_id}) lost admin outpost on ${mapKey} (decayed)`
        );
      }
    } else {
      // All maps are empty — full bankruptcy
      console.log(
        `Player ${player.name} (${player.entity_id}) is bankrupt — auto-forfeiting`
      );
      fullBankruptcy(store, player);
    }
  }
}

/** Remove a player's buildings, workers, ambassadors and tasks on a single map. */
function decayMap(store: WorldStore, playerId: string, mapKey: MapKey) {
  const removedBuildingIds: string[] = [];

  for (const [bid, building] of store.buildings) {
    if (building.owner_id !== playerId || building.map_key !== mapKey) continue;
    removedBuildingIds.push(bid);
    store.buildings.delete(bid);
  }

  for (const [wid, worker] of store.workers) {
    if (worker.owner_id !== playerId || worker.map_key !== mapKey) continue;
    if (worker.current_task_id) store.taskQueue.delete(worker.current_task_id);
    store.workers.delete(wid);
  }

  for (const [ambId, amb] of store.ambassadors) {
    if (amb.owner_id !== playerId || amb.map_key !== mapKey) continue;
    store.ambassadors.delete(ambId);
  }

  // Clean up routes from other buildings that pointed at removed buildings
  for (const b of store.buildings.values()) {
    if (!b.outgoing_routes) continue;
    b.outgoing_routes = b.outgoing_routes.filter(
      (r) => !removedBuildingIds.includes(r.to_building_id)
    );
  }
}

/** Full bankruptcy: wipe all maps, mark player bankrupt. */
function fullBankruptcy(store: WorldStore, player: Player) {
  const playerId = player.entity_id;

  for (const [wid, worker] of store.workers) {
    if (worker.owner_id !== playerId) continue;
    if (worker.current_task_id) store.taskQueue.delete(worker.current_task_id);
    store.workers.delete(wid);
  }

  for (const [ambId, amb] of store.ambassadors) {
    if (amb.owner_id !== playerId) continue;
    store.ambassadors.delete(ambId);
  }
  store.salesTaxHistory.delete(playerId);

  const buildingIds: string[] = [];
  for (const [bid, building] of store.buildings) {
    if (building.owner_id !== playerId) continue;
    buildingIds.push(bid);
    store.buildings.delete(bid);
  }

  for (const b of store.buildings.values()) {
    if (!b.outgoing_routes) continue;
    b.outgoing_routes = b.outgoing_routes.filter(
      (r) => !buildingIds.includes(r.to_building_id)
    );
  }

  for (const [taskId, task] of store.taskQueue) {
    if (task.owner_id === playerId) store.taskQueue.delete(taskId);
  }

  player.map_accounts = {};
  player.research = [];
  player.tutorial_step = 1;
  player.work_areas = [];
  player.bankrupt = true;

  store.pushEvent("player_bankrupt", {
    player_id: playerId,
    name: player.name,
  });
}
