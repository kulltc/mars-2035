import { remainingCapacity, remainingOutputCapacity, BUILDING_DEFS, type MaterialType } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

export function processProduction(store: WorldStore) {
  // Mine production
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

  // Recipe-based processing buildings
  for (const building of store.buildings.values()) {
    if (building.status !== "active") continue;
    const def = BUILDING_DEFS[building.class];
    if (!def.recipe) continue;

    const { inputs, output, output_amount } = def.recipe;

    // Check all inputs are available
    let canProduce = true;
    for (const [mat, needed] of Object.entries(inputs)) {
      if (!needed) continue;
      const have = building.inventory[mat as MaterialType] ?? 0;
      if (have < needed) { canProduce = false; break; }
    }
    if (!canProduce) continue;

    // Check output capacity (use output buffer if available)
    const outputBuf = building.output_buffer ?? {};
    const outputCap = def.output_capacity;
    const remaining = outputCap != null
      ? remainingOutputCapacity(outputBuf, outputCap)
      : remainingCapacity(building.inventory, building.capacity);
    if (remaining < output_amount) continue;

    // Consume inputs
    for (const [mat, needed] of Object.entries(inputs)) {
      if (!needed) continue;
      building.inventory[mat as MaterialType] =
        (building.inventory[mat as MaterialType] ?? 0) - needed;
    }

    // Produce output (write to output buffer if available)
    if (building.output_buffer != null) {
      building.output_buffer[output] = (building.output_buffer[output] ?? 0) + output_amount;
    } else {
      building.inventory[output] = (building.inventory[output] ?? 0) + output_amount;
    }

    store.pushEvent(
      "processing",
      {
        building_id: building.entity_id,
        material: output,
        amount: output_amount,
        inputs,
      },
      building.map_key
    );
  }
}
