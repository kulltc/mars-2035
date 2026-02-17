import { useEffect, useRef } from "react";
import { connectMapWS } from "../api/client.js";
import { useGameStore } from "../state/store.js";
import type { Building, GameEvent, Tile } from "@mars-2035/shared";

interface SnapshotMessage {
  type: "snapshot";
  map_key: string;
  tick: number;
  tiles: Tile[];
  buildings: Building[];
}

interface EventsMessage {
  type: "events";
  map_key: string;
  events: GameEvent[];
}

type WSMessage = SnapshotMessage | EventsMessage;

export function useMapSubscription() {
  const wsRef = useRef<WebSocket | null>(null);
  const currentMap = useGameStore((s) => s.currentMap);
  const setTiles = useGameStore((s) => s.setTiles);
  const setBuildings = useGameStore((s) => s.setBuildings);
  const addEvents = useGameStore((s) => s.addEvents);

  useEffect(() => {
    if (!currentMap) return;

    const { dx, dy, mx, my } = currentMap;

    const ws = connectMapWS(dx, dy, mx, my, (raw) => {
      const msg = raw as WSMessage;
      if (msg.type === "snapshot") {
        setTiles(msg.tiles);
        setBuildings(msg.buildings);
      } else if (msg.type === "events") {
        addEvents(msg.events);
      }
    });

    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [currentMap, setTiles, setBuildings, addEvents]);
}
