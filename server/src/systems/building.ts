import {
  type Building,
  type BuildingClass,
  type Location,
  type MaterialType,
  type Player,
  BUILDING_DEFS,
  RESOURCE_TYPES,
  STARTING_MONEY,
  STARTING_WORKERS,
  TERRITORY_RADIUS,
  WORKER_CAPACITY,
  locationToMapKey,
  tileKey,
  getTerritoryInfo,
  type TerritoryBuilding,
  getResearchForBuilding,
  RESEARCH_TREE,
} from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";

let buildingCounter = 0;

export function setBuildingCounter(n: number) {
  buildingCounter = n;
}

export function spawnWorker(store: WorldStore, ownerId: string, mapKey: string, x: number, y: number) {
  const wid = `wrk_${++store.workerCounter}`;
  // Apply worker capacity research bonus
  const player = store.players.get(ownerId);
  let workerCap = WORKER_CAPACITY;
  if (player?.research.includes("storage_workers")) {
    const effect = RESEARCH_TREE.storage_workers.effect!;
    workerCap = Math.round(workerCap * effect.multiplier);
  }

  const worker: import("@mars-2035/shared").Worker = {
    entity_id: wid,
    owner_id: ownerId,
    map_key: mapKey,
    x, y,
    inventory: {},
    capacity: workerCap,
    state: "idle",
    worker_status: "active",
  };
  store.workers.set(wid, worker);
  store.pushEvent("worker_spawned", { worker_id: wid, owner_id: ownerId, x, y }, mapKey);
  return worker;
}

export function placeBuilding(
  store: WorldStore,
  player: Player,
  buildingClass: BuildingClass,
  location: Location,
  initialStatus: Building["status"] = "active"
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

    // Initial admin outpost cannot be placed inside another player's territory
    const territoryBuildings: TerritoryBuilding[] = [];
    for (const b of store.buildings.values()) {
      if (b.map_key === mapKey && TERRITORY_RADIUS[b.class] != null) {
        territoryBuildings.push({
          x: b.location.x,
          y: b.location.y,
          class: b.class,
          owner_id: b.owner_id,
        });
      }
    }

    const inOtherTerritory = territoryBuildings.some((b) => {
      if (b.owner_id === player.entity_id) return false;
      const radius = TERRITORY_RADIUS[b.class];
      if (radius == null) return false;
      const dist = Math.abs(location.x - b.x) + Math.abs(location.y - b.y);
      return dist <= radius;
    });

    if (inOtherTerritory) {
      return { ok: false, error: "Cannot place admin outpost in another player's territory" };
    }
  }

  // Admin outpost on non-home maps requires unlock_new_map research
  if (buildingClass === "admin_outpost") {
    const hasAnyOutpost = Object.values(player.map_accounts).some(a => a.admin_outpost_building_id);
    if (hasAnyOutpost && !player.research.includes("unlock_new_map")) {
      return { ok: false, error: "Research 'Planetary Expansion' required to expand to new maps" };
    }
  }

  // Non-admin buildings: require admin outpost on this map
  if (buildingClass !== "admin_outpost") {
    const account = player.map_accounts[mapKey];
    if (!account?.admin_outpost_building_id) {
      return { ok: false, error: "Must have an admin outpost on this map first" };
    }

    // Research gating for buildings
    const requiredResearch = getResearchForBuilding(buildingClass);
    if (requiredResearch && !player.research.includes(requiredResearch)) {
      const researchName = RESEARCH_TREE[requiredResearch]?.name ?? requiredResearch;
      return { ok: false, error: `Research '${researchName}' required to build ${buildingClass.replace(/_/g, " ")}` };
    }

    // Territory validation (skip for admin_outpost and research_station)
    if (buildingClass !== "research_station") {
      const territoryBuildings: TerritoryBuilding[] = [];
      for (const b of store.buildings.values()) {
        if (b.map_key === mapKey && TERRITORY_RADIUS[b.class] != null) {
          territoryBuildings.push({
            x: b.location.x,
            y: b.location.y,
            class: b.class,
            owner_id: b.owner_id,
          });
        }
      }
      const info = getTerritoryInfo(territoryBuildings, location.x, location.y, player.entity_id);

      if (!info.inTerritory) {
        return { ok: false, error: "Must build within your territory" };
      }

      // Territory buildings (infra_tower) require full territory and no contest
      if (TERRITORY_RADIUS[buildingClass] != null) {
        if (!info.fullTerritory) {
          return { ok: false, error: "Territory buildings require full territory (admin outpost or infra tower coverage)" };
        }
        if (info.contested) {
          return { ok: false, error: "Cannot place territory buildings in contested territory" };
        }
      }
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

  // Recipe buildings: require producer buildings for non-raw inputs
  const def0 = BUILDING_DEFS[buildingClass];
  if (def0.recipe) {
    const rawSet = new Set<string>(RESOURCE_TYPES);
    const playerBuildings = store.getBuildingsByPlayer(player.entity_id);
    const ownedClasses = new Set(playerBuildings.map((b) => b.class));
    for (const mat of Object.keys(def0.recipe.inputs)) {
      if (rawSet.has(mat)) continue;
      // Find which building produces this material
      const producer = Object.entries(BUILDING_DEFS).find(
        ([, d]) => d.recipe?.output === mat
      );
      if (producer && !ownedClasses.has(producer[0] as BuildingClass)) {
        return { ok: false, error: `Requires a ${producer[0].replace(/_/g, " ")} first` };
      }
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

  // Apply building capacity research bonus
  let capacity = def.capacity;
  if (player.research.includes("storage_buildings")) {
    const effect = RESEARCH_TREE.storage_buildings.effect!;
    capacity = Math.round(capacity * effect.multiplier);
  }

  const building: Building = {
    entity_id: entityId,
    class: buildingClass,
    owner_id: player.entity_id,
    location,
    map_key: mapKey,
    status: initialStatus,
    inventory: {},
    capacity,
    resource_type: buildingClass === "mine" ? tile.resource!.type : undefined,
    production_per_tick:
      buildingClass === "mine"
        ? (def.production_per_tick ?? 0) * tile.resource!.richness
        : undefined,
    output_buffer: def.recipe ? {} : undefined,
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
    player.map_accounts[mapKey] = {
      started_at_tick: store.tick,
      new_player_protection_active: false,
    };
  }

  // Link admin outpost
  if (buildingClass === "admin_outpost") {
    const account = player.map_accounts[mapKey];
    account.admin_outpost_building_id = entityId;
    account.started_at_tick = store.tick;
    account.new_player_protection_active = true;
    // Clear bankrupt flag on restart
    if (player.bankrupt) delete player.bankrupt;
    // Spawn starting workers
    for (let i = 0; i < STARTING_WORKERS; i++) {
      spawnWorker(store, player.entity_id, mapKey, location.x, location.y);
    }
  }

  return { ok: true, building };
}

/** Recalculate capacities on existing buildings/workers based on player research */
export function applyResearchEffects(store: WorldStore, player: Player) {
  if (player.research.includes("storage_buildings")) {
    const mult = RESEARCH_TREE.storage_buildings.effect!.multiplier;
    for (const b of store.buildings.values()) {
      if (b.owner_id !== player.entity_id) continue;
      const base = BUILDING_DEFS[b.class].capacity;
      b.capacity = Math.round(base * mult);
    }
  }
  if (player.research.includes("storage_workers")) {
    const mult = RESEARCH_TREE.storage_workers.effect!.multiplier;
    for (const w of store.workers.values()) {
      if (w.owner_id !== player.entity_id) continue;
      w.capacity = Math.round(WORKER_CAPACITY * mult);
    }
  }
}
