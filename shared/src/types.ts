// ── Material & Asset types ──

export const MATERIAL_TYPES = [
  "money",
  "steel",
  "silicon",
  "polymer",
  "rare_earth",
  "carbon",
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
  "mine",
  "port",
  "core_hq",
  "admin_hub",
  "relay",
] as const;

export type BuildingClass = (typeof BUILDING_CLASSES)[number];

export type BuildingStatus = "active" | "suspended" | "constructing";

export interface Building {
  entity_id: string;
  class: BuildingClass;
  owner_id: string;
  location: Location;
  map_key: MapKey;
  status: BuildingStatus;
  upkeep_per_tick: number;
  inventory: Assets;
  // Mine-specific
  resource_type?: ResourceType;
  production_per_tick?: number;
  // Influence buildings
  influence_value?: number;
}

// ── Player ──

export type PlayerStatus = "active" | "inactive";

export interface MapAccount {
  assets: Assets;
  admin_outpost_building_id?: string;
}

export interface Player {
  entity_id: string;
  name: string;
  status: PlayerStatus;
  map_accounts: Record<MapKey, MapAccount>;
}

// ── District ──

export interface DistrictState {
  district_id: DistrictKey;
  owner_id?: string;
  contested: boolean;
  influence_scores: Record<string, number>; // player_id → total influence
}

// ── Events ──

export type EventType =
  | "building_placed"
  | "production"
  | "upkeep_charged"
  | "building_suspended"
  | "building_resumed"
  | "tax_charged"
  | "transfer"
  | "export"
  | "district_ownership_changed"
  | "player_registered"
  | "tick_complete";

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
  | "transfer_to_player"
  | "transfer_to_building"
  | "export";

export interface Command {
  id: string;
  player_id: string;
  type: CommandType;
  data: Record<string, unknown>;
  submitted_at: number;
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
