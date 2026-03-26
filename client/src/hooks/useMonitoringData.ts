import { useSyncExternalStore, useCallback } from "react";
import {
  subscribeMonitoring,
  getMonitoringAggregates,
  getSnapshots,
  getVersion,
  type MonitoringAggregates,
  type TickSnapshot,
} from "../state/monitoringCollector.js";

// Cache: recompute only when version changes
let aggCache: Map<number, { version: number; result: MonitoringAggregates }> = new Map();
let snapCache: Map<number, { version: number; result: TickSnapshot[] }> = new Map();

function getCachedAggregates(windowSize: 10 | 50 | 100): MonitoringAggregates {
  const v = getVersion();
  const cached = aggCache.get(windowSize);
  if (cached && cached.version === v) return cached.result;
  const result = getMonitoringAggregates(windowSize);
  aggCache.set(windowSize, { version: v, result });
  return result;
}

function getCachedSnapshots(windowSize: number): TickSnapshot[] {
  const v = getVersion();
  const cached = snapCache.get(windowSize);
  if (cached && cached.version === v) return cached.result;
  const result = getSnapshots(windowSize);
  snapCache.set(windowSize, { version: v, result });
  return result;
}

export function useMonitoringData(windowSize: 10 | 50 | 100): MonitoringAggregates {
  const getSnapshot = useCallback(
    () => getCachedAggregates(windowSize),
    [windowSize]
  );
  return useSyncExternalStore(subscribeMonitoring, getSnapshot);
}

export function useMonitoringSnapshots(windowSize: number): TickSnapshot[] {
  const getSnap = useCallback(
    () => getCachedSnapshots(windowSize),
    [windowSize]
  );
  return useSyncExternalStore(subscribeMonitoring, getSnap);
}
