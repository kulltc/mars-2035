import {
  type Player,
  type Building,
  type Tile,
  type GameEvent,
  type Command,
  type WorldMeta,
  type MapKey,
  type MaterialType,
  type MarketPrices,
  type EventType,
  type ResourceType,
  type Worker,
  type WorkerTask,
  TICK_INTERVAL_MS,
  DISTRICTS_X,
  DISTRICTS_Y,
  MAPS_PER_DISTRICT_X,
  MAPS_PER_DISTRICT_Y,
  TILES_PER_MAP,
  BASE_MARKET_PRICES,
  TRADEABLE_TYPES,
  BUILDING_DEFS,
  STARTING_MONEY,
  STARTING_WORKERS,
  WORKER_CAPACITY,
  tileKey,
} from "@mars-2035/shared";
import { generateWorld } from "../seed/worldGen.js";
import type { WorldSnapshotPayload } from "../db.js";

export class WorldStore {
  readonly worldId = "mars-alpha";

  // Core state
  players = new Map<string, Player>();
  buildings = new Map<string, Building>();
  workers = new Map<string, Worker>();
  tiles: Map<MapKey, Map<string, Tile>>; // mapKey → (tileKey → Tile)
  marketPrices: MarketPrices = { ...BASE_MARKET_PRICES };
  supplyPressure: Record<ResourceType, number> = Object.fromEntries(
    TRADEABLE_TYPES.map((r) => [r, 0])
  ) as Record<ResourceType, number>;

  // Event log
  events: GameEvent[] = [];
  private seq = 0;

  // Command queue (drained each tick)
  commandQueue: Command[] = [];

  // Tick counter
  tick = 0;

  // Worker counter
  workerCounter = 0;

  // Task queue
  taskQueue = new Map<string, WorkerTask>();
  taskCounter = 0;

  // WebSocket subscribers: mapKey → Set<callback>
  subscribers = new Map<MapKey, Set<(events: GameEvent[], buildings: Building[], workers: Worker[]) => void>>();

  constructor(seed = 42) {
    this.tiles = generateWorld(seed);
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

  getBuildingsByPlayer(playerId: string): Building[] {
    const result: Building[] = [];
    for (const b of this.buildings.values()) {
      if (b.owner_id === playerId) result.push(b);
    }
    return result;
  }

  getWorkersByMap(mapKey: MapKey): Worker[] {
    const result: Worker[] = [];
    for (const w of this.workers.values()) {
      if (w.map_key === mapKey) result.push(w);
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

  subscribe(mapKey: MapKey, cb: (events: GameEvent[], buildings: Building[], workers: Worker[]) => void): () => void {
    let subs = this.subscribers.get(mapKey);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(mapKey, subs);
    }
    subs.add(cb);
    return () => subs!.delete(cb);
  }

  broadcast(mapKey: MapKey, events: GameEvent[], buildings: Building[], workers: Worker[]) {
    const subs = this.subscribers.get(mapKey);
    if (subs) {
      for (const cb of subs) cb(events, buildings, workers);
    }
  }

  // ── Snapshot persistence ──

  toSnapshot(): WorldSnapshotPayload {
    const players: Record<string, Player> = {};
    for (const [k, v] of this.players) players[k] = v;
    const buildings: Record<string, Building> = {};
    for (const [k, v] of this.buildings) buildings[k] = v;
    const workers: Record<string, Worker> = {};
    for (const [k, v] of this.workers) workers[k] = v;
    const taskQueue: Record<string, WorkerTask> = {};
    for (const [k, v] of this.taskQueue) taskQueue[k] = v;
    return {
      tick: this.tick, seq: this.seq, players, buildings,
      marketPrices: this.marketPrices,
      supplyPressure: { ...this.supplyPressure },
      workers,
      taskQueue,
      taskCounter: this.taskCounter,
    };
  }

  static fromSnapshot(payload: WorldSnapshotPayload, seed: number): WorldStore {
    const store = new WorldStore(seed);
    store.tick = payload.tick;
    store.seq = payload.seq;

    store.players = new Map(Object.entries(payload.players));
    store.buildings = new Map(Object.entries(payload.buildings));

    if (payload.marketPrices) {
      store.marketPrices = payload.marketPrices;
    }

    if (payload.supplyPressure) {
      store.supplyPressure = { ...store.supplyPressure, ...payload.supplyPressure };
    }

    // Restore workers
    if (payload.workers) {
      store.workers = new Map(Object.entries(payload.workers));
      // Restore workerCounter from existing worker IDs
      for (const id of store.workers.keys()) {
        const n = parseInt(id.replace("wrk_", ""), 10);
        if (n > store.workerCounter) store.workerCounter = n;
      }
      // Migration: remove legacy fields, backfill worker_status
      for (const w of store.workers.values()) {
        const legacy = w as unknown as Record<string, unknown>;
        delete legacy.route_index;
        delete legacy.current_route;
        if (!w.worker_status) w.worker_status = "active";
        // Reset workers mid-route to idle since task queue is new
        if (!w.current_task_id && w.state !== "idle" && w.state !== "returning_to_base" && w.state !== "unloading") {
          w.state = "idle";
        }
      }
    }

    // Restore task queue
    if (payload.taskQueue) {
      store.taskQueue = new Map(Object.entries(payload.taskQueue));
    }
    if (payload.taskCounter) {
      store.taskCounter = payload.taskCounter;
    }

    // Re-link buildings to tiles
    for (const building of store.buildings.values()) {
      const mapTiles = store.tiles.get(building.map_key as MapKey);
      if (mapTiles) {
        const tk = tileKey(building.location.x, building.location.y);
        const tile = mapTiles.get(tk);
        if (tile) tile.building_id = building.entity_id;
      }
    }

    // One-time migration: move money from old map_accounts.assets to admin outpost inventory
    let didMigrate = false;
    for (const player of store.players.values()) {
      for (const [, account] of Object.entries(player.map_accounts)) {
        const legacyAssets = (account as Record<string, unknown>).assets as Record<string, number> | undefined;
        if (!legacyAssets) continue;

        didMigrate = true;
        const adminId = account.admin_outpost_building_id;
        if (!adminId) continue;

        const adminOutpost = store.buildings.get(adminId);
        if (!adminOutpost) continue;

        // Transfer all legacy assets to admin outpost inventory
        for (const [mat, amount] of Object.entries(legacyAssets)) {
          if (amount && amount > 0) {
            adminOutpost.inventory[mat as MaterialType] =
              (adminOutpost.inventory[mat as MaterialType] ?? 0) + amount;
            console.log(`Migration: moved ${amount} ${mat} from account to admin outpost ${adminId}`);
          }
        }

        // Clear legacy assets
        delete (account as Record<string, unknown>).assets;
      }
    }

    // Only seed money and unsuspend if we actually migrated legacy data
    if (didMigrate) {
      for (const player of store.players.values()) {
        for (const [, account] of Object.entries(player.map_accounts)) {
          const adminId = account.admin_outpost_building_id;
          if (!adminId) continue;
          const adminOutpost = store.buildings.get(adminId);
          if (!adminOutpost) continue;
          if (!adminOutpost.inventory.money || adminOutpost.inventory.money <= 0) {
            adminOutpost.inventory.money = STARTING_MONEY;
            console.log(`Migration: seeded admin outpost ${adminId} with ${STARTING_MONEY} money`);
          }
        }
      }

      for (const building of store.buildings.values()) {
        if (building.status !== "suspended") continue;
        building.status = "active";
        console.log(`Migration: reactivated ${building.entity_id} (${building.class})`);
      }
    }

    // Backfill capacity on buildings missing it
    for (const building of store.buildings.values()) {
      if (!building.capacity) {
        building.capacity = BUILDING_DEFS[building.class].capacity;
        console.log(`Migration: set capacity ${building.capacity} on ${building.entity_id} (${building.class})`);
      }
    }

    // Migration: add output_buffer to recipe buildings
    for (const building of store.buildings.values()) {
      const def = BUILDING_DEFS[building.class];
      if (def.recipe && !building.output_buffer) {
        building.output_buffer = {};
        console.log(`Migration: added output_buffer to ${building.entity_id} (${building.class})`);
      }
    }

    // Migration: spawn workers for existing admin outposts if no workers exist
    if (store.workers.size === 0) {
      for (const building of store.buildings.values()) {
        if (building.class !== "admin_outpost") continue;
        for (let i = 0; i < STARTING_WORKERS; i++) {
          const wid = `wrk_${++store.workerCounter}`;
          store.workers.set(wid, {
            entity_id: wid,
            owner_id: building.owner_id,
            map_key: building.map_key,
            x: building.location.x,
            y: building.location.y,
            inventory: {},
            capacity: WORKER_CAPACITY,
            state: "idle",
            worker_status: "active",
          });
          console.log(`Migration: spawned worker ${wid} for admin outpost ${building.entity_id}`);
        }
      }
    }

    return store;
  }

  // ── Serialization helpers for API ──

  serializeTiles(mapKey: MapKey): Tile[] {
    const tileMap = this.tiles.get(mapKey);
    if (!tileMap) return [];
    return Array.from(tileMap.values());
  }
}
