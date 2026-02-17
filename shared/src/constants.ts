import type { BuildingClass, ResourceType } from "./types.js";

// ── World dimensions ──

export const DISTRICTS_X = 2;
export const DISTRICTS_Y = 2;
export const MAPS_PER_DISTRICT_X = 5;
export const MAPS_PER_DISTRICT_Y = 5;
export const TILES_PER_MAP = 300;

// ── Tick ──

export const TICK_INTERVAL_MS = 5_000; // 5s for dev

// ── Building definitions ──

export interface BuildingDef {
  upkeep_per_tick: number;
  influence_value?: number;
  production_per_tick?: number; // base, multiplied by richness for mines
}

export const BUILDING_DEFS: Record<BuildingClass, BuildingDef> = {
  admin_outpost: { upkeep_per_tick: 0 },
  mine: { upkeep_per_tick: 2, production_per_tick: 5 },
  port: { upkeep_per_tick: 3 },
  core_hq: { upkeep_per_tick: 10, influence_value: 100 },
  admin_hub: { upkeep_per_tick: 5, influence_value: 50 },
  relay: { upkeep_per_tick: 1, influence_value: 10 },
};

// ── Influence ──

export const CONTEST_DELTA = 20; // minimum lead to claim ownership

// ── Tax rates ──

export const BUILDING_TAX_RATE: Record<BuildingClass, number> = {
  admin_outpost: 0,
  mine: 1,
  port: 2,
  core_hq: 3,
  admin_hub: 2,
  relay: 0.5,
};

export const INVENTORY_TAX_RATE: Record<ResourceType, number> = {
  steel: 0.01,
  silicon: 0.01,
  polymer: 0.01,
  rare_earth: 0.02,
  carbon: 0.01,
};

export const EXPORT_TAX_RATE: Record<ResourceType, number> = {
  steel: 0.05,
  silicon: 0.05,
  polymer: 0.05,
  rare_earth: 0.1,
  carbon: 0.05,
};

// ── Resource generation ──

export const RESOURCE_DENSITY = 0.07; // ~7% of tiles have resources
export const RESOURCE_TYPES: ResourceType[] = [
  "steel",
  "silicon",
  "polymer",
  "rare_earth",
  "carbon",
];

// ── Starting assets ──

export const STARTING_MONEY = 500;

// ── Viewport ──

export const VIEWPORT_W = 40;
export const VIEWPORT_H = 30;
