import React from "react";
import { useGameStore } from "../state/store.js";
import { WORKER_UPKEEP } from "@mars-2035/shared";
import type { WorkerState } from "@mars-2035/shared";
import { submitCommand } from "../api/client.js";

const STATE_SHORT: Record<WorkerState, string> = {
  idle: "Idle",
  moving_to_pickup: "To pickup",
  picking_up: "Picking up",
  moving_to_dropoff: "To dropoff",
  dropping_off: "Dropping off",
  returning_to_base: "Returning",
  unloading: "Unloading",
  moving_to_construct: "To build",
  constructing: "Building",
};

export function WorkerPanel() {
  const workers = useGameStore((s) => s.workers);
  const player = useGameStore((s) => s.player);
  const selectedWorkerId = useGameStore((s) => s.selectedWorkerId);
  const setSelectedWorkerId = useGameStore((s) => s.setSelectedWorkerId);

  if (!player) return null;

  const myWorkers = workers.filter((w) => w.owner_id === player.entity_id);
  if (myWorkers.length === 0) return null;

  const activeCount = myWorkers.filter((w) => w.worker_status === "active").length;
  const totalUpkeep = activeCount * WORKER_UPKEEP;

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 4, fontSize: 13 }}>Workers</h3>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
        {activeCount}/{myWorkers.length} active | Upkeep: {totalUpkeep}/tick
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {myWorkers.map((w) => {
          const isSelected = w.entity_id === selectedWorkerId;
          const isInactive = w.worker_status === "inactive";
          return (
            <div
              key={w.entity_id}
              onClick={() => setSelectedWorkerId(w.entity_id)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "3px 6px",
                borderRadius: 3,
                cursor: "pointer",
                fontSize: 11,
                backgroundColor: isSelected ? "#1a3a6a" : "transparent",
                border: isSelected ? "1px solid #4fc3f7" : "1px solid transparent",
                opacity: isInactive ? 0.5 : 1,
              }}
            >
              <span style={{ color: isInactive ? "#e57373" : "#ccc" }}>
                {w.entity_id.replace("wrk_", "W")}
              </span>
              <span style={{
                color: w.state === "idle" ? "#666" : "#4fc3f7",
                fontSize: 10,
              }}>
                {STATE_SHORT[w.state] ?? w.state}
              </span>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                backgroundColor: isInactive ? "#e57373" : "#81c784",
                display: "inline-block",
                flexShrink: 0,
              }} />
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm(`Remove worker ${w.entity_id}?`)) return;
                  await submitCommand("remove_worker", { worker_id: w.entity_id });
                }}
                style={{
                  background: "none", border: "none", color: "#e5737380",
                  cursor: "pointer", fontSize: 10, padding: "0 2px", flexShrink: 0,
                }}
                title="Remove worker"
              >
                x
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: 10,
  backgroundColor: "#16213e",
  borderRadius: 4,
  fontSize: 13,
};
