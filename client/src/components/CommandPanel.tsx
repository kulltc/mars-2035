import React from "react";
import { useGameStore } from "../state/store.js";
import { BUILDING_DEFS, RESOURCE_TYPES, WORKER_COST, type BuildingClass, type MaterialType } from "@mars-2035/shared";
import { submitCommand } from "../api/client.js";

const PLACEABLE: BuildingClass[] = [
  "admin_outpost", "mine", "port",
  // Morphic Chain
  "smelter", "magnetic_press", "morphic_forge", "servo_assembly", "replication_chamber",
  // Toroidin Chain
  "polymer_kiln", "crystal_grower", "toroidin_foundry", "muphrid_lab", "solar_loom",
  // Cryogenic Chain
  "cryo_distillery", "phase_condenser", "xenotherm_reactor", "deep_freeze_synth", "iceworld_refinery",
  // Psychophysical Chain
  "resonance_tuner", "neural_loom", "psychophysical_amp", "dampening_forge", "consciousness_engine",
];

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

const BUILD_SECTIONS: { label: string; items: BuildingClass[] }[] = [
  { label: "Core", items: ["admin_outpost", "mine", "port"] },
  { label: "Morphic Chain", items: ["smelter", "magnetic_press", "morphic_forge", "servo_assembly", "replication_chamber"] },
  { label: "Toroidin Chain", items: ["polymer_kiln", "crystal_grower", "toroidin_foundry", "muphrid_lab", "solar_loom"] },
  { label: "Cryogenic Chain", items: ["cryo_distillery", "phase_condenser", "xenotherm_reactor", "deep_freeze_synth", "iceworld_refinery"] },
  { label: "Psychophysical Chain", items: ["resonance_tuner", "neural_loom", "psychophysical_amp", "dampening_forge", "consciousness_engine"] },
];

// material → building class that produces it (via recipe)
const PRODUCED_BY = new Map<MaterialType, BuildingClass>();
const RAW_MATERIALS = new Set<string>(RESOURCE_TYPES);
for (const [cls, def] of Object.entries(BUILDING_DEFS)) {
  if (def.recipe) PRODUCED_BY.set(def.recipe.output, cls as BuildingClass);
}

// For each recipe building, which building classes must the player already own?
// (only for non-raw recipe inputs)
const PREREQS = new Map<BuildingClass, BuildingClass[]>();
for (const [cls, def] of Object.entries(BUILDING_DEFS)) {
  if (!def.recipe) continue;
  const needed: BuildingClass[] = [];
  for (const mat of Object.keys(def.recipe.inputs)) {
    if (RAW_MATERIALS.has(mat)) continue;
    const producer = PRODUCED_BY.get(mat as MaterialType);
    if (producer && !needed.includes(producer)) needed.push(producer);
  }
  if (needed.length > 0) PREREQS.set(cls as BuildingClass, needed);
}

function formatCost(cls: BuildingClass): string {
  const def = BUILDING_DEFS[cls];
  const entries = Object.entries(def.cost).filter(([, v]) => v && v > 0);
  if (entries.length === 0) return "Free";
  return entries.map(([mat, amt]) => `${amt} ${mat}`).join(", ");
}

export function CommandPanel() {
  const player = useGameStore((s) => s.player);
  const buildings = useGameStore((s) => s.buildings);
  const buildMode = useGameStore((s) => s.buildMode);
  const setBuildMode = useGameStore((s) => s.setBuildMode);
  const currentMap = useGameStore((s) => s.currentMap);
  const workers = useGameStore((s) => s.workers);

  if (!player) return null;

  const mapKey = currentMap
    ? `${currentMap.dx}:${currentMap.dy}:${currentMap.mx}:${currentMap.my}`
    : null;
  const hasAdminOutpost = mapKey
    ? !!player.map_accounts?.[mapKey]?.admin_outpost_building_id
    : false;

  // Building classes the player has on this map
  const ownedClasses = new Set(
    buildings
      .filter((b) => b.owner_id === player.entity_id)
      .map((b) => b.class)
  );

  const myWorkerCount = workers.filter((w) => w.owner_id === player.entity_id).length;
  const workerCostStr = Object.entries(WORKER_COST)
    .filter(([, v]) => v && v > 0)
    .map(([mat, amt]) => `${amt} ${mat}`)
    .join(", ");

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>Build</h3>
      {BUILD_SECTIONS.map((section) => (
        <div key={section.label} style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: "#666", marginBottom: 1, textTransform: "uppercase", letterSpacing: 1 }}>{section.label}</div>
          {section.items.map((cls) => {
            const needsAdmin = cls !== "admin_outpost" && !hasAdminOutpost;
            const alreadyHasAdmin = cls === "admin_outpost" && hasAdminOutpost;
            const prereqs = PREREQS.get(cls);
            const missingPrereqs = prereqs?.filter((p) => !ownedClasses.has(p));
            const locked = missingPrereqs && missingPrereqs.length > 0;
            const disabled = needsAdmin || alreadyHasAdmin || !!locked;
            const isSelected = buildMode === cls;
            return (
              <div
                key={cls}
                onClick={() => !disabled && setBuildMode(isSelected ? null : cls)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "2px 6px",
                  borderRadius: 2,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.4 : 1,
                  backgroundColor: isSelected ? "#4fc3f7" : "transparent",
                  color: isSelected ? "#000" : "#e0e0e0",
                  fontSize: 12,
                }}
                title={
                  locked
                    ? `Requires: ${missingPrereqs!.map((p) => DISPLAY_NAMES[p]).join(", ")}`
                    : needsAdmin
                    ? "Place an Admin Outpost first"
                    : alreadyHasAdmin
                    ? "Already have an admin outpost"
                    : `Cost: ${formatCost(cls)}`
                }
              >
                <span>{DISPLAY_NAMES[cls]}</span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>
                  {locked ? `needs ${missingPrereqs!.map((p) => DISPLAY_NAMES[p]).join(", ")}` : formatCost(cls)}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {/* Buy Worker */}
      {hasAdminOutpost && mapKey && (
        <div style={{ marginTop: 8 }}>
          <h3 style={{ marginBottom: 4 }}>Workers ({myWorkerCount})</h3>
          <button
            onClick={() => submitCommand("buy_worker", { map_key: mapKey })}
            style={{ ...btnStyle, backgroundColor: "#0f3460", color: "#e0e0e0", cursor: "pointer" }}
            title={`Cost: ${workerCostStr}`}
          >
            <div>Buy Worker</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>{workerCostStr}</div>
          </button>
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: 10,
  backgroundColor: "#16213e",
  borderRadius: 4,
  fontSize: 13,
};

const btnStyle: React.CSSProperties = {
  border: "1px solid #444",
  padding: "4px 10px",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 12,
  textAlign: "center",
};
