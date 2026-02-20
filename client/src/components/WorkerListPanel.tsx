import React from "react";
import { useGameStore } from "../state/store.js";
import { totalInventory, type WorkerState } from "@mars-2035/shared";
import { submitCommand } from "../api/client.js";

const STATE_LABELS: Record<WorkerState, string> = {
  idle: "Idle",
  moving_to_pickup: "To pickup",
  picking_up: "Picking up",
  moving_to_dropoff: "To drop-off",
  dropping_off: "Dropping off",
  returning_to_base: "Returning",
  unloading: "Unloading",
  moving_to_construct: "To build",
  constructing: "Building",
};

export function WorkerListPanel() {
  const workers = useGameStore((s) => s.workers);
  const player = useGameStore((s) => s.player);
  const toggleWorkers = useGameStore((s) => s.toggleWorkers);
  const setSelectedWorkerId = useGameStore((s) => s.setSelectedWorkerId);
  const setSelectedTile = useGameStore((s) => s.setSelectedTile);
  const setCameraTarget = useGameStore((s) => s.setCameraTarget);
  const addNotification = useGameStore((s) => s.addNotification);

  if (!player) return null;

  const myWorkers = workers.filter((w) => w.owner_id === player.entity_id);
  const activeCount = myWorkers.filter((w) => w.worker_status === "active").length;

  return (
    <div
      className="modal-overlay worker-list-overlay"
      style={{ position: "absolute", inset: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) toggleWorkers(); }}
    >
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <span className="modal-title">Workers ({activeCount}/{myWorkers.length} active)</span>
          <button className="modal-close" onClick={toggleWorkers}>&times;</button>
        </div>

        {myWorkers.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 12, fontStyle: "italic" }}>
            No workers yet. Build an Admin Outpost to recruit workers.
          </div>
        ) : (
          <div className="worker-list">
            {myWorkers.map((w) => {
              const isActive = w.worker_status === "active";
              const invEntries = Object.entries(w.inventory).filter(([, v]) => v && v > 0);
              const shortId = w.entity_id.slice(-6);

              return (
                <div
                  key={w.entity_id}
                  className="worker-row"
                  onClick={() => {
                    setSelectedWorkerId(w.entity_id);
                    setSelectedTile(null);
                    toggleWorkers();
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                        background: isActive ? "var(--success)" : "var(--danger)",
                      }}
                    />
                    <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {shortId}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      ({w.x},{w.y})
                    </span>
                    <span style={{ fontSize: 11, color: "var(--accent)" }}>
                      {STATE_LABELS[w.state] ?? w.state}
                    </span>
                  </div>

                  {invEntries.length > 0 && (
                    <div style={{ fontSize: 10, color: "var(--text-secondary)", marginRight: 8, whiteSpace: "nowrap" }}>
                      {invEntries.map(([mat, amt]) => `${(amt as number).toFixed(0)} ${mat.replace(/_/g, " ")}`).join(", ")}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-sm btn-accent"
                      onClick={() => {
                        setCameraTarget({ x: w.x, y: w.y });
                        toggleWorkers();
                      }}
                    >
                      Locate
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={async () => {
                        if (!confirm("Remove this worker?")) return;
                        const res = await submitCommand("remove_worker", { worker_id: w.entity_id });
                        if (res.error) {
                          addNotification(`Remove failed: ${res.error}`, "error");
                        } else {
                          addNotification("Worker removed", "warning");
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
