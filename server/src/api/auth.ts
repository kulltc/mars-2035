import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import type { Player } from "@mars-2035/shared";
import { pool } from "../db.js";
import type { WorldStore } from "../store/WorldStore.js";

let playerCounter = 0;

export function setPlayerCounter(n: number) {
  playerCounter = n;
}

function createPlayer(store: WorldStore, playerName: string, playerId: string): Player {
  const player: Player = {
    entity_id: playerId,
    name: playerName,
    status: "active",
    map_accounts: {},
    research: [],
    tutorial_step: 1,
  };
  store.players.set(playerId, player);

  store.pushEvent("player_registered", { player_id: playerId, name: playerName });
  return player;
}

export function registerAuthRoutes(app: FastifyInstance, store: WorldStore) {
  // POST /api/auth/register
  app.post<{ Body: { username: string; password: string; player_name: string } }>(
    "/api/auth/register",
    async (req, reply) => {
      const { username, password, player_name } = req.body;

      if (!username || !password || !player_name) {
        reply.code(400);
        return { error: "username, password, and player_name are required" };
      }

      const hash = await bcrypt.hash(password, 10);
      const playerId = `plr_${Date.now()}_${++playerCounter}`;

      try {
        await pool.query(
          "INSERT INTO users (username, password, player_id) VALUES ($1, $2, $3)",
          [username, hash, playerId]
        );
      } catch (err: any) {
        if (err.code === "23505") {
          reply.code(409);
          return { error: "Username already taken" };
        }
        throw err;
      }

      const player = createPlayer(store, player_name, playerId);
      const buildings = store.getBuildingsByPlayer(player.entity_id);

      const token = app.jwt.sign({ userId: username, playerId });
      return { token, player: { ...player, buildings } };
    }
  );

  // POST /api/auth/login
  app.post<{ Body: { username: string; password: string } }>(
    "/api/auth/login",
    async (req, reply) => {
      const { username, password } = req.body;

      if (!username || !password) {
        reply.code(400);
        return { error: "username and password are required" };
      }

      const result = await pool.query(
        "SELECT username, password, player_id FROM users WHERE username = $1",
        [username]
      );

      if (result.rows.length === 0) {
        reply.code(401);
        return { error: "Invalid username or password" };
      }

      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        reply.code(401);
        return { error: "Invalid username or password" };
      }

      // Re-create player in WorldStore if missing (server restart)
      let player = store.players.get(user.player_id);
      if (!player) {
        player = createPlayer(store, username, user.player_id);
      }

      const token = app.jwt.sign({ userId: username, playerId: user.player_id });
      const buildings = store.getBuildingsByPlayer(player.entity_id);
      return { token, player: { ...player, buildings } };
    }
  );

  // GET /api/auth/me
  app.get("/api/auth/me", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const { playerId } = req.user as { userId: string; playerId: string };

    // Re-create player if missing (server restart)
    let player = store.players.get(playerId);
    if (!player) {
      const result = await pool.query(
        "SELECT username FROM users WHERE player_id = $1",
        [playerId]
      );
      if (result.rows.length === 0) {
        reply.code(404);
        return { error: "User not found" };
      }
      player = createPlayer(store, result.rows[0].username, playerId);
    }

    const buildings = store.getBuildingsByPlayer(player.entity_id);
    return { player: { ...player, buildings } };
  });
}
