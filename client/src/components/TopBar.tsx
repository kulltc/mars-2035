import React from "react";
import { useGameStore } from "../state/store.js";

export function TopBar() {
  const player = useGameStore((s) => s.player);
  const world = useGameStore((s) => s.world);
  const buildings = useGameStore((s) => s.buildings);
  const workers = useGameStore((s) => s.workers);
  const currentMap = useGameStore((s) => s.currentMap);
  const toggleMarket = useGameStore((s) => s.toggleMarket);
  const toggleTechTree = useGameStore((s) => s.toggleTechTree);
  const toggleWorkers = useGameStore((s) => s.toggleWorkers);
  const toggleMapSelector = useGameStore((s) => s.toggleMapSelector);
  const showMarket = useGameStore((s) => s.showMarket);
  const logout = useGameStore((s) => s.logout);

  if (!player || !currentMap) return null;

  const mapKey = `${currentMap.dx}:${currentMap.dy}:${currentMap.mx}:${currentMap.my}`;
  const adminBuilding = buildings.find(
    (b) => b.class === "admin_outpost" && b.owner_id === player.entity_id
  );

  const inv = adminBuilding?.inventory ?? {};
  const money = inv.money ?? 0;
  const myWorkers = workers.filter((w) => w.owner_id === player.entity_id);
  const activeWorkers = myWorkers.filter((w) => w.worker_status === "active").length;

  // Key raw materials
  const rawMats = [
    { key: "steel", label: "Fe", color: "#ff8a65", name: "Steel" },
    { key: "silicon", label: "Si", color: "#90caf9", name: "Silicon" },
    { key: "polymer", label: "Po", color: "#ce93d8", name: "Polymer" },
    { key: "rare_earth", label: "RE", color: "#ffcc80", name: "Rare Earth" },
    { key: "carbon", label: "C", color: "#a5d6a7", name: "Carbon" },
  ];

  return (
    <div className="top-bar">
      <span className="top-bar-title">MARS 2035</span>
      <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 8 }}>
        {player.name}
      </span>

      <div className="top-bar-divider" />

      {/* Money */}
      <div className="resource-pill money" title="Money">
        <span className="label">$</span>
        <span className="value">{money.toFixed(0)}</span>
      </div>

      {/* Raw materials in admin outpost */}
      {rawMats.map((m) => {
        const val = inv[m.key as keyof typeof inv] ?? 0;
        if (val === 0 && !adminBuilding) return null;
        return (
          <div key={m.key} className="resource-pill" title={m.name}>
            <span className="label" style={{ color: m.color }}>{m.label}</span>
            <span className="value">{val > 0 ? val.toFixed(0) : "0"}</span>
          </div>
        );
      })}

      <div className="top-bar-divider" />

      {/* Workers */}
      <div
        className="resource-pill"
        title="Workers"
        style={{ cursor: "pointer" }}
        onClick={toggleWorkers}
      >
        <span className="label" style={{ color: "var(--accent)" }}>W</span>
        <span className="value">{activeWorkers}/{myWorkers.length}</span>
      </div>

      {/* Buildings count */}
      <div className="resource-pill">
        <span className="label" style={{ color: "#81c784" }}>B</span>
        <span className="value">
          {buildings.filter((b) => b.owner_id === player.entity_id).length}
        </span>
      </div>

      <div className="top-bar-right">
        <button
          className="icon-btn"
          onClick={toggleMapSelector}
          title="Map Selector"
          style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
        >
          {currentMap.mx},{currentMap.my}
        </button>

        <span className="top-bar-tick">T:{world?.tick ?? 0}</span>

        <button
          className={`icon-btn ${showMarket ? "active" : ""}`}
          onClick={toggleMarket}
          title="Market Prices"
        >
          $
        </button>

        <button
          className="icon-btn"
          onClick={toggleTechTree}
          title="Tech Tree"
        >
          ?
        </button>

        <button
          className="icon-btn"
          onClick={logout}
          title="Logout"
          style={{ fontSize: 12 }}
        >
          &#x2192;
        </button>
      </div>
    </div>
  );
}
