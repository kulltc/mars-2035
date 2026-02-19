import type { FastifyInstance } from "fastify";
import {
  type Command,
  type CommandType,
  BUILDING_CLASSES,
  toMapKey,
} from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";
import { filterStateForPlayer } from "./filterState.js";

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
  "set_buffer_stock",
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
      const tiles = store.serializeTiles(mapKey);
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
}
