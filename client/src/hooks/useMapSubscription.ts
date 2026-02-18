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

export function useMapSubscription() {
  const wsRef = useRef<WebSocket | null>(null);
  const currentMap = useGameStore((s) => s.currentMap);
  const setTiles = useGameStore((s) => s.setTiles);
  const setBuildings = useGameStore((s) => s.setBuildings);
  const setWorkers = useGameStore((s) => s.setWorkers);
  const addEvents = useGameStore((s) => s.addEvents);
  const setMarketPrices = useGameStore((s) => s.setMarketPrices);

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
      } else if (msg.type === "events") {
        addEvents(msg.events);
        setBuildings(msg.buildings);
        if (msg.workers) setWorkers(msg.workers);
        if (msg.market_prices) setMarketPrices(msg.market_prices);
      }
    });

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [currentMap, setTiles, setBuildings, setWorkers, addEvents, setMarketPrices]);
}
