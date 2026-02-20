import React, { useEffect, useRef, useState } from "react";
import { useGameStore } from "../state/store.js";
import { submitCommand } from "../api/client.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import type { MaterialType } from "@mars-2035/shared";

const MATERIAL_GROUPS: { label: string; color: string; items: MaterialType[] }[] = [
  { label: "Raw", color: "var(--text-secondary)", items: ["steel", "silicon", "polymer", "rare_earth", "carbon"] },
  { label: "Morphic", color: "#ff7043", items: ["ferrite_alloy", "morphic_composite", "morphic_core", "servo_cortex", "autonomic_matrix"] },
  { label: "Toroidin", color: "#ba68c8", items: ["thermoplast", "lattice_fiber", "toroidin_plate", "muphrid_cell", "paradox_weave"] },
  { label: "Cryogenic", color: "#4dd0e1", items: ["cryite", "null_phase_gel", "xenotherm_crystal", "absolute_lattice", "zero_point_shard"] },
  { label: "Psycho", color: "#f48fb1", items: ["psi_crystal", "esper_thread", "psychon_core", "peep_shield", "noetic_matrix"] },
];

function formatMaterialName(mat: string): string {
  return mat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Key raw materials shown as pills in the top bar
const RAW_MATS = [
  { key: "steel", label: "Fe", color: "#ff8a65", name: "Steel" },
  { key: "silicon", label: "Si", color: "#90caf9", name: "Silicon" },
  { key: "polymer", label: "Po", color: "#ce93d8", name: "Polymer" },
  { key: "rare_earth", label: "RE", color: "#ffcc80", name: "Rare Earth" },
  { key: "carbon", label: "C", color: "#a5d6a7", name: "Carbon" },
];

export function TopBar() {
  const player = useGameStore((s) => s.player);
  const setPlayer = useGameStore((s) => s.setPlayer);
  const buildings = useGameStore((s) => s.buildings);
  const currentMap = useGameStore((s) => s.currentMap);
  const toggleMarket = useGameStore((s) => s.toggleMarket);
  const toggleTechTree = useGameStore((s) => s.toggleTechTree);
  const toggleWorkers = useGameStore((s) => s.toggleWorkers);
  const toggleMapSelector = useGameStore((s) => s.toggleMapSelector);
  const showMarket = useGameStore((s) => s.showMarket);
  const logout = useGameStore((s) => s.logout);
  const addNotification = useGameStore((s) => s.addNotification);
  const showMainMenu = useGameStore((s) => s.showMainMenu);
  const toggleMainMenu = useGameStore((s) => s.toggleMainMenu);
  const showInventory = useGameStore((s) => s.showInventory);
  const toggleInventory = useGameStore((s) => s.toggleInventory);
  const isMobile = useIsMobile();

  const [showForfeitConfirm, setShowForfeitConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inventoryRef = useRef<HTMLDivElement>(null);

  // Click-outside to dismiss popups
  useEffect(() => {
    if (!showMainMenu && !showInventory) return;
    const handler = (e: MouseEvent) => {
      if (showMainMenu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        toggleMainMenu();
      }
      if (showInventory && inventoryRef.current && !inventoryRef.current.contains(e.target as Node)) {
        toggleInventory();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMainMenu, showInventory, toggleMainMenu, toggleInventory]);

  if (!player || !currentMap) return null;

  const adminBuilding = buildings.find(
    (b) => b.class === "admin_outpost" && b.owner_id === player.entity_id
  );
  const inv = adminBuilding?.inventory ?? {};
  const money = inv.money ?? 0;
  const lowCash = money <= 0 && !!adminBuilding;

  const resourcePills = (
    <>
      {RAW_MATS.map((m) => {
        const val = inv[m.key as keyof typeof inv] ?? 0;
        if (val === 0 && !adminBuilding) return null;
        return (
          <div key={m.key} className="resource-pill" title={m.name}>
            <span className="label" style={{ color: m.color }}>{m.label}</span>
            <span className="value">{val > 0 ? val.toFixed(0) : "0"}</span>
          </div>
        );
      })}
    </>
  );

  const forfeitConfirmModal = showForfeitConfirm && (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }} onClick={() => setShowForfeitConfirm(false)}>
      <div style={{
        background: "var(--bg-panel)", border: "1px solid var(--danger)",
        borderRadius: 8, padding: "20px 28px", maxWidth: 360, textAlign: "center",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)", marginBottom: 8 }}>
          Forfeit Game?
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
          This will permanently destroy all your buildings, workers, and research.
          You will restart with only starting money. This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn-sm" onClick={() => setShowForfeitConfirm(false)}>Cancel</button>
          <button
            className="btn btn-danger btn-sm"
            onClick={async () => {
              setShowForfeitConfirm(false);
              const res = await submitCommand("forfeit", {});
              if (res.error) {
                addNotification(`Forfeit failed: ${res.error}`, "error");
              } else {
                if (player) {
                  setPlayer({
                    ...player,
                    tutorial_step: 1,
                    map_accounts: {},
                    research: [],
                  });
                }
                addNotification("Game forfeited. You can place a new admin outpost to start over.", "warning");
              }
            }}
          >
            Forfeit
          </button>
        </div>
      </div>
    </div>
  );

  // Inventory popup content
  const inventoryPopup = showInventory && (
    <div className="inventory-popup" ref={inventoryRef}>
      {MATERIAL_GROUPS.map((group) => {
        const items = group.items.filter((m) => (inv[m as keyof typeof inv] ?? 0) > 0);
        if (items.length === 0) return null;
        return (
          <div key={group.label} className="inventory-group">
            <div className="inventory-group-label" style={{ color: group.color }}>{group.label}</div>
            {items.map((m) => (
              <div key={m} className="inventory-row">
                <span className="inventory-mat">{formatMaterialName(m)}</span>
                <span className="inventory-val">{(inv[m as keyof typeof inv] ?? 0).toFixed(1)}</span>
              </div>
            ))}
          </div>
        );
      })}
      {MATERIAL_GROUPS.every((g) => g.items.every((m) => (inv[m as keyof typeof inv] ?? 0) === 0)) && (
        <div style={{ color: "var(--text-muted)", fontSize: 11, padding: 8 }}>No materials in inventory</div>
      )}
    </div>
  );

  // Main menu items
  const mainMenuPopup = showMainMenu && (
    <div className={`main-menu-popup${isMobile ? " mobile" : ""}`} ref={menuRef}>
      {isMobile && (
        <>
          <div style={{ padding: "6px 12px", fontSize: 11, color: "var(--text-muted)" }}>
            {player.name}
          </div>
          <button className="main-menu-item" onClick={() => { toggleMainMenu(); toggleMapSelector(); }}>
            Map Selector ({currentMap.mx},{currentMap.my})
          </button>
          <button className="main-menu-item" onClick={() => { toggleMainMenu(); toggleMarket(); }}>
            Market
          </button>
          <button className="main-menu-item" onClick={() => { toggleMainMenu(); toggleTechTree(); }}>
            Tech Tree
          </button>
          <button className="main-menu-item" onClick={() => { toggleMainMenu(); toggleWorkers(); }}>
            Worker List
          </button>
          <div className="main-menu-divider" />
        </>
      )}
      <button
        className="main-menu-item danger"
        onClick={() => { toggleMainMenu(); setShowForfeitConfirm(true); }}
      >
        Forfeit
      </button>
      <button
        className="main-menu-item"
        onClick={() => { toggleMainMenu(); logout(); }}
      >
        Logout
      </button>
    </div>
  );

  return (
    <div className={`top-bar${isMobile ? " mobile" : ""}${lowCash ? " low-cash" : ""}`}>
      {/* Desktop: title + player name */}
      {!isMobile && (
        <>
          <span className="top-bar-title">MARS 2035</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 8 }}>
            {player.name}
          </span>
          <div className="top-bar-divider" />
        </>
      )}

      {/* Money + raw material pills (clickable for inventory) */}
      <div
        className="top-bar-resources"
        onClick={toggleInventory}
        title="Click to view full inventory"
        style={{ cursor: "pointer" }}
      >
        <div className="resource-pill money" title="Money">
          <span className="label">$</span>
          <span className="value">{money.toFixed(0)}</span>
        </div>
        {resourcePills}
      </div>

      {/* Right section */}
      <div className="top-bar-right">
        {!isMobile && (
          <>
            <button
              className="icon-btn"
              onClick={toggleMapSelector}
              title="Map Selector"
              style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
            >
              {currentMap.mx},{currentMap.my}
            </button>
            <button
              className={`icon-btn ${showMarket ? "active" : ""}`}
              onClick={toggleMarket}
              title="Market Prices"
            >
              $
            </button>
            <button className="icon-btn" onClick={toggleTechTree} title="Tech Tree">
              ?
            </button>
          </>
        )}

        {/* Hamburger menu */}
        <div style={{ position: "relative" }}>
          <button
            className={`icon-btn ${showMainMenu ? "active" : ""}`}
            onClick={toggleMainMenu}
            title="Menu"
          >
            &#x2630;
          </button>
          {mainMenuPopup}
        </div>
      </div>

      {/* Popups */}
      {inventoryPopup}
      {forfeitConfirmModal}
    </div>
  );
}
