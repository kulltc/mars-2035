import {
  type MaterialType,
  type ResourceType,
  BUILDING_TAX_RATE,
  INVENTORY_TAX_RATE,
  EXPORT_TAX_RATE,
  toDistrictKey,
} from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

export function processTaxes(store: WorldStore) {
  for (const building of store.buildings.values()) {
    const districtKey = toDistrictKey(building.location.dx, building.location.dy);
    const district = store.districts.get(districtKey);
    if (!district || district.contested || !district.owner_id) continue;

    // Skip taxing the district owner's own buildings
    if (building.owner_id === district.owner_id) continue;

    const player = store.players.get(building.owner_id);
    if (!player) continue;
    const account = player.map_accounts[building.map_key];
    if (!account) continue;

    let totalTax = 0;

    // (A) Building tax
    const buildingTax = BUILDING_TAX_RATE[building.class] ?? 0;
    totalTax += buildingTax;

    // (B) Inventory tax
    for (const [mat, amount] of Object.entries(building.inventory)) {
      if (mat === "money" || !amount) continue;
      const rate = INVENTORY_TAX_RATE[mat as ResourceType] ?? 0;
      totalTax += amount * rate;
    }

    if (totalTax <= 0) continue;

    // Deduct from player
    const money = account.assets.money ?? 0;
    const charged = Math.min(money, totalTax);
    account.assets.money = money - charged;

    // Credit to district owner
    const owner = store.players.get(district.owner_id);
    if (owner) {
      // Credit to owner's account on same map
      if (!owner.map_accounts[building.map_key]) {
        owner.map_accounts[building.map_key] = { assets: {} };
      }
      owner.map_accounts[building.map_key].assets.money =
        (owner.map_accounts[building.map_key].assets.money ?? 0) + charged;
    }

    store.pushEvent(
      "tax_charged",
      {
        player_id: building.owner_id,
        district_owner_id: district.owner_id,
        amount: charged,
        building_id: building.entity_id,
      },
      building.map_key
    );
  }

  // (C) Export taxes are collected during export command in phase 01
  // We handle them retroactively here based on export events this tick
  const exportEvents = store.events.filter(
    (e) => e.tick === store.tick && e.type === "export"
  );
  for (const evt of exportEvents) {
    const { player_id, material, amount } = evt.data as {
      player_id: string;
      material: MaterialType;
      amount: number;
    };
    const mapKey = evt.map_key;
    if (!mapKey) continue;

    // Find district for this map
    const parts = mapKey.split(":");
    const districtKey = toDistrictKey(Number(parts[0]), Number(parts[1]));
    const district = store.districts.get(districtKey);
    if (!district || district.contested || !district.owner_id) continue;
    if (player_id === district.owner_id) continue;

    const rate = EXPORT_TAX_RATE[material as ResourceType] ?? 0;
    const tax = Math.floor(amount * rate);
    if (tax <= 0) continue;

    const player = store.players.get(player_id as string);
    if (!player) continue;
    const account = player.map_accounts[mapKey];
    if (!account) continue;

    const money = account.assets.money ?? 0;
    const charged = Math.min(money, tax);
    account.assets.money = money - charged;

    // Credit to district owner
    const owner = store.players.get(district.owner_id);
    if (owner) {
      if (!owner.map_accounts[mapKey]) {
        owner.map_accounts[mapKey] = { assets: {} };
      }
      owner.map_accounts[mapKey].assets.money =
        (owner.map_accounts[mapKey].assets.money ?? 0) + charged;
    }

    store.pushEvent(
      "tax_charged",
      {
        player_id,
        district_owner_id: district.owner_id,
        amount: charged,
        type: "export_tax",
        material,
      },
      mapKey
    );
  }
}
