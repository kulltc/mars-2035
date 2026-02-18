import React from "react";
import { useGameStore } from "../state/store.js";
import { totalInventory, SUSPENSION_DESTROY_TICKS } from "@mars-2035/shared";

export function TileInfo() {
  const selectedTile = useGameStore((s) => s.selectedTile);
  const tiles = useGameStore((s) => s.tiles);
  const buildings = useGameStore((s) => s.buildings);
  const world = useGameStore((s) => s.world);

  if (!selectedTile) {
    return <div style={panelStyle}>Select a tile to inspect</div>;
  }

  const key = `${selectedTile.x}:${selectedTile.y}`;
  const tile = tiles.get(key);
  const building = buildings.find(
    (b) => b.location.x === selectedTile.x && b.location.y === selectedTile.y
  );

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>
        Tile ({selectedTile.x}, {selectedTile.y})
      </h3>
      {tile?.resource ? (
        <div>
          Resource: <strong>{tile.resource.type}</strong> (richness:{" "}
          {tile.resource.richness.toFixed(2)})
        </div>
      ) : (
        <div>No resource</div>
      )}
      {building && (
        <div style={{ marginTop: 6 }}>
          <div>
            Building: <strong>
              {building.class === "port" ? "Trading Outpost" : building.class.replace(/_/g, " ")}
            </strong>{" "}
            <span style={{ color: "#888", fontSize: 11 }}>({building.entity_id})</span>
          </div>
          <div>Status: <span style={{ color: building.status === "suspended" ? "#e57373" : building.status === "constructing" ? "#ffb74d" : "#81c784" }}>{building.status}</span></div>
          {building.status === "suspended" && building.suspended_at_tick != null && world && (
            <div style={{ fontSize: 11, color: "#e57373" }}>
              Decays in {Math.max(0, SUSPENSION_DESTROY_TICKS - (world.tick - building.suspended_at_tick))} ticks
            </div>
          )}
          <div style={{ fontSize: 11, color: "#888" }}>Owner: {building.owner_id}</div>
          {building.production_per_tick && (
            <div>
              Production: {building.production_per_tick.toFixed(1)}/tick (
              {building.resource_type})
            </div>
          )}
          {/* Capacity bar */}
          {building.capacity > 0 && (() => {
            const used = totalInventory(building.inventory);
            const pct = Math.min(100, (used / building.capacity) * 100);
            return (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2 }}>
                  Storage: {used.toFixed(0)} / {building.capacity}
                </div>
                <div style={{ height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`,
                    height: "100%",
                    backgroundColor: pct > 90 ? "#e57373" : pct > 60 ? "#ffb74d" : "#81c784",
                    borderRadius: 3,
                  }} />
                </div>
              </div>
            );
          })()}
          {/* Inventory */}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontWeight: "bold", fontSize: 12, color: "#aaa" }}>Inventory:</div>
            {(() => {
              const entries = Object.entries(building.inventory).filter(([, v]) => v && v > 0);
              if (entries.length === 0) return <div style={{ color: "#555", fontSize: 12 }}>Empty</div>;
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
          {/* Routes summary */}
          {building.outgoing_routes && building.outgoing_routes.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#80cbc4" }}>
              {building.outgoing_routes.length} outgoing route(s)
            </div>
          )}
        </div>
      )}
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
