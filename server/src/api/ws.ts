import type { FastifyInstance } from "fastify";
import { toMapKey, type GameEvent, type Worker } from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";
import { filterStateForPlayer } from "./filterState.js";

export function registerWebSocket(app: FastifyInstance, store: WorldStore) {
  app.get<{
    Params: { dx: string; dy: string; mx: string; my: string };
    Querystring: { token?: string };
  }>(
    "/ws/map/:dx/:dy/:mx/:my",
    { websocket: true },
    (socket, req) => {
      // Verify JWT token from query param
      const token = req.query.token;
      if (!token) {
        socket.send(JSON.stringify({ type: "error", message: "Missing token" }));
        socket.close();
        return;
      }

      let playerId: string;
      try {
        const decoded = app.jwt.verify(token) as { playerId: string };
        playerId = decoded.playerId;
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid token" }));
        socket.close();
        return;
      }

      const { dx, dy, mx, my } = req.params;
      const mapKey = toMapKey(Number(dx), Number(dy), Number(mx), Number(my));

      console.log(`WS client connected to map ${mapKey}`);

      // Send initial snapshot (filtered per player)
      const tiles = store.serializeTiles(mapKey);
      const { buildings: filteredBuildings, workers: filteredWorkers } =
        filterStateForPlayer(playerId, store.getBuildingsByMap(mapKey), store.getWorkersByMap(mapKey));
      socket.send(
        JSON.stringify({
          type: "snapshot",
          map_key: mapKey,
          tick: store.tick,
          tiles,
          buildings: filteredBuildings,
          workers: filteredWorkers,
          market_prices: store.marketPrices,
        })
      );

      // Subscribe to map events (filtered per player)
      const unsub = store.subscribe(mapKey, (events: GameEvent[], buildings, workers: Worker[]) => {
        if (socket.readyState === 1) {
          const filtered = filterStateForPlayer(playerId, buildings, workers);
          socket.send(
            JSON.stringify({
              type: "events",
              map_key: mapKey,
              events,
              buildings: filtered.buildings,
              workers: filtered.workers,
              market_prices: store.marketPrices,
            })
          );
        }
      });

      socket.on("close", () => {
        console.log(`WS client disconnected from map ${mapKey}`);
        unsub();
      });
    }
  );
}
