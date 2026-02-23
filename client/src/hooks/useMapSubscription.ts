import { useEffect, useRef } from "react";
import { connectMapWS, fetchMap } from "../api/client.js";
import { useGameStore } from "../state/store.js";
import type { Building, GameEvent, MarketPrices, Tile, Worker, TaxInfo, Ambassador } from "@mars-2035/shared";

interface SnapshotMessage {
  type: "snapshot";
  map_key: string;
  tick: number;
  tiles?: Tile[];
  buildings: Building[];
  workers: Worker[];
  ambassadors?: Ambassador[];
  market_prices: MarketPrices;
  tax_info?: TaxInfo;
}

interface EventsMessage {
  type: "events";
  map_key: string;
  events: GameEvent[];
  buildings: Building[];
  workers: Worker[];
  ambassadors?: Ambassador[];
  market_prices: MarketPrices;
  tax_info?: TaxInfo;
}

type WSMessage = SnapshotMessage | EventsMessage;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

/** Event types that generate user-visible notifications */
function notifyForEvents(events: GameEvent[]) {
  const state = useGameStore.getState();
  const addNotification = state.addNotification;
  const openProtectionEndedModal = state.openProtectionEndedModal;
  const currentPlayerId = state.player?.entity_id;

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
      case "new_player_protection_ended": {
        const playerId = evt.data.player_id as string | undefined;
        if (playerId && currentPlayerId && playerId === currentPlayerId) {
          openProtectionEndedModal();
        }
        break;
      }
      case "ambassador_arrived": {
        const ownerId = evt.data.owner_id as string | undefined;
        const carried = evt.data.carried_money as number | undefined;
        const targetOwnerId = evt.data.target_owner_id as string | undefined;
        if (ownerId === currentPlayerId && carried && carried > 0) {
          addNotification(`Ambassador collected $${carried.toFixed(1)}!`, "success");
        } else if (targetOwnerId === currentPlayerId && carried && carried > 0) {
          addNotification(`An ambassador took $${carried.toFixed(1)} from your building!`, "warning");
        } else if (ownerId === currentPlayerId) {
          const pct = evt.data.pct as number | undefined;
          if (pct != null && pct < 0) {
            addNotification(`Ambassador had to pay — your economy is weaker`, "warning");
          } else {
            addNotification(`Ambassador arrived — no cash exchanged`, "info");
          }
        }
        break;
      }
      case "player_bankrupt": {
        const bankruptPlayerId = evt.data.player_id as string | undefined;
        if (bankruptPlayerId && currentPlayerId && bankruptPlayerId === currentPlayerId) {
          // Refresh player state — the tick already reset map_accounts/research
          const player = state.player;
          if (player) {
            state.setPlayer({
              ...player,
              bankrupt: true,
              map_accounts: {},
              research: [],
              tutorial_step: 1,
              buildings: [],
            });
          }
          state.openBankruptModal();
        }
        break;
      }
      // Suppress routine events: production, routes, market updates, ticks, etc.
    }
  }
}

export function useMapSubscription() {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const cancelledRef = useRef(false);
  const currentMap = useGameStore((s) => s.currentMap);
  const token = useGameStore((s) => s.token);
  const setTiles = useGameStore((s) => s.setTiles);
  const setBuildings = useGameStore((s) => s.setBuildings);
  const setWorkers = useGameStore((s) => s.setWorkers);
  const addEvents = useGameStore((s) => s.addEvents);
  const setMarketPrices = useGameStore((s) => s.setMarketPrices);
  const setTaxInfo = useGameStore((s) => s.setTaxInfo);
  const setAmbassadors = useGameStore((s) => s.setAmbassadors);
  const setWorld = useGameStore((s) => s.setWorld);

  useEffect(() => {
    if (!currentMap || !token) return;

    cancelledRef.current = false;
    attemptRef.current = 0;

    const { dx, dy, mx, my } = currentMap;

    // Fetch tiles via REST (static data, only need to load once per map)
    let tilesFetched = false;
    function fetchTiles() {
      if (tilesFetched) return;
      tilesFetched = true;
      fetchMap(dx, dy, mx, my)
        .then((data) => {
          if (!cancelledRef.current) {
            setTiles(data.tiles);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch tiles:", err);
          tilesFetched = false; // allow retry
        });
    }

    function handleMessage(raw: unknown) {
      const msg = raw as WSMessage;
      if (msg.type === "snapshot") {
        // Tiles come from REST, not WS — fetch once
        if (msg.tiles) {
          setTiles(msg.tiles);
        } else {
          fetchTiles();
        }
        setBuildings(msg.buildings);
        if (msg.workers) setWorkers(msg.workers);
        if (msg.ambassadors) setAmbassadors(msg.ambassadors);
        if (msg.market_prices) setMarketPrices(msg.market_prices);
        if (msg.tax_info) setTaxInfo(msg.tax_info);
        // Update tick from snapshot
        if (msg.tick) {
          const world = useGameStore.getState().world;
          if (world) setWorld({ ...world, tick: msg.tick });
        }
      } else if (msg.type === "events") {
        addEvents(msg.events);
        setBuildings(msg.buildings);
        if (msg.workers) setWorkers(msg.workers);
        if (msg.ambassadors) setAmbassadors(msg.ambassadors);
        if (msg.market_prices) setMarketPrices(msg.market_prices);
        if (msg.tax_info) setTaxInfo(msg.tax_info);
        // Generate notifications for important events
        notifyForEvents(msg.events);
        // Update tick from events
        const tickEvt = msg.events.find((e) => e.type === "tick_complete");
        if (tickEvt) {
          const world = useGameStore.getState().world;
          if (world) setWorld({ ...world, tick: tickEvt.tick });
        }
      }
    }

    function connect() {
      if (cancelledRef.current) return;

      const ws = connectMapWS(dx, dy, mx, my, handleMessage);

      ws.onopen = () => {
        attemptRef.current = 0;
        // Hide modal if it was showing from a previous disconnect
        useGameStore.getState().closeConnectionLostModal();
      };

      ws.onclose = () => {
        if (cancelledRef.current) return;
        useGameStore.getState().openConnectionLostModal();
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, so reconnect is handled there
      };

      wsRef.current = ws;
    }

    function scheduleReconnect() {
      if (cancelledRef.current) return;

      if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        return;
      }

      const delay = RECONNECT_DELAYS[attemptRef.current] ?? RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
      attemptRef.current++;

      retryRef.current = setTimeout(() => {
        if (!cancelledRef.current) {
          connect();
        }
      }, delay);
    }

    connect();

    return () => {
      cancelledRef.current = true;
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [currentMap, token, setTiles, setBuildings, setWorkers, setAmbassadors, addEvents, setMarketPrices, setTaxInfo, setWorld]);
}
