import React from "react";
import { useGameStore } from "../state/store.js";
import { BUILDING_CLASSES, type BuildingClass } from "@mars-2035/shared";

const PLACEABLE: BuildingClass[] = [
  "admin_outpost",
  "mine",
  "port",
  "core_hq",
  "admin_hub",
  "relay",
];

export function CommandPanel() {
  const player = useGameStore((s) => s.player);
  const buildMode = useGameStore((s) => s.buildMode);
  const setBuildMode = useGameStore((s) => s.setBuildMode);

  if (!player) return null;

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>Build</h3>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {PLACEABLE.map((cls) => (
          <button
            key={cls}
            onClick={() => setBuildMode(buildMode === cls ? null : cls)}
            style={{
              ...btnStyle,
              backgroundColor: buildMode === cls ? "#4fc3f7" : "#0f3460",
              color: buildMode === cls ? "#000" : "#e0e0e0",
            }}
          >
            {cls.replace("_", " ")}
          </button>
        ))}
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
};
