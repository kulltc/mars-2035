/**
 * Postgres-backed token store for MCP OAuth.
 * Survives container restarts so clients don't need to re-authenticate.
 */

import pg from "pg";
const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://postgres:password@localhost:5432/postgres",
});

export async function initTokenStore(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mcp_clients (
      client_id       TEXT PRIMARY KEY,
      data            JSONB NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS mcp_access_tokens (
      token           TEXT PRIMARY KEY,
      game_token      TEXT NOT NULL,
      player_id       TEXT NOT NULL,
      client_id       TEXT NOT NULL,
      expires_at      TIMESTAMPTZ NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS mcp_auth_codes (
      code            TEXT PRIMARY KEY,
      client_id       TEXT NOT NULL,
      redirect_uri    TEXT NOT NULL,
      code_challenge  TEXT NOT NULL,
      game_token      TEXT NOT NULL,
      player_id       TEXT NOT NULL,
      expires_at      TIMESTAMPTZ NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Clean up expired rows on startup
  await pool.query(`DELETE FROM mcp_access_tokens WHERE expires_at < now()`);
  await pool.query(`DELETE FROM mcp_auth_codes WHERE expires_at < now()`);
}

// ── Clients ──

export async function getClient(clientId: string): Promise<unknown | undefined> {
  const { rows } = await pool.query(
    `SELECT data FROM mcp_clients WHERE client_id = $1`,
    [clientId]
  );
  return rows[0]?.data;
}

export async function saveClient(clientId: string, data: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO mcp_clients (client_id, data)
     VALUES ($1, $2)
     ON CONFLICT (client_id) DO UPDATE SET data = $2`,
    [clientId, JSON.stringify(data)]
  );
}

// ── Auth Codes ──

export async function getAuthCode(code: string) {
  const { rows } = await pool.query(
    `SELECT client_id, redirect_uri, code_challenge, game_token, player_id
     FROM mcp_auth_codes WHERE code = $1 AND expires_at > now()`,
    [code]
  );
  if (rows.length === 0) return undefined;
  return {
    clientId: rows[0].client_id as string,
    redirectUri: rows[0].redirect_uri as string,
    codeChallenge: rows[0].code_challenge as string,
    gameToken: rows[0].game_token as string,
    playerId: rows[0].player_id as string,
  };
}

export async function saveAuthCode(
  code: string,
  entry: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    gameToken: string;
    playerId: string;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO mcp_auth_codes (code, client_id, redirect_uri, code_challenge, game_token, player_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + interval '5 minutes')`,
    [code, entry.clientId, entry.redirectUri, entry.codeChallenge, entry.gameToken, entry.playerId]
  );
}

export async function deleteAuthCode(code: string): Promise<void> {
  await pool.query(`DELETE FROM mcp_auth_codes WHERE code = $1`, [code]);
}

// ── Access Tokens ──

export async function getAccessToken(token: string) {
  const { rows } = await pool.query(
    `SELECT game_token, player_id, client_id
     FROM mcp_access_tokens WHERE token = $1 AND expires_at > now()`,
    [token]
  );
  if (rows.length === 0) return undefined;
  return {
    gameToken: rows[0].game_token as string,
    playerId: rows[0].player_id as string,
    clientId: rows[0].client_id as string,
  };
}

export async function saveAccessToken(
  token: string,
  entry: { gameToken: string; playerId: string; clientId: string }
): Promise<void> {
  await pool.query(
    `INSERT INTO mcp_access_tokens (token, game_token, player_id, client_id, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '24 hours')`,
    [token, entry.gameToken, entry.playerId, entry.clientId]
  );
}

export async function deleteAccessToken(token: string): Promise<void> {
  await pool.query(`DELETE FROM mcp_access_tokens WHERE token = $1`, [token]);
}
