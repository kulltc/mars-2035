import type { Assets, BuildingClass, MaterialType, ResourceType } from "./types.js";

// ── World dimensions ──

export const DISTRICTS_X = 2;
export const DISTRICTS_Y = 2;
export const MAPS_PER_DISTRICT_X = 5;
export const MAPS_PER_DISTRICT_Y = 5;
export const TILES_PER_MAP = 300;

// ── Tick ──

export const TICK_INTERVAL_MS = 5_000; // 5s for dev

// ── Building definitions ──

export interface Recipe {
  inputs: Assets;
  output: MaterialType;
  output_amount: number;
}

export interface BuildingDef {
  upkeep_per_tick: number;
  cost: Assets;
  capacity: number;
  production_per_tick?: number; // base, multiplied by richness for mines
  build_ticks: number;
  recipe?: Recipe;
  output_capacity?: number;
}

export const BUILDING_DEFS: Record<BuildingClass, BuildingDef> = {
  admin_outpost: { upkeep_per_tick: 0, cost: {}, capacity: 2000, build_ticks: 0 },
  mine: { upkeep_per_tick: 0.2, cost: { money: 100 }, capacity: 50, production_per_tick: 5, build_ticks: 3 },
  port: { upkeep_per_tick: 0.3, cost: { money: 150 }, capacity: 200, build_ticks: 5 },
  // Morphic Chain
  smelter:              { upkeep_per_tick: 0.4, cost: { money: 200 },  capacity: 80, build_ticks: 5,  output_capacity: 40, recipe: { inputs: { steel: 3, carbon: 2 }, output: "ferrite_alloy", output_amount: 1 } },
  magnetic_press:       { upkeep_per_tick: 0.6, cost: { money: 400 },  capacity: 60, build_ticks: 8,  output_capacity: 30, recipe: { inputs: { ferrite_alloy: 2, rare_earth: 1 }, output: "morphic_composite", output_amount: 1 } },
  morphic_forge:        { upkeep_per_tick: 1.0, cost: { money: 800 },  capacity: 40, build_ticks: 12, output_capacity: 20, recipe: { inputs: { morphic_composite: 2, silicon: 2 }, output: "morphic_core", output_amount: 1 } },
  servo_assembly:       { upkeep_per_tick: 1.5, cost: { money: 1500 }, capacity: 30, build_ticks: 18, output_capacity: 15, recipe: { inputs: { morphic_core: 1, polymer: 3 }, output: "servo_cortex", output_amount: 1 } },
  replication_chamber:  { upkeep_per_tick: 2.5, cost: { money: 3000 }, capacity: 20, build_ticks: 25, output_capacity: 10, recipe: { inputs: { servo_cortex: 1, morphic_core: 1 }, output: "autonomic_matrix", output_amount: 1 } },
  // Toroidin Chain
  polymer_kiln:         { upkeep_per_tick: 0.4, cost: { money: 200 },  capacity: 80, build_ticks: 5,  output_capacity: 40, recipe: { inputs: { polymer: 3, carbon: 2 }, output: "thermoplast", output_amount: 1 } },
  crystal_grower:       { upkeep_per_tick: 0.6, cost: { money: 400 },  capacity: 60, build_ticks: 8,  output_capacity: 30, recipe: { inputs: { thermoplast: 2, silicon: 2 }, output: "lattice_fiber", output_amount: 1 } },
  toroidin_foundry:     { upkeep_per_tick: 1.0, cost: { money: 800 },  capacity: 40, build_ticks: 12, output_capacity: 20, recipe: { inputs: { lattice_fiber: 2, steel: 2 }, output: "toroidin_plate", output_amount: 1 } },
  muphrid_lab:          { upkeep_per_tick: 1.5, cost: { money: 1500 }, capacity: 30, build_ticks: 18, output_capacity: 15, recipe: { inputs: { toroidin_plate: 1, rare_earth: 2 }, output: "muphrid_cell", output_amount: 1 } },
  solar_loom:           { upkeep_per_tick: 2.5, cost: { money: 3000 }, capacity: 20, build_ticks: 25, output_capacity: 10, recipe: { inputs: { muphrid_cell: 1, lattice_fiber: 2 }, output: "paradox_weave", output_amount: 1 } },
  // Cryogenic Chain
  cryo_distillery:      { upkeep_per_tick: 0.4, cost: { money: 200 },  capacity: 80, build_ticks: 5,  output_capacity: 40, recipe: { inputs: { silicon: 2, carbon: 3 }, output: "cryite", output_amount: 1 } },
  phase_condenser:      { upkeep_per_tick: 0.6, cost: { money: 400 },  capacity: 60, build_ticks: 8,  output_capacity: 30, recipe: { inputs: { cryite: 2, polymer: 2 }, output: "null_phase_gel", output_amount: 1 } },
  xenotherm_reactor:    { upkeep_per_tick: 1.0, cost: { money: 800 },  capacity: 40, build_ticks: 12, output_capacity: 20, recipe: { inputs: { null_phase_gel: 2, rare_earth: 1 }, output: "xenotherm_crystal", output_amount: 1 } },
  deep_freeze_synth:    { upkeep_per_tick: 1.5, cost: { money: 1500 }, capacity: 30, build_ticks: 18, output_capacity: 15, recipe: { inputs: { xenotherm_crystal: 1, cryite: 2 }, output: "absolute_lattice", output_amount: 1 } },
  iceworld_refinery:    { upkeep_per_tick: 2.5, cost: { money: 3000 }, capacity: 20, build_ticks: 25, output_capacity: 10, recipe: { inputs: { absolute_lattice: 1, xenotherm_crystal: 1 }, output: "zero_point_shard", output_amount: 1 } },
  // Psychophysical Chain
  resonance_tuner:      { upkeep_per_tick: 0.5, cost: { money: 250 },  capacity: 80, build_ticks: 5,  output_capacity: 40, recipe: { inputs: { rare_earth: 2, silicon: 2 }, output: "psi_crystal", output_amount: 1 } },
  neural_loom:          { upkeep_per_tick: 0.7, cost: { money: 450 },  capacity: 60, build_ticks: 8,  output_capacity: 30, recipe: { inputs: { psi_crystal: 2, polymer: 2 }, output: "esper_thread", output_amount: 1 } },
  psychophysical_amp:   { upkeep_per_tick: 1.1, cost: { money: 900 },  capacity: 40, build_ticks: 12, output_capacity: 20, recipe: { inputs: { esper_thread: 2, rare_earth: 1 }, output: "psychon_core", output_amount: 1 } },
  dampening_forge:      { upkeep_per_tick: 1.6, cost: { money: 1600 }, capacity: 30, build_ticks: 18, output_capacity: 15, recipe: { inputs: { psychon_core: 1, steel: 3 }, output: "peep_shield", output_amount: 1 } },
  consciousness_engine: { upkeep_per_tick: 2.8, cost: { money: 3200 }, capacity: 20, build_ticks: 25, output_capacity: 10, recipe: { inputs: { peep_shield: 1, psychon_core: 1 }, output: "noetic_matrix", output_amount: 1 } },
};

// ── Market ──

export const BASE_MARKET_PRICES: Record<ResourceType, number> = {
  steel: 1.0,
  silicon: 1.2,
  polymer: 1.5,
  rare_earth: 3.0,
  carbon: 0.8,
  // Morphic Chain
  ferrite_alloy: 4.0,
  morphic_composite: 12.0,
  morphic_core: 30.0,
  servo_cortex: 70.0,
  autonomic_matrix: 160.0,
  // Toroidin Chain
  thermoplast: 4.5,
  lattice_fiber: 13.0,
  toroidin_plate: 32.0,
  muphrid_cell: 75.0,
  paradox_weave: 170.0,
  // Cryogenic Chain
  cryite: 4.0,
  null_phase_gel: 12.5,
  xenotherm_crystal: 33.0,
  absolute_lattice: 72.0,
  zero_point_shard: 165.0,
  // Psychophysical Chain
  psi_crystal: 5.0,
  esper_thread: 14.0,
  psychon_core: 35.0,
  peep_shield: 78.0,
  noetic_matrix: 175.0,
};

export const TRADEABLE_TYPES = Object.keys(BASE_MARKET_PRICES) as ResourceType[];

export const MARKET_VOLATILITY = 0.1;
export const MARKET_PRICE_MIN = 0.2;
export const MARKET_PRICE_MAX = 500.0;

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
export const WORKER_MONEY_CAPACITY = 150;
export const WORKER_UPKEEP = 0.5;
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

export function outputBufferTotal(inv: Assets): number {
  let sum = 0;
  for (const v of Object.values(inv)) {
    if (v) sum += v;
  }
  return sum;
}

export function remainingOutputCapacity(outputBuffer: Assets, outputCap: number): number {
  return Math.max(0, outputCap - outputBufferTotal(outputBuffer));
}

// ── Viewport ──

export const VIEWPORT_W = 40;
export const VIEWPORT_H = 30;
