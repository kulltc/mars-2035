import { useEffect, useRef } from "react";
import { connectMapWS } from "../api/client.js";
import { useGameStore } from "../state/store.js";
import type { Building, GameEvent, MarketPrices, Tile, Worker } from "@mars-2035/shared";

interface SnapshotMessage {
  type: "snapshot";
  map_key: string;
  tick: number;
  tiles: Tile[];
  buildings: Building[];
  workers: Worker[];
  market_prices: MarketPrices;
}

interface EventsMessage {
  type: "events";
  map_key: string;
  events: GameEvent[];
  buildings: Building[];
  workers: Worker[];
  market_prices: MarketPrices;
}

type WSMessage = SnapshotMessage | EventsMessage;

/** Event types that generate user-visible notifications */
function notifyForEvents(events: GameEvent[]) {
  const addNotification = useGameStore.getState().addNotification;
  for (const evt of events) {
    switch (evt.type) {
      case "command_failed":
        addNotification(`${evt.data.command_type}: ${evt.data.error}`, "error");
        break;
      case "building_suspended":
        addNotification(
          `Building suspended: ${evt.data.reason}`,
          "warning"
        );
        break;
      case "building_destroyed":
        addNotification("A building was destroyed!", "error");
        break;
      case "construction_complete":
        addNotification("Construction complete!", "success");
        break;
      // Suppress routine events: production, routes, market updates, ticks, etc.
    }
  }
}

export function useMapSubscription() {
  const wsRef = useRef<WebSocket | null>(null);
  const currentMap = useGameStore((s) => s.currentMap);
  const setTiles = useGameStore((s) => s.setTiles);
  const setBuildings = useGameStore((s) => s.setBuildings);
  const setWorkers = useGameStore((s) => s.setWorkers);
  const addEvents = useGameStore((s) => s.addEvents);
  const setMarketPrices = useGameStore((s) => s.setMarketPrices);
  const setWorld = useGameStore((s) => s.setWorld);

  useEffect(() => {
    if (!currentMap) return;

    const { dx, dy, mx, my } = currentMap;

    const ws = connectMapWS(dx, dy, mx, my, (raw) => {
      const msg = raw as WSMessage;
      if (msg.type === "snapshot") {
        setTiles(msg.tiles);
        setBuildings(msg.buildings);
        if (msg.workers) setWorkers(msg.workers);
        if (msg.market_prices) setMarketPrices(msg.market_prices);
        // Update tick from snapshot
        if (msg.tick) {
          const world = useGameStore.getState().world;
          if (world) setWorld({ ...world, tick: msg.tick });
        }
      } else if (msg.type === "events") {
        addEvents(msg.events);
        setBuildings(msg.buildings);
        if (msg.workers) setWorkers(msg.workers);
        if (msg.market_prices) setMarketPrices(msg.market_prices);
        // Generate notifications for important events
        notifyForEvents(msg.events);
        // Update tick from events
        const tickEvt = msg.events.find((e) => e.type === "tick_complete");
        if (tickEvt) {
          const world = useGameStore.getState().world;
          if (world) setWorld({ ...world, tick: tickEvt.tick });
        }
      }
    });

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [currentMap, setTiles, setBuildings, setWorkers, addEvents, setMarketPrices, setWorld]);
}
