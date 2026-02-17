import type { FastifyInstance } from "fastify";
import {
  type Command,
  toMapKey,
  toDistrictKey,
} from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";

let commandCounter = 0;

export function registerRoutes(app: FastifyInstance, store: WorldStore) {
  // GET /api/world
  app.get("/api/world", async () => {
    return store.getMeta();
  });

  // GET /api/map/:dx/:dy/:mx/:my
  app.get<{ Params: { dx: string; dy: string; mx: string; my: string } }>(
    "/api/map/:dx/:dy/:mx/:my",
    async (req) => {
      const { dx, dy, mx, my } = req.params;
      const mapKey = toMapKey(Number(dx), Number(dy), Number(mx), Number(my));
      const tiles = store.serializeTiles(mapKey);
      const buildings = store.getBuildingsByMap(mapKey);
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

  // GET /api/district/:dx/:dy
  app.get<{ Params: { dx: string; dy: string } }>(
    "/api/district/:dx/:dy",
    async (req, reply) => {
      const key = toDistrictKey(Number(req.params.dx), Number(req.params.dy));
      const district = store.districts.get(key);
      if (!district) {
        reply.code(404);
        return { error: "District not found" };
      }
      return district;
    }
  );

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

      const player = store.players.get(playerId);
      if (!player) {
        reply.code(404);
        return { error: "Player not found" };
      }

      const command: Command = {
        id: `cmd_${++commandCounter}`,
        player_id: playerId,
        type: type as Command["type"],
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
}
