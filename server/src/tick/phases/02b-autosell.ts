import type { ResourceType } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

export function processAutoSell(store: WorldStore) {
  for (const building of store.buildings.values()) {
    if (building.class !== "port" || building.status !== "active") continue;
    if (!building.auto_sell) continue;

    for (const [resource, rule] of Object.entries(building.auto_sell)) {
      if (!rule) continue;
      const res = resource as ResourceType;
      const bufAvail = building.output_buffer?.[res] ?? 0;
      const invAvail = building.inventory[res] ?? 0;
      const available = bufAvail + invAvail;
      if (available <= 0) continue;

      const price = store.marketPrices[res];

      // Check min_price constraint
      if (rule.mode === "min_rate" && rule.min_price != null && price < rule.min_price) {
        continue;
      }

      // Sell all available from both storages, credit money to port
      const revenue = Math.round(available * price * 100) / 100;
      if (building.output_buffer) building.output_buffer[res] = 0;
      building.inventory[res] = 0;
      building.inventory.money = (building.inventory.money ?? 0) + revenue;

      // Supply pressure
      store.supplyPressure[res] = (store.supplyPressure[res] ?? 0) + available;

      store.pushEvent(
        "auto_sell",
        {
          building_id: building.entity_id,
          resource,
          amount: available,
          price,
          revenue,
          player_id: building.owner_id,
        },
        building.map_key
      );
    }
  }
}
