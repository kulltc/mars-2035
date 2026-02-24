import { NEW_PLAYER_PROTECTION_TICKS, TERRITORY_BUILDINGS, type BuildingClass } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

const TERRITORY_SET = new Set<string>(TERRITORY_BUILDINGS as BuildingClass[]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function expireNewPlayerProtection(store: WorldStore) {
  for (const player of store.players.values()) {
    for (const [mapKey, account] of Object.entries(player.map_accounts)) {
      if (!account.new_player_protection_active) continue;
      if (account.started_at_tick == null) continue;
      if (store.tick - account.started_at_tick < NEW_PLAYER_PROTECTION_TICKS) continue;

      account.new_player_protection_active = false;
      store.pushEvent(
        "new_player_protection_ended",
        {
          player_id: player.entity_id,
          map_key: mapKey,
        },
        mapKey
      );
    }
  }
}

export function processTaxes(store: WorldStore) {
  expireNewPlayerProtection(store);

  // Wealth tax: charge money stored in buildings at 1/100th the sales tax rate.
  for (const building of store.buildings.values()) {
    if (store.isNewPlayerProtectionActive(building.owner_id, building.map_key)) continue;

    const money = building.inventory.money ?? 0;
    if (money <= 0) continue;

    const salesTaxRate = store.getTaxRate(building.map_key);
    if (salesTaxRate <= 0) continue;

    // set wealth tax to zero for now.
    const wealthTaxRate = 0 * salesTaxRate / 100;
    const computedTax = round2(money * wealthTaxRate);
    const taxAmount = Math.min(money, Math.max(1, computedTax));
    if (taxAmount <= 0) continue;

    building.inventory.money = round2(money - taxAmount);
    store.taxPool.set(building.map_key, round2((store.taxPool.get(building.map_key) ?? 0) + taxAmount));
  }

  for (const [mapKey, pool] of store.taxPool) {
    if (pool <= 0) continue;

    // Count territory buildings per player on this map
    const playerBuildings = new Map<string, number>();
    let total = 0;
    for (const b of store.buildings.values()) {
      if (b.map_key === mapKey && b.status === "active" && TERRITORY_SET.has(b.class)) {
        if (store.isNewPlayerProtectionActive(b.owner_id, b.map_key)) continue;
        playerBuildings.set(b.owner_id, (playerBuildings.get(b.owner_id) ?? 0) + 1);
        total++;
      }
    }

    if (total === 0) continue;

    // Distribute proportionally to each player's admin_outpost on this map
    for (const [playerId, count] of playerBuildings) {
      const effectiveCount = Math.max(0, count - 1);
      const share = total > 0 ? effectiveCount / total : 0;
      const amount = round2(pool * share);
      if (amount <= 0) continue;

      const player = store.players.get(playerId);
      if (!player) continue;
      const account = player.map_accounts[mapKey];
      if (!account?.admin_outpost_building_id) continue;
      const adminOutpost = store.buildings.get(account.admin_outpost_building_id);
      if (!adminOutpost) continue;

      adminOutpost.inventory.money = round2((adminOutpost.inventory.money ?? 0) + amount);

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
