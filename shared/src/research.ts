import type { Assets, BuildingClass } from "./types.js";

export interface ResearchDef {
  id: string;
  name: string;
  track: "diplomacy" | "logistics" | "offensive_diplomacy";
  cost: Assets;
  requires: string[];
  description: string;
  unlocks?: BuildingClass;
  effect?: { type: "building_capacity" | "worker_capacity"; multiplier: number };
}

export const RESEARCH_TREE: Record<string, ResearchDef> = {
  // Diplomacy track
  unlock_infra_tower: {
    id: "unlock_infra_tower",
    name: "Infrastructure Foundations",
    track: "diplomacy",
    cost: { ferrite_alloy: 5, cryite: 5 },
    requires: [],
    description: "Unlock Infra Tower construction for territory expansion.",
    unlocks: "infra_tower",
  },
  unlock_research_station: {
    id: "unlock_research_station",
    name: "Advanced Research Methods",
    track: "diplomacy",
    cost: { morphic_composite: 3, null_phase_gel: 3 },
    requires: ["unlock_infra_tower"],
    description: "Unlock Research Station construction.",
    unlocks: "research_station",
  },
  unlock_new_map: {
    id: "unlock_new_map",
    name: "Planetary Expansion",
    track: "diplomacy",
    cost: { morphic_core: 2, xenotherm_crystal: 2, money: 2000 },
    requires: ["unlock_research_station"],
    description: "Establish an Admin Outpost on a neighboring map.",
  },
  // Logistics track
  storage_buildings: {
    id: "storage_buildings",
    name: "Expanded Warehousing",
    track: "logistics",
    cost: { ferrite_alloy: 8, thermoplast: 5 },
    requires: [],
    description: "Increase all building storage capacity by 50%.",
    effect: { type: "building_capacity", multiplier: 1.5 },
  },
  storage_workers: {
    id: "storage_workers",
    name: "Heavy Haulers",
    track: "logistics",
    cost: { morphic_composite: 4, lattice_fiber: 4 },
    requires: ["storage_buildings"],
    description: "Increase worker carry capacity by 50%.",
    effect: { type: "worker_capacity", multiplier: 1.5 },
  },
  logistics_quantum_routing: {
    id: "logistics_quantum_routing",
    name: "Quantum Logistics",
    track: "logistics",
    cost: { money: 2000, morphic_core: 2, xenotherm_crystal: 2, autonomic_matrix: 1, zero_point_shard: 1 },
    requires: ["storage_workers"],
    description: "Unlock Quantum Relay construction for instant cross-sector material routing.",
    unlocks: "quantum_relay",
  },
  // Offensive Diplomacy track
  foreign_affairs_1: {
    id: "foreign_affairs_1",
    name: "Foreign Affairs I",
    track: "offensive_diplomacy",
    cost: { ferrite_alloy: 8, thermoplast: 5 },
    requires: [],
    description: "Unlock Embassy. Max claim: \u00B110%.",
    unlocks: "embassy",
  },
  foreign_affairs_2: {
    id: "foreign_affairs_2",
    name: "Foreign Affairs II",
    track: "offensive_diplomacy",
    cost: { morphic_composite: 5, null_phase_gel: 5 },
    requires: ["foreign_affairs_1"],
    description: "Increase max embassy claim to \u00B130%.",
  },
  foreign_affairs_3: {
    id: "foreign_affairs_3",
    name: "Foreign Affairs III",
    track: "offensive_diplomacy",
    cost: { morphic_core: 3, xenotherm_crystal: 3 },
    requires: ["foreign_affairs_2"],
    description: "Increase max embassy claim to \u00B150%.",
  },
  foreign_affairs_4: {
    id: "foreign_affairs_4",
    name: "Diplomatic Automation",
    track: "offensive_diplomacy",
    cost: { autonomic_matrix: 2, zero_point_shard: 2 },
    requires: ["foreign_affairs_3"],
    description: "Unlock auto-mission: ambassador repeats missions automatically.",
  },
};

/** Get the research ID that unlocks a building class, if any */
export function getResearchForBuilding(buildingClass: BuildingClass): string | undefined {
  for (const [id, def] of Object.entries(RESEARCH_TREE)) {
    if (def.unlocks === buildingClass) return id;
  }
  return undefined;
}
