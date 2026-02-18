import React from "react";
import { useGameStore } from "../state/store.js";

const RESOURCE_COLORS: Record<string, string> = {
  steel: "#3d4a55",
  silicon: "#3a5560",
  polymer: "#553a55",
  rare_earth: "#605530",
  carbon: "#383838",
};

const RESOURCE_NAMES: Record<string, string> = {
  steel: "Steel",
  silicon: "Silicon",
  polymer: "Polymer",
  rare_earth: "Rare Earth",
  carbon: "Carbon",
};

function qualityLabel(richness: number): string {
  if (richness < 1.5) return "Low";
  if (richness < 2.0) return "Medium";
  if (richness < 2.5) return "High";
  return "Very High";
}

export function TileDetail() {
  const selectedTile = useGameStore((s) => s.selectedTile);
  const tiles = useGameStore((s) => s.tiles);
  const buildings = useGameStore((s) => s.buildings);
  const player = useGameStore((s) => s.player);
  const setSelectedTile = useGameStore((s) => s.setSelectedTile);

  if (!selectedTile || !player) return null;

  const tile = tiles.get(`${selectedTile.x}:${selectedTile.y}`);
  if (!tile?.resource) return null;

  // Don't show if there's a player-owned building on this tile
  const hasOwnBuilding = buildings.some(
    (b) => b.location.x === selectedTile.x && b.location.y === selectedTile.y && b.owner_id === player.entity_id
  );
  if (hasOwnBuilding) return null;

  const resType = tile.resource.type;
  const richness = tile.resource.richness;
  const color = RESOURCE_COLORS[resType] ?? "#555";
  const name = RESOURCE_NAMES[resType] ?? resType;

  return (
    <div className="tile-detail">
      <div className="td-header">
        <span className="td-dot" style={{ background: color }} />
        <div>
          <div className="td-title">{name} Deposit</div>
          <div className="td-coords">({selectedTile.x}, {selectedTile.y})</div>
        </div>
        <button className="td-close" onClick={() => setSelectedTile(null)}>&times;</button>
      </div>

      <div style={{ fontSize: 12, marginTop: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ color: "var(--text-secondary)" }}>Quality</span>
          <span style={{ fontWeight: 600 }}>{qualityLabel(richness)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-secondary)" }}>Richness</span>
          <span className="mono">{richness.toFixed(2)}</span>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
        Build a mine here to collect this resource
      </div>
    </div>
  );
}
