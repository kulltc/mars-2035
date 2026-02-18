import React from "react";
import { useGameStore } from "../state/store.js";
import {
  totalInventory, WORKER_CAPACITY, WORKER_MONEY_CAPACITY,
  MATERIAL_TYPES, type MaterialType, type WorkerState, type WorkerFilter, type WorkerTaskType,
} from "@mars-2035/shared";
import { submitCommand } from "../api/client.js";

const RESOURCE_LIST: MaterialType[] = [...MATERIAL_TYPES].filter((m) => m !== "money");

const STATE_LABELS: Record<WorkerState, string> = {
  idle: "Idle",
  moving_to_pickup: "Moving to pickup",
  picking_up: "Picking up",
  moving_to_dropoff: "Moving to drop-off",
  dropping_off: "Dropping off",
  returning_to_base: "Returning to base",
  unloading: "Unloading",
  moving_to_construct: "Going to build",
  constructing: "Constructing",
};

export function WorkerDetail() {
  const selectedWorkerId = useGameStore((s) => s.selectedWorkerId);
  const setSelectedWorkerId = useGameStore((s) => s.setSelectedWorkerId);
  const workers = useGameStore((s) => s.workers);
  const areaDrawMode = useGameStore((s) => s.areaDrawMode);
  const setAreaDrawMode = useGameStore((s) => s.setAreaDrawMode);
  const pendingWorkerFilter = useGameStore((s) => s.pendingWorkerFilter);
  const setPendingWorkerFilter = useGameStore((s) => s.setPendingWorkerFilter);
  const addNotification = useGameStore((s) => s.addNotification);

  if (!selectedWorkerId) return null;
  const worker = workers.find((w) => w.entity_id === selectedWorkerId);
  if (!worker) return null;

  const usedMaterials = totalInventory(worker.inventory);
  const matCap = worker.capacity ?? WORKER_CAPACITY;
  const matPct = Math.min(100, (usedMaterials / matCap) * 100);
  const usedMoney = worker.inventory.money ?? 0;
  const moneyPct = Math.min(100, (usedMoney / WORKER_MONEY_CAPACITY) * 100);

  const filter = pendingWorkerFilter?.workerId === worker.entity_id
    ? pendingWorkerFilter.filter
    : worker.task_filter;

  const hasConstruct = !filter?.task_types || filter.task_types.includes("construct");
  const hasPickup = !filter?.task_types || filter.task_types.includes("pickup");

  const applyFilter = (newFilter: WorkerFilter | undefined) => {
    const cleaned = newFilter && (newFilter.task_types || newFilter.resources || newFilter.area)
      ? newFilter : undefined;
    setPendingWorkerFilter(worker.entity_id, cleaned);
    submitCommand("configure_worker", {
      worker_id: worker.entity_id,
      task_filter: cleaned ?? null,
    });
  };

  const toggleTaskType = (type: WorkerTaskType, checked: boolean) => {
    const current = filter?.task_types ?? ["pickup", "construct"];
    let next: WorkerTaskType[];
    if (checked) {
      next = current.includes(type) ? current : [...current, type];
    } else {
      next = current.filter((t) => t !== type);
    }
    applyFilter({ ...filter, task_types: next.length >= 2 ? undefined : next });
  };

  const toggleResource = (res: MaterialType, checked: boolean) => {
    const current = filter?.resources ?? [...RESOURCE_LIST];
    let next: MaterialType[];
    if (checked) {
      next = current.includes(res) ? current : [...current, res];
    } else {
      next = current.filter((r) => r !== res);
    }
    applyFilter({ ...filter, resources: next.length >= RESOURCE_LIST.length ? undefined : next });
  };

  return (
    <div className="worker-detail" style={{ bottom: 8, right: 8 }}>
      <div className="wd-header">
        <div>
          <strong>Worker</strong>
          <span style={{ color: "var(--text-muted)", fontSize: 10, marginLeft: 6 }}>
            ({worker.x}, {worker.y})
          </span>
        </div>
        <button className="wd-close" onClick={() => setSelectedWorkerId(null)}>&times;</button>
      </div>

      {/* Status + State */}
      <div style={{ display: "flex", gap: 8, marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: worker.worker_status === "inactive" ? "var(--danger)" : "var(--success)" }}>
          {worker.worker_status ?? "active"}
        </span>
        <span style={{ color: "var(--accent)" }}>
          {STATE_LABELS[worker.state] ?? worker.state}
        </span>
      </div>

      {/* Capacity bars */}
      <div style={{ marginBottom: 6 }}>
        <div className="capacity-label">
          <span>Materials</span>
          <span className="mono">{usedMaterials.toFixed(0)}/{matCap}</span>
        </div>
        <div className="capacity-bar">
          <div className="capacity-bar-fill" style={{
            width: `${matPct}%`,
            background: matPct > 90 ? "var(--danger)" : matPct > 60 ? "var(--warning)" : "var(--success)",
          }} />
        </div>
        <div className="capacity-label" style={{ marginTop: 2 }}>
          <span>Money</span>
          <span className="mono">{usedMoney.toFixed(0)}/{WORKER_MONEY_CAPACITY}</span>
        </div>
        <div className="capacity-bar">
          <div className="capacity-bar-fill" style={{
            width: `${moneyPct}%`,
            background: moneyPct > 90 ? "var(--danger)" : "var(--money)",
          }} />
        </div>
      </div>

      {/* Inventory */}
      {(() => {
        const entries = Object.entries(worker.inventory).filter(([, v]) => v && v > 0);
        if (entries.length === 0) return null;
        return (
          <div style={{ marginBottom: 6, fontSize: 11 }}>
            {entries.map(([mat, amt]) => (
              <span key={mat} style={{ marginRight: 8, color: mat === "money" ? "var(--money)" : "var(--text-secondary)" }}>
                {mat.replace(/_/g, " ")}: <strong>{(amt as number).toFixed(1)}</strong>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Task Filters */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)", marginBottom: 4 }}>
          Task Filters
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
          <label className="filter-check">
            <input type="checkbox" checked={hasConstruct} onChange={(e) => toggleTaskType("construct", e.target.checked)} />
            Build
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={hasPickup} onChange={(e) => toggleTaskType("pickup", e.target.checked)} />
            Haul
          </label>
        </div>

        {/* Resource filters (collapsible) */}
        {hasPickup && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0 10px", marginBottom: 4 }}>
            {RESOURCE_LIST.slice(0, 6).map((res) => {
              const checked = !filter?.resources || filter.resources.includes(res);
              return (
                <label key={res} className="filter-check">
                  <input type="checkbox" checked={checked} onChange={(e) => toggleResource(res, e.target.checked)} />
                  {res.replace(/_/g, " ")}
                </label>
              );
            })}
          </div>
        )}

        {/* Activity area */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <span style={{ color: "var(--text-muted)" }}>Area:</span>
          {filter?.area ? (
            <>
              <span className="mono" style={{ color: "var(--text-secondary)" }}>
                ({filter.area.x1},{filter.area.y1})-({filter.area.x2},{filter.area.y2})
              </span>
              <button className="btn btn-sm" onClick={() => applyFilter({ ...filter, area: undefined })}>Clear</button>
            </>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>Entire map</span>
          )}
          <button
            className={`btn btn-sm ${areaDrawMode === worker.entity_id ? "btn-danger" : "btn-accent"}`}
            onClick={() => setAreaDrawMode(areaDrawMode === worker.entity_id ? null : worker.entity_id)}
          >
            {areaDrawMode === worker.entity_id ? "Cancel" : "Set Area"}
          </button>
        </div>

        {/* Remove worker */}
        <div style={{ marginTop: 6 }}>
          <button
            className="btn btn-danger btn-sm"
            onClick={async () => {
              if (!confirm("Remove this worker?")) return;
              const res = await submitCommand("remove_worker", { worker_id: worker.entity_id });
              if (res.error) {
                addNotification(`Remove failed: ${res.error}`, "error");
              } else {
                addNotification("Worker removed", "warning");
                setSelectedWorkerId(null);
              }
            }}
          >
            Remove Worker
          </button>
        </div>
      </div>
    </div>
  );
}
