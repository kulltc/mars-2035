import type { MaterialType } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

export function processRoutes(store: WorldStore) {
  for (const building of store.buildings.values()) {
    if (building.status !== "active") continue;
    if (!building.outgoing_routes || building.outgoing_routes.length === 0) continue;

    for (const route of building.outgoing_routes) {
      const available = building.inventory[route.resource] ?? 0;
      if (available <= 0) continue;

      const dest = store.buildings.get(route.to_building_id);
      if (!dest || dest.status !== "active") continue;
      if (dest.map_key !== building.map_key) continue;

      // Move all available
      const amount = available;
      building.inventory[route.resource] = 0;
      dest.inventory[route.resource as MaterialType] =
        (dest.inventory[route.resource as MaterialType] ?? 0) + amount;

      store.pushEvent(
        "route_executed",
        {
          from_building_id: building.entity_id,
          to_building_id: dest.entity_id,
          resource: route.resource,
          amount,
        },
        building.map_key
      );
    }
  }
}
