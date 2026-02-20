import React, { useCallback, useState } from "react";
import { useGameStore } from "../state/store.js";
import { register, login } from "../api/client.js";

export function LoginScreen() {
  const setToken = useGameStore((s) => s.setToken);
  const setPlayer = useGameStore((s) => s.setPlayer);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="login-screen">
      <div className="login-title">MARS 2035</div>
      <div className="login-subtitle">Mars Settlement Management Simulator</div>
      <div className="login-box">
        <div className="login-toggle">
          <button
            className={isLogin ? "active" : ""}
            onClick={() => { setIsLogin(true); setError(""); }}
          >
            Login
          </button>
          <button
            className={!isLogin ? "active" : ""}
            onClick={() => { setIsLogin(false); setError(""); }}
          >
            Register
          </button>
        </div>
        <input
          className="login-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
        />
        <input
          className="login-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          onKeyDown={(e) => e.key === "Enter" && isLogin && handleAuth()}
        />
        {!isLogin && (
          <input
            className="login-input"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAuth()}
            placeholder="Player name"
          />
        )}
        <button className="login-submit" onClick={handleAuth}>
          {isLogin ? "Login" : "Register"}
        </button>
        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}
