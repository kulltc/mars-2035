/**
 * Thin HTTP client for the game server's REST API.
 */

import type {
  GameEvent,
  Building,
  Player,
  MarketPrices,
  Worker,
  Ambassador,
  TaxInfo,
  WorkArea,
  CommandType,
  MapKey,
} from "@mars-2035/shared";
import { parseMapKey } from "@mars-2035/shared";

const GAME_SERVER_URL = process.env.MARS_SERVER_URL ?? "http://localhost:3000";

export interface WorldMeta {
  world_id: string;
  tick: number;
  width: number;
  height: number;
  district_size: number;
}

export interface PlayerWithBuildings extends Player {
  buildings: Building[];
}

export async function getWorld(): Promise<WorldMeta> {
  const res = await fetch(`${GAME_SERVER_URL}/api/world`);
  if (!res.ok) throw new Error(`GET /api/world failed: ${res.status}`);
  return res.json() as Promise<WorldMeta>;
}

export async function getPlayer(
  playerId: string,
  token: string
): Promise<PlayerWithBuildings> {
  const res = await fetch(`${GAME_SERVER_URL}/api/player/${playerId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /api/player failed: ${res.status}`);
  return res.json() as Promise<PlayerWithBuildings>;
}

export async function getEvents(
  mapKey?: string,
  sinceSeq?: number
): Promise<GameEvent[]> {
  const params = new URLSearchParams();
  if (mapKey) params.set("map_key", mapKey);
  if (sinceSeq !== undefined) params.set("since_seq", String(sinceSeq));
  const qs = params.toString();
  const url = `${GAME_SERVER_URL}/api/events${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET /api/events failed: ${res.status}`);
  return res.json() as Promise<GameEvent[]>;
}

/**
 * Collect events over multiple ticks by polling /api/events.
 * Returns once `targetTicks` tick_complete events have been observed.
 */
export async function collectEvents(
  mapKey: string,
  targetTicks: number,
  signal?: AbortSignal
): Promise<GameEvent[]> {
  const allEvents: GameEvent[] = [];
  let ticksSeen = 0;
  let lastSeq = 0;

  // Seed lastSeq from current events so we start from "now"
  const initial = await getEvents(mapKey);
  if (initial.length > 0) {
    lastSeq = initial[initial.length - 1].seq;
  }

  while (ticksSeen < targetTicks) {
    if (signal?.aborted) throw new Error("Aborted");

    await new Promise((r) => setTimeout(r, 1000));

    const batch = await getEvents(mapKey, lastSeq);
    if (batch.length === 0) continue;

    for (const evt of batch) {
      if (evt.seq > lastSeq) {
        lastSeq = evt.seq;
        allEvents.push(evt);
        if (evt.type === "tick_complete") {
          ticksSeen++;
          if (ticksSeen >= targetTicks) break;
        }
      }
    }
  }

  return allEvents;
}

// ── Command submission ──

export interface CommandResult {
  ok: boolean;
  command_id: string;
  /** Set on failure */
  error?: string;
  /** The event emitted on success (e.g. building_placed, export, etc.) */
  event?: GameEvent;
}

export async function submitCommand(
  token: string,
  type: CommandType,
  data: Record<string, unknown>
): Promise<CommandResult> {
  const res = await fetch(`${GAME_SERVER_URL}/api/command`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type, data }),
  });
  const body = await res.json() as { ok: boolean; command_id?: string; error?: string };

  if (!body.ok || !body.command_id) {
    return { ok: false, command_id: "", error: body.error ?? "Command rejected" };
  }

  return waitForCommandResult(body.command_id);
}

/**
 * Poll /api/events until we find an event with our command_id.
 * Success events carry command_id in their data; failures emit command_failed.
 * Typically resolves within one tick (1-5s).
 */
async function waitForCommandResult(
  commandId: string,
  timeoutMs = 15_000,
): Promise<CommandResult> {
  // Get current last seq so we only scan new events
  const initial = await getEvents();
  let lastSeq = initial.length > 0 ? initial[initial.length - 1].seq : 0;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));

    const batch = await getEvents(undefined, lastSeq);
    for (const evt of batch) {
      if (evt.seq > lastSeq) lastSeq = evt.seq;

      if (evt.data.command_id !== commandId) continue;

      if (evt.type === "command_failed") {
        return {
          ok: false,
          command_id: commandId,
          error: evt.data.error as string,
        };
      }

      // Any other event with our command_id means success
      return {
        ok: true,
        command_id: commandId,
        event: evt,
      };
    }
  }

  return {
    ok: false,
    command_id: commandId,
    error: "Timed out waiting for command result (15s)",
  };
}

// ── Market prices ──

export async function getMarketPrices(): Promise<MarketPrices> {
  const res = await fetch(`${GAME_SERVER_URL}/api/market`);
  if (!res.ok) throw new Error(`GET /api/market failed: ${res.status}`);
  return res.json() as Promise<MarketPrices>;
}

// ── Map snapshot (workers, ambassadors, market, tax, work areas) ──

export interface MapSnapshot {
  map_key: string;
  tick: number;
  buildings: Building[];
  workers: Worker[];
  ambassadors: Ambassador[];
  market_prices: MarketPrices;
  tax_info: TaxInfo;
  work_areas: WorkArea[];
}

export async function getMapSnapshot(
  token: string,
  mapKey: MapKey
): Promise<MapSnapshot> {
  const { dx, dy, mx, my } = parseMapKey(mapKey);
  const res = await fetch(
    `${GAME_SERVER_URL}/api/map/${dx}/${dy}/${mx}/${my}/snapshot`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`GET /api/map/.../snapshot failed: ${res.status}`);
  return res.json() as Promise<MapSnapshot>;
}

// ── Map tiles (resource tiles for placement) ──

export interface MapTile {
  x: number;
  y: number;
  resource: { type: string; richness: number };
}

export interface MapTilesResponse {
  map_key: string;
  tiles: MapTile[];
  buildings: Building[];
}

export async function getMapTiles(
  token: string,
  mapKey: MapKey
): Promise<MapTilesResponse> {
  const { dx, dy, mx, my } = parseMapKey(mapKey);
  const res = await fetch(
    `${GAME_SERVER_URL}/api/map/${dx}/${dy}/${mx}/${my}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`GET /api/map failed: ${res.status}`);
  return res.json() as Promise<MapTilesResponse>;
}

// ── Workers ──

export async function getWorkers(
  playerId: string,
  token: string
): Promise<Worker[]> {
  const res = await fetch(`${GAME_SERVER_URL}/api/player/${playerId}/workers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /api/player/.../workers failed: ${res.status}`);
  return res.json() as Promise<Worker[]>;
}

// ── Ambassadors ──

export async function getAmbassadors(
  playerId: string,
  token: string
): Promise<Ambassador[]> {
  const res = await fetch(`${GAME_SERVER_URL}/api/player/${playerId}/ambassadors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /api/player/.../ambassadors failed: ${res.status}`);
  return res.json() as Promise<Ambassador[]>;
}
