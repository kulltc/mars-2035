import { create } from "zustand";
import type {
  Player, Building, Tile, GameEvent, WorldMeta, MarketPrices,
} from "@mars-2035/shared";

export interface GameState {
  // Auth
  token: string | null;
  setToken: (token: string) => void;
  logout: () => void;

  // World
  world: WorldMeta | null;
  setWorld: (world: WorldMeta) => void;

  // Current player
  player: (Player & { buildings: Building[] }) | null;
  setPlayer: (player: (Player & { buildings: Building[] }) | null) => void;

  // Current map view
  currentMap: { dx: number; dy: number; mx: number; my: number } | null;
  setCurrentMap: (map: { dx: number; dy: number; mx: number; my: number }) => void;

  // Tiles for current map (keyed by "x:y")
  tiles: Map<string, Tile>;
  setTiles: (tiles: Tile[]) => void;

  // Buildings on current map
  buildings: Building[];
  setBuildings: (buildings: Building[]) => void;
  updateBuilding: (building: Building) => void;

  // Selected tile
  selectedTile: { x: number; y: number } | null;
  setSelectedTile: (tile: { x: number; y: number } | null) => void;

  // Market prices
  marketPrices: MarketPrices | null;
  setMarketPrices: (prices: MarketPrices) => void;

  // Event log
  events: GameEvent[];
  addEvents: (events: GameEvent[]) => void;

  // UI
  buildMode: string | null; // building class being placed
  setBuildMode: (mode: string | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  token: localStorage.getItem("mars_token"),
  setToken: (token) => {
    localStorage.setItem("mars_token", token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem("mars_token");
    set({ token: null, player: null });
  },

  world: null,
  setWorld: (world) => set({ world }),

  player: null,
  setPlayer: (player) => set({ player }),

  currentMap: null,
  setCurrentMap: (currentMap) => set({ currentMap }),

  tiles: new Map(),
  setTiles: (tiles) => {
    const map = new Map<string, Tile>();
    for (const t of tiles) {
      map.set(`${t.x}:${t.y}`, t);
    }
    set({ tiles: map });
  },

  buildings: [],
  setBuildings: (buildings) => set({ buildings }),
  updateBuilding: (building) =>
    set((state) => ({
      buildings: state.buildings.map((b) =>
        b.entity_id === building.entity_id ? building : b
      ),
    })),

  selectedTile: null,
  setSelectedTile: (selectedTile) => set({ selectedTile }),

  marketPrices: null,
  setMarketPrices: (marketPrices) => set({ marketPrices }),

  events: [],
  addEvents: (newEvents) =>
    set((state) => ({
      events: [...state.events, ...newEvents].slice(-200),
    })),

  buildMode: null,
  setBuildMode: (buildMode) => set({ buildMode }),
}));
