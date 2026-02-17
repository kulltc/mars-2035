import React, { useCallback, useEffect, useState } from "react";
import { useGameStore } from "./state/store.js";
import { useMapSubscription } from "./hooks/useMapSubscription.js";
import { fetchWorld, fetchPlayer, register, login, getMe } from "./api/client.js";
import { MapView } from "./components/MapView.js";
import { TileInfo } from "./components/TileInfo.js";
import { PlayerDashboard } from "./components/PlayerDashboard.js";
import { BuildingPanel } from "./components/BuildingPanel.js";
import { MarketInfo } from "./components/MarketInfo.js";
import { EventLog } from "./components/EventLog.js";
import { CommandPanel } from "./components/CommandPanel.js";

export function App() {
  const setWorld = useGameStore((s) => s.setWorld);
  const setCurrentMap = useGameStore((s) => s.setCurrentMap);
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const world = useGameStore((s) => s.world);
  const events = useGameStore((s) => s.events);
  const token = useGameStore((s) => s.token);
  const setToken = useGameStore((s) => s.setToken);
  const logout = useGameStore((s) => s.logout);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
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

  // Restore session from token
  useEffect(() => {
    if (!token) return;
    getMe()
      .then((data) => setPlayer(data.player))
      .catch(() => logout());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh player data on tick events
  useEffect(() => {
    if (!player || !token) return;
    fetchPlayer(player.entity_id).then(setPlayer).catch(() => {});
  }, [events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAuth = useCallback(async () => {
    setError("");
    try {
      if (isLogin) {
        if (!username.trim() || !password) return;
        const res = await login(username.trim(), password);
        setToken(res.token);
        setPlayer(res.player);
      } else {
        if (!username.trim() || !password || !playerName.trim()) return;
        const res = await register(username.trim(), password, playerName.trim());
        setToken(res.token);
        setPlayer(res.player);
      }
    } catch (e: any) {
      setError(e.message || "Auth failed");
    }
  }, [isLogin, username, password, playerName, setToken, setPlayer]);

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
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => { setIsLogin(true); setError(""); }}
            style={{
              background: isLogin ? "#4fc3f7" : "transparent",
              color: isLogin ? "#000" : "#888",
              border: "1px solid #444", padding: "6px 16px",
              borderRadius: "4px 0 0 4px", cursor: "pointer", fontSize: 14,
            }}
          >
            Login
          </button>
          <button
            onClick={() => { setIsLogin(false); setError(""); }}
            style={{
              background: !isLogin ? "#4fc3f7" : "transparent",
              color: !isLogin ? "#000" : "#888",
              border: "1px solid #444", borderLeft: "none", padding: "6px 16px",
              borderRadius: "0 4px 4px 0", cursor: "pointer", fontSize: 14,
            }}
          >
            Register
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            style={{
              background: "#0f3460", color: "#e0e0e0",
              border: "1px solid #444", padding: "8px 12px",
              borderRadius: 4, fontSize: 16, width: 220,
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            onKeyDown={(e) => e.key === "Enter" && isLogin && handleAuth()}
            style={{
              background: "#0f3460", color: "#e0e0e0",
              border: "1px solid #444", padding: "8px 12px",
              borderRadius: 4, fontSize: 16, width: 220,
            }}
          />
          {!isLogin && (
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAuth()}
              placeholder="Player name"
              style={{
                background: "#0f3460", color: "#e0e0e0",
                border: "1px solid #444", padding: "8px 12px",
                borderRadius: 4, fontSize: 16, width: 220,
              }}
            />
          )}
          <button
            onClick={handleAuth}
            style={{
              background: "#4fc3f7", color: "#000",
              border: "none", padding: "8px 16px",
              borderRadius: 4, fontSize: 16, cursor: "pointer", width: 248,
            }}
          >
            {isLogin ? "Login" : "Register"}
          </button>
        </div>
        {error && <div style={{ color: "#e57373", marginTop: 12 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Left panel */}
      <div style={{
        width: 280, padding: 10, overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 10,
        borderRight: "1px solid #333",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Mars 2035</h2>
          <button
            onClick={logout}
            style={{
              background: "transparent", color: "#888",
              border: "1px solid #555", padding: "2px 8px",
              borderRadius: 4, cursor: "pointer", fontSize: 11,
            }}
          >
            Logout
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#888" }}>
          Tick: {world.tick} | Map: 0:0:0:0
        </div>
        <PlayerDashboard />
        <CommandPanel />
        <MarketInfo />
      </div>

      {/* Center: map */}
      <div style={{ flex: 1, padding: 10, overflow: "auto" }}>
        <MapView />
      </div>

      {/* Right panel */}
      <div style={{
        width: 300, padding: 10, overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 10,
        borderLeft: "1px solid #333",
      }}>
        <TileInfo />
        <BuildingPanel />
        <EventLog />
      </div>
    </div>
  );
}
