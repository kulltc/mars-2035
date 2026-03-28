/**
 * Stateless aggregation of game events into monitoring data.
 * Ported from client/src/state/monitoringCollector.ts — same logic,
 * but runs per-request instead of maintaining persistent state.
 */

import type {
  ResourceType,
  BuildingClass,
  GameEvent,
  Building,
  Assets,
} from "@mars-2035/shared";
import { BUILDING_DEFS } from "@mars-2035/shared";

// ── Types ──

export type TrendDirection = "increasing" | "decreasing" | "stable";

export interface WorkerSnapshot {
  total: number;
  active: number;
  idle: number;
}

export interface TickAccumulator {
  tick: number;
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
}

export interface MonitoringAggregates {
  windowSize: number;
  ticksCaptured: number;

  // Production
  totalProduction: Partial<Record<ResourceType, number>>;
  avgProductionPerTick: Partial<Record<ResourceType, number>>;
  producingBuildingCount: Partial<Record<ResourceType, number>>;

  // Consumption
  totalConsumption: Partial<Record<ResourceType, number>>;
  avgConsumptionPerTick: Partial<Record<ResourceType, number>>;
  netChange: Partial<Record<ResourceType, number>>;
  trend: Partial<Record<ResourceType, TrendDirection>>;

  // Financial
  totalUpkeep: number;
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
}

// ── Helpers ──

function addToRecord(
  rec: Partial<Record<ResourceType, number>>,
  key: ResourceType,
  amount: number
) {
  rec[key] = (rec[key] ?? 0) + amount;
}

function createEmptyAccumulator(tick: number): TickAccumulator {
  return {
    tick,
    production: {},
    processing: {},
    consumption: {},
    upkeepCharged: 0,
    salesRevenue: 0,
    salesByResource: {},
    importCosts: 0,
    taxCollected: 0,
    taxPaid: 0,
    ambassadorIncome: 0,
    ambassadorExpense: 0,
    constructionSpend: 0,
  };
}

// ── Event Processing ──

function processEvent(
  evt: GameEvent,
  playerId: string,
  buildings: Building[],
  acc: TickAccumulator
) {
  const buildingLookup = (id: string) =>
    buildings.find((b) => b.entity_id === id);

  switch (evt.type) {
    case "production": {
      const ownerId = evt.data.owner_id as string | undefined;
      const buildingId = evt.data.building_id as string | undefined;
      if (ownerId && ownerId !== playerId) {
        if (buildingId) {
          const building = buildingLookup(buildingId);
          if (!building || building.owner_id !== playerId) return;
        } else {
          return;
        }
      } else if (!ownerId && buildingId) {
        const building = buildingLookup(buildingId);
        if (!building || building.owner_id !== playerId) return;
      }
      const material = evt.data.material as ResourceType;
      const amount = evt.data.amount as number;
      addToRecord(acc.production, material, amount);
      break;
    }
    case "processing": {
      const buildingId = evt.data.building_id as string;
      const building = buildingLookup(buildingId);
      if (!building || building.owner_id !== playerId) return;
      const material = evt.data.material as ResourceType;
      const amount = evt.data.amount as number;
      addToRecord(acc.processing, material, amount);
      const inputs = evt.data.inputs as Assets | undefined;
      if (inputs) {
        for (const [mat, qty] of Object.entries(inputs)) {
          if (mat !== "money" && qty && qty > 0) {
            addToRecord(acc.consumption, mat as ResourceType, qty);
          }
        }
      }
      break;
    }
    case "upkeep_charged": {
      if (evt.data.player_id !== playerId) return;
      acc.upkeepCharged += (evt.data.amount as number) ?? 0;
      break;
    }
    case "auto_sell": {
      if (evt.data.player_id !== playerId) return;
      const revenue = (evt.data.revenue as number) ?? 0;
      acc.salesRevenue += revenue;
      const resource = evt.data.resource as ResourceType;
      addToRecord(acc.salesByResource, resource, revenue);
      break;
    }
    case "export": {
      if (evt.data.player_id !== playerId) return;
      const revenue = (evt.data.revenue as number) ?? 0;
      acc.salesRevenue += revenue;
      const material = evt.data.material as ResourceType;
      addToRecord(acc.salesByResource, material, revenue);
      break;
    }
    case "import": {
      if (evt.data.player_id !== playerId) return;
      acc.importCosts += (evt.data.cost as number) ?? 0;
      break;
    }
    case "tax_collected": {
      if (evt.data.player_id !== playerId) return;
      acc.taxCollected += (evt.data.amount as number) ?? 0;
      break;
    }
    case "tax_paid": {
      if (evt.data.player_id !== playerId) return;
      acc.taxPaid += (evt.data.amount as number) ?? 0;
      break;
    }
    case "ambassador_arrived": {
      const ownerId = evt.data.owner_id as string;
      const carriedMoney = (evt.data.carried_money as number) ?? 0;
      if (ownerId === playerId && carriedMoney > 0) {
        // We sent an ambassador and it collected money
        acc.ambassadorIncome += carriedMoney;
      }
      const targetOwnerId = evt.data.target_owner_id as string | undefined;
      if (targetOwnerId === playerId && carriedMoney > 0) {
        // A rival ambassador took money from our building
        acc.ambassadorExpense += carriedMoney;
      }
      break;
    }
    case "building_placed": {
      if (evt.data.owner_id !== playerId) return;
      const buildingClass = evt.data.building_class as BuildingClass;
      const def = BUILDING_DEFS[buildingClass];
      if (def?.cost?.money) {
        acc.constructionSpend += def.cost.money;
      }
      break;
    }
  }
}

// ── Main Aggregation ──

/**
 * Compute monitoring aggregates from raw events.
 * Groups events by tick, processes player-relevant ones, and returns
 * the same data structure the Monitoring panel uses.
 */
export function computeMonitoringAggregates(
  events: GameEvent[],
  playerId: string,
  buildings: Building[],
  windowSize: number
): MonitoringAggregates {
  // Group events by tick
  const eventsByTick = new Map<number, GameEvent[]>();
  for (const evt of events) {
    const existing = eventsByTick.get(evt.tick);
    if (existing) {
      existing.push(evt);
    } else {
      eventsByTick.set(evt.tick, [evt]);
    }
  }

  // Sort ticks and take the last windowSize
  const sortedTicks = [...eventsByTick.keys()].sort((a, b) => a - b);
  const windowTicks = sortedTicks.slice(-windowSize);
  const ticksCaptured = windowTicks.length;

  if (ticksCaptured === 0) {
    return emptyAggregates(windowSize);
  }

  // Process each tick
  const accumulators: TickAccumulator[] = [];
  for (const tick of windowTicks) {
    const acc = createEmptyAccumulator(tick);
    const tickEvents = eventsByTick.get(tick)!;
    for (const evt of tickEvents) {
      if (evt.type !== "tick_complete") {
        processEvent(evt, playerId, buildings, acc);
      }
    }
    accumulators.push(acc);
  }

  // Sum across ticks
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

  for (const acc of accumulators) {
    for (const [res, amt] of Object.entries(acc.production)) {
      addToRecord(totalProduction, res as ResourceType, amt!);
    }
    for (const [res, amt] of Object.entries(acc.processing)) {
      addToRecord(totalProcessing, res as ResourceType, amt!);
    }
    for (const [res, amt] of Object.entries(acc.consumption)) {
      addToRecord(totalConsumption, res as ResourceType, amt!);
    }
    totalUpkeep += acc.upkeepCharged;
    totalSalesRevenue += acc.salesRevenue;
    totalImportCosts += acc.importCosts;
    totalTaxIncome += acc.taxCollected;
    totalTaxPaid += acc.taxPaid;
    totalAmbassadorIncome += acc.ambassadorIncome;
    totalAmbassadorExpense += acc.ambassadorExpense;
    totalConstructionCosts += acc.constructionSpend;
  }

  // Merge production + processing for total output
  const totalOutput: Partial<Record<ResourceType, number>> = {
    ...totalProduction,
  };
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

  // Net change
  const allResources = new Set<ResourceType>([
    ...(Object.keys(totalOutput) as ResourceType[]),
    ...(Object.keys(totalConsumption) as ResourceType[]),
  ]);
  const netChange: Partial<Record<ResourceType, number>> = {};
  for (const res of allResources) {
    netChange[res] =
      ((totalOutput[res] ?? 0) - (totalConsumption[res] ?? 0)) / ticksCaptured;
  }

  // Building counts
  const producingBuildingCount: Partial<Record<ResourceType, number>> = {};
  for (const b of buildings) {
    if (b.owner_id !== playerId || b.status !== "active") continue;
    if (b.class === "mine" && b.resource_type) {
      addToRecord(producingBuildingCount, b.resource_type, 1);
    }
    const def = BUILDING_DEFS[b.class];
    if (def.recipe && def.recipe.output) {
      addToRecord(
        producingBuildingCount,
        def.recipe.output as ResourceType,
        1
      );
    }
  }

  // Trend detection
  const trend: Partial<Record<ResourceType, TrendDirection>> = {};
  if (ticksCaptured >= 4) {
    const midpoint = Math.floor(ticksCaptured / 2);
    const firstHalf = accumulators.slice(0, midpoint);
    const secondHalf = accumulators.slice(midpoint);

    for (const res of allResources) {
      const firstAvg =
        firstHalf.reduce((sum, acc) => {
          const prod =
            (acc.production[res] ?? 0) + (acc.processing[res] ?? 0);
          const cons = acc.consumption[res] ?? 0;
          return sum + prod - cons;
        }, 0) / firstHalf.length;

      const secondAvg =
        secondHalf.reduce((sum, acc) => {
          const prod =
            (acc.production[res] ?? 0) + (acc.processing[res] ?? 0);
          const cons = acc.consumption[res] ?? 0;
          return sum + prod - cons;
        }, 0) / secondHalf.length;

      const baseline = Math.max(
        Math.abs(firstAvg),
        Math.abs(secondAvg),
        0.01
      );
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

  // Financial
  const totalIncome = totalSalesRevenue + totalTaxIncome + totalAmbassadorIncome;
  const totalExpenses = totalUpkeep + totalImportCosts + totalConstructionCosts + totalTaxPaid + totalAmbassadorExpense;

  return {
    windowSize,
    ticksCaptured,
    totalProduction: totalOutput,
    avgProductionPerTick,
    producingBuildingCount,
    totalConsumption,
    avgConsumptionPerTick,
    netChange,
    trend,
    totalUpkeep,
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
  };
}

function emptyAggregates(windowSize: number): MonitoringAggregates {
  return {
    windowSize,
    ticksCaptured: 0,
    totalProduction: {},
    avgProductionPerTick: {},
    producingBuildingCount: {},
    totalConsumption: {},
    avgConsumptionPerTick: {},
    netChange: {},
    trend: {},
    totalUpkeep: 0,
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
  };
}
