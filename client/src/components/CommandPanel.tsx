import React from "react";
import { useGameStore } from "../state/store.js";
import { BUILDING_DEFS, type BuildingClass } from "@mars-2035/shared";

const PLACEABLE: BuildingClass[] = ["admin_outpost", "mine", "port"];

const DISPLAY_NAMES: Record<BuildingClass, string> = {
  admin_outpost: "Admin Outpost",
  mine: "Mine",
  port: "Trading Outpost",
};

function formatCost(cls: BuildingClass): string {
  const def = BUILDING_DEFS[cls];
  const entries = Object.entries(def.cost).filter(([, v]) => v && v > 0);
  if (entries.length === 0) return "Free";
  return entries.map(([mat, amt]) => `${amt} ${mat}`).join(", ");
}

export function CommandPanel() {
  const player = useGameStore((s) => s.player);
  const buildMode = useGameStore((s) => s.buildMode);
  const setBuildMode = useGameStore((s) => s.setBuildMode);
  const currentMap = useGameStore((s) => s.currentMap);

  if (!player) return null;

  const mapKey = currentMap
    ? `${currentMap.dx}:${currentMap.dy}:${currentMap.mx}:${currentMap.my}`
    : null;
  const hasAdminOutpost = mapKey
    ? !!player.map_accounts?.[mapKey]?.admin_outpost_building_id
    : false;

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>Build</h3>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {PLACEABLE.map((cls) => {
          const needsAdmin = cls !== "admin_outpost" && !hasAdminOutpost;
          const alreadyHasAdmin = cls === "admin_outpost" && hasAdminOutpost;
          const disabled = needsAdmin || alreadyHasAdmin;
          return (
            <button
              key={cls}
              disabled={disabled}
              onClick={() => setBuildMode(buildMode === cls ? null : cls)}
              style={{
                ...btnStyle,
                backgroundColor: buildMode === cls ? "#4fc3f7" : "#0f3460",
                color: buildMode === cls ? "#000" : "#e0e0e0",
                opacity: disabled ? 0.4 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
              title={
                needsAdmin
                  ? "Place an Admin Outpost first"
                  : alreadyHasAdmin
                  ? "Already have an admin outpost"
                  : `Cost: ${formatCost(cls)}`
              }
            >
              <div>{DISPLAY_NAMES[cls]}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>{formatCost(cls)}</div>
            </button>
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

const btnStyle: React.CSSProperties = {
  border: "1px solid #444",
  padding: "4px 10px",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 12,
  textAlign: "center",
};
