import React, { useState } from "react";
import { useGameStore } from "../state/store.js";
import { submitCommand } from "../api/client.js";
import { MATERIAL_TYPES, type MaterialType } from "@mars-2035/shared";

export function BuildingPanel() {
  const selectedTile = useGameStore((s) => s.selectedTile);
  const buildings = useGameStore((s) => s.buildings);
  const player = useGameStore((s) => s.player);

  const [transferMat, setTransferMat] = useState<MaterialType>("steel");
  const [transferAmt, setTransferAmt] = useState(10);

  if (!selectedTile || !player) return null;

  const building = buildings.find(
    (b) => b.location.x === selectedTile.x && b.location.y === selectedTile.y
  );

  if (!building || building.owner_id !== player.entity_id) return null;

  const handleTransferToPlayer = async () => {
    await submitCommand("transfer_to_player", {
      building_id: building.entity_id,
      material: transferMat,
      amount: transferAmt,
    });
  };

  const handleTransferToBuilding = async () => {
    await submitCommand("transfer_to_building", {
      building_id: building.entity_id,
      material: transferMat,
      amount: transferAmt,
    });
  };

  const handleExport = async () => {
    if (building.class !== "port") return;
    await submitCommand("export", {
      building_id: building.entity_id,
      material: transferMat,
      amount: transferAmt,
    });
  };

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>
        {building.class} — Actions
      </h3>

      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <select
          value={transferMat}
          onChange={(e) => setTransferMat(e.target.value as MaterialType)}
          style={selectStyle}
        >
          {MATERIAL_TYPES.filter((m) => m !== "money").map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          type="number"
          value={transferAmt}
          onChange={(e) => setTransferAmt(Number(e.target.value))}
          style={{ ...selectStyle, width: 60 }}
          min={1}
        />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={handleTransferToPlayer} style={btnStyle}>
          Transfer to Account
        </button>
        <button onClick={handleTransferToBuilding} style={btnStyle}>
          Transfer to Building
        </button>
        {building.class === "port" && (
          <button onClick={handleExport} style={{ ...btnStyle, backgroundColor: "#388e3c" }}>
            Export
          </button>
        )}
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

const selectStyle: React.CSSProperties = {
  background: "#0f3460",
  color: "#e0e0e0",
  border: "1px solid #444",
  padding: "4px 6px",
  borderRadius: 3,
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  background: "#0f3460",
  color: "#e0e0e0",
  border: "1px solid #444",
  padding: "4px 10px",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 12,
};
