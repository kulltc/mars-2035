import React, { useCallback, useEffect, useState } from "react";
import { useGameStore } from "./state/store.js";
import { useMapSubscription } from "./hooks/useMapSubscription.js";
import { fetchWorld, registerPlayer, fetchPlayer } from "./api/client.js";
import { MapView } from "./components/MapView.js";
import { TileInfo } from "./components/TileInfo.js";
import { PlayerDashboard } from "./components/PlayerDashboard.js";
import { BuildingPanel } from "./components/BuildingPanel.js";
import { DistrictInfo } from "./components/DistrictInfo.js";
import { EventLog } from "./components/EventLog.js";
import { CommandPanel } from "./components/CommandPanel.js";

export function App() {
  const setWorld = useGameStore((s) => s.setWorld);
  const setCurrentMap = useGameStore((s) => s.setCurrentMap);
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const world = useGameStore((s) => s.world);
  const events = useGameStore((s) => s.events);

  const [playerName, setPlayerName] = useState("");
  const [error, setError] = useState("");

  // Connect to map via WS
  useMapSubscription();

  // Initialize
  useEffect(() => {
    fetchWorld().then((w) => {
      setWorld(w);
      setCurrentMap({ dx: 0, dy: 0, mx: 0, my: 0 });
    });
  }, [setWorld, setCurrentMap]);

  // Refresh player data on tick events
  useEffect(() => {
    if (!player) return;
    fetchPlayer(player.entity_id).then(setPlayer);
  }, [events.length]);

  const handleRegister = useCallback(async () => {
    if (!playerName.trim()) return;
    try {
      const p = await registerPlayer(playerName.trim());
      const full = await fetchPlayer(p.entity_id);
      setPlayer(full);
      setError("");
    } catch (e) {
      setError("Failed to register");
    }
  }, [playerName, setPlayer]);

  if (!world) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h1>Mars 2035</h1>
        <div style={{ color: "#888" }}>Connecting to server...</div>
      </div>
    );
  }

  if (!player) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h1 style={{ marginBottom: 20 }}>Mars 2035</h1>
        <div style={{ marginBottom: 12 }}>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRegister()}
            placeholder="Enter your name"
            style={{
              background: "#0f3460",
              color: "#e0e0e0",
              border: "1px solid #444",
              padding: "8px 12px",
              borderRadius: 4,
              fontSize: 16,
              width: 200,
            }}
          />
          <button
            onClick={handleRegister}
            style={{
              background: "#4fc3f7",
              color: "#000",
              border: "none",
              padding: "8px 16px",
              borderRadius: 4,
              fontSize: 16,
              marginLeft: 8,
              cursor: "pointer",
            }}
          >
            Join
          </button>
        </div>
        {error && <div style={{ color: "#e57373" }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Left panel */}
      <div
        style={{
          width: 280,
          padding: 10,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          borderRight: "1px solid #333",
        }}
      >
        <h2 style={{ fontSize: 18, margin: 0 }}>Mars 2035</h2>
        <div style={{ fontSize: 11, color: "#888" }}>
          Tick: {world.tick} | Map: 0:0:0:0
        </div>
        <PlayerDashboard />
        <CommandPanel />
        <DistrictInfo />
      </div>

      {/* Center: map */}
      <div style={{ flex: 1, padding: 10, overflow: "auto" }}>
        <MapView />
      </div>

      {/* Right panel */}
      <div
        style={{
          width: 300,
          padding: 10,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          borderLeft: "1px solid #333",
        }}
      >
        <TileInfo />
        <BuildingPanel />
        <EventLog />
      </div>
    </div>
  );
}
