import React from "react";
import { useGameStore } from "../state/store.js";

const CHAINS = [
  {
    name: "Core Buildings",
    color: "#4fc3f7",
    flow: "Admin Outpost \u2192 Mine \u2192 Trading Outpost",
    desc: "Admin Outpost: free, required per map. Mine: place on resource tiles, produces raw materials. Port: sell materials on the market.",
  },
  {
    name: "Morphic Chain",
    color: "#e65100",
    flow: "Smelter \u2192 Magnetic Press \u2192 Morphic Forge \u2192 Servo Assembly \u2192 Replication Chamber",
    desc: "Steel + Carbon \u2192 Ferrite Alloy \u2192 Morphic Composite \u2192 Morphic Core \u2192 Servo Cortex \u2192 Autonomic Matrix. Each stage requires the output of the previous plus additional raw inputs.",
  },
  {
    name: "Toroidin Chain",
    color: "#7b1fa2",
    flow: "Polymer Kiln \u2192 Crystal Grower \u2192 Toroidin Foundry \u2192 Muphrid Lab \u2192 Solar Loom",
    desc: "Polymer + Carbon \u2192 Thermoplast \u2192 Lattice Fiber \u2192 Toroidin Plate \u2192 Muphrid Cell \u2192 Paradox Weave. Purple chain focuses on polymer and silicon processing.",
  },
  {
    name: "Cryogenic Chain",
    color: "#00838f",
    flow: "Cryo Distillery \u2192 Phase Condenser \u2192 Xenotherm Reactor \u2192 Deep-Freeze Synth \u2192 Iceworld Refinery",
    desc: "Silicon + Carbon \u2192 Cryite \u2192 Null Phase Gel \u2192 Xenotherm Crystal \u2192 Absolute Lattice \u2192 Zero Point Shard. Cyan chain for cryogenic materials.",
  },
  {
    name: "Psychophysical Chain",
    color: "#ad1457",
    flow: "Resonance Tuner \u2192 Neural Loom \u2192 Psychophysical Amp \u2192 Dampening Forge \u2192 Consciousness Engine",
    desc: "Rare Earth + Silicon \u2192 Psi Crystal \u2192 Esper Thread \u2192 Psychon Core \u2192 Peep Shield \u2192 Noetic Matrix. Pink chain for exotic psychophysical materials.",
  },
];

export function TechTree() {
  const toggleTechTree = useGameStore((s) => s.toggleTechTree);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) toggleTechTree(); }}>
      <div className="modal-content">
        <div className="modal-header">
          <span className="modal-title">Tech Tree</span>
          <button className="modal-close" onClick={toggleTechTree}>&times;</button>
        </div>

        <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 12 }}>
          Each processing chain builds on the previous stage. You must have the prerequisite building
          before placing the next one. Raw materials come from Mines placed on resource tiles.
          Workers haul materials between buildings automatically based on routes.
        </p>

        {CHAINS.map((chain) => (
          <div key={chain.name} className="tech-chain">
            <div className="tc-title" style={{ color: chain.color }}>{chain.name}</div>
            <div className="tc-flow">{chain.flow}</div>
            <div className="tc-desc">{chain.desc}</div>
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
