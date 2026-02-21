import { TERRITORY_BUILDINGS, type BuildingClass } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

const TERRITORY_SET = new Set<string>(TERRITORY_BUILDINGS as BuildingClass[]);

export function processTaxes(store: WorldStore) {
  for (const [mapKey, pool] of store.taxPool) {
    if (pool <= 0) continue;

    // Count territory buildings per player on this map
    const playerBuildings = new Map<string, number>();
    let total = 0;
    for (const b of store.buildings.values()) {
      if (b.map_key === mapKey && b.status === "active" && TERRITORY_SET.has(b.class)) {
        playerBuildings.set(b.owner_id, (playerBuildings.get(b.owner_id) ?? 0) + 1);
        total++;
      }
    }

    if (total === 0) continue;

    // Distribute proportionally to each player's admin_outpost on this map
    for (const [playerId, count] of playerBuildings) {
      const effectiveCount = Math.max(0, count - 1);
      const share = total > 0 ? effectiveCount / total : 0;
      const amount = Math.round(pool * share * 100) / 100;
      if (amount <= 0) continue;

      const player = store.players.get(playerId);
      if (!player) continue;
      const account = player.map_accounts[mapKey];
      if (!account?.admin_outpost_building_id) continue;
      const adminOutpost = store.buildings.get(account.admin_outpost_building_id);
      if (!adminOutpost) continue;

      adminOutpost.inventory.money = (adminOutpost.inventory.money ?? 0) + amount;

      store.pushEvent(
        "tax_collected",
        {
          player_id: playerId,
          amount,
          share,
          map_key: mapKey,
        },
        mapKey
      );
    }
  }

  // Clear tax pool after distribution
  store.taxPool.clear();
}
