import React from "react";
import { BUILDING_DEFS, type BuildingClass } from "@mars-2035/shared";

const DISPLAY_NAMES: Record<BuildingClass, string> = {
  admin_outpost: "Admin Outpost",
  mine: "Mine",
  port: "Trading Outpost",
  smelter: "Smelter",
  magnetic_press: "Magnetic Press",
  morphic_forge: "Morphic Forge",
  servo_assembly: "Servo Assembly",
  replication_chamber: "Replication Chamber",
  polymer_kiln: "Polymer Kiln",
  crystal_grower: "Crystal Grower",
  toroidin_foundry: "Toroidin Foundry",
  muphrid_lab: "Muphrid Lab",
  solar_loom: "Solar Loom",
  cryo_distillery: "Cryo Distillery",
  phase_condenser: "Phase Condenser",
  xenotherm_reactor: "Xenotherm Reactor",
  deep_freeze_synth: "Deep-Freeze Synth",
  iceworld_refinery: "Iceworld Refinery",
  resonance_tuner: "Resonance Tuner",
  neural_loom: "Neural Loom",
  psychophysical_amp: "Psychophysical Amp",
  dampening_forge: "Dampening Forge",
  consciousness_engine: "Consciousness Engine",
};

const CHAINS: { label: string; color: string; buildings: BuildingClass[] }[] = [
  { label: "Morphic Chain", color: "#e65100", buildings: ["smelter", "magnetic_press", "morphic_forge", "servo_assembly", "replication_chamber"] },
  { label: "Toroidin Chain", color: "#7b1fa2", buildings: ["polymer_kiln", "crystal_grower", "toroidin_foundry", "muphrid_lab", "solar_loom"] },
  { label: "Cryogenic Chain", color: "#00838f", buildings: ["cryo_distillery", "phase_condenser", "xenotherm_reactor", "deep_freeze_synth", "iceworld_refinery"] },
  { label: "Psychophysical Chain", color: "#ad1457", buildings: ["resonance_tuner", "neural_loom", "psychophysical_amp", "dampening_forge", "consciousness_engine"] },
];

function formatInputs(inputs: Record<string, number>): string {
  return Object.entries(inputs)
    .filter(([, v]) => v > 0)
    .map(([mat, amt]) => `${amt} ${mat.replace(/_/g, " ")}`)
    .join(" + ");
}

export function TechTree({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        backgroundColor: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#1a1a2e",
          border: "1px solid #444",
          borderRadius: 8,
          padding: 20,
          maxWidth: 700,
          maxHeight: "80vh",
          overflowY: "auto",
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Tech Tree</h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent", color: "#888", border: "1px solid #555",
              padding: "2px 10px", borderRadius: 4, cursor: "pointer", fontSize: 14,
            }}
          >
            &times;
          </button>
        </div>

        {/* Core buildings */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Core</div>
          <div style={{ fontSize: 12, color: "#ccc" }}>
            <div style={{ marginBottom: 2 }}><b>Admin Outpost</b> — Required on each map. Free.</div>
            <div style={{ marginBottom: 2 }}><b>Mine</b> — Place on a resource tile. Produces raw materials. Cost: $100</div>
            <div><b>Trading Outpost</b> — Sells materials on the market. Cost: $150</div>
          </div>
        </div>

        {/* Chains */}
        {CHAINS.map((chain) => (
          <div key={chain.label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: chain.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontWeight: "bold" }}>
              {chain.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {chain.buildings.map((cls, i) => {
                const def = BUILDING_DEFS[cls];
                const recipe = def.recipe!;
                const cost = Object.entries(def.cost).filter(([, v]) => v && v > 0).map(([m, a]) => `$${a}`).join(", ");
                return (
                  <div key={cls} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    {i > 0 && <span style={{ color: "#555", fontSize: 11, width: 18, textAlign: "center" }}>&rarr;</span>}
                    {i === 0 && <span style={{ width: 18 }} />}
                    <div style={{
                      flex: 1,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      padding: "3px 8px",
                      backgroundColor: "#16213e",
                      borderRadius: 3,
                      borderLeft: `3px solid ${chain.color}`,
                      fontSize: 12,
                    }}>
                      <div>
                        <span style={{ color: "#e0e0e0", fontWeight: "bold" }}>{DISPLAY_NAMES[cls]}</span>
                        <span style={{ color: "#888", marginLeft: 8 }}>{cost}</span>
                      </div>
                      <div style={{ color: "#aaa", fontSize: 11, textAlign: "right" }}>
                        {formatInputs(recipe.inputs)} &rarr; <span style={{ color: "#81c784" }}>{recipe.output_amount} {recipe.output.replace(/_/g, " ")}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
          Each building in a chain requires the previous building's output as input.
          Raw materials (steel, silicon, polymer, rare earth, carbon) come from mines.
        </div>
      </div>
    </div>
  );
}
