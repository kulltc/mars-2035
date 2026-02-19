import React, { useEffect, useRef, useState } from "react";
import { useGameStore } from "../state/store.js";
import { submitCommand } from "../api/client.js";
import {
  MATERIAL_TYPES, TRADEABLE_TYPES, BUILDING_DEFS, SUSPENSION_DESTROY_TICKS,
  totalInventory, outputBufferTotal,
  type MaterialType, type ResourceType, type AutoSellRule, type Building,
  RESEARCH_TREE, type ResearchDef,
} from "@mars-2035/shared";
import { DISPLAY_NAMES } from "./MapCanvas.js";

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
};

const BUILDING_ICONS: Record<string, string> = {
  admin_outpost: "\u2302", research_lab: "\u2697", mine: "\u26CF", port: "\u2693",
  smelter: "S", magnetic_press: "M", morphic_forge: "F",
  servo_assembly: "V", replication_chamber: "R",
  polymer_kiln: "K", crystal_grower: "G", toroidin_foundry: "T",
  muphrid_lab: "L", solar_loom: "W",
  cryo_distillery: "D", phase_condenser: "P", xenotherm_reactor: "X",
  deep_freeze_synth: "Z", iceworld_refinery: "I",
  resonance_tuner: "N", neural_loom: "E", psychophysical_amp: "A",
  dampening_forge: "H", consciousness_engine: "C",
};

function buildingLabel(b: Building): string {
  return `${DISPLAY_NAMES[b.class] ?? b.class} (${b.location.x},${b.location.y})`;
}

export function BuildingDetail() {
  const selectedTile = useGameStore((s) => s.selectedTile);
  const buildings = useGameStore((s) => s.buildings);
  const player = useGameStore((s) => s.player);
  const world = useGameStore((s) => s.world);
  const marketPrices = useGameStore((s) => s.marketPrices);
  const setSelectedTile = useGameStore((s) => s.setSelectedTile);
  const updateBuilding = useGameStore((s) => s.updateBuilding);
  const addNotification = useGameStore((s) => s.addNotification);

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

  const def = BUILDING_DEFS[building.class];
  const otherBuildings = buildings.filter(
    (b) => b.owner_id === player.entity_id && b.entity_id !== building.entity_id
  );
  const effectiveRoutes = building.outgoing_routes ?? [];
  const used = totalInventory(building.inventory);
  const pct = building.capacity > 0 ? Math.min(100, (used / building.capacity) * 100) : 0;

  const getEffectiveRule = (res: ResourceType): AutoSellRule | null => {
    if (res in localAutoSell) return localAutoSell[res] ?? null;
    return building.auto_sell?.[res] ?? null;
  };

  const handleDeleteRoute = async (toBuildingId: string, resource: MaterialType) => {
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

  return (
    <div className="building-detail">
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
                <span className="route-res" style={{ color: route.resource === "money" ? "var(--money)" : "var(--text-primary)" }}>
                  {route.resource.replace(/_/g, " ")}
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

      {/* Auto-sell (port only) */}
      {building.class === "port" && (
        <div className="bd-section">
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
                    className={`auto-sell-btn ${currentMode === "off" ? "" : "active"}`}
                    onClick={() => {
                      const next = currentMode === "off" ? "any_rate" : currentMode === "any_rate" ? "min_rate" : "off";
                      handleAutoSellChange(res, next, rule?.min_price);
                    }}
                  >
                    {currentMode === "off" ? "Off" : currentMode === "any_rate" ? "Any" : `Min $${rule?.min_price ?? 1}`}
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
        </div>
      )}

      {/* Research panel (research_lab only) */}
      {building.class === "research_lab" && player && (
        <div className="bd-section">
          <div className="bd-section-title">Research</div>
          {(["diplomacy", "logistics"] as const).map((track) => {
            const items = Object.values(RESEARCH_TREE).filter((r) => r.track === track);
            return (
              <div key={track} className="research-track">
                <div className="research-track-title">{track === "diplomacy" ? "\u25B8 DIPLOMACY" : "\u25B8 LOGISTICS"}</div>
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
                            {completed ? "\u2713" : available ? "\u25C9" : "\uD83D\uDD12"}
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
}
