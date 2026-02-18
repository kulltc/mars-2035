import type { FastifyInstance } from "fastify";
import { toMapKey, type GameEvent, type Worker } from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";

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

      try {
        app.jwt.verify(token);
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid token" }));
        socket.close();
        return;
      }

      const { dx, dy, mx, my } = req.params;
      const mapKey = toMapKey(Number(dx), Number(dy), Number(mx), Number(my));

      console.log(`WS client connected to map ${mapKey}`);

      // Send initial snapshot
      const tiles = store.serializeTiles(mapKey);
      const buildings = store.getBuildingsByMap(mapKey);
      const workers = store.getWorkersByMap(mapKey);
      socket.send(
        JSON.stringify({
          type: "snapshot",
          map_key: mapKey,
          tick: store.tick,
          tiles,
          buildings,
          workers,
          market_prices: store.marketPrices,
        })
      );

      // Subscribe to map events
      const unsub = store.subscribe(mapKey, (events: GameEvent[], buildings, workers: Worker[]) => {
        if (socket.readyState === 1) {
          socket.send(
            JSON.stringify({
              type: "events",
              map_key: mapKey,
              events,
              buildings,
              workers,
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
