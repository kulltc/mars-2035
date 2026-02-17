import React, { useCallback, useEffect, useState } from "react";
import { useGameStore } from "../state/store.js";
import { VIEWPORT_W, VIEWPORT_H, type Tile, type Building } from "@mars-2035/shared";
import { submitCommand } from "../api/client.js";

const TILE_SIZE = 20;

const RESOURCE_COLORS: Record<string, string> = {
  steel: "#3d4a55",
  silicon: "#3a5560",
  polymer: "#553a55",
  rare_earth: "#605530",
  carbon: "#383838",
};

const BUILDING_COLORS: Record<string, string> = {
  admin_outpost: "#4fc3f7",
  mine: "#ffb74d",
  port: "#81c784",
  core_hq: "#e57373",
  admin_hub: "#ba68c8",
  relay: "#90a4ae",
};

const BUILDING_ICONS: Record<string, string> = {
  admin_outpost: "\u2302", // ⌂
  mine: "\u26CF",          // ⛏ (pick)
  port: "\u2693",          // ⚓
  core_hq: "\u2605",       // ★
  admin_hub: "\u25C6",     // ◆
  relay: "\u25CE",         // ◎
};

export function MapView() {
  const tiles = useGameStore((s) => s.tiles);
  const buildings = useGameStore((s) => s.buildings);
  const selectedTile = useGameStore((s) => s.selectedTile);
  const setSelectedTile = useGameStore((s) => s.setSelectedTile);
  const buildMode = useGameStore((s) => s.buildMode);
  const setBuildMode = useGameStore((s) => s.setBuildMode);
  const player = useGameStore((s) => s.player);
  const currentMap = useGameStore((s) => s.currentMap);

  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Build building index
  const buildingByTile = new Map<string, Building>();
  for (const b of buildings) {
    buildingByTile.set(`${b.location.x}:${b.location.y}`, b);
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const step = 10;
      if (e.key === "ArrowLeft") setOffset((o) => ({ ...o, x: Math.max(0, o.x - step) }));
      if (e.key === "ArrowRight") setOffset((o) => ({ ...o, x: o.x + step }));
      if (e.key === "ArrowUp") setOffset((o) => ({ ...o, y: Math.max(0, o.y - step) }));
      if (e.key === "ArrowDown") setOffset((o) => ({ ...o, y: o.y + step }));
      if (e.key === "Escape") setBuildMode(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [setBuildMode]);

  const handleTileClick = useCallback(
    async (x: number, y: number) => {
      setSelectedTile({ x, y });

      if (buildMode && player && currentMap) {
        const location = {
          dx: currentMap.dx,
          dy: currentMap.dy,
          mx: currentMap.mx,
          my: currentMap.my,
          x,
          y,
        };
        await submitCommand(player.entity_id, "place_building", {
          building_class: buildMode,
          location,
        });
        setBuildMode(null);
      }
    },
    [buildMode, player, currentMap, setSelectedTile, setBuildMode]
  );

  const rows: React.ReactNode[] = [];
  for (let vy = 0; vy < VIEWPORT_H; vy++) {
    const cells: React.ReactNode[] = [];
    for (let vx = 0; vx < VIEWPORT_W; vx++) {
      const tx = offset.x + vx;
      const ty = offset.y + vy;
      const key = `${tx}:${ty}`;
      const tile = tiles.get(key);
      const building = buildingByTile.get(key);
      const isSelected = selectedTile?.x === tx && selectedTile?.y === ty;

      let bg = "#2a1a1a"; // mars surface
      let border = "1px solid #3a2a2a";
      let label = "";
      let boxShadow = "none";
      let fontSize = 10;
      let color = "#fff";
      let opacity = 1;

      if (tile?.resource) {
        bg = RESOURCE_COLORS[tile.resource.type] ?? bg;
      }
      if (building) {
        const bldColor = BUILDING_COLORS[building.class] ?? "#fff";
        bg = bldColor;
        label = BUILDING_ICONS[building.class] ?? building.class[0].toUpperCase();
        fontSize = 13;
        border = `2px solid #fff`;
        boxShadow = `0 0 4px 1px ${bldColor}`;

        if (building.owner_id === player?.entity_id) {
          boxShadow = `0 0 6px 2px ${bldColor}, inset 0 0 4px rgba(255,255,255,0.3)`;
        }

        if (building.status === "suspended") {
          opacity = 0.5;
          border = `2px dashed #e57373`;
          boxShadow = "none";
        }
      }
      if (isSelected) {
        border = "2px solid #fff";
        boxShadow = `0 0 8px 2px rgba(255,255,255,0.6)${boxShadow !== "none" ? ", " + boxShadow : ""}`;
      }

      cells.push(
        <div
          key={key}
          onClick={() => handleTileClick(tx, ty)}
          style={{
            width: TILE_SIZE,
            height: TILE_SIZE,
            backgroundColor: bg,
            border,
            boxShadow,
            opacity,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize,
            cursor: buildMode ? "crosshair" : "pointer",
            color,
            fontWeight: "bold",
            borderRadius: building ? 3 : 0,
            zIndex: building ? 1 : 0,
            position: "relative",
          }}
        >
          {label}
        </div>
      );
    }
    rows.push(
      <div key={vy} style={{ display: "flex", height: TILE_SIZE }}>
        {cells}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          marginBottom: 4,
          color: "#888",
        }}
      >
        Map view ({offset.x},{offset.y}) — Arrow keys to pan
        {buildMode && (
          <span style={{ color: "#4fc3f7", marginLeft: 8 }}>
            Placing: {buildMode} (click tile, Esc to cancel)
          </span>
        )}
      </div>
      <div style={{ lineHeight: 0 }}>{rows}</div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "#888", flexWrap: "wrap" }}>
        {Object.entries(BUILDING_COLORS).map(([cls, color]) => (
          <span key={cls} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{
              display: "inline-block",
              width: 12,
              height: 12,
              backgroundColor: color,
              border: "1px solid #fff",
              borderRadius: 2,
              textAlign: "center",
              fontSize: 9,
              lineHeight: "12px",
              color: "#fff",
            }}>
              {BUILDING_ICONS[cls]?.[0] ?? cls[0].toUpperCase()}
            </span>
            {cls.replace(/_/g, " ")}
          </span>
        ))}
        <span style={{ marginLeft: 8, borderLeft: "1px solid #444", paddingLeft: 8 }}>
          Resources:
        </span>
        {Object.entries(RESOURCE_COLORS).map(([res, color]) => (
          <span key={res} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{
              display: "inline-block",
              width: 12,
              height: 12,
              backgroundColor: color,
            }} />
            {res.replace(/_/g, " ")}
          </span>
        ))}
      </div>
    </div>
  );
}
