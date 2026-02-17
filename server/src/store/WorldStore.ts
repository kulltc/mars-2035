import {
  type Player,
  type Building,
  type Tile,
  type GameEvent,
  type Command,
  type DistrictState,
  type WorldMeta,
  type MapKey,
  type DistrictKey,
  type EventType,
  TICK_INTERVAL_MS,
  DISTRICTS_X,
  DISTRICTS_Y,
  MAPS_PER_DISTRICT_X,
  MAPS_PER_DISTRICT_Y,
  TILES_PER_MAP,
  tileKey,
  toDistrictKey,
} from "@mars-2035/shared";
import { generateWorld } from "../seed/worldGen.js";

export class WorldStore {
  readonly worldId = "mars-alpha";

  // Core state
  players = new Map<string, Player>();
  buildings = new Map<string, Building>();
  tiles: Map<MapKey, Map<string, Tile>>; // mapKey → (tileKey → Tile)
  districts = new Map<DistrictKey, DistrictState>();

  // Event log
  events: GameEvent[] = [];
  private seq = 0;

  // Command queue (drained each tick)
  commandQueue: Command[] = [];

  // Tick counter
  tick = 0;

  // WebSocket subscribers: mapKey → Set<callback>
  subscribers = new Map<MapKey, Set<(events: GameEvent[]) => void>>();

  constructor(seed = 42) {
    this.tiles = generateWorld(seed);
    this.initDistricts();
  }

  private initDistricts() {
    for (let dx = 0; dx < DISTRICTS_X; dx++) {
      for (let dy = 0; dy < DISTRICTS_Y; dy++) {
        const key = toDistrictKey(dx, dy);
        this.districts.set(key, {
          district_id: key,
          owner_id: undefined,
          contested: false,
          influence_scores: {},
        });
      }
    }
  }

  // ── Helpers ──

  nextSeq(): number {
    return ++this.seq;
  }

  pushEvent(type: EventType, data: Record<string, unknown>, mapKey?: MapKey): GameEvent {
    const event: GameEvent = {
      world_id: this.worldId,
      seq: this.nextSeq(),
      tick: this.tick,
      ts: Date.now(),
      type,
      map_key: mapKey,
      data,
    };
    this.events.push(event);
    return event;
  }

  getTile(mapKey: MapKey, x: number, y: number): Tile | undefined {
    return this.tiles.get(mapKey)?.get(tileKey(x, y));
  }

  getBuildingsByMap(mapKey: MapKey): Building[] {
    const result: Building[] = [];
    for (const b of this.buildings.values()) {
      if (b.map_key === mapKey) result.push(b);
    }
    return result;
  }

  getBuildingsByDistrict(districtKey: DistrictKey): Building[] {
    const result: Building[] = [];
    for (const b of this.buildings.values()) {
      const dk = toDistrictKey(b.location.dx, b.location.dy);
      if (dk === districtKey) result.push(b);
    }
    return result;
  }

  getBuildingsByPlayer(playerId: string): Building[] {
    const result: Building[] = [];
    for (const b of this.buildings.values()) {
      if (b.owner_id === playerId) result.push(b);
    }
    return result;
  }

  getEventsSince(mapKey: MapKey, sinceSeq: number): GameEvent[] {
    return this.events.filter(
      (e) => e.seq > sinceSeq && (e.map_key === mapKey || e.map_key === undefined)
    );
  }

  getMeta(): WorldMeta {
    return {
      world_id: this.worldId,
      tick: this.tick,
      tick_interval_ms: TICK_INTERVAL_MS,
      districts_x: DISTRICTS_X,
      districts_y: DISTRICTS_Y,
      maps_per_district_x: MAPS_PER_DISTRICT_X,
      maps_per_district_y: MAPS_PER_DISTRICT_Y,
      tiles_per_map: TILES_PER_MAP,
    };
  }

  // ── Subscription management ──

  subscribe(mapKey: MapKey, cb: (events: GameEvent[]) => void): () => void {
    let subs = this.subscribers.get(mapKey);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(mapKey, subs);
    }
    subs.add(cb);
    return () => subs!.delete(cb);
  }

  broadcast(mapKey: MapKey, events: GameEvent[]) {
    const subs = this.subscribers.get(mapKey);
    if (subs) {
      for (const cb of subs) cb(events);
    }
  }

  // ── Serialization helpers for API ──

  serializeTiles(mapKey: MapKey): Tile[] {
    const tileMap = this.tiles.get(mapKey);
    if (!tileMap) return [];
    return Array.from(tileMap.values());
  }
}
