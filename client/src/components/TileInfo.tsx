import React from "react";
import { useGameStore } from "../state/store.js";

export function TileInfo() {
  const selectedTile = useGameStore((s) => s.selectedTile);
  const tiles = useGameStore((s) => s.tiles);
  const buildings = useGameStore((s) => s.buildings);

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
            Building: <strong>{building.class}</strong>
          </div>
          <div>Status: {building.status}</div>
          <div>Owner: {building.owner_id}</div>
          {building.production_per_tick && (
            <div>
              Production: {building.production_per_tick.toFixed(1)}/tick (
              {building.resource_type})
            </div>
          )}
          {Object.entries(building.inventory).length > 0 && (
            <div>
              Inventory:{" "}
              {Object.entries(building.inventory)
                .filter(([, v]) => v && v > 0)
                .map(([k, v]) => `${k}: ${(v as number).toFixed(1)}`)
                .join(", ")}
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
