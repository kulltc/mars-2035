import React from "react";
import { useGameStore } from "../state/store.js";
import { BUILDING_DEFS, type BuildingClass } from "@mars-2035/shared";
import { DISPLAY_NAMES } from "./MapCanvas.js";

const BUILDING_COLORS: Record<string, string> = {
  admin_outpost: "#4fc3f7", infra_tower: "#26c6da", research_lab: "#7e57c2", research_station: "#ab47bc",
  mine: "#ffb74d", port: "#81c784",
  smelter: "#e65100", magnetic_press: "#d84315", morphic_forge: "#bf360c",
  servo_assembly: "#a52714", replication_chamber: "#8b1a1a",
  polymer_kiln: "#7b1fa2", crystal_grower: "#6a1b9a", toroidin_foundry: "#4a148c",
  muphrid_lab: "#38006b", solar_loom: "#2c0054",
  cryo_distillery: "#00838f", phase_condenser: "#006064", xenotherm_reactor: "#004d40",
  deep_freeze_synth: "#00363a", iceworld_refinery: "#002626",
  resonance_tuner: "#ad1457", neural_loom: "#880e4f", psychophysical_amp: "#6a0037",
  dampening_forge: "#560027", consciousness_engine: "#3e001f",
};

const CHAIN_SECTIONS: { label: string; color: string; items: BuildingClass[] }[] = [
  { label: "Core Buildings", color: "#4fc3f7", items: ["admin_outpost", "mine", "port", "infra_tower", "research_lab", "research_station"] },
  { label: "Morphic Chain", color: "#e65100", items: ["smelter", "magnetic_press", "morphic_forge", "servo_assembly", "replication_chamber"] },
  { label: "Toroidin Chain", color: "#7b1fa2", items: ["polymer_kiln", "crystal_grower", "toroidin_foundry", "muphrid_lab", "solar_loom"] },
  { label: "Cryogenic Chain", color: "#00838f", items: ["cryo_distillery", "phase_condenser", "xenotherm_reactor", "deep_freeze_synth", "iceworld_refinery"] },
  { label: "Psychophysical Chain", color: "#ad1457", items: ["resonance_tuner", "neural_loom", "psychophysical_amp", "dampening_forge", "consciousness_engine"] },
];

const CORE_DESCRIPTIONS: Record<string, string> = {
  admin_outpost: "Free hub building. Required on each map. Stores all materials.",
  mine: "Place on resource tiles. Produces raw materials based on tile richness.",
  port: "Sells materials on the market. Configure auto-sell per material.",
  infra_tower: "Extends buildable area around it.",
  research_lab: "Produces research points for unlocking new buildings.",
  research_station: "Advanced research facility for higher-tier unlocks.",
};

function formatMat(mat: string): string {
  if (mat === "money") return "$";
  return mat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCost(cls: BuildingClass): string {
  const def = BUILDING_DEFS[cls];
  const entries = Object.entries(def.cost).filter(([, v]) => v && v > 0);
  if (entries.length === 0) return "Free";
  return entries.map(([mat, amt]) => mat === "money" ? `$${amt}` : `${amt} ${formatMat(mat)}`).join(", ");
}

function BuildingCard({ cls }: { cls: BuildingClass }) {
  const def = BUILDING_DEFS[cls];
  const recipe = def.recipe;
  const isCore = CORE_DESCRIPTIONS[cls] != null;

  return (
    <div className="tech-building-card">
      <div className="tbc-name" style={{ color: BUILDING_COLORS[cls] ?? "#888" }}>
        {DISPLAY_NAMES[cls] ?? cls}
      </div>
      {isCore ? (
        <div className="tbc-desc">{CORE_DESCRIPTIONS[cls]}</div>
      ) : recipe ? (
        <div className="tbc-recipe">
          {Object.entries(recipe.inputs)
            .filter(([, v]) => v > 0)
            .map(([mat, amt]) => `${amt} ${formatMat(mat)}`)
            .join(" + ")}
          {" \u2192 "}
          {recipe.output_amount} {formatMat(recipe.output)}
        </div>
      ) : null}
      <div className="tbc-meta">
        <span>Cost: {formatCost(cls)}</span>
        {def.upkeep_per_tick > 0 && <span>Upkeep: ${def.upkeep_per_tick}/tick</span>}
      </div>
    </div>
  );
}

export function TechTree() {
  const toggleTechTree = useGameStore((s) => s.toggleTechTree);

  return (
    <div
      className="modal-overlay tech-tree-overlay"
      style={{ position: "absolute", inset: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) toggleTechTree(); }}
    >
      <div className="modal-content">
        <div className="modal-header">
          <span className="modal-title">Tech Tree</span>
          <button className="modal-close" onClick={toggleTechTree}>&times;</button>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 12 }}>
          Each processing chain builds on the previous stage. Workers haul materials between buildings
          automatically based on routes. Raw materials come from Mines placed on resource tiles.
        </p>

        {CHAIN_SECTIONS.map((chain) => (
          <div key={chain.label} className="tech-chain">
            <div className="tc-title" style={{ color: chain.color }}>{chain.label}</div>
            <div className="tech-building-list">
              {chain.items.map((cls) => (
                <BuildingCard key={cls} cls={cls} />
              ))}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
          <strong>Tips:</strong>
          <ul style={{ paddingLeft: 16, marginTop: 4 }}>
            <li>Drag from one building to another on the map to create a resource route</li>
            <li>Workers automatically haul materials along configured routes</li>
            <li>Use Auto-Sell on Trading Outposts to sell processed goods</li>
            <li>Higher-tier materials sell for significantly more on the market</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
