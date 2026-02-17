import React from "react";
import { useGameStore } from "../state/store.js";
import type { Building, MapKey } from "@mars-2035/shared";

export function PlayerDashboard() {
  const player = useGameStore((s) => s.player);
  const buildings = useGameStore((s) => s.buildings);
  const currentMap = useGameStore((s) => s.currentMap);

  if (!player) return null;

  const mapKey: MapKey | null = currentMap
    ? `${currentMap.dx}:${currentMap.dy}:${currentMap.mx}:${currentMap.my}`
    : null;

  const account = mapKey ? player.map_accounts[mapKey] : null;

  // Find admin outpost on current map from the buildings array (live from WS)
  const adminOutpost: Building | undefined = account?.admin_outpost_building_id
    ? buildings.find((b) => b.entity_id === account.admin_outpost_building_id)
    : undefined;

  const inventoryEntries = adminOutpost
    ? Object.entries(adminOutpost.inventory).filter(([, v]) => v !== undefined && v !== 0)
    : [];

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>Player: {player.name}</h3>

      {/* Admin outpost wallet */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: 12, color: "#aaa" }}>
          Admin Outpost Wallet
        </div>
        {adminOutpost ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {inventoryEntries.length > 0 ? (
              inventoryEntries.map(([mat, amt]) => (
                <div key={mat} style={{ fontSize: 13 }}>
                  <span style={{ color: mat === "money" ? "#ffd54f" : "#ccc" }}>
                    {mat === "money" ? "$" : ""}{mat}:
                  </span>{" "}
                  <strong style={{ color: mat === "money" ? "#ffd54f" : "#e0e0e0" }}>
                    {(amt as number).toFixed(1)}
                  </strong>
                </div>
              ))
            ) : (
              <div style={{ color: "#666", fontSize: 12 }}>Empty</div>
            )}
          </div>
        ) : (
          <div style={{ color: "#666", fontSize: 12 }}>
            No admin outpost on this map
          </div>
        )}
      </div>

      {/* Building list */}
      {player.buildings && player.buildings.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: 12, color: "#aaa" }}>Buildings</div>
          {player.buildings
            .filter((b) => !mapKey || b.map_key === mapKey)
            .map((b) => (
              <div
                key={b.entity_id}
                style={{
                  fontSize: 12,
                  padding: "2px 0",
                  color: b.status === "suspended" ? "#e57373" : "#e0e0e0",
                }}
              >
                {b.class === "port" ? "trading outpost" : b.class.replace(/_/g, " ")} ({b.location.x},{b.location.y}) — {b.status}
              </div>
            ))}
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
};
