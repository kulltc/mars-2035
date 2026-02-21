import type { FastifyInstance } from "fastify";
import { toMapKey, TERRITORY_BUILDINGS, TAX_PER_BUILDING, type GameEvent, type Worker, type MapKey, type TaxInfo } from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";
import { filterStateForPlayer } from "./filterState.js";

const TERRITORY_SET = new Set<string>(TERRITORY_BUILDINGS);

function computeTaxInfo(store: WorldStore, mapKey: MapKey): TaxInfo {
  const playerCounts = new Map<string, number>();
  let total = 0;
  for (const b of store.buildings.values()) {
    if (b.map_key === mapKey && b.status === "active" && TERRITORY_SET.has(b.class)) {
      playerCounts.set(b.owner_id, (playerCounts.get(b.owner_id) ?? 0) + 1);
      total++;
    }
  }
  const taxRate = total * TAX_PER_BUILDING;
  const players: TaxInfo["players"] = [];
  for (const [playerId, count] of playerCounts) {
    const player = store.players.get(playerId);
    players.push({
      playerId,
      name: player?.name ?? "Unknown",
      buildings: count,
      share: total > 0 ? count / total : 0,
    });
  }
  return { taxRate, players };
}

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
          tax_info: computeTaxInfo(store, mapKey),
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
              tax_info: computeTaxInfo(store, mapKey),
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
