import type { Player, WorldMeta, Tile, Building, DistrictState, GameEvent, AuthResponse } from "@mars-2035/shared";

const BASE = "";

function getToken(): string | null {
  return localStorage.getItem("mars_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ── Auth ──

export async function register(
  username: string, password: string, player_name: string
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, player_name }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Registration failed");
  }
  return res.json();
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Login failed");
  }
  return res.json();
}

export async function getMe(): Promise<{ player: Player & { buildings: Building[] } }> {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

// ── Game API ──

export async function fetchWorld(): Promise<WorldMeta> {
  const res = await fetch(`${BASE}/api/world`);
  return res.json();
}

export async function fetchMap(
  dx: number, dy: number, mx: number, my: number
): Promise<{ map_key: string; tiles: Tile[]; buildings: Building[] }> {
  const res = await fetch(`${BASE}/api/map/${dx}/${dy}/${mx}/${my}`);
  return res.json();
}

export async function fetchPlayer(id: string): Promise<Player & { buildings: Building[] }> {
  const res = await fetch(`${BASE}/api/player/${id}`, {
    headers: authHeaders(),
  });
  return res.json();
}

export async function fetchDistrict(dx: number, dy: number): Promise<DistrictState> {
  const res = await fetch(`${BASE}/api/district/${dx}/${dy}`);
  return res.json();
}

export async function submitCommand(
  type: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; command_id: string }> {
  const res = await fetch(`${BASE}/api/command`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ type, data }),
  });
  return res.json();
}

export async function fetchEvents(mapKey: string, sinceSeq = 0): Promise<GameEvent[]> {
  const res = await fetch(
    `${BASE}/api/events?map_key=${encodeURIComponent(mapKey)}&since_seq=${sinceSeq}`
  );
  return res.json();
}

export function connectMapWS(
  dx: number, dy: number, mx: number, my: number,
  onMessage: (data: unknown) => void
): WebSocket {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const token = getToken();
  const ws = new WebSocket(
    `${protocol}//${location.host}/ws/map/${dx}/${dy}/${mx}/${my}?token=${token}`
  );
  ws.onmessage = (evt) => {
    const data = JSON.parse(evt.data);
    onMessage(data);
  };
  return ws;
}
