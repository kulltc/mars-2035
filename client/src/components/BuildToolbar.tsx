import React, { useState } from "react";
import { useGameStore } from "../state/store.js";
import {
  BUILDING_DEFS, RESOURCE_TYPES, WORKER_COST,
  type BuildingClass, type MaterialType,
  getResearchForBuilding,
} from "@mars-2035/shared";
import { submitCommand } from "../api/client.js";
import { DISPLAY_NAMES } from "./MapCanvas.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { BottomSheet } from "./BottomSheet.js";

const BUILDING_ICONS: Record<string, string> = {
  admin_outpost: "⌂", infra_tower: "△", research_lab: "⚗", research_station: "◉",
  mine: "⛏", port: "$",
  smelter: "♨", magnetic_press: "⌬", morphic_forge: "⚒",
  servo_assembly: "⚙", replication_chamber: "⧉",
  polymer_kiln: "◌", crystal_grower: "✧", toroidin_foundry: "⊚",
  muphrid_lab: "⚛", solar_loom: "☼",
  cryo_distillery: "❄", phase_condenser: "◈", xenotherm_reactor: "☢",
  deep_freeze_synth: "❆", iceworld_refinery: "⬡",
  resonance_tuner: "♬", neural_loom: "∿", psychophysical_amp: "Ψ",
  dampening_forge: "⊟", consciousness_engine: "◎",
};

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

const BUILD_SECTIONS: { label: string; color: string; items: BuildingClass[] }[] = [
  { label: "Core", color: "#4fc3f7", items: ["admin_outpost", "infra_tower", "research_lab", "research_station", "mine", "port"] },
  { label: "Morphic", color: "#e65100", items: ["smelter", "magnetic_press", "morphic_forge", "servo_assembly", "replication_chamber"] },
  { label: "Toroidin", color: "#7b1fa2", items: ["polymer_kiln", "crystal_grower", "toroidin_foundry", "muphrid_lab", "solar_loom"] },
  { label: "Cryogenic", color: "#00838f", items: ["cryo_distillery", "phase_condenser", "xenotherm_reactor", "deep_freeze_synth", "iceworld_refinery"] },
  { label: "Psycho", color: "#ad1457", items: ["resonance_tuner", "neural_loom", "psychophysical_amp", "dampening_forge", "consciousness_engine"] },
];

// Material -> producing building class (for prerequisite checking)
const RAW_MATERIALS = new Set<string>(RESOURCE_TYPES);
const PRODUCED_BY = new Map<MaterialType, BuildingClass>();
for (const [cls, def] of Object.entries(BUILDING_DEFS)) {
  if (def.recipe) PRODUCED_BY.set(def.recipe.output, cls as BuildingClass);
}
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

function formatMaterialName(mat: string): string {
  if (mat === "money") return "$";
  return mat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCost(cls: BuildingClass): string {
  const def = BUILDING_DEFS[cls];
  const entries = Object.entries(def.cost).filter(([, v]) => v && v > 0);
  if (entries.length === 0) return "Free";
  const parts = entries.map(([mat, amt]) =>
    mat === "money" ? `$${amt}` : `${amt} ${formatMaterialName(mat)}`
  );
  return parts.join(", ");
}

export function BuildToolbar() {
  const isMobile = useIsMobile();
  const player = useGameStore((s) => s.player);
  const buildings = useGameStore((s) => s.buildings);
  const workers = useGameStore((s) => s.workers);
  const buildMode = useGameStore((s) => s.buildMode);
  const setBuildMode = useGameStore((s) => s.setBuildMode);
  const currentMap = useGameStore((s) => s.currentMap);
  const addNotification = useGameStore((s) => s.addNotification);
  const toggleBuildSheet = useGameStore((s) => s.toggleBuildSheet);
  const toggleWorkers = useGameStore((s) => s.toggleWorkers);

  const [activeTab, setActiveTab] = useState(0);

  if (!player || !currentMap) return null;

  const mapKey = `${currentMap.dx}:${currentMap.dy}:${currentMap.mx}:${currentMap.my}`;
  const hasAdminOutpost = !!player.map_accounts?.[mapKey]?.admin_outpost_building_id;
  const ownedClasses = new Set(
    buildings.filter((b) => b.owner_id === player.entity_id).map((b) => b.class)
  );
  const myWorkerCount = workers.filter((w) => w.owner_id === player.entity_id).length;
  const workerCostStr = Object.entries(WORKER_COST)
    .filter(([, v]) => v && v > 0)
    .map(([, amt]) => `$${amt}`)
    .join(", ");

  const section = BUILD_SECTIONS[activeTab];

  const content = (
    <div className={isMobile ? "build-toolbar mobile" : "build-toolbar"}>
      {/* Tabs */}
      <div className="build-toolbar-tabs">
        {BUILD_SECTIONS.map((s, i) => (
          <button
            key={s.label}
            className={`build-tab ${i === activeTab ? "active" : ""}`}
            onClick={() => setActiveTab(i)}
            style={i === activeTab ? { borderLeftColor: s.color } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Building cards */}
      <div className="build-items">
        {section.items.map((cls) => {
          const needsAdmin = cls !== "admin_outpost" && !hasAdminOutpost;
          const alreadyHasAdmin = cls === "admin_outpost" && hasAdminOutpost;
          const prereqs = PREREQS.get(cls);
          const missingPrereqs = prereqs?.filter((p) => !ownedClasses.has(p));
          const locked = missingPrereqs && missingPrereqs.length > 0;

          // Research gating
          const requiredResearch = getResearchForBuilding(cls);
          const researchLocked = requiredResearch && !player.research?.includes(requiredResearch);

          const disabled = needsAdmin || alreadyHasAdmin || !!locked || !!researchLocked;
          const isSelected = buildMode === cls;

          let title = `${DISPLAY_NAMES[cls]}\nCost: ${formatCost(cls)}`;
          if (researchLocked) title += "\n🔒 Requires research to unlock";
          if (locked) title += `\nRequires: ${missingPrereqs!.map((p) => DISPLAY_NAMES[p]).join(", ")}`;
          if (needsAdmin) title += "\nPlace an Admin Outpost first";

          return (
            <div
              key={cls}
              className={`build-card ${isSelected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
              onClick={() => {
                if (disabled) return;
                setBuildMode(isSelected ? null : cls);
                if (!isSelected && isMobile) toggleBuildSheet();
              }}
              title={title}
            >
              <span className="bc-icon" style={{ color: researchLocked ? "#555" : (BUILDING_COLORS[cls] ?? "#888") }}>
                {researchLocked ? "\uD83D\uDD12" : (BUILDING_ICONS[cls] ?? cls[0])}
              </span>
              <span className="bc-name">{DISPLAY_NAMES[cls] ?? cls}</span>
              <span className="bc-cost">{formatCost(cls)}</span>
            </div>
          );
        })}
      </div>

      {/* Workers section */}
      <div className="build-toolbar-extra">
        <div
          className="resource-pill"
          style={{ cursor: "pointer" }}
          onClick={toggleWorkers}
          title="View worker list"
        >
          <span className="label" style={{ color: "var(--accent)" }}>W</span>
          <span className="value">{myWorkerCount}</span>
        </div>
        {hasAdminOutpost && (
          <button
            className="btn btn-accent btn-sm"
            onClick={async () => {
              const res = await submitCommand("buy_worker", { map_key: mapKey });
              if (res.error) {
                addNotification(`Worker failed: ${res.error}`, "error");
              } else {
                addNotification("Worker purchased", "success");
              }
            }}
            title={`Buy worker (${workerCostStr})`}
          >
            + Worker {workerCostStr}
          </button>
        )}
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {buildings.filter((b) => b.owner_id === player.entity_id).length} buildings
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return <BottomSheet onClose={toggleBuildSheet} maxHeight="55vh">{content}</BottomSheet>;
  }
  return content;
}
