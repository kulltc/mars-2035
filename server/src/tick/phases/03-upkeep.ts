import type { MapKey } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

export function processUpkeep(store: WorldStore) {
  // Group upkeep by (owner, map) → deduct from admin outpost
  const byPlayerMap = new Map<string, { playerId: string; mapKey: MapKey; total: number }>();

  for (const building of store.buildings.values()) {
    if (building.upkeep_per_tick <= 0) continue;
    if (building.status === "suspended") continue;

    const key = `${building.owner_id}:${building.map_key}`;
    const entry = byPlayerMap.get(key);
    if (entry) {
      entry.total += building.upkeep_per_tick;
    } else {
      byPlayerMap.set(key, {
        playerId: building.owner_id,
        mapKey: building.map_key,
        total: building.upkeep_per_tick,
      });
    }
  }

  for (const { playerId, mapKey, total } of byPlayerMap.values()) {
    const player = store.players.get(playerId);
    if (!player) continue;

    const account = player.map_accounts[mapKey];
    if (!account?.admin_outpost_building_id) continue;

    const adminOutpost = store.buildings.get(account.admin_outpost_building_id);
    if (!adminOutpost) continue;

    const money = adminOutpost.inventory.money ?? 0;

    if (money >= total) {
      adminOutpost.inventory.money = money - total;
      store.pushEvent(
        "upkeep_charged",
        { player_id: playerId, amount: total },
        mapKey
      );
    } else {
      // Insufficient funds → suspend buildings on this map (not the admin outpost itself)
      adminOutpost.inventory.money = 0;
      for (const building of store.buildings.values()) {
        if (
          building.owner_id === playerId &&
          building.map_key === mapKey &&
          building.status === "active" &&
          building.upkeep_per_tick > 0
        ) {
          building.status = "suspended";
          store.pushEvent(
            "building_suspended",
            { building_id: building.entity_id, reason: "insufficient_funds" },
            mapKey
          );
        }
      }
    }
  }

  // Resume buildings if admin outpost now has enough money
  for (const building of store.buildings.values()) {
    if (building.status !== "suspended") continue;
    const player = store.players.get(building.owner_id);
    if (!player) continue;
    const account = player.map_accounts[building.map_key];
    if (!account?.admin_outpost_building_id) continue;

    const adminOutpost = store.buildings.get(account.admin_outpost_building_id);
    if (!adminOutpost) continue;

    const money = adminOutpost.inventory.money ?? 0;
    if (money >= building.upkeep_per_tick) {
      building.status = "active";
      store.pushEvent(
        "building_resumed",
        { building_id: building.entity_id },
        building.map_key
      );
    }
  }
}
