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
  type Ambassador,
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
  TERRITORY_BUILDINGS,
  TAX_PER_BUILDING,
  NEW_PLAYER_PROTECTION_TICKS,
  tileKey,
} from "@mars-2035/shared";
import { generateWorld } from "../seed/worldGen.js";
import { applyResearchEffects } from "../systems/building.js";
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

  // Ambassadors
  ambassadors = new Map<string, Ambassador>();
  ambassadorCounter = 0;
  salesTaxHistory = new Map<string, number[]>(); // playerId → last 5 tick sums
  currentTickSalesTax = new Map<string, number>(); // transient, reset each tick

  // Tax pool: accumulated tax per map during auto-sell, drained during processTaxes
  taxPool = new Map<MapKey, number>();

  // WebSocket subscribers: mapKey → Set<callback>
  subscribers = new Map<MapKey, Set<(events: GameEvent[], buildings: Building[], workers: Worker[], ambassadors: Ambassador[]) => void>>();

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

  getAmbassadorsByMap(mapKey: MapKey): Ambassador[] {
    const result: Ambassador[] = [];
    for (const a of this.ambassadors.values()) {
      if (a.map_key === mapKey) result.push(a);
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

  /** Count territory buildings on a map and return tax rate (0.001 per building) */
  getTaxRate(mapKey: MapKey): number {
    let count = 0;
    for (const b of this.buildings.values()) {
      if (b.map_key === mapKey && b.status === "active" && (TERRITORY_BUILDINGS as string[]).includes(b.class)) {
        count++;
      }
    }
    return count * TAX_PER_BUILDING;
  }

  isNewPlayerProtectionActive(playerId: string, mapKey: MapKey): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    const account = player.map_accounts[mapKey];
    return account?.new_player_protection_active === true;
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

  subscribe(mapKey: MapKey, cb: (events: GameEvent[], buildings: Building[], workers: Worker[], ambassadors: Ambassador[]) => void): () => void {
    let subs = this.subscribers.get(mapKey);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(mapKey, subs);
    }
    subs.add(cb);
    return () => subs!.delete(cb);
  }

  broadcast(mapKey: MapKey, events: GameEvent[], buildings: Building[], workers: Worker[], ambassadors: Ambassador[]) {
    const subs = this.subscribers.get(mapKey);
    if (subs) {
      for (const cb of subs) cb(events, buildings, workers, ambassadors);
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
    const ambassadors: Record<string, Ambassador> = {};
    for (const [k, v] of this.ambassadors) ambassadors[k] = v;
    const salesTaxHistory: Record<string, number[]> = {};
    for (const [k, v] of this.salesTaxHistory) salesTaxHistory[k] = [...v];
    return {
      tick: this.tick, seq: this.seq, players, buildings,
      marketPrices: this.marketPrices,
      supplyPressure: { ...this.supplyPressure },
      workers,
      taskQueue,
      taskCounter: this.taskCounter,
      ambassadors,
      ambassadorCounter: this.ambassadorCounter,
      salesTaxHistory,
    };
  }

  static fromSnapshot(payload: WorldSnapshotPayload, seed: number): WorldStore {
    const store = new WorldStore(seed);
    store.tick = payload.tick;
    store.seq = payload.seq;

    store.players = new Map(Object.entries(payload.players));
    // Migration: backfill research array for existing players
    for (const player of store.players.values()) {
      if (!player.research) player.research = [];
      for (const account of Object.values(player.map_accounts)) {
        if (account.started_at_tick == null) {
          account.started_at_tick = store.tick;
        }
        if (account.new_player_protection_active == null) {
          account.new_player_protection_active = false;
        }
        if (
          account.new_player_protection_active &&
          store.tick - account.started_at_tick >= NEW_PLAYER_PROTECTION_TICKS
        ) {
          account.new_player_protection_active = false;
        }
      }
    }
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

    // Restore ambassadors
    if (payload.ambassadors) {
      store.ambassadors = new Map(Object.entries(payload.ambassadors));
      // Migration: ensure cooldown_ticks exists
      for (const a of store.ambassadors.values()) {
        if (a.cooldown_ticks == null) a.cooldown_ticks = 0;
      }
    }
    if (payload.ambassadorCounter) {
      store.ambassadorCounter = payload.ambassadorCounter;
    }
    if (payload.salesTaxHistory) {
      store.salesTaxHistory = new Map(Object.entries(payload.salesTaxHistory));
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

    // Recalculate building/worker capacities based on unlocked research
    for (const player of store.players.values()) {
      if (player.research.length > 0) {
        applyResearchEffects(store, player);
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
