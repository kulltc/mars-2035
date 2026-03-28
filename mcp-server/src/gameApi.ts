/**
 * Thin HTTP client for the game server's REST API.
 */

import type { GameEvent, Building, Player, MarketPrices } from "@mars-2035/shared";

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
