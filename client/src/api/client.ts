import type { Player, WorldMeta, Tile, Building, DistrictState, GameEvent } from "@mars-2035/shared";

const BASE = "";

export async function fetchWorld(): Promise<WorldMeta> {
  const res = await fetch(`${BASE}/api/world`);
  return res.json();
}

export async function fetchMap(
  dx: number,
  dy: number,
  mx: number,
  my: number
): Promise<{ map_key: string; tiles: Tile[]; buildings: Building[] }> {
  const res = await fetch(`${BASE}/api/map/${dx}/${dy}/${mx}/${my}`);
  return res.json();
}

export async function fetchPlayer(id: string): Promise<Player & { buildings: Building[] }> {
  const res = await fetch(`${BASE}/api/player/${id}`);
  return res.json();
}

export async function fetchDistrict(dx: number, dy: number): Promise<DistrictState> {
  const res = await fetch(`${BASE}/api/district/${dx}/${dy}`);
  return res.json();
}

export async function registerPlayer(name: string): Promise<Player> {
  const res = await fetch(`${BASE}/api/player`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function submitCommand(
  player_id: string,
  type: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; command_id: string }> {
  const res = await fetch(`${BASE}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player_id, type, data }),
  });
  return res.json();
}

export async function fetchEvents(
  mapKey: string,
  sinceSeq = 0
): Promise<GameEvent[]> {
  const res = await fetch(
    `${BASE}/api/events?map_key=${encodeURIComponent(mapKey)}&since_seq=${sinceSeq}`
  );
  return res.json();
}

export function connectMapWS(
  dx: number,
  dy: number,
  mx: number,
  my: number,
  onMessage: (data: unknown) => void
): WebSocket {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws/map/${dx}/${dy}/${mx}/${my}`);
  ws.onmessage = (evt) => {
    const data = JSON.parse(evt.data);
    onMessage(data);
  };
  return ws;
}
