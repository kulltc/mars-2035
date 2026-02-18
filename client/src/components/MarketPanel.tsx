import React from "react";
import { useGameStore } from "../state/store.js";
import { RESOURCE_TYPES, type ResourceType } from "@mars-2035/shared";

const CHAIN_GROUPS: { label: string; color: string; items: ResourceType[] }[] = [
  { label: "Raw Materials", color: "var(--text-secondary)", items: RESOURCE_TYPES as unknown as ResourceType[] },
  {
    label: "Morphic Chain", color: "#e65100",
    items: ["ferrite_alloy", "morphic_composite", "morphic_core", "servo_cortex", "autonomic_matrix"] as ResourceType[],
  },
  {
    label: "Toroidin Chain", color: "#7b1fa2",
    items: ["thermoplast", "lattice_fiber", "toroidin_plate", "muphrid_cell", "paradox_weave"] as ResourceType[],
  },
  {
    label: "Cryogenic Chain", color: "#00838f",
    items: ["cryite", "null_phase_gel", "xenotherm_crystal", "absolute_lattice", "zero_point_shard"] as ResourceType[],
  },
  {
    label: "Psychophysical Chain", color: "#ad1457",
    items: ["psi_crystal", "esper_thread", "psychon_core", "peep_shield", "noetic_matrix"] as ResourceType[],
  },
];

export function MarketPanel() {
  const marketPrices = useGameStore((s) => s.marketPrices);
  const toggleMarket = useGameStore((s) => s.toggleMarket);

  return (
    <div className="market-panel">
      <div className="mp-header">
        <span className="mp-title">Market Prices</span>
        <button className="modal-close" onClick={toggleMarket}>&times;</button>
      </div>

      {!marketPrices ? (
        <div style={{ color: "var(--text-muted)" }}>Loading prices...</div>
      ) : (
        CHAIN_GROUPS.map((group) => (
          <div key={group.label} className="market-section">
            <div className="ms-title" style={{ color: group.color }}>{group.label}</div>
            {group.items.map((res) => {
              const price = marketPrices[res];
              return (
                <div key={res} className="market-row">
                  <span className="mr-name">{res.replace(/_/g, " ")}</span>
                  <span className="mr-price">${price?.toFixed(2) ?? "\u2014"}</span>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
