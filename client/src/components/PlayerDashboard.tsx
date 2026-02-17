import React from "react";
import { useGameStore } from "../state/store.js";
import type { MapKey } from "@mars-2035/shared";

export function PlayerDashboard() {
  const player = useGameStore((s) => s.player);
  const currentMap = useGameStore((s) => s.currentMap);

  if (!player) return null;

  const mapKey: MapKey | null = currentMap
    ? `${currentMap.dx}:${currentMap.dy}:${currentMap.mx}:${currentMap.my}`
    : null;

  const account = mapKey ? player.map_accounts[mapKey] : null;

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>Player: {player.name}</h3>
      <div style={{ fontSize: 12, color: "#888" }}>ID: {player.entity_id}</div>

      {account && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>
            Map Account ({mapKey})
          </div>
          <div>
            {Object.entries(account.assets)
              .filter(([, v]) => v !== undefined && v !== 0)
              .map(([mat, amt]) => (
                <div key={mat} style={{ fontSize: 13 }}>
                  {mat}: <strong>{(amt as number).toFixed(1)}</strong>
                </div>
              ))}
            {Object.keys(account.assets).length === 0 && (
              <div style={{ color: "#666" }}>No assets</div>
            )}
          </div>
        </div>
      )}

      {player.buildings && player.buildings.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Buildings</div>
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
                {b.class} ({b.location.x},{b.location.y}) — {b.status}
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
