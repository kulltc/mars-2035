import React from "react";
import { useGameStore } from "../state/store.js";
import { totalInventory, WORKER_CAPACITY, WORKER_MONEY_CAPACITY } from "@mars-2035/shared";
import type { WorkerState, WorkerFilter, WorkerTaskType, MaterialType } from "@mars-2035/shared";
import { MATERIAL_TYPES } from "@mars-2035/shared";
import { submitCommand } from "../api/client.js";

const RESOURCE_LIST: MaterialType[] = [...MATERIAL_TYPES];

const STATE_LABELS: Record<WorkerState, string> = {
  idle: "Idle",
  moving_to_pickup: "Moving to pickup",
  picking_up: "Picking up",
  moving_to_dropoff: "Moving to drop-off",
  dropping_off: "Dropping off",
  returning_to_base: "Returning to base",
  unloading: "Unloading at base",
  moving_to_construct: "Moving to build site",
  constructing: "Constructing",
};

export function WorkerInfo() {
  const selectedWorkerId = useGameStore((s) => s.selectedWorkerId);
  const workers = useGameStore((s) => s.workers);
  const buildings = useGameStore((s) => s.buildings);
  const areaDrawMode = useGameStore((s) => s.areaDrawMode);
  const setAreaDrawMode = useGameStore((s) => s.setAreaDrawMode);
  const pendingWorkerFilter = useGameStore((s) => s.pendingWorkerFilter);
  const setPendingWorkerFilter = useGameStore((s) => s.setPendingWorkerFilter);

  if (!selectedWorkerId) return null;

  const worker = workers.find((w) => w.entity_id === selectedWorkerId);
  if (!worker) return null;

  const usedMaterials = totalInventory(worker.inventory);
  const matCap = worker.capacity ?? WORKER_CAPACITY;
  const matPct = Math.min(100, (usedMaterials / matCap) * 100);
  const usedMoney = worker.inventory.money ?? 0;
  const moneyPct = Math.min(100, (usedMoney / WORKER_MONEY_CAPACITY) * 100);

  // Use optimistic local filter if it matches this worker, else server state
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
    const taskTypes = next.length >= 2 ? undefined : next;
    applyFilter({ ...filter, task_types: taskTypes });
  };

  const toggleResource = (res: MaterialType, checked: boolean) => {
    const current = filter?.resources ?? [...RESOURCE_LIST];
    let next: MaterialType[];
    if (checked) {
      next = current.includes(res) ? current : [...current, res];
    } else {
      next = current.filter((r) => r !== res);
    }
    const resources = next.length >= RESOURCE_LIST.length ? undefined : next;
    applyFilter({ ...filter, resources });
  };

  const clearArea = () => {
    applyFilter({ ...filter, area: undefined });
  };

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>Worker</h3>
      <div style={{ fontSize: 11, color: "#888" }}>{worker.entity_id}</div>
      <div style={{ fontSize: 11, color: "#888" }}>Owner: {worker.owner_id}</div>
      <div style={{ marginTop: 4 }}>
        Status:{" "}
        <strong style={{ color: worker.worker_status === "inactive" ? "#e57373" : "#81c784" }}>
          {worker.worker_status ?? "active"}
        </strong>
      </div>
      <div>
        State:{" "}
        <strong style={{ color: "#4fc3f7" }}>
          {STATE_LABELS[worker.state] ?? worker.state}
        </strong>
      </div>
      <div>
        Position: ({worker.x}, {worker.y})
      </div>

      {worker.current_task_id && (
        <div style={{ marginTop: 6, padding: 6, backgroundColor: "#0d1b3e", borderRadius: 4 }}>
          <div style={{ fontSize: 11, color: "#80cbc4", fontWeight: "bold" }}>Task</div>
          <div style={{ fontSize: 11, color: "#aaa" }}>{worker.current_task_id}</div>
        </div>
      )}

      {/* Capacity bars */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2 }}>
          Materials: {usedMaterials.toFixed(0)} / {matCap}
        </div>
        <div style={{ height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              width: `${matPct}%`,
              height: "100%",
              backgroundColor: matPct > 90 ? "#e57373" : matPct > 60 ? "#ffb74d" : "#81c784",
              borderRadius: 3,
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2, marginTop: 4 }}>
          Money: {usedMoney.toFixed(0)} / {WORKER_MONEY_CAPACITY}
        </div>
        <div style={{ height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              width: `${moneyPct}%`,
              height: "100%",
              backgroundColor: moneyPct > 90 ? "#e57373" : moneyPct > 60 ? "#ffb74d" : "#ffd54f",
              borderRadius: 3,
            }}
          />
        </div>
      </div>

      {/* Inventory */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontWeight: "bold", fontSize: 12, color: "#aaa" }}>Inventory:</div>
        {(() => {
          const entries = Object.entries(worker.inventory).filter(([, v]) => v && v > 0);
          if (entries.length === 0)
            return <div style={{ color: "#555", fontSize: 12 }}>Empty</div>;
          return entries.map(([mat, amt]) => (
            <div key={mat} style={{ fontSize: 12 }}>
              <span style={{ color: mat === "money" ? "#ffd54f" : "#ccc" }}>{mat}:</span>{" "}
              <strong style={{ color: mat === "money" ? "#ffd54f" : "#e0e0e0" }}>
                {(amt as number).toFixed(1)}
              </strong>
            </div>
          ));
        })()}
      </div>

      {/* Task Filters */}
      <div style={{ marginTop: 8, borderTop: "1px solid #333", paddingTop: 6 }}>
        <div style={{ fontWeight: "bold", fontSize: 12, color: "#aaa", marginBottom: 4 }}>Task Filters</div>

        {/* Task types */}
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "#ccc" }}>
            <input type="checkbox" checked={hasConstruct} onChange={(e) => toggleTaskType("construct", e.target.checked)} />
            Construction
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "#ccc" }}>
            <input type="checkbox" checked={hasPickup} onChange={(e) => toggleTaskType("pickup", e.target.checked)} />
            Hauling
          </label>
        </div>

        {/* Resources (only if hauling enabled) */}
        {hasPickup && (
          <div style={{ fontSize: 11, marginBottom: 4 }}>
            <div style={{ color: "#888", marginBottom: 2 }}>Resources:</div>
            {RESOURCE_LIST.map((res) => {
              const checked = !filter?.resources || filter.resources.includes(res);
              return (
                <label key={res} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "#ccc" }}>
                  <input type="checkbox" checked={checked} onChange={(e) => toggleResource(res, e.target.checked)} />
                  {res.replace(/_/g, " ")}
                </label>
              );
            })}
          </div>
        )}

        {/* Activity area */}
        <div style={{ fontSize: 11 }}>
          <div style={{ color: "#888", marginBottom: 2 }}>Activity area:</div>
          {filter?.area ? (
            <div style={{ color: "#ccc" }}>
              ({filter.area.x1},{filter.area.y1}) - ({filter.area.x2},{filter.area.y2})
              <button onClick={clearArea} style={smallBtnStyle}>Clear</button>
            </div>
          ) : (
            <span style={{ color: "#555" }}>Entire map</span>
          )}
          <button
            onClick={() => setAreaDrawMode(areaDrawMode === worker.entity_id ? null : worker.entity_id)}
            style={{
              ...smallBtnStyle,
              marginTop: 2,
              backgroundColor: areaDrawMode === worker.entity_id ? "#e57373" : "#333",
            }}
          >
            {areaDrawMode === worker.entity_id ? "Cancel" : "Set Area"}
          </button>
        </div>
      </div>
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  marginLeft: 6,
  padding: "1px 6px",
  fontSize: 10,
  backgroundColor: "#333",
  color: "#ccc",
  border: "1px solid #555",
  borderRadius: 3,
  cursor: "pointer",
};

const panelStyle: React.CSSProperties = {
  padding: 10,
  backgroundColor: "#16213e",
  borderRadius: 4,
  fontSize: 13,
  minHeight: 80,
  flexShrink: 0,
};
