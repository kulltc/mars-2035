import { create } from "zustand";
import type {
  Player, Building, Tile, GameEvent, WorldMeta, MarketPrices, Worker, WorkerFilter,
  BuildingClass, TaxInfo, Ambassador,
} from "@mars-2035/shared";

// ── Notification types ──

export type NotificationType = "success" | "error" | "warning" | "info";

export interface Notification {
  id: string;
  text: string;
  type: NotificationType;
  createdAt: number;
  duration: number; // ms, 0 = manual dismiss
}

// ── Optimistic building ──

export interface PendingBuilding {
  id: string;
  buildingClass: BuildingClass;
  x: number;
  y: number;
  placedAt: number;
}

// ── Route picker ──

export interface RoutePickerTarget {
  fromBuildingId: string;
  toBuildingId: string;
  screenX: number;
  screenY: number;
}

// ── Store ──

let notifCounter = 0;

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

  // Workers on current map
  workers: Worker[];
  setWorkers: (workers: Worker[]) => void;
  workerPrevPositions: Map<string, { x: number; y: number }>;
  workerUpdateAt: number;

  // Ambassadors on current map
  ambassadors: Ambassador[];
  setAmbassadors: (ambassadors: Ambassador[]) => void;
  ambassadorPrevPositions: Map<string, { x: number; y: number }>;
  ambassadorUpdateAt: number;

  // Ambassador targeting mode
  ambassadorTargetMode: string | null; // office_building_id when in targeting mode
  setAmbassadorTargetMode: (officeId: string | null) => void;

  // Auto-mission targeting mode
  autoMissionTargetMode: string | null; // office_building_id when in targeting mode
  setAutoMissionTargetMode: (officeId: string | null) => void;

  // Selected worker
  selectedWorkerId: string | null;
  setSelectedWorkerId: (id: string | null) => void;

  // Selected tile
  selectedTile: { x: number; y: number } | null;
  setSelectedTile: (tile: { x: number; y: number } | null) => void;

  // Market prices
  marketPrices: MarketPrices | null;
  setMarketPrices: (prices: MarketPrices) => void;

  // Event log (kept for subscription, not displayed)
  events: GameEvent[];
  addEvents: (events: GameEvent[]) => void;

  // Build mode
  buildMode: string | null;
  setBuildMode: (mode: string | null) => void;

  // Worker area draw
  areaDrawMode: string | null;
  setAreaDrawMode: (id: string | null) => void;

  // Optimistic worker filter
  pendingWorkerFilter: { workerId: string; filter: WorkerFilter | undefined } | null;
  setPendingWorkerFilter: (workerId: string, filter: WorkerFilter | undefined) => void;
  clearPendingWorkerFilter: () => void;

  // ── New: Notifications ──
  notifications: Notification[];
  addNotification: (text: string, type: NotificationType, duration?: number) => void;
  dismissNotification: (id: string) => void;

  // ── New: Optimistic buildings ──
  pendingBuildings: PendingBuilding[];
  addPendingBuilding: (pb: Omit<PendingBuilding, "id" | "placedAt">) => void;

  // ── New: Route picker ──
  routePickerTarget: RoutePickerTarget | null;
  setRoutePickerTarget: (target: RoutePickerTarget | null) => void;

  // ── New: UI toggles ──
  showMarket: boolean;
  toggleMarket: () => void;
  showTechTree: boolean;
  toggleTechTree: () => void;
  showWorkers: boolean;
  toggleWorkers: () => void;
  showMapSelector: boolean;
  toggleMapSelector: () => void;

  // ── Camera target (for locate-worker) ──
  cameraTarget: { x: number; y: number } | null;
  setCameraTarget: (target: { x: number; y: number } | null) => void;

  // ── Mobile UI ──
  showBuildSheet: boolean;
  toggleBuildSheet: () => void;
  showMainMenu: boolean;
  toggleMainMenu: () => void;
  showInventory: boolean;
  toggleInventory: () => void;

  // ── Tax panel ──
  taxInfo: TaxInfo | null;
  setTaxInfo: (info: TaxInfo | null) => void;
  showTaxPanel: boolean;
  toggleTaxPanel: () => void;

  // ── Bankruptcy modal ──
  showBankruptModal: boolean;
  openBankruptModal: () => void;
  closeBankruptModal: () => void;

  // ── Connection lost modal ──
  showConnectionLostModal: boolean;
  openConnectionLostModal: () => void;
  closeConnectionLostModal: () => void;

  // ── Map expansion mode ──
  expansionEmbassyId: string | null;
  setExpansionMode: (embassyId: string | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  // ── Auth ──
  token: localStorage.getItem("mars_token"),
  setToken: (token) => {
    localStorage.setItem("mars_token", token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem("mars_token");
    set({ token: null, player: null });
  },

  // ── World ──
  world: null,
  setWorld: (world) => set({ world }),

  // ── Player ──
  player: null,
  setPlayer: (player) => set({ player }),

  // ── Map ──
  currentMap: null,
  setCurrentMap: (currentMap) => set({ currentMap }),

  // ── Tiles ──
  tiles: new Map(),
  setTiles: (tiles) => {
    const map = new Map<string, Tile>();
    for (const t of tiles) {
      map.set(`${t.x}:${t.y}`, t);
    }
    set({ tiles: map });
  },

  // ── Buildings ──
  buildings: [],
  setBuildings: (buildings) =>
    set((state) => {
      // Clear pending buildings that server now has or that have expired (2s timeout)
      const buildingPositions = new Set(buildings.map((b) => `${b.location.x}:${b.location.y}`));
      const now = Date.now();
      const pendingBuildings = state.pendingBuildings.filter(
        (pb) => !buildingPositions.has(`${pb.x}:${pb.y}`) && now - pb.placedAt < 2_000
      );
      return { buildings, pendingBuildings };
    }),
  updateBuilding: (building) =>
    set((state) => ({
      buildings: state.buildings.map((b) =>
        b.entity_id === building.entity_id ? building : b
      ),
    })),

  // ── Workers ──
  workers: [],
  setWorkers: (workers) =>
    set((state) => {
      const prev = new Map<string, { x: number; y: number }>();
      for (const w of state.workers) {
        prev.set(w.entity_id, { x: w.x, y: w.y });
      }
      return { workers, workerPrevPositions: prev, workerUpdateAt: Date.now() };
    }),
  workerPrevPositions: new Map(),
  workerUpdateAt: 0,

  // ── Ambassadors ──
  ambassadors: [],
  setAmbassadors: (ambassadors) =>
    set((state) => {
      const prev = new Map<string, { x: number; y: number }>();
      for (const a of state.ambassadors) {
        prev.set(a.entity_id, { x: a.x, y: a.y });
      }
      return { ambassadors, ambassadorPrevPositions: prev, ambassadorUpdateAt: Date.now() };
    }),
  ambassadorPrevPositions: new Map(),
  ambassadorUpdateAt: 0,

  // ── Ambassador targeting ──
  ambassadorTargetMode: null,
  setAmbassadorTargetMode: (ambassadorTargetMode) => set({ ambassadorTargetMode }),

  // ── Auto-mission targeting ──
  autoMissionTargetMode: null,
  setAutoMissionTargetMode: (autoMissionTargetMode) => set({ autoMissionTargetMode }),

  // ── Selection ──
  selectedWorkerId: null,
  setSelectedWorkerId: (selectedWorkerId) => set({ selectedWorkerId }),
  selectedTile: null,
  setSelectedTile: (selectedTile) => set({ selectedTile }),

  // ── Market ──
  marketPrices: null,
  setMarketPrices: (marketPrices) => set({ marketPrices }),

  // ── Events ──
  events: [],
  addEvents: (newEvents) =>
    set((state) => ({
      events: [...state.events, ...newEvents].slice(-200),
    })),

  // ── Build mode ──
  buildMode: null,
  setBuildMode: (buildMode) => set({ buildMode }),

  // ── Area draw ──
  areaDrawMode: null,
  setAreaDrawMode: (areaDrawMode) => set({ areaDrawMode }),

  // ── Optimistic worker filter ──
  pendingWorkerFilter: null,
  setPendingWorkerFilter: (workerId, filter) =>
    set({ pendingWorkerFilter: { workerId, filter } }),
  clearPendingWorkerFilter: () => set({ pendingWorkerFilter: null }),

  // ── Notifications ──
  notifications: [],
  addNotification: (text, type, duration = 4000) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { id: `n-${++notifCounter}`, text, type, createdAt: Date.now(), duration },
      ].slice(-10),
    })),
  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  // ── Pending buildings ──
  pendingBuildings: [],
  addPendingBuilding: (pb) =>
    set((state) => ({
      pendingBuildings: [
        ...state.pendingBuildings,
        { ...pb, id: `pb-${Date.now()}`, placedAt: Date.now() },
      ],
    })),

  // ── Route picker ──
  routePickerTarget: null,
  setRoutePickerTarget: (routePickerTarget) => set({ routePickerTarget }),

  // ── UI toggles ──
  showMarket: false,
  toggleMarket: () => set((state) => ({ showMarket: !state.showMarket })),
  showTechTree: false,
  toggleTechTree: () => set((state) => ({ showTechTree: !state.showTechTree })),
  showWorkers: false,
  toggleWorkers: () => set((state) => ({ showWorkers: !state.showWorkers })),
  showMapSelector: false,
  toggleMapSelector: () => set((state) => ({ showMapSelector: !state.showMapSelector })),

  // ── Camera target ──
  cameraTarget: null,
  setCameraTarget: (cameraTarget) => set({ cameraTarget }),

  // ── Mobile UI ──
  showBuildSheet: false,
  toggleBuildSheet: () => set((state) => ({ showBuildSheet: !state.showBuildSheet })),
  showMainMenu: false,
  toggleMainMenu: () => set((state) => ({ showMainMenu: !state.showMainMenu })),
  showInventory: false,
  toggleInventory: () => set((state) => ({ showInventory: !state.showInventory })),

  // ── Tax panel ──
  taxInfo: null,
  setTaxInfo: (taxInfo) => set({ taxInfo }),
  showTaxPanel: false,
  toggleTaxPanel: () => set((state) => ({ showTaxPanel: !state.showTaxPanel })),

  // ── Bankruptcy modal ──
  showBankruptModal: false,
  openBankruptModal: () => set({ showBankruptModal: true }),
  closeBankruptModal: () => set({ showBankruptModal: false }),

  // ── Connection lost modal ──
  showConnectionLostModal: false,
  openConnectionLostModal: () => set({ showConnectionLostModal: true }),
  closeConnectionLostModal: () => set({ showConnectionLostModal: false }),

  // ── Map expansion mode ──
  expansionEmbassyId: null,
  setExpansionMode: (expansionEmbassyId) => set({ expansionEmbassyId }),
}));
