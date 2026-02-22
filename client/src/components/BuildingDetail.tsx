import React, { useEffect, useRef, useState } from "react";
import { useGameStore } from "../state/store.js";
import { submitCommand } from "../api/client.js";
import {
  MATERIAL_TYPES, TRADEABLE_TYPES, BUILDING_DEFS, SUSPENSION_DESTROY_TICKS,
  totalInventory, outputBufferTotal, RESOURCE_TYPES, IMPORT_PRICE_MULTIPLIER,
  type MaterialType, type ResourceType, type AutoSellRule, type RouteResource, type Building, parseMapKey,
  RESEARCH_TREE, sectorName, type ResearchDef,
} from "@mars-2035/shared";
import { DISPLAY_NAMES } from "./MapCanvas.js";
import { LockIcon } from "./LockIcon.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { BottomSheet } from "./BottomSheet.js";

const BUILDING_COLORS: Record<string, string> = {
  admin_outpost: "#4fc3f7", research_lab: "#7e57c2", mine: "#ffb74d", port: "#81c784",
  smelter: "#e65100", magnetic_press: "#d84315", morphic_forge: "#bf360c",
  servo_assembly: "#a52714", replication_chamber: "#8b1a1a",
  polymer_kiln: "#7b1fa2", crystal_grower: "#6a1b9a", toroidin_foundry: "#4a148c",
  muphrid_lab: "#38006b", solar_loom: "#2c0054",
  cryo_distillery: "#00838f", phase_condenser: "#006064", xenotherm_reactor: "#004d40",
  deep_freeze_synth: "#00363a", iceworld_refinery: "#002626",
  resonance_tuner: "#ad1457", neural_loom: "#880e4f", psychophysical_amp: "#6a0037",
  dampening_forge: "#560027", consciousness_engine: "#3e001f",
  quantum_relay: "#64b5f6",
  embassy: "#ff8a65",
};

const BUILDING_ICONS: Record<string, string> = {
  admin_outpost: "⌂", research_lab: "⚗", mine: "⛏", port: "$",
  smelter: "♨", magnetic_press: "⌬", morphic_forge: "⚒",
  servo_assembly: "⚙", replication_chamber: "⧉",
  polymer_kiln: "◌", crystal_grower: "✧", toroidin_foundry: "⊚",
  muphrid_lab: "⚛", solar_loom: "☼",
  cryo_distillery: "❄", phase_condenser: "◈", xenotherm_reactor: "☢",
  deep_freeze_synth: "❆", iceworld_refinery: "⬡",
  resonance_tuner: "♬", neural_loom: "∿", psychophysical_amp: "Ψ",
  dampening_forge: "⊟", consciousness_engine: "◎",
  quantum_relay: "⬢",
  embassy: "♛",
};

const RELAY_MATERIALS: MaterialType[] = MATERIAL_TYPES.filter((m) => m !== "money");

function relayDestinationLabel(b: Building): string {
  const { dx, dy, mx, my } = parseMapKey(b.map_key);
  const sector = sectorName(dx, dy, mx, my);
  return `${sector} (${mx},${my}) · ${b.location.x},${b.location.y}`;
}

function buildingLabel(b: Building): string {
  return `${DISPLAY_NAMES[b.class] ?? b.class} (${b.location.x},${b.location.y})`;
}

function adminOutpostDestinationLabel(b: Building): string {
  const { dx, dy, mx, my } = parseMapKey(b.map_key);
  const sector = sectorName(dx, dy, mx, my);
  return `${sector} (${mx},${my})`;
}

export function BuildingDetail() {
  const isMobile = useIsMobile();
  const selectedTile = useGameStore((s) => s.selectedTile);
  const buildings = useGameStore((s) => s.buildings);
  const player = useGameStore((s) => s.player);
  const world = useGameStore((s) => s.world);
  const marketPrices = useGameStore((s) => s.marketPrices);
  const setSelectedTile = useGameStore((s) => s.setSelectedTile);
  const updateBuilding = useGameStore((s) => s.updateBuilding);
  const addNotification = useGameStore((s) => s.addNotification);

  // Local buffer stock state
  const [localBufferStock, setLocalBufferStock] = useState<Partial<Record<MaterialType, number>>>({});

  // Port mode (buy/sell toggle)
  const [portMode, setPortMode] = useState<"sell" | "buy">("sell");
  const [buyResource, setBuyResource] = useState<ResourceType>(RESOURCE_TYPES[0]);
  const [buyAmount, setBuyAmount] = useState(1);
  const [relayToBuildingId, setRelayToBuildingId] = useState("");
  const [relayMaterials, setRelayMaterials] = useState<MaterialType[]>([]);
  const [moneyTransferTargetMapKey, setMoneyTransferTargetMapKey] = useState("");
  const [moneyTransferAmount, setMoneyTransferAmount] = useState(100);
  const [bufferStockExpanded, setBufferStockExpanded] = useState(false);

  // Local auto-sell state
  const [localAutoSell, setLocalAutoSell] = useState<Partial<Record<ResourceType, AutoSellRule | null>>>({});
  const trackedId = useRef<string | null>(null);

  const building = (() => {
    if (!selectedTile || !player) return null;
    return buildings.find(
      (b) => b.location.x === selectedTile.x && b.location.y === selectedTile.y && b.owner_id === player.entity_id
    ) ?? null;
  })();

  // Reset local state on building change
  useEffect(() => {
    if (building?.entity_id !== trackedId.current) {
      trackedId.current = building?.entity_id ?? null;
      setLocalAutoSell({});
      setLocalBufferStock({});
      setMoneyTransferTargetMapKey("");
      setMoneyTransferAmount(100);
    }
  }, [building?.entity_id]);

  // Clear local overrides when server catches up
  useEffect(() => {
    if (!building) return;
    setLocalAutoSell((prev) => {
      const next: typeof prev = {};
      let changed = false;
      for (const [res, localRule] of Object.entries(prev)) {
        const serverRule = building.auto_sell?.[res as ResourceType];
        const serverMode = serverRule?.mode ?? "off";
        const localMode = localRule?.mode ?? "off";
        if (localMode !== serverMode) {
          next[res as ResourceType] = localRule;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [building]);

  if (!building || !player) return null;

  const closePanel = () => setSelectedTile(null);
  const def = BUILDING_DEFS[building.class];
  const allOwnedBuildings = (player.buildings ?? buildings).filter(
    (b) => b.owner_id === player.entity_id
  );
  const otherBuildings = allOwnedBuildings.filter(
    (b) => b.owner_id === player.entity_id && b.entity_id !== building.entity_id
  );
  const effectiveRoutes = building.outgoing_routes ?? [];
  const relayRules = building.quantum_rules ?? [];
  const relayTargets = allOwnedBuildings.filter(
    (b) =>
      b.owner_id === player.entity_id &&
      b.class === "quantum_relay" &&
      b.entity_id !== building.entity_id
  );
  const otherAdminOutposts = allOwnedBuildings.filter(
    (b) =>
      b.owner_id === player.entity_id &&
      b.class === "admin_outpost" &&
      b.entity_id !== building.entity_id
  );
  const used = totalInventory(building.inventory);
  const pct = building.capacity > 0 ? Math.min(100, (used / building.capacity) * 100) : 0;

  const getEffectiveRule = (res: ResourceType): AutoSellRule | null => {
    if (res in localAutoSell) return localAutoSell[res] ?? null;
    return building.auto_sell?.[res] ?? null;
  };

  const handleDeleteRoute = async (toBuildingId: string, resource: RouteResource) => {
    // Optimistic
    const prev = building.outgoing_routes ?? [];
    updateBuilding({
      ...building,
      outgoing_routes: prev.filter((r) => !(r.resource === resource && r.to_building_id === toBuildingId)),
    });
    addNotification("Route removed", "info");

    const res = await submitCommand("delete_route", {
      from_building_id: building.entity_id,
      to_building_id: toBuildingId,
      resource,
    });
    if (res.error) {
      addNotification(`Delete failed: ${res.error}`, "error");
      updateBuilding({ ...building, outgoing_routes: prev });
    }
  };

  const handleAutoSellChange = async (resource: ResourceType, mode: string, minPrice?: number) => {
    let rule: AutoSellRule | null = null;
    if (mode === "any_rate") rule = { mode: "any_rate" };
    else if (mode === "min_rate") rule = { mode: "min_rate", min_price: minPrice ?? 1 };
    setLocalAutoSell((prev) => ({ ...prev, [resource]: rule }));
    await submitCommand("configure_auto_sell", {
      building_id: building.entity_id, resource, rule,
    });
  };

  const content = (
    <div className={isMobile ? "building-detail mobile" : "building-detail"}>
      {/* Header */}
      <div className="bd-header">
        <div
          className="bd-icon"
          style={{ background: BUILDING_COLORS[building.class] ?? "#555" }}
        >
          {BUILDING_ICONS[building.class] ?? "?"}
        </div>
        <div>
          <div className="bd-title">{DISPLAY_NAMES[building.class] ?? building.class}</div>
          <div className="bd-coords">({building.location.x}, {building.location.y})</div>
        </div>
        <button className="bd-close" onClick={() => setSelectedTile(null)}>&times;</button>
      </div>

      {/* Status */}
      <span className={`bd-status ${building.status}`}>{building.status}</span>
      {building.status === "suspended" && building.suspended_at_tick != null && world && (
        <span style={{ fontSize: 11, color: "var(--danger)", marginLeft: 8 }}>
          Decays in {Math.max(0, SUSPENSION_DESTROY_TICKS - (world.tick - building.suspended_at_tick))} ticks
        </span>
      )}

      {/* Recipe */}
      {def.recipe && (
        <div className="bd-recipe" style={{ marginTop: 8 }}>
          {Object.entries(def.recipe.inputs).filter(([, v]) => v && v > 0).map(([m, a]) => `${a} ${m.replace(/_/g, " ")}`).join(" + ")}
          {" \u2192 "}
          {def.recipe.output_amount} {def.recipe.output.replace(/_/g, " ")}
        </div>
      )}

      {/* Production rate (mine) */}
      {building.production_per_tick && (
        <div style={{ fontSize: 12, color: "var(--success)", marginTop: 4 }}>
          Produces {building.production_per_tick.toFixed(1)} {building.resource_type}/tick
        </div>
      )}

      {/* Storage bar */}
      {building.capacity > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="capacity-label">
            <span>Storage</span>
            <span className="mono">{used.toFixed(0)}/{building.capacity}</span>
          </div>
          <div className="capacity-bar">
            <div
              className="capacity-bar-fill"
              style={{
                width: `${pct}%`,
                background: pct > 90 ? "var(--danger)" : pct > 60 ? "var(--warning)" : "var(--success)",
              }}
            />
          </div>
        </div>
      )}

      {/* Output buffer bar */}
      {def.output_capacity && building.output_buffer && (() => {
        const outUsed = outputBufferTotal(building.output_buffer);
        const outPct = Math.min(100, (outUsed / def.output_capacity!) * 100);
        return (
          <div style={{ marginTop: 4 }}>
            <div className="capacity-label">
              <span>Output</span>
              <span className="mono">{outUsed.toFixed(0)}/{def.output_capacity}</span>
            </div>
            <div className="capacity-bar">
              <div
                className="capacity-bar-fill"
                style={{
                  width: `${outPct}%`,
                  background: outPct > 90 ? "var(--danger)" : outPct > 60 ? "var(--warning)" : "var(--accent)",
                }}
              />
            </div>
          </div>
        );
      })()}

      {/* Inventory */}
      {(() => {
        const entries = Object.entries(building.inventory).filter(([, v]) => v && v > 0);
        if (entries.length === 0) return null;
        return (
          <div className="bd-section">
            <div className="bd-section-title">Inventory</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
              {entries.map(([mat, amt]) => (
                <div key={mat} style={{ fontSize: 12 }}>
                  <span style={{ color: mat === "money" ? "var(--money)" : "var(--text-secondary)" }}>
                    {mat.replace(/_/g, " ")}:
                  </span>{" "}
                  <strong className="mono" style={{ color: mat === "money" ? "var(--money)" : "var(--text-primary)" }}>
                    {(amt as number).toFixed(1)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Routes */}
      <div className="bd-section">
        <div className="bd-section-title">Routes</div>
        {effectiveRoutes.length === 0 ? (
          <div className="route-hint">Drag from this building to another to create a route</div>
        ) : (
          effectiveRoutes.map((route, i) => {
            const dest = buildings.find((b) => b.entity_id === route.to_building_id);
            return (
              <div key={`${route.resource}-${route.to_building_id}-${i}`} className="route-item">
                <span className="route-res" style={{ color: route.resource === "money" ? "var(--money)" : route.resource === "all" ? "var(--text-secondary)" : "var(--text-primary)" }}>
                  {route.resource === "all" ? "all materials" : route.resource.replace(/_/g, " ")}
                </span>
                <span className="route-arrow">&rarr;</span>
                <span className="route-dest">
                  {dest ? buildingLabel(dest) : "???"}
                </span>
                <button
                  className="route-delete"
                  onClick={() => handleDeleteRoute(route.to_building_id, route.resource)}
                >
                  &times;
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Quantum relay rules */}
      {building.class === "quantum_relay" && (
        <div className="bd-section">
          <div className="bd-section-title">Quantum Rules (max 3)</div>

          {relayRules.length === 0 ? (
            <div className="route-hint">No quantum rules configured</div>
          ) : (
            relayRules.map((rule, idx) => {
              const dest = relayTargets.find((b) => b.entity_id === rule.to_building_id)
                ?? allOwnedBuildings.find((b) => b.entity_id === rule.to_building_id)
                ?? null;
              return (
                <div key={`${rule.to_building_id}-${idx}`} className="route-item">
                  <span className="route-res" style={{ color: "var(--accent)" }}>
                    {rule.materials.join(", ")}
                  </span>
                  <span className="route-arrow">&rarr;</span>
                  <span className="route-dest">{dest ? relayDestinationLabel(dest) : "???"}</span>
                  <button
                    className="route-delete"
                    onClick={async () => {
                      const res = await submitCommand("delete_quantum_rule", {
                        building_id: building.entity_id,
                        to_building_id: rule.to_building_id,
                      });
                      if (res.error) addNotification(`Delete failed: ${res.error}`, "error");
                    }}
                  >
                    &times;
                  </button>
                </div>
              );
            })
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <select
              className="input"
              value={relayToBuildingId}
              onChange={(e) => setRelayToBuildingId(e.target.value)}
              style={{ fontSize: 12, padding: "2px 4px" }}
            >
              <option value="">Select destination relay</option>
              {relayTargets.map((b) => (
                <option key={b.entity_id} value={b.entity_id}>
                  {relayDestinationLabel(b)}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {RELAY_MATERIALS.map((mat) => {
                const selected = relayMaterials.includes(mat);
                return (
                  <button
                    key={mat}
                    type="button"
                    className={`auto-sell-btn ${selected ? "active" : ""}`}
                    onClick={() => {
                      setRelayMaterials((prev) =>
                        prev.includes(mat) ? prev.filter((m) => m !== mat) : [...prev, mat]
                      );
                    }}
                  >
                    {mat.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>

            <button
              className="btn btn-accent btn-sm"
              disabled={!relayToBuildingId || relayMaterials.length === 0 || (relayRules.length >= 3 && !relayRules.some((r) => r.to_building_id === relayToBuildingId))}
              onClick={async () => {
                const res = await submitCommand("configure_quantum_rule", {
                  building_id: building.entity_id,
                  to_building_id: relayToBuildingId,
                  materials: relayMaterials,
                });
                if (res.error) {
                  addNotification(`Rule failed: ${res.error}`, "error");
                } else {
                  addNotification("Quantum rule saved", "success");
                }
              }}
            >
              Save Rule
            </button>
          </div>
        </div>
      )}

      {/* Buffer Stock */}
      {(() => {
        // Show buffer stock for materials present in inventory, output_buffer, or already having a buffer
        const materials = new Set<MaterialType>();
        for (const key of Object.keys(building.inventory) as MaterialType[]) {
          if ((building.inventory[key] ?? 0) > 0 && key !== "money") materials.add(key);
        }
        if (building.output_buffer) {
          for (const key of Object.keys(building.output_buffer) as MaterialType[]) {
            if ((building.output_buffer[key] ?? 0) > 0) materials.add(key);
          }
        }
        if (building.buffer_stock) {
          for (const key of Object.keys(building.buffer_stock) as MaterialType[]) {
            if ((building.buffer_stock[key] ?? 0) > 0) materials.add(key);
          }
        }
        // Also include routed resources — "all" adds all non-money materials
        for (const route of effectiveRoutes) {
          if (route.resource === "all") {
            for (const m of MATERIAL_TYPES) {
              if (m !== "money") materials.add(m);
            }
          } else {
            materials.add(route.resource);
          }
        }
        if (materials.size === 0) return null;

        // Split into priority (recipe inputs) and other
        const recipeInputs = new Set<MaterialType>();
        const recipeDef = BUILDING_DEFS[building.class].recipe;
        if (recipeDef) {
          for (const [m, v] of Object.entries(recipeDef.inputs)) {
            if (v && v > 0) recipeInputs.add(m as MaterialType);
          }
        }

        const allSorted = [...materials].sort();
        const priority = allSorted.filter((m) => recipeInputs.has(m));
        const other = allSorted.filter((m) => !recipeInputs.has(m));
        const showExpand = other.length > 0;
        const visibleMaterials = showExpand && !bufferStockExpanded ? priority : allSorted;

        const renderRow = (mat: MaterialType) => {
          const serverVal = building.buffer_stock?.[mat] ?? 0;
          const val = mat in localBufferStock ? (localBufferStock[mat] ?? 0) : serverVal;
          return (
            <div key={mat} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ flex: 1, color: "var(--text-secondary)" }}>{mat.replace(/_/g, " ")}</span>
              <input
                type="number"
                className="input"
                min="0"
                step="1"
                value={val}
                onChange={(e) => {
                  const amount = Math.max(0, Math.round(Number(e.target.value)));
                  setLocalBufferStock((prev) => ({ ...prev, [mat]: amount }));
                  submitCommand("set_buffer_stock", {
                    building_id: building.entity_id,
                    resource: mat,
                    amount,
                  });
                }}
                style={{ width: 60, padding: "1px 4px", fontSize: 11 }}
              />
            </div>
          );
        };

        return (
          <div className="bd-section">
            <div className="bd-section-title">Buffer Stock</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {visibleMaterials.map(renderRow)}
              {showExpand && (
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, marginTop: 2, alignSelf: "flex-start" }}
                  onClick={() => setBufferStockExpanded(!bufferStockExpanded)}
                >
                  {bufferStockExpanded ? `Hide ${other.length} more` : `Show ${other.length} more`}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Inter-map money transfer (admin outpost only) */}
      {building.class === "admin_outpost" && (
        <div className="bd-section">
          <div className="bd-section-title">Send Money</div>
          {otherAdminOutposts.length === 0 ? (
            <div className="route-hint">Build another admin outpost to transfer between sectors</div>
          ) : (() => {
            const selectedMapKey =
              moneyTransferTargetMapKey && otherAdminOutposts.some((b) => b.map_key === moneyTransferTargetMapKey)
                ? moneyTransferTargetMapKey
                : otherAdminOutposts[0].map_key;
            const destination = otherAdminOutposts.find((b) => b.map_key === selectedMapKey) ?? null;
            const sourceMoney = building.inventory.money ?? 0;
            const amount = Number.isFinite(moneyTransferAmount)
              ? Math.max(0.1, Math.round(moneyTransferAmount * 10) / 10)
              : 0;
            const canSend = !!destination && amount > 0 && sourceMoney >= amount;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <select
                  className="input"
                  value={selectedMapKey}
                  onChange={(e) => setMoneyTransferTargetMapKey(e.target.value)}
                  style={{ fontSize: 12, padding: "2px 4px" }}
                >
                  {otherAdminOutposts.map((outpost) => (
                    <option key={outpost.entity_id} value={outpost.map_key}>
                      {adminOutpostDestinationLabel(outpost)}
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="number"
                    className="input"
                    min="0.1"
                    step="0.1"
                    value={moneyTransferAmount}
                    onChange={(e) => setMoneyTransferAmount(Number(e.target.value))}
                    style={{ width: 90, fontSize: 12, padding: "2px 4px" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    Available: <strong style={{ color: "var(--money)" }}>${sourceMoney.toFixed(1)}</strong>
                  </span>
                </div>

                <button
                  className="btn btn-accent btn-sm"
                  disabled={!canSend}
                  onClick={async () => {
                    if (!destination) {
                      addNotification("Select a destination sector", "error");
                      return;
                    }

                    const res = await submitCommand("transfer", {
                      from_building_id: building.entity_id,
                      to_building_id: destination.entity_id,
                      material: "money",
                      amount,
                    });

                    if (res.error) {
                      addNotification(`Send failed: ${res.error}`, "error");
                    } else {
                      addNotification(`Sent $${amount.toFixed(1)} to ${adminOutpostDestinationLabel(destination)}`, "success");
                    }
                  }}
                >
                  Send
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Port buy/sell (port only) */}
      {building.class === "port" && (
        <div className="bd-section">
          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <button
              className={`btn btn-sm${portMode === "sell" ? " btn-accent" : ""}`}
              onClick={() => setPortMode("sell")}
            >
              Sell
            </button>
            <button
              className={`btn btn-sm${portMode === "buy" ? " btn-accent" : ""}`}
              onClick={() => setPortMode("buy")}
            >
              Buy
            </button>
          </div>

          {/* Sell mode: existing auto-sell grid */}
          {portMode === "sell" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className="bd-section-title" style={{ margin: 0 }}>Auto-Sell</span>
                <button
                  className="btn btn-sm"
                  onClick={() => { for (const r of TRADEABLE_TYPES) handleAutoSellChange(r, "any_rate"); }}
                >
                  All Any
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => { for (const r of TRADEABLE_TYPES) handleAutoSellChange(r, "off"); }}
                >
                  All Off
                </button>
              </div>
              <div className="auto-sell-grid">
                {TRADEABLE_TYPES.map((res) => {
                  const rule = getEffectiveRule(res);
                  const currentMode = rule?.mode ?? "off";
                  const price = marketPrices?.[res];
                  return (
                    <div key={res} className="auto-sell-row">
                      <span className="as-name">{res.replace(/_/g, " ")}</span>
                      <span className="as-price">{price != null ? `$${price.toFixed(1)}` : "\u2014"}</span>
                      <button
                        className={`auto-sell-btn ${currentMode === "off" ? "active" : ""}`}
                        onClick={() => handleAutoSellChange(res, "off")}
                      >
                        Off
                      </button>
                      <button
                        className={`auto-sell-btn ${currentMode === "any_rate" ? "active" : ""}`}
                        onClick={() => handleAutoSellChange(res, "any_rate")}
                      >
                        Any
                      </button>
                      <button
                        className={`auto-sell-btn ${currentMode === "min_rate" ? "active" : ""}`}
                        onClick={() => handleAutoSellChange(res, "min_rate", rule?.min_price ?? 1)}
                      >
                        Min
                      </button>
                      {currentMode === "min_rate" && (
                        <input
                          type="number"
                          className="input"
                          step="0.5"
                          min="0.1"
                          value={rule?.min_price ?? 1}
                          onChange={(e) => handleAutoSellChange(res, "min_rate", Number(e.target.value))}
                          style={{ width: 50, padding: "1px 4px", fontSize: 10 }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Buy mode: import form */}
          {portMode === "buy" && (() => {
            const unitPrice = (marketPrices?.[buyResource] ?? 1) * IMPORT_PRICE_MULTIPLIER;
            const totalCost = Math.round(buyAmount * unitPrice * 100) / 100;
            const portMoney = building.inventory.money ?? 0;
            const canAfford = portMoney >= totalCost && buyAmount > 0;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="bd-section-title" style={{ margin: 0 }}>Buy Materials (150% market)</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    className="input"
                    value={buyResource}
                    onChange={(e) => setBuyResource(e.target.value as ResourceType)}
                    style={{ fontSize: 12, padding: "2px 4px" }}
                  >
                    {RESOURCE_TYPES.map((r) => (
                      <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    step="1"
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(Math.max(1, Math.round(Number(e.target.value))))}
                    style={{ width: 60, fontSize: 12, padding: "2px 4px" }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  Unit: ${unitPrice.toFixed(2)} &middot; Total: <strong style={{ color: canAfford ? "var(--money)" : "var(--danger)" }}>${totalCost.toFixed(2)}</strong>
                  {" "}&middot; Port money: ${portMoney.toFixed(1)}
                </div>
                <button
                  className="btn btn-accent btn-sm"
                  disabled={!canAfford}
                  onClick={async () => {
                    const res = await submitCommand("import", {
                      building_id: building.entity_id,
                      material: buyResource,
                      amount: buyAmount,
                    });
                    if (res.error) {
                      addNotification(`Import failed: ${res.error}`, "error");
                    } else {
                      addNotification(`Bought ${buyAmount} ${buyResource.replace(/_/g, " ")}`, "success");
                    }
                  }}
                >
                  Buy
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Embassy panel */}
      {building.class === "embassy" && (() => {
        const ambassadors = useGameStore.getState().ambassadors.filter(
          (a) => a.office_building_id === building.entity_id
        );
        const setAmbassadorTargetMode = useGameStore.getState().setAmbassadorTargetMode;
        return (
          <div className="bd-section">
            <div className="bd-section-title">Ambassador</div>
            {ambassadors.length === 0 ? (
              <div className="route-hint">No ambassador stationed yet</div>
            ) : ambassadors.map((amb) => (
              <div key={amb.entity_id} style={{ fontSize: 12, marginBottom: 8 }}>
                <div>
                  Status: <strong style={{ color: amb.state === "idle" ? "var(--success)" : "var(--warning)" }}>
                    {amb.state.replace(/_/g, " ")}
                  </strong>
                </div>
                {amb.state === "returning" && amb.carried_money > 0 && (
                  <div style={{ color: "var(--money)" }}>
                    Carrying: ${amb.carried_money.toFixed(1)}
                  </div>
                )}
                {amb.state === "idle" && amb.cooldown_ticks > 0 && (
                  <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
                    Cooldown: {amb.cooldown_ticks} ticks
                  </div>
                )}
                {amb.state === "idle" && amb.cooldown_ticks <= 0 && (
                  <button
                    className="btn btn-accent btn-sm"
                    style={{ marginTop: 4 }}
                    onClick={() => {
                      setAmbassadorTargetMode(building.entity_id);
                      addNotification("Click a rival building to send ambassador", "info");
                    }}
                  >
                    Send Ambassador
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Research panel (research_lab only) */}
      {building.class === "research_lab" && player && (
        <div className="bd-section">
          <div className="bd-section-title">Research</div>
          {(["diplomacy", "logistics", "offensive_diplomacy"] as const).map((track) => {
            const items = Object.values(RESEARCH_TREE).filter((r) => r.track === track);
            return (
              <div key={track} className="research-track">
                <div className="research-track-title">{"\u25B8 " + track.replace(/_/g, " ").toUpperCase()}</div>
                {items.map((res, idx) => {
                  const completed = player.research?.includes(res.id);
                  const prereqsMet = res.requires.every((r) => player.research?.includes(r));
                  const available = prereqsMet && !completed;
                  const costEntries = Object.entries(res.cost).filter(([, v]) => v && v > 0);

                  return (
                    <React.Fragment key={res.id}>
                      {idx > 0 && <div className="research-connector">{"\u2502"}</div>}
                      <div className={`research-node ${completed ? "completed" : available ? "available" : "locked"}`}>
                        <div className="research-node-header">
                          <span className="research-status-icon">
                              {completed ? "\u2713" : available ? "\u25C9" : <LockIcon />}
                          </span>
                          <span className="research-name">{res.name}</span>
                        </div>
                        <div className="research-desc">{res.description}</div>
                        <div className="research-cost">
                          {costEntries.map(([mat, amt]) => (
                            <span key={mat} className="research-cost-item">
                              {amt} {mat.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                        {!prereqsMet && (
                          <div className="research-prereq">
                            Requires: {res.requires.map((r) => RESEARCH_TREE[r]?.name ?? r).join(", ")}
                          </div>
                        )}
                        {available && (
                          <button
                            className="btn btn-accent btn-sm"
                            style={{ marginTop: 4 }}
                            onClick={async () => {
                              const result = await submitCommand("do_research", { research_id: res.id });
                              if (result.error) {
                                addNotification(`Research failed: ${result.error}`, "error");
                              } else {
                                addNotification(`Researched: ${res.name}`, "success");
                              }
                            }}
                          >
                            Research
                          </button>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Sell building */}
      {building.class !== "admin_outpost" && (
        <div className="bd-section">
          <button
            className="btn btn-danger btn-sm"
            onClick={async () => {
              if (!confirm(`Sell ${DISPLAY_NAMES[building.class]}? You'll get 50% cost refund.`)) return;
              const res = await submitCommand("sell_building", { building_id: building.entity_id });
              if (res.error) {
                addNotification(`Sell failed: ${res.error}`, "error");
              } else {
                addNotification(`${DISPLAY_NAMES[building.class]} sold`, "warning");
                setSelectedTile(null);
              }
            }}
          >
            Sell Building (50% refund)
          </button>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return <BottomSheet onClose={closePanel} maxHeight="70vh">{content}</BottomSheet>;
  }
  return content;
}
