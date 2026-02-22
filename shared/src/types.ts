// ── Material & Asset types ──

export const MATERIAL_TYPES = [
  "money",
  "steel",
  "silicon",
  "polymer",
  "rare_earth",
  "carbon",
  // Morphic Chain
  "ferrite_alloy",
  "morphic_composite",
  "morphic_core",
  "servo_cortex",
  "autonomic_matrix",
  // Toroidin Chain
  "thermoplast",
  "lattice_fiber",
  "toroidin_plate",
  "muphrid_cell",
  "paradox_weave",
  // Cryogenic Chain
  "cryite",
  "null_phase_gel",
  "xenotherm_crystal",
  "absolute_lattice",
  "zero_point_shard",
  // Psychophysical Chain
  "psi_crystal",
  "esper_thread",
  "psychon_core",
  "peep_shield",
  "noetic_matrix",
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

export type Assets = Partial<Record<MaterialType, number>>;

// ── Coordinates ──

export interface Location {
  dx: number; // district x (0..1)
  dy: number; // district y (0..1)
  mx: number; // map x within district (0..4)
  my: number; // map y within district (0..4)
  x: number; // tile x within map (0..299)
  y: number; // tile y within map (0..299)
}

/** String key for a map: "dx:dy:mx:my" */
export type MapKey = string;

/** String key for a district: "dx:dy" */
export type DistrictKey = string;

// ── Tile ──

export type ResourceType = Exclude<MaterialType, "money">;

export interface ResourceData {
  type: ResourceType;
  richness: number; // multiplier, e.g. 1.0 – 3.0
}

export interface Tile {
  x: number;
  y: number;
  resource?: ResourceData;
  building_id?: string;
}

// ── Building ──

export const BUILDING_CLASSES = [
  "admin_outpost",
  "infra_tower",
  "research_station",
  "research_lab",
  "mine",
  "port",
  // Morphic Chain
  "smelter",
  "magnetic_press",
  "morphic_forge",
  "servo_assembly",
  "replication_chamber",
  // Toroidin Chain
  "polymer_kiln",
  "crystal_grower",
  "toroidin_foundry",
  "muphrid_lab",
  "solar_loom",
  // Cryogenic Chain
  "cryo_distillery",
  "phase_condenser",
  "xenotherm_reactor",
  "deep_freeze_synth",
  "iceworld_refinery",
  // Psychophysical Chain
  "resonance_tuner",
  "neural_loom",
  "psychophysical_amp",
  "dampening_forge",
  "consciousness_engine",
  "quantum_relay",
  "embassy",
] as const;

export type BuildingClass = (typeof BUILDING_CLASSES)[number];

export type BuildingStatus = "active" | "suspended" | "constructing";

export interface AutoSellRule {
  mode: "any_rate" | "min_rate";
  min_price?: number;
}

export type RouteResource = MaterialType | "all";

export interface OutgoingRoute {
  resource: RouteResource;
  to_building_id: string;
}

export interface QuantumRelayRule {
  to_building_id: string;
  materials: MaterialType[];
}

export interface Building {
  entity_id: string;
  class: BuildingClass;
  owner_id: string;
  location: Location;
  map_key: MapKey;
  status: BuildingStatus;
  suspended_at_tick?: number;
  inventory: Assets;
  capacity: number;
  output_buffer?: Assets;
  // Mine-specific
  resource_type?: ResourceType;
  production_per_tick?: number;
  // Port auto-sell config
  auto_sell?: Partial<Record<ResourceType, AutoSellRule>>;
  // Routes: move resources to other buildings each tick
  outgoing_routes?: OutgoingRoute[];
  // Quantum relay rules: instant transfer to another relay each tick
  quantum_rules?: QuantumRelayRule[];
  // Per-material minimum stock to keep (not shipped out by workers)
  buffer_stock?: Partial<Record<MaterialType, number>>;
}

// ── Worker Task ──

export type WorkerTaskType = "pickup" | "dropoff" | "construct";

export interface WorkerTaskBase {
  id: string;
  type: WorkerTaskType;
  owner_id: string;
  map_key: MapKey;
}

export interface PickupTask extends WorkerTaskBase {
  type: "pickup";
  from_building_id: string;
  to_building_id: string;
  resource: MaterialType;
}

export interface DropoffTask extends WorkerTaskBase {
  type: "dropoff";
  building_id: string;
  resource: MaterialType;
}

export interface ConstructTask extends WorkerTaskBase {
  type: "construct";
  building_id: string;
  ticks_remaining: number;
}

export type WorkerTask = PickupTask | DropoffTask | ConstructTask;

// ── Worker ──

export type WorkerState = "idle" | "moving_to_pickup" | "picking_up" | "moving_to_dropoff" | "dropping_off" | "returning_to_base" | "unloading" | "moving_to_construct" | "constructing";

export type WorkerStatus = "active" | "inactive";

export interface WorkerFilter {
  task_types?: WorkerTaskType[];
  resources?: MaterialType[];
  area?: { x1: number; y1: number; x2: number; y2: number };
}

export interface Worker {
  entity_id: string;
  owner_id: string;
  map_key: MapKey;
  x: number;
  y: number;
  inventory: Assets;
  capacity: number;
  state: WorkerState;
  worker_status: WorkerStatus;
  current_task_id?: string;
  task_filter?: WorkerFilter;
}

// ── Market ──

export type MarketPrices = Record<ResourceType, number>;

// ── Player ──

export type PlayerStatus = "active" | "inactive";

export interface MapAccount {
  admin_outpost_building_id?: string;
  started_at_tick?: number;
  new_player_protection_active?: boolean;
}

export interface Player {
  entity_id: string;
  name: string;
  status: PlayerStatus;
  map_accounts: Record<MapKey, MapAccount>;
  research: string[];
  tutorial_step?: number;
  bankrupt?: boolean;
}

// ── Ambassador ──

export type AmbassadorState = "idle" | "moving_to_target" | "returning";

export interface Ambassador {
  entity_id: string;
  owner_id: string;
  office_building_id: string;
  map_key: MapKey;
  x: number;
  y: number;
  state: AmbassadorState;
  target_building_id?: string;
  carried_money: number;
  cooldown_ticks: number;
}

// ── Events ──

export type EventType =
  | "building_placed"
  | "production"
  | "upkeep_charged"
  | "building_suspended"
  | "building_resumed"
  | "auto_sell"
  | "market_update"
  | "transfer"
  | "export"
  | "import"
  | "route_executed"
  | "command_failed"
  | "player_registered"
  | "tick_complete"
  | "worker_spawned"
  | "worker_pickup"
  | "worker_dropoff"
  | "construction_complete"
  | "building_destroyed"
  | "processing"
  | "research_complete"
  | "tax_collected"
  | "new_player_protection_ended"
  | "ambassador_dispatched"
  | "ambassador_arrived"
  | "ambassador_returned"
  | "player_bankrupt";

export interface GameEvent {
  world_id: string;
  seq: number;
  tick: number;
  ts: number;
  type: EventType;
  map_key?: MapKey;
  data: Record<string, unknown>;
}

// ── Commands ──

export type CommandType =
  | "place_building"
  | "transfer"
  | "export"
  | "configure_auto_sell"
  | "configure_route"
  | "delete_route"
  | "buy_worker"
  | "sell_building"
  | "remove_worker"
  | "configure_worker"
  | "do_research"
  | "set_buffer_stock"
  | "configure_quantum_rule"
  | "delete_quantum_rule"
  | "import"
  | "forfeit"
  | "dismiss_tutorial"
  | "send_ambassador"
  | "acknowledge_bankrupt";

export interface Command {
  id: string;
  player_id: string;
  type: CommandType;
  data: Record<string, unknown>;
  submitted_at: number;
}

// ── Tax ──

export interface TaxInfo {
  taxRate: number;
  players: { playerId: string; name: string; buildings: number; share: number }[];
}

// ── Auth ──

export interface AuthResponse {
  token: string;
  player: Player & { buildings: Building[] };
}

// ── World ──

export interface WorldMeta {
  world_id: string;
  tick: number;
  tick_interval_ms: number;
  districts_x: number;
  districts_y: number;
  maps_per_district_x: number;
  maps_per_district_y: number;
  tiles_per_map: number;
}
