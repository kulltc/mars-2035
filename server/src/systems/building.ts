import {
  type Building,
  type BuildingClass,
  type Location,
  type MaterialType,
  type Player,
  BUILDING_DEFS,
  STARTING_MONEY,
  locationToMapKey,
  tileKey,
} from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";

let buildingCounter = 0;

export function setBuildingCounter(n: number) {
  buildingCounter = n;
}

export function placeBuilding(
  store: WorldStore,
  player: Player,
  buildingClass: BuildingClass,
  location: Location
): { ok: true; building: Building } | { ok: false; error: string } {
  const mapKey = locationToMapKey(location);
  const tile = store.getTile(mapKey, location.x, location.y);

  if (!tile) return { ok: false, error: "Invalid tile coordinates" };
  if (tile.building_id) return { ok: false, error: "Tile already has a building" };

  // Admin outpost: max 1 per player per map
  if (buildingClass === "admin_outpost") {
    const account = player.map_accounts[mapKey];
    if (account?.admin_outpost_building_id) {
      return { ok: false, error: "Already have an admin outpost on this map" };
    }
  }

  // Mine / Port: require admin outpost on this map
  if (buildingClass !== "admin_outpost") {
    const account = player.map_accounts[mapKey];
    if (!account?.admin_outpost_building_id) {
      return { ok: false, error: "Must have an admin outpost on this map first" };
    }

    // Deduct building cost from admin outpost inventory
    const adminOutpost = store.buildings.get(account.admin_outpost_building_id);
    if (!adminOutpost) {
      return { ok: false, error: "Admin outpost not found" };
    }

    const def = BUILDING_DEFS[buildingClass];
    for (const [mat, cost] of Object.entries(def.cost)) {
      if (!cost) continue;
      const available = adminOutpost.inventory[mat as MaterialType] ?? 0;
      if (available < cost) {
        return { ok: false, error: `Insufficient ${mat} (need ${cost}, have ${available.toFixed(1)})` };
      }
    }

    // All checks pass — deduct costs
    for (const [mat, cost] of Object.entries(def.cost)) {
      if (!cost) continue;
      adminOutpost.inventory[mat as MaterialType] =
        (adminOutpost.inventory[mat as MaterialType] ?? 0) - cost;
    }
  }

  // Mine: must be on matching resource tile
  if (buildingClass === "mine") {
    if (!tile.resource) {
      return { ok: false, error: "Mine must be placed on a resource tile" };
    }
  }

  const def = BUILDING_DEFS[buildingClass];
  const entityId = `bld_${++buildingCounter}`;

  const building: Building = {
    entity_id: entityId,
    class: buildingClass,
    owner_id: player.entity_id,
    location,
    map_key: mapKey,
    status: "active",
    upkeep_per_tick: def.upkeep_per_tick,
    inventory: {},
    resource_type: buildingClass === "mine" ? tile.resource!.type : undefined,
    production_per_tick:
      buildingClass === "mine"
        ? (def.production_per_tick ?? 0) * tile.resource!.richness
        : undefined,
  };

  // Seed admin outpost with starting money
  if (buildingClass === "admin_outpost") {
    building.inventory.money = STARTING_MONEY;
  }

  // Register building
  store.buildings.set(entityId, building);
  tile.building_id = entityId;

  // Ensure player has a map account
  if (!player.map_accounts[mapKey]) {
    player.map_accounts[mapKey] = {};
  }

  // Link admin outpost
  if (buildingClass === "admin_outpost") {
    player.map_accounts[mapKey].admin_outpost_building_id = entityId;
  }

  return { ok: true, building };
}
