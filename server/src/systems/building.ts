import {
  type Building,
  type BuildingClass,
  type Location,
  type Player,
  BUILDING_DEFS,
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
    influence_value: def.influence_value,
  };

  // Register building
  store.buildings.set(entityId, building);
  tile.building_id = entityId;

  // Ensure player has a map account
  if (!player.map_accounts[mapKey]) {
    player.map_accounts[mapKey] = { assets: {} };
  }

  // Link admin outpost
  if (buildingClass === "admin_outpost") {
    player.map_accounts[mapKey].admin_outpost_building_id = entityId;
  }

  return { ok: true, building };
}
