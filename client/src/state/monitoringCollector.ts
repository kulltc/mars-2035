import type { ResourceType, BuildingClass, BuildingStatus, GameEvent, Assets } from "@mars-2035/shared";
import { BUILDING_DEFS } from "@mars-2035/shared";
import { useGameStore } from "./store.js";

// ── Types ──

export interface WorkerSnapshot {
  total: number;
  active: number;
  idle: number;
}

export interface BuildingSnapshotEntry {
  id: string;
  class: BuildingClass;
  status: BuildingStatus;
  resourceType?: ResourceType;
  richness?: number;
}

export interface TickSnapshot {
  tick: number;
  timestamp: number;
  production: Partial<Record<ResourceType, number>>;
  processing: Partial<Record<ResourceType, number>>;
  consumption: Partial<Record<ResourceType, number>>;
  upkeepCharged: number;
  salesRevenue: number;
  salesByResource: Partial<Record<ResourceType, number>>;
  importCosts: number;
  taxCollected: number;
  taxPaid: number;
  ambassadorIncome: number;
  ambassadorExpense: number;
  constructionSpend: number;
  workerCount: WorkerSnapshot;
  buildingSnapshot: BuildingSnapshotEntry[];
}

export type TrendDirection = "increasing" | "decreasing" | "stable";

export interface MonitoringAggregates {
  windowSize: number;
  ticksCaptured: number;

  // Production
  totalProduction: Partial<Record<ResourceType, number>>;
  avgProductionPerTick: Partial<Record<ResourceType, number>>;
  theoreticalMax: Partial<Record<ResourceType, number>>;
  efficiency: Partial<Record<ResourceType, number>>;
  producingBuildingCount: Partial<Record<ResourceType, number>>;
  avgProductionPerBuilding: Partial<Record<ResourceType, number>>;

  // Consumption
  totalConsumption: Partial<Record<ResourceType, number>>;
  avgConsumptionPerTick: Partial<Record<ResourceType, number>>;
  netChange: Partial<Record<ResourceType, number>>;
  trend: Partial<Record<ResourceType, TrendDirection>>;

  // Financial
  totalUpkeep: number;
  buildingUpkeep: number;
  workerUpkeep: number;
  totalSalesRevenue: number;
  totalImportCosts: number;
  totalTaxIncome: number;
  totalTaxPaid: number;
  totalAmbassadorIncome: number;
  totalAmbassadorExpense: number;
  totalConstructionCosts: number;
  netProfitLoss: number;
  avgIncomePerTick: number;
  avgExpensesPerTick: number;
  avgNetPerTick: number;

  // Workers
  avgWorkers: WorkerSnapshot;
}

// ── Ring Buffer ──

const MAX_SNAPSHOTS = 200;
const snapshots: TickSnapshot[] = [];
const listeners = new Set<() => void>();
let version = 0;

export function getVersion(): number {
  return version;
}

// ── Accumulator for current tick ──

let accumulator: Omit<TickSnapshot, "tick" | "timestamp" | "workerCount" | "buildingSnapshot"> = createEmptyAccumulator();
let lastProcessedSeq = -1;
let unsubscribe: (() => void) | null = null;

function createEmptyAccumulator() {
  return {
    production: {} as Partial<Record<ResourceType, number>>,
    processing: {} as Partial<Record<ResourceType, number>>,
    consumption: {} as Partial<Record<ResourceType, number>>,
    upkeepCharged: 0,
    salesRevenue: 0,
    salesByResource: {} as Partial<Record<ResourceType, number>>,
    importCosts: 0,
    taxCollected: 0,
    taxPaid: 0,
    ambassadorIncome: 0,
    ambassadorExpense: 0,
    constructionSpend: 0,
  };
}

function addToRecord(rec: Partial<Record<ResourceType, number>>, key: ResourceType, amount: number) {
  rec[key] = (rec[key] ?? 0) + amount;
}

function processEvent(evt: GameEvent, playerId: string) {
  switch (evt.type) {
    case "production": {
      const ownerId = evt.data.owner_id as string | undefined;
      const buildingId = evt.data.building_id as string | undefined;
      // Production events don't always have owner_id — check building ownership from store
      if (ownerId && ownerId !== playerId) {
        // Check if building belongs to player
        if (buildingId) {
          const building = useGameStore.getState().buildings.find(b => b.entity_id === buildingId);
          if (!building || building.owner_id !== playerId) return;
        } else {
          return;
        }
      } else if (!ownerId && buildingId) {
        const building = useGameStore.getState().buildings.find(b => b.entity_id === buildingId);
        if (!building || building.owner_id !== playerId) return;
      }
      const material = evt.data.material as ResourceType;
      const amount = evt.data.amount as number;
      addToRecord(accumulator.production, material, amount);
      break;
    }
    case "processing": {
      const buildingId = evt.data.building_id as string;
      const building = useGameStore.getState().buildings.find(b => b.entity_id === buildingId);
      if (!building || building.owner_id !== playerId) return;
      const material = evt.data.material as ResourceType;
      const amount = evt.data.amount as number;
      addToRecord(accumulator.processing, material, amount);
      // Track consumption from inputs
      const inputs = evt.data.inputs as Assets | undefined;
      if (inputs) {
        for (const [mat, qty] of Object.entries(inputs)) {
          if (mat !== "money" && qty && qty > 0) {
            addToRecord(accumulator.consumption, mat as ResourceType, qty);
          }
        }
      }
      break;
    }
    case "upkeep_charged": {
      if (evt.data.player_id !== playerId) return;
      accumulator.upkeepCharged += (evt.data.amount as number) ?? 0;
      break;
    }
    case "auto_sell": {
      if (evt.data.player_id !== playerId) return;
      const revenue = (evt.data.revenue as number) ?? 0;
      accumulator.salesRevenue += revenue;
      const resource = evt.data.resource as ResourceType;
      addToRecord(accumulator.salesByResource, resource, revenue);
      break;
    }
    case "export": {
      if (evt.data.player_id !== playerId) return;
      const revenue = (evt.data.revenue as number) ?? 0;
      accumulator.salesRevenue += revenue;
      const material = evt.data.material as ResourceType;
      addToRecord(accumulator.salesByResource, material, revenue);
      break;
    }
    case "import": {
      if (evt.data.player_id !== playerId) return;
      accumulator.importCosts += (evt.data.cost as number) ?? 0;
      break;
    }
    case "tax_collected": {
      if (evt.data.player_id !== playerId) return;
      accumulator.taxCollected += (evt.data.amount as number) ?? 0;
      break;
    }
    case "tax_paid": {
      if (evt.data.player_id !== playerId) return;
      accumulator.taxPaid += (evt.data.amount as number) ?? 0;
      break;
    }
    case "ambassador_arrived": {
      const ownerId = evt.data.owner_id as string;
      const carriedMoney = (evt.data.carried_money as number) ?? 0;
      if (ownerId === playerId && carriedMoney > 0) {
        accumulator.ambassadorIncome += carriedMoney;
      }
      const targetOwnerId = evt.data.target_owner_id as string | undefined;
      if (targetOwnerId === playerId && carriedMoney > 0) {
        accumulator.ambassadorExpense += carriedMoney;
      }
      break;
    }
    case "building_placed": {
      if (evt.data.owner_id !== playerId) return;
      const buildingClass = evt.data.building_class as BuildingClass;
      const def = BUILDING_DEFS[buildingClass];
      if (def?.cost?.money) {
        accumulator.constructionSpend += def.cost.money;
      }
      break;
    }
  }
}

function finalizeTick(tick: number) {
  const state = useGameStore.getState();
  const playerId = state.player?.entity_id;
  if (!playerId) return;

  const playerBuildings = state.buildings.filter(b => b.owner_id === playerId);
  const playerWorkers = state.workers.filter(w => w.owner_id === playerId);
  const tiles = state.tiles;

  const buildingSnapshot: BuildingSnapshotEntry[] = playerBuildings.map(b => {
    const entry: BuildingSnapshotEntry = {
      id: b.entity_id,
      class: b.class,
      status: b.status,
    };
    if (b.class === "mine" && b.resource_type) {
      entry.resourceType = b.resource_type;
      const tile = tiles.get(`${b.location.x}:${b.location.y}`);
      entry.richness = tile?.resource?.richness ?? 1;
    }
    if (BUILDING_DEFS[b.class].recipe) {
      const recipe = BUILDING_DEFS[b.class].recipe!;
      entry.resourceType = recipe.output as ResourceType;
    }
    return entry;
  });

  const snapshot: TickSnapshot = {
    tick,
    timestamp: Date.now(),
    ...accumulator,
    workerCount: {
      total: playerWorkers.length,
      active: playerWorkers.filter(w => w.worker_status === "active").length,
      idle: playerWorkers.filter(w => w.worker_status === "active" && w.state === "idle").length,
    },
    buildingSnapshot,
  };

  snapshots.push(snapshot);
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS);
  }

  accumulator = createEmptyAccumulator();
  notifyListeners();
}

function notifyListeners() {
  version++;
  for (const cb of listeners) {
    cb();
  }
}

// ── Public API ──

export function initMonitoringCollector() {
  if (unsubscribe) return; // Already initialized

  let lastMapKey: string | null = null;

  unsubscribe = useGameStore.subscribe((state, prevState) => {
    // Detect map change → reset
    const mapKey = state.currentMap
      ? `${state.currentMap.dx}:${state.currentMap.dy}:${state.currentMap.mx}:${state.currentMap.my}`
      : null;
    if (mapKey !== lastMapKey) {
      lastMapKey = mapKey;
      snapshots.length = 0;
      accumulator = createEmptyAccumulator();
      lastProcessedSeq = -1;
      notifyListeners();
      return;
    }

    // Process new events
    const events = state.events;
    if (events.length === 0) return;

    const playerId = state.player?.entity_id;
    if (!playerId) return;

    // Find new events by seq number
    const newEvents = lastProcessedSeq < 0
      ? events
      : events.filter(e => e.seq > lastProcessedSeq);

    if (newEvents.length === 0) return;

    let tickCompleted = false;
    let completedTick = 0;

    for (const evt of newEvents) {
      if (evt.seq > lastProcessedSeq) {
        lastProcessedSeq = evt.seq;
      }
      if (evt.type === "tick_complete") {
        tickCompleted = true;
        completedTick = evt.tick;
      } else {
        processEvent(evt, playerId);
      }
    }

    if (tickCompleted) {
      finalizeTick(completedTick);
    }
  });
}

export function destroyMonitoringCollector() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  snapshots.length = 0;
  accumulator = createEmptyAccumulator();
  lastProcessedSeq = -1;
}

export function getSnapshots(windowSize: number): TickSnapshot[] {
  return snapshots.slice(-windowSize);
}

export function subscribeMonitoring(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// ── Aggregate Computation ──

export function getMonitoringAggregates(windowSize: 10 | 50 | 100): MonitoringAggregates {
  const window = snapshots.slice(-windowSize);
  const ticksCaptured = window.length;

  if (ticksCaptured === 0) {
    return emptyAggregates(windowSize);
  }

  // Sum production, processing, consumption
  const totalProduction: Partial<Record<ResourceType, number>> = {};
  const totalProcessing: Partial<Record<ResourceType, number>> = {};
  const totalConsumption: Partial<Record<ResourceType, number>> = {};
  let totalUpkeep = 0;
  let totalSalesRevenue = 0;
  let totalImportCosts = 0;
  let totalTaxIncome = 0;
  let totalTaxPaid = 0;
  let totalAmbassadorIncome = 0;
  let totalAmbassadorExpense = 0;
  let totalConstructionCosts = 0;
  let totalWorkers = 0;
  let totalActiveWorkers = 0;
  let totalIdleWorkers = 0;

  for (const snap of window) {
    for (const [res, amt] of Object.entries(snap.production)) {
      addToRecord(totalProduction, res as ResourceType, amt!);
    }
    for (const [res, amt] of Object.entries(snap.processing)) {
      addToRecord(totalProcessing, res as ResourceType, amt!);
    }
    for (const [res, amt] of Object.entries(snap.consumption)) {
      addToRecord(totalConsumption, res as ResourceType, amt!);
    }
    totalUpkeep += snap.upkeepCharged;
    totalSalesRevenue += snap.salesRevenue;
    totalImportCosts += snap.importCosts;
    totalTaxIncome += snap.taxCollected;
    totalTaxPaid += snap.taxPaid;
    totalAmbassadorIncome += snap.ambassadorIncome;
    totalAmbassadorExpense += snap.ambassadorExpense;
    totalConstructionCosts += snap.constructionSpend;
    totalWorkers += snap.workerCount.total;
    totalActiveWorkers += snap.workerCount.active;
    totalIdleWorkers += snap.workerCount.idle;
  }

  // Merge production + processing for total output per resource
  const totalOutput: Partial<Record<ResourceType, number>> = { ...totalProduction };
  for (const [res, amt] of Object.entries(totalProcessing)) {
    addToRecord(totalOutput, res as ResourceType, amt!);
  }

  // Per-tick averages
  const avgProductionPerTick: Partial<Record<ResourceType, number>> = {};
  for (const [res, amt] of Object.entries(totalOutput)) {
    avgProductionPerTick[res as ResourceType] = amt! / ticksCaptured;
  }

  const avgConsumptionPerTick: Partial<Record<ResourceType, number>> = {};
  for (const [res, amt] of Object.entries(totalConsumption)) {
    avgConsumptionPerTick[res as ResourceType] = amt! / ticksCaptured;
  }

  // Net change = total output - total consumption
  const allResources = new Set<ResourceType>([
    ...Object.keys(totalOutput) as ResourceType[],
    ...Object.keys(totalConsumption) as ResourceType[],
  ]);
  const netChange: Partial<Record<ResourceType, number>> = {};
  for (const res of allResources) {
    netChange[res] = ((totalOutput[res] ?? 0) - (totalConsumption[res] ?? 0)) / ticksCaptured;
  }

  // Theoretical max from latest snapshot's building state
  const latestSnap = window[window.length - 1];
  const theoreticalMax: Partial<Record<ResourceType, number>> = {};
  const producingBuildingCount: Partial<Record<ResourceType, number>> = {};

  for (const b of latestSnap.buildingSnapshot) {
    if (b.status !== "active") continue;

    if (b.class === "mine" && b.resourceType) {
      const baseProd = BUILDING_DEFS.mine.production_per_tick ?? 2;
      const richness = b.richness ?? 1;
      addToRecord(theoreticalMax, b.resourceType, baseProd * richness);
      addToRecord(producingBuildingCount, b.resourceType, 1);
    }

    const def = BUILDING_DEFS[b.class];
    if (def.recipe && b.resourceType) {
      addToRecord(theoreticalMax, b.resourceType, def.recipe.output_amount);
      addToRecord(producingBuildingCount, b.resourceType, 1);
    }
  }

  // Efficiency = actual avg per tick / theoretical max * 100
  const efficiency: Partial<Record<ResourceType, number>> = {};
  for (const [res, max] of Object.entries(theoreticalMax)) {
    const actual = avgProductionPerTick[res as ResourceType] ?? 0;
    efficiency[res as ResourceType] = max! > 0 ? (actual / max!) * 100 : 0;
  }

  // Per-building average
  const avgProductionPerBuilding: Partial<Record<ResourceType, number>> = {};
  for (const [res, count] of Object.entries(producingBuildingCount)) {
    const total = avgProductionPerTick[res as ResourceType] ?? 0;
    avgProductionPerBuilding[res as ResourceType] = count! > 0 ? total / count! : 0;
  }

  // Trend detection: compare first half vs second half of window
  const trend: Partial<Record<ResourceType, TrendDirection>> = {};
  if (ticksCaptured >= 4) {
    const midpoint = Math.floor(ticksCaptured / 2);
    const firstHalf = window.slice(0, midpoint);
    const secondHalf = window.slice(midpoint);

    for (const res of allResources) {
      const firstAvg = firstHalf.reduce((sum, s) => {
        const prod = (s.production[res] ?? 0) + (s.processing[res] ?? 0);
        const cons = s.consumption[res] ?? 0;
        return sum + prod - cons;
      }, 0) / firstHalf.length;

      const secondAvg = secondHalf.reduce((sum, s) => {
        const prod = (s.production[res] ?? 0) + (s.processing[res] ?? 0);
        const cons = s.consumption[res] ?? 0;
        return sum + prod - cons;
      }, 0) / secondHalf.length;

      const baseline = Math.max(Math.abs(firstAvg), Math.abs(secondAvg), 0.01);
      const change = (secondAvg - firstAvg) / baseline;

      if (change > 0.1) trend[res] = "increasing";
      else if (change < -0.1) trend[res] = "decreasing";
      else trend[res] = "stable";
    }
  } else {
    for (const res of allResources) {
      trend[res] = "stable";
    }
  }

  // Financial — split building vs worker upkeep
  let buildingUpkeepEst = 0;
  for (const b of latestSnap.buildingSnapshot) {
    if (b.status === "active") {
      buildingUpkeepEst += BUILDING_DEFS[b.class].upkeep_per_tick;
    }
  }
  const avgUpkeepPerTick = totalUpkeep / ticksCaptured;
  const workerUpkeepEst = Math.max(0, avgUpkeepPerTick - buildingUpkeepEst);

  const totalIncome = totalSalesRevenue + totalTaxIncome + totalAmbassadorIncome;
  const totalExpenses = totalUpkeep + totalImportCosts + totalConstructionCosts + totalTaxPaid + totalAmbassadorExpense;

  return {
    windowSize,
    ticksCaptured,
    totalProduction: totalOutput,
    avgProductionPerTick,
    theoreticalMax,
    efficiency,
    producingBuildingCount,
    avgProductionPerBuilding,
    totalConsumption,
    avgConsumptionPerTick,
    netChange,
    trend,
    totalUpkeep,
    buildingUpkeep: buildingUpkeepEst,
    workerUpkeep: workerUpkeepEst,
    totalSalesRevenue,
    totalImportCosts,
    totalTaxIncome,
    totalTaxPaid,
    totalAmbassadorIncome,
    totalAmbassadorExpense,
    totalConstructionCosts,
    netProfitLoss: totalIncome - totalExpenses,
    avgIncomePerTick: totalIncome / ticksCaptured,
    avgExpensesPerTick: totalExpenses / ticksCaptured,
    avgNetPerTick: (totalIncome - totalExpenses) / ticksCaptured,
    avgWorkers: {
      total: Math.round(totalWorkers / ticksCaptured),
      active: Math.round(totalActiveWorkers / ticksCaptured),
      idle: Math.round(totalIdleWorkers / ticksCaptured),
    },
  };
}

function emptyAggregates(windowSize: number): MonitoringAggregates {
  return {
    windowSize,
    ticksCaptured: 0,
    totalProduction: {},
    avgProductionPerTick: {},
    theoreticalMax: {},
    efficiency: {},
    producingBuildingCount: {},
    avgProductionPerBuilding: {},
    totalConsumption: {},
    avgConsumptionPerTick: {},
    netChange: {},
    trend: {},
    totalUpkeep: 0,
    buildingUpkeep: 0,
    workerUpkeep: 0,
    totalSalesRevenue: 0,
    totalImportCosts: 0,
    totalTaxIncome: 0,
    totalTaxPaid: 0,
    totalAmbassadorIncome: 0,
    totalAmbassadorExpense: 0,
    totalConstructionCosts: 0,
    netProfitLoss: 0,
    avgIncomePerTick: 0,
    avgExpensesPerTick: 0,
    avgNetPerTick: 0,
    avgWorkers: { total: 0, active: 0, idle: 0 },
  };
}
