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
  capacity: number;
  production_per_tick?: number; // base, multiplied by richness for mines
  build_ticks: number;
}

export const BUILDING_DEFS: Record<BuildingClass, BuildingDef> = {
  admin_outpost: { upkeep_per_tick: 0, cost: {}, capacity: 2000, build_ticks: 0 },
  mine: { upkeep_per_tick: 2, cost: { money: 100 }, capacity: 50, production_per_tick: 5, build_ticks: 3 },
  port: { upkeep_per_tick: 3, cost: { money: 150 }, capacity: 200, build_ticks: 5 },
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

// ── Supply pressure ──

export const SUPPLY_PRESSURE_FACTOR = 0.002;
export const SUPPLY_PRESSURE_DECAY = 0.5;

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

// ── Workers ──

export const WORKER_CAPACITY = 20;
export const WORKER_UPKEEP = 2;
export const SUSPENSION_DESTROY_TICKS = 100;
export const STARTING_WORKERS = 2;
export const WORKER_COST: Assets = { money: 75 };

// ── Inventory helpers ──

export function totalInventory(inv: Assets): number {
  let sum = 0;
  for (const [k, v] of Object.entries(inv)) {
    if (k !== "money" && v) sum += v;
  }
  return sum;
}

export function remainingCapacity(inv: Assets, cap: number): number {
  return Math.max(0, cap - totalInventory(inv));
}

// ── Viewport ──

export const VIEWPORT_W = 40;
export const VIEWPORT_H = 30;
