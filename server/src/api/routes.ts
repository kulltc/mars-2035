import type { FastifyInstance } from "fastify";
import {
  type Command,
  type Player,
  STARTING_MONEY,
  toMapKey,
  toDistrictKey,
} from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";

let playerCounter = 0;
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

  // GET /api/player/:id
  app.get<{ Params: { id: string } }>("/api/player/:id", async (req, reply) => {
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

  // POST /api/player
  app.post<{ Body: { name: string } }>("/api/player", async (req) => {
    const { name } = req.body;
    const entityId = `plr_${++playerCounter}`;
    const player: Player = {
      entity_id: entityId,
      name,
      status: "active",
      map_accounts: {},
    };
    store.players.set(entityId, player);
    store.pushEvent("player_registered", { player_id: entityId, name });

    // Give starting money on map 0:0:0:0
    const startMap = toMapKey(0, 0, 0, 0);
    player.map_accounts[startMap] = {
      assets: { money: STARTING_MONEY },
    };

    return player;
  });

  // POST /api/command
  app.post<{ Body: { player_id: string; type: string; data: Record<string, unknown> } }>(
    "/api/command",
    async (req, reply) => {
      const { player_id, type, data } = req.body;
      const player = store.players.get(player_id);
      if (!player) {
        reply.code(404);
        return { error: "Player not found" };
      }

      const command: Command = {
        id: `cmd_${++commandCounter}`,
        player_id,
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
      // Return last 100 events if no filter
      return store.events.slice(-100);
    }
  );
}
