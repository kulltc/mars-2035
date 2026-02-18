import { remainingCapacity } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

export function processProduction(store: WorldStore) {
  for (const building of store.buildings.values()) {
    if (building.class !== "mine") continue;
    if (building.status !== "active") continue;
    if (!building.resource_type || !building.production_per_tick) continue;

    const remaining = remainingCapacity(building.inventory, building.capacity);
    if (remaining <= 0) continue;

    const amount = Math.min(building.production_per_tick, remaining);
    building.inventory[building.resource_type] =
      (building.inventory[building.resource_type] ?? 0) + amount;

    store.pushEvent(
      "production",
      {
        building_id: building.entity_id,
        material: building.resource_type,
        amount,
      },
      building.map_key
    );
  }
}
