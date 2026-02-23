import type { FastifyInstance } from "fastify";
import {
  type Command,
  type CommandType,
  BUILDING_CLASSES,
  MATERIAL_TYPES,
  toMapKey,
} from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";
import { filterStateForPlayer } from "./filterState.js";
import { pool, getResourceTilesForMap } from "../db.js";

const VALID_COMMAND_TYPES: Set<string> = new Set<CommandType>([
  "place_building",
  "transfer",
  "export",
  "configure_auto_sell",
  "configure_route",
  "delete_route",
  "buy_worker",
  "sell_building",
  "remove_worker",
  "configure_worker",
  "do_research",
  "set_buffer_stock",
  "configure_quantum_rule",
  "delete_quantum_rule",
  "import",
  "forfeit",
  "dismiss_tutorial",
  "send_ambassador",
  "acknowledge_bankrupt"
]);

let commandCounter = 0;

export function registerRoutes(app: FastifyInstance, store: WorldStore) {
  // GET /api/world
  app.get("/api/world", async () => {
    return store.getMeta();
  });

  // GET /api/map/:dx/:dy/:mx/:my (authenticated)
  app.get<{ Params: { dx: string; dy: string; mx: string; my: string } }>(
    "/api/map/:dx/:dy/:mx/:my",
    async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        reply.code(401);
        return { error: "Unauthorized" };
      }

      const { playerId } = req.user as { userId: string; playerId: string };
      const { dx, dy, mx, my } = req.params;
      const mapKey = toMapKey(Number(dx), Number(dy), Number(mx), Number(my));
      const rows = await getResourceTilesForMap(mapKey);
      const tiles = rows.map((r) => ({
        x: r.x,
        y: r.y,
        resource: { type: r.resource_type, richness: r.richness },
      }));
      const { buildings } = filterStateForPlayer(
        playerId, store.getBuildingsByMap(mapKey), []
      );
      return { map_key: mapKey, tiles, buildings };
    }
  );

  // GET /api/player/:id (authenticated — own player only)
  app.get<{ Params: { id: string } }>("/api/player/:id", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const { playerId } = req.user as { userId: string; playerId: string };
    if (req.params.id !== playerId) {
      reply.code(403);
      return { error: "Forbidden" };
    }

    const player = store.players.get(req.params.id);
    if (!player) {
      reply.code(404);
      return { error: "Player not found" };
    }
    const buildings = store.getBuildingsByPlayer(player.entity_id);
    return { ...player, buildings };
  });

  // POST /api/command (authenticated — player_id from JWT)
  app.post<{ Body: { type: string; data: Record<string, unknown> } }>(
    "/api/command",
    async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        reply.code(401);
        return { error: "Unauthorized" };
      }

      const { playerId } = req.user as { userId: string; playerId: string };
      const { type, data } = req.body;

      if (!VALID_COMMAND_TYPES.has(type)) {
        reply.code(400);
        return { error: `Invalid command type: ${type}` };
      }

      const player = store.players.get(playerId);
      if (!player) {
        reply.code(404);
        return { error: "Player not found" };
      }

      const command: Command = {
        id: `cmd_${++commandCounter}`,
        player_id: playerId,
        type: type as CommandType,
        data,
        submitted_at: Date.now(),
      };
      store.commandQueue.push(command);
      return { ok: true, command_id: command.id };
    }
  );

  // GET /api/events
  app.get<{ Querystring: { map_key?: string; since_seq?: string } }>(
    "/api/events",
    async (req) => {
      const { map_key, since_seq } = req.query;
      if (map_key) {
        const sinceSeq = since_seq ? Number(since_seq) : 0;
        return store.getEventsSince(map_key, sinceSeq);
      }
      return store.events.slice(-100);
    }
  );

  // POST /api/dev/grant-materials (dev only)
  app.post<{ Body: { username: string; amount?: number } }>(
    "/api/dev/grant-materials",
    async (req, reply) => {
      if (process.env.NODE_ENV === "production") {
        reply.code(403);
        return { error: "Disabled in production" };
      }

      const { username, amount = 10000 } = req.body;
      if (!username) {
        reply.code(400);
        return { error: "username is required" };
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        reply.code(400);
        return { error: "amount must be a positive number" };
      }

      const userResult = await pool.query(
        "SELECT player_id FROM users WHERE username = $1",
        [username]
      );
      if (userResult.rows.length === 0) {
        reply.code(404);
        return { error: "User not found" };
      }

      const playerId = userResult.rows[0].player_id as string;
      const player = store.players.get(playerId);
      if (!player) {
        reply.code(404);
        return { error: "Player is not loaded in world state yet. Log in once, then retry." };
      }

      let updatedOutposts = 0;
      for (const account of Object.values(player.map_accounts)) {
        const adminId = account.admin_outpost_building_id;
        if (!adminId) continue;

        const adminOutpost = store.buildings.get(adminId);
        if (!adminOutpost) continue;

        for (const material of MATERIAL_TYPES) {
          adminOutpost.inventory[material] = amount;
        }

        updatedOutposts += 1;
      }

      if (updatedOutposts === 0) {
        reply.code(400);
        return { error: "Player has no admin outpost yet" };
      }

      return {
        ok: true,
        username,
        player_id: playerId,
        amount,
        admin_outposts_updated: updatedOutposts,
        materials_set: MATERIAL_TYPES.length,
      };
    }
  );
}
