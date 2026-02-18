import React from "react";
import { useGameStore } from "../state/store.js";
import { totalInventory, WORKER_CAPACITY } from "@mars-2035/shared";
import type { WorkerState } from "@mars-2035/shared";

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

  if (!selectedWorkerId) return null;

  const worker = workers.find((w) => w.entity_id === selectedWorkerId);
  if (!worker) return null;

  const used = totalInventory(worker.inventory);
  const cap = worker.capacity ?? WORKER_CAPACITY;
  const pct = Math.min(100, (used / cap) * 100);

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

      {/* Capacity bar */}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2 }}>
          Cargo: {used.toFixed(0)} / {cap}
        </div>
        <div style={{ height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundColor: pct > 90 ? "#e57373" : pct > 60 ? "#ffb74d" : "#81c784",
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
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: 10,
  backgroundColor: "#16213e",
  borderRadius: 4,
  fontSize: 13,
  minHeight: 80,
};
