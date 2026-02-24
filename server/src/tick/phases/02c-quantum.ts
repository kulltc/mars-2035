import { type Building, type MaterialType, remainingCapacity } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

const MAX_RULES_PER_RELAY = 3;
const MAX_THROUGHPUT_PER_RULE = 3;

function pickTransfers(materials: MaterialType[]): MaterialType[] {
  if (materials.length <= 0) return [];
  if (materials.length === 1) return [materials[0], materials[0], materials[0]];
  if (materials.length === 2) {
    const [a, b] = materials;
    return Math.random() < 0.5 ? [a, a, b] : [a, b, b];
  }
  return materials.slice(0, MAX_THROUGHPUT_PER_RULE);
}

function transferOneUnit(source: Building, destination: Building, material: MaterialType): boolean {
  const available = source.inventory[material] ?? 0;
  const buffer = source.buffer_stock?.[material] ?? 0;
  if (available - buffer < 1) return false;

  const remaining = remainingCapacity(destination.inventory, destination.capacity);
  if (remaining < 1) return false;

  const maxStock = destination.max_stock?.[material];
  if (maxStock !== undefined && (destination.inventory[material] ?? 0) >= maxStock) return false;

  source.inventory[material] = available - 1;
  destination.inventory[material] = (destination.inventory[material] ?? 0) + 1;
  return true;
}

export function processQuantumRelays(store: WorldStore) {
  for (const relay of store.buildings.values()) {
    if (relay.class !== "quantum_relay") continue;
    if (relay.status !== "active") continue;
    if (!relay.quantum_rules || relay.quantum_rules.length === 0) continue;

    const rules = relay.quantum_rules.slice(0, MAX_RULES_PER_RELAY);

    for (const rule of rules) {
      const destination = store.buildings.get(rule.to_building_id);
      if (!destination) continue;
      if (destination.owner_id !== relay.owner_id) continue;
      if (destination.class !== "quantum_relay") continue;
      if (destination.status !== "active") continue;
      if (destination.entity_id === relay.entity_id) continue;

      const selected = Array.from(new Set(rule.materials)).filter((mat) => mat !== "money");
      const availableSelected = selected.filter((mat) => {
        const available = relay.inventory[mat] ?? 0;
        const buffer = relay.buffer_stock?.[mat] ?? 0;
        return available - buffer >= 1;
      });
      if (availableSelected.length === 0) continue;

      const picks = pickTransfers(availableSelected);
      const moved: Partial<Record<MaterialType, number>> = {};
      let movedTotal = 0;

      for (const material of picks) {
        if (movedTotal >= MAX_THROUGHPUT_PER_RULE) break;
        const ok = transferOneUnit(relay, destination, material);
        if (!ok) continue;

        moved[material] = (moved[material] ?? 0) + 1;
        movedTotal += 1;
      }

      if (movedTotal > 0) {
        const mapKey = relay.map_key;
        store.pushEvent(
          "transfer",
          {
            from_building_id: relay.entity_id,
            to_building_id: destination.entity_id,
            amount: movedTotal,
            materials: moved,
            quantum: true,
          },
          mapKey,
        );
      }
    }
  }
}
