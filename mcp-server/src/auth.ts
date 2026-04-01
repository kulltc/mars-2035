/**
 * OAuth provider for the MCP server, backed by the game server's
 * username/password login (/api/auth/login).
 *
 * Token and client state is persisted to Postgres so container restarts
 * don't invalidate existing sessions.
 *
 * Flow:
 * 1. MCP client registers dynamically
 * 2. Client redirects user to /authorize
 * 3. We show a login form (game username + password)
 * 4. User submits → we call game server /api/auth/login
 * 5. On success we issue an auth code and redirect back
 * 6. Client exchanges code for access token at /token
 * 7. Access token = game JWT (passed through to game server API calls)
 */

import { randomUUID, randomBytes } from "node:crypto";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import * as db from "./db.js";

const GAME_SERVER_URL = process.env.MARS_SERVER_URL ?? "http://localhost:3000";

// ── JWT fallback: validate a game JWT by calling the game server ──

async function verifyGameJwt(
  token: string
): Promise<{ playerId: string } | undefined> {
  try {
    const res = await fetch(`${GAME_SERVER_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { player?: { entity_id: string } };
    if (!data.player?.entity_id) return undefined;
    return { playerId: data.player.entity_id };
  } catch {
    return undefined;
  }
}

// ── Clients store (Postgres-backed) ──

export const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId: string) {
    const data = await db.getClient(clientId);
    return data as OAuthClientInformationFull | undefined;
  },
  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ) {
    const clientId = randomUUID();
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    } as OAuthClientInformationFull;
    await db.saveClient(clientId, full);
    return full;
  },
};

// ── OAuth provider ──

export const oauthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ) {
    // Serve a simple login form
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Mars 2035 – Login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #16213e; padding: 2rem; border-radius: 12px; width: 320px; box-shadow: 0 4px 24px rgba(0,0,0,0.4); }
    h2 { margin-top: 0; color: #e94560; }
    label { display: block; margin-top: 1rem; font-size: 0.9rem; }
    input { width: 100%; padding: 0.5rem; margin-top: 0.25rem; border: 1px solid #333; border-radius: 6px; background: #0f3460; color: #e0e0e0; font-size: 1rem; box-sizing: border-box; }
    button { width: 100%; padding: 0.6rem; margin-top: 1.5rem; border: none; border-radius: 6px; background: #e94560; color: white; font-size: 1rem; cursor: pointer; }
    button:hover { background: #c73653; }
    .error { color: #e94560; margin-top: 0.5rem; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Mars 2035</h2>
    <p>Sign in with your game account to connect your AI assistant.</p>
    <form method="POST" action="/login/callback">
      <input type="hidden" name="client_id" value="${client.client_id}">
      <input type="hidden" name="redirect_uri" value="${params.redirectUri}">
      <input type="hidden" name="code_challenge" value="${params.codeChallenge}">
      <input type="hidden" name="state" value="${params.state ?? ""}">
      <label>Username<input type="text" name="username" required autofocus></label>
      <label>Password<input type="password" name="password" required></label>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  },

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ) {
    const entry = await db.getAuthCode(authorizationCode);
    if (!entry) throw new Error("Invalid authorization code");
    return entry.codeChallenge;
  },

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    const entry = await db.getAuthCode(authorizationCode);
    if (!entry) throw new Error("Invalid authorization code");
    await db.deleteAuthCode(authorizationCode);

    // Issue an access token that maps to the game JWT
    const accessToken = randomBytes(32).toString("hex");
    await db.saveAccessToken(accessToken, {
      gameToken: entry.gameToken,
      playerId: entry.playerId,
      clientId: entry.clientId,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 86400, // 24 hours
    };
  },

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new Error("Refresh tokens not supported");
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // 1. Try OAuth access token (DB lookup)
    const entry = await db.getAccessToken(token);
    if (entry) {
      return {
        token,
        clientId: entry.clientId,
        scopes: [],
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
        extra: {
          gameToken: entry.gameToken,
          playerId: entry.playerId,
        },
      };
    }

    // 2. Fallback: try as a game JWT (for UI-issued tokens)
    const jwt = await verifyGameJwt(token);
    if (jwt) {
      return {
        token,
        clientId: "jwt-direct",
        scopes: [],
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
        extra: {
          gameToken: token,
          playerId: jwt.playerId,
        },
      };
    }

    throw new Error("Invalid access token");
  },

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ) {
    await db.deleteAccessToken(request.token);
  },
};

// ── Helper: handle the login form POST ──

export async function handleAuthorizeCallback(
  body: {
    username: string;
    password: string;
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    state: string;
  },
  res: Response
) {
  const { username, password, client_id, redirect_uri, code_challenge, state } =
    body;

  // Authenticate against game server
  const loginRes = await fetch(`${GAME_SERVER_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!loginRes.ok) {
    const err = (await loginRes.json().catch(() => ({}))) as {
      error?: string;
    };
    // Redirect with error
    const url = new URL(redirect_uri);
    url.searchParams.set("error", "access_denied");
    url.searchParams.set(
      "error_description",
      err.error ?? "Invalid credentials"
    );
    if (state) url.searchParams.set("state", state);
    res.redirect(url.toString());
    return;
  }

  const loginData = (await loginRes.json()) as {
    token: string;
    player: { entity_id: string };
  };

  // Store auth code in DB
  const code = randomBytes(16).toString("hex");
  await db.saveAuthCode(code, {
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    gameToken: loginData.token,
    playerId: loginData.player.entity_id,
  });

  // Redirect back to client with code
  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
}

// ── Helper for tool handlers ──

export interface GameAuth {
  gameToken: string;
  playerId: string;
}

export function getGameAuth(authInfo?: AuthInfo): GameAuth {
  if (!authInfo?.extra) {
    throw new Error("Not authenticated");
  }
  return {
    gameToken: authInfo.extra.gameToken as string,
    playerId: authInfo.extra.playerId as string,
  };
}
