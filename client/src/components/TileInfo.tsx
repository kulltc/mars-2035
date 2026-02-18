import React from "react";
import { useGameStore } from "../state/store.js";
import { totalInventory, outputBufferTotal, SUSPENSION_DESTROY_TICKS, BUILDING_DEFS } from "@mars-2035/shared";

export function TileInfo() {
  const selectedTile = useGameStore((s) => s.selectedTile);
  const tiles = useGameStore((s) => s.tiles);
  const buildings = useGameStore((s) => s.buildings);
  const world = useGameStore((s) => s.world);
  const player = useGameStore((s) => s.player);

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
      {building && (() => {
        const isOwn = building.owner_id === player?.entity_id;
        return (
          <div style={{ marginTop: 6 }}>
            <div>
              Building: <strong style={{ textTransform: "capitalize" }}>
                {building.class === "port" ? "Trading Outpost" : building.class.replace(/_/g, " ")}
              </strong>{" "}
              <span style={{ color: "#888", fontSize: 11 }}>({building.entity_id})</span>
            </div>
            <div>Status: <span style={{ color: building.status === "suspended" ? "#e57373" : building.status === "constructing" ? "#ffb74d" : "#81c784" }}>{building.status}</span></div>
            <div style={{ fontSize: 11, color: "#888" }}>Owner: {building.owner_id}</div>
            {!isOwn && (
              <div style={{ marginTop: 6, color: "#888", fontSize: 12, fontStyle: "italic" }}>
                (Details hidden — not your building)
              </div>
            )}
            {isOwn && (
              <>
                {building.status === "suspended" && building.suspended_at_tick != null && world && (
                  <div style={{ fontSize: 11, color: "#e57373" }}>
                    Decays in {Math.max(0, SUSPENSION_DESTROY_TICKS - (world.tick - building.suspended_at_tick))} ticks
                  </div>
                )}
                {building.production_per_tick && (
                  <div>
                    Production: {building.production_per_tick.toFixed(1)}/tick (
                    {building.resource_type})
                  </div>
                )}
                {(() => {
                  const def = BUILDING_DEFS[building.class];
                  if (!def.recipe) return null;
                  const { inputs, output, output_amount } = def.recipe;
                  const inputStr = Object.entries(inputs)
                    .filter(([, v]) => v && v > 0)
                    .map(([mat, amt]) => `${amt} ${mat.replace(/_/g, " ")}`)
                    .join(" + ");
                  return (
                    <div style={{ fontSize: 11, color: "#80cbc4", marginTop: 2 }}>
                      Recipe: {inputStr} &rarr; {output_amount} {output.replace(/_/g, " ")}
                    </div>
                  );
                })()}
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
                {/* Output buffer bar for recipe buildings */}
                {(() => {
                  const def = BUILDING_DEFS[building.class];
                  if (!def.output_capacity || !building.output_buffer) return null;
                  const used = outputBufferTotal(building.output_buffer);
                  const pct = Math.min(100, (used / def.output_capacity) * 100);
                  return (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2 }}>
                        Output: {used.toFixed(0)} / {def.output_capacity}
                      </div>
                      <div style={{ height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          width: `${pct}%`,
                          height: "100%",
                          backgroundColor: pct > 90 ? "#e57373" : pct > 60 ? "#ffb74d" : "#64b5f6",
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
                {/* Output buffer inventory */}
                {building.output_buffer && (() => {
                  const entries = Object.entries(building.output_buffer).filter(([, v]) => v && v > 0);
                  if (entries.length === 0) return null;
                  return (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontWeight: "bold", fontSize: 12, color: "#64b5f6" }}>Output Buffer:</div>
                      {entries.map(([mat, amt]) => (
                        <div key={mat} style={{ fontSize: 12 }}>
                          <span style={{ color: "#90caf9" }}>{mat}:</span>{" "}
                          <strong style={{ color: "#bbdefb" }}>{(amt as number).toFixed(1)}</strong>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Routes summary */}
                {building.outgoing_routes && building.outgoing_routes.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: "#80cbc4" }}>
                    {building.outgoing_routes.length} outgoing route(s)
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}
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
