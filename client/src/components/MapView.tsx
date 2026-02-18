import React, { useCallback, useEffect, useState } from "react";
import { useGameStore } from "../state/store.js";
import { VIEWPORT_W, VIEWPORT_H, TICK_INTERVAL_MS, totalInventory, type Tile, type Building, type Worker } from "@mars-2035/shared";
import { submitCommand } from "../api/client.js";
import { useAnimationFrame } from "../hooks/useAnimationFrame.js";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

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
};

const BUILDING_ICONS: Record<string, string> = {
  admin_outpost: "\u2302", // ⌂
  mine: "\u26CF",          // ⛏ (pick)
  port: "\u2693",          // ⚓
};

export function MapView() {
  const tiles = useGameStore((s) => s.tiles);
  const buildings = useGameStore((s) => s.buildings);
  const workers = useGameStore((s) => s.workers);
  const selectedTile = useGameStore((s) => s.selectedTile);
  const setSelectedTile = useGameStore((s) => s.setSelectedTile);
  const buildMode = useGameStore((s) => s.buildMode);
  const setBuildMode = useGameStore((s) => s.setBuildMode);
  const player = useGameStore((s) => s.player);
  const currentMap = useGameStore((s) => s.currentMap);
  const workerPrevPositions = useGameStore((s) => s.workerPrevPositions);
  const workerUpdateAt = useGameStore((s) => s.workerUpdateAt);
  const selectedWorkerId = useGameStore((s) => s.selectedWorkerId);
  const setSelectedWorkerId = useGameStore((s) => s.setSelectedWorkerId);

  useAnimationFrame();

  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Build building index
  const buildingByTile = new Map<string, Building>();
  for (const b of buildings) {
    buildingByTile.set(`${b.location.x}:${b.location.y}`, b);
  }

  // Find selected building for route arrows
  const selectedBuilding = selectedTile
    ? buildingByTile.get(`${selectedTile.x}:${selectedTile.y}`)
    : undefined;

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
      setSelectedWorkerId(null);

      if (buildMode && player && currentMap) {
        const location = {
          dx: currentMap.dx,
          dy: currentMap.dy,
          mx: currentMap.mx,
          my: currentMap.my,
          x,
          y,
        };
        await submitCommand("place_building", {
          building_class: buildMode,
          location,
        });
        setBuildMode(null);
      }
    },
    [buildMode, player, currentMap, setSelectedTile, setBuildMode, setSelectedWorkerId]
  );

  // Compute route arrows for selected building
  const routeArrows: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];
  if (selectedBuilding?.outgoing_routes) {
    for (const route of selectedBuilding.outgoing_routes) {
      const dest = buildings.find((b) => b.entity_id === route.to_building_id);
      if (!dest) continue;
      const sx = selectedBuilding.location.x - offset.x;
      const sy = selectedBuilding.location.y - offset.y;
      const dx = dest.location.x - offset.x;
      const dy = dest.location.y - offset.y;
      // Only draw if at least one endpoint is visible
      if ((sx >= 0 && sx < VIEWPORT_W && sy >= 0 && sy < VIEWPORT_H) ||
          (dx >= 0 && dx < VIEWPORT_W && dy >= 0 && dy < VIEWPORT_H)) {
        routeArrows.push({
          x1: sx * TILE_SIZE + TILE_SIZE / 2,
          y1: sy * TILE_SIZE + TILE_SIZE / 2,
          x2: dx * TILE_SIZE + TILE_SIZE / 2,
          y2: dy * TILE_SIZE + TILE_SIZE / 2,
          color: route.resource === "money" ? "#ffd54f" : "#4fc3f7",
        });
      }
    }
  }
  // Also show incoming routes TO the selected building
  if (selectedBuilding) {
    for (const b of buildings) {
      if (!b.outgoing_routes) continue;
      for (const route of b.outgoing_routes) {
        if (route.to_building_id !== selectedBuilding.entity_id) continue;
        const sx = b.location.x - offset.x;
        const sy = b.location.y - offset.y;
        const dx = selectedBuilding.location.x - offset.x;
        const dy = selectedBuilding.location.y - offset.y;
        if ((sx >= 0 && sx < VIEWPORT_W && sy >= 0 && sy < VIEWPORT_H) ||
            (dx >= 0 && dx < VIEWPORT_W && dy >= 0 && dy < VIEWPORT_H)) {
          routeArrows.push({
            x1: sx * TILE_SIZE + TILE_SIZE / 2,
            y1: sy * TILE_SIZE + TILE_SIZE / 2,
            x2: dx * TILE_SIZE + TILE_SIZE / 2,
            y2: dy * TILE_SIZE + TILE_SIZE / 2,
            color: route.resource === "money" ? "#ffd54f80" : "#4fc3f780",
          });
        }
      }
    }
  }

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
        } else if (building.status === "constructing") {
          opacity = 0.5;
          border = `2px dashed #ffb74d`;
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

  const mapW = VIEWPORT_W * TILE_SIZE;
  const mapH = VIEWPORT_H * TILE_SIZE;

  return (
    <div>
      <div style={{ fontSize: 11, marginBottom: 4, color: "#888" }}>
        Map view ({offset.x},{offset.y}) — Arrow keys to pan
        {buildMode && (
          <span style={{ color: "#4fc3f7", marginLeft: 8 }}>
            Placing: {buildMode} (click tile, Esc to cancel)
          </span>
        )}
      </div>
      <div style={{ position: "relative", width: mapW, height: mapH }}>
        <div style={{ lineHeight: 0 }}>{rows}</div>
        {/* SVG overlay for route arrows and workers */}
        <svg
          style={{ position: "absolute", top: 0, left: 0, width: mapW, height: mapH, pointerEvents: "none" }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#4fc3f7" />
            </marker>
            <marker id="arrowhead-gold" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#ffd54f" />
            </marker>
          </defs>
          {routeArrows.map((a, i) => (
            <line
              key={i}
              x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
              stroke={a.color}
              strokeWidth={2}
              markerEnd={a.color.includes("ffd54f") ? "url(#arrowhead-gold)" : "url(#arrowhead)"}
            />
          ))}
          {/* Workers */}
          {(() => {
            const now = Date.now();
            const alpha = workerUpdateAt > 0
              ? clamp((now - workerUpdateAt) / TICK_INTERVAL_MS, 0, 1)
              : 1;

            // Compute interpolated positions, then group by pixel tile to spread overlaps
            const workerPositions: Array<{ w: typeof workers[0]; wx: number; wy: number }> = [];
            for (const w of workers) {
              const isMoving = w.state === "moving_to_pickup" || w.state === "moving_to_dropoff" || w.state === "returning_to_base" || w.state === "moving_to_construct";
              const prev = workerPrevPositions.get(w.entity_id);

              let wx: number, wy: number;
              if (isMoving && prev) {
                wx = lerp(prev.x, w.x, alpha);
                wy = lerp(prev.y, w.y, alpha);
              } else {
                wx = w.x;
                wy = w.y;
              }
              workerPositions.push({ w, wx, wy });
            }

            // Group by rounded tile position to detect overlaps
            const tileGroups = new Map<string, number>();
            for (const wp of workerPositions) {
              const tk = `${Math.round(wp.wx)}:${Math.round(wp.wy)}`;
              tileGroups.set(tk, (tileGroups.get(tk) ?? 0) + 1);
            }
            const tileIndex = new Map<string, number>();

            const circles: React.ReactNode[] = [];
            for (const { w, wx, wy } of workerPositions) {
              const vx = wx - offset.x;
              const vy = wy - offset.y;
              if (vx < -1 || vx > VIEWPORT_W || vy < -1 || vy > VIEWPORT_H) continue;

              let cx = vx * TILE_SIZE + TILE_SIZE / 2;
              let cy = vy * TILE_SIZE + TILE_SIZE / 2;

              // Spread workers sharing the same tile in a ring
              const tk = `${Math.round(wx)}:${Math.round(wy)}`;
              const count = tileGroups.get(tk) ?? 1;
              if (count > 1) {
                const idx = tileIndex.get(tk) ?? 0;
                tileIndex.set(tk, idx + 1);
                const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
                const spread = Math.min(6, 3 + count);
                cx += Math.cos(angle) * spread;
                cy += Math.sin(angle) * spread;
              }

              const carrying = totalInventory(w.inventory) > 0;
              const isInactive = w.worker_status === "inactive";
              const isSelected = w.entity_id === selectedWorkerId;

              if (isSelected) {
                circles.push(
                  <circle
                    key={w.entity_id + "-glow"}
                    cx={cx} cy={cy} r={8}
                    fill="none"
                    stroke="#4fc3f7" strokeWidth={1.5}
                    opacity={0.6}
                  />
                );
              }
              circles.push(
                <circle
                  key={w.entity_id}
                  cx={cx} cy={cy} r={4}
                  fill={isInactive ? "#555" : carrying ? "#ffd54f" : "#bbb"}
                  stroke={isSelected ? "#4fc3f7" : "#000"} strokeWidth={isSelected ? 1.5 : 1}
                  style={{ pointerEvents: "all", cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedWorkerId(w.entity_id);
                  }}
                />
              );
            }
            return circles;
          })()}
        </svg>
      </div>
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
