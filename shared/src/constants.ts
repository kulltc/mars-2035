import type { Assets, BuildingClass, ResourceType } from "./types.js";

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
  cost: Assets;
  production_per_tick?: number; // base, multiplied by richness for mines
}

export const BUILDING_DEFS: Record<BuildingClass, BuildingDef> = {
  admin_outpost: { upkeep_per_tick: 0, cost: {} },
  mine: { upkeep_per_tick: 2, cost: { money: 100 }, production_per_tick: 5 },
  port: { upkeep_per_tick: 3, cost: { money: 150 } },
};

// ── Market ──

export const BASE_MARKET_PRICES: Record<ResourceType, number> = {
  steel: 1.0,
  silicon: 1.2,
  polymer: 1.5,
  rare_earth: 3.0,
  carbon: 0.8,
};

export const MARKET_VOLATILITY = 0.1;
export const MARKET_PRICE_MIN = 0.2;
export const MARKET_PRICE_MAX = 10.0;

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
