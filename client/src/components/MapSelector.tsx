import React, { useEffect, useState } from "react";
import { RESOURCE_TYPES, type ResourceType, districtName, sectorName } from "@mars-2035/shared";
import { fetchMap } from "../api/client.js";
import { useGameStore } from "../state/store.js";
import { LockIcon } from "./LockIcon.js";
import { useIsMobile } from "../hooks/useIsMobile.js";

interface DensityPill {
  label: string;
  value: string;
  color: string;
}

interface DensitySurvey {
  pills: DensityPill[];
  tooltip: string;
}

const RESOURCE_LABELS: Record<ResourceType, string> = {
  steel: "Fe",
  silicon: "Si",
  polymer: "Po",
  rare_earth: "RE",
  carbon: "C",
  ferrite_alloy: "FA",
  morphic_composite: "MC",
  morphic_core: "MCore",
  servo_cortex: "SC",
  autonomic_matrix: "AM",
  thermoplast: "TP",
  lattice_fiber: "LF",
  toroidin_plate: "TPt",
  muphrid_cell: "Mu",
  paradox_weave: "PW",
  cryite: "Cr",
  null_phase_gel: "NPG",
  xenotherm_crystal: "XC",
  absolute_lattice: "AL",
  zero_point_shard: "ZP",
  psi_crystal: "Psi",
  esper_thread: "ET",
  psychon_core: "PC",
  peep_shield: "PS",
  noetic_matrix: "NM",
};

const RESOURCE_COLORS: Partial<Record<ResourceType, string>> = {
  steel: "#ff8a65",
  silicon: "#90caf9",
  polymer: "#ce93d8",
  rare_earth: "#ffcc80",
  carbon: "#a5d6a7",
};

function computeDensitySummary(mapTiles: { resource?: { type: ResourceType } }[]): DensitySurvey {
  const totalTiles = Math.max(mapTiles.length, 1);
  const counts: Partial<Record<ResourceType, number>> = {};
  for (const t of mapTiles) {
    const resourceType = t.resource?.type;
    if (!resourceType || !RESOURCE_TYPES.includes(resourceType)) continue;
    counts[resourceType] = (counts[resourceType] ?? 0) + 1;
  }

  const entries = RESOURCE_TYPES.map((resourceType) => {
    const pct = ((counts[resourceType] ?? 0) / totalTiles) * 100;
    return { resourceType, pct };
  });

  const top = entries
    .filter((e) => e.pct > 0)
    .sort((a, b) => b.pct - a.pct);

  const tooltip = entries
    .map((e) => `${RESOURCE_LABELS[e.resourceType]} ${e.pct.toFixed(1)}%`)
    .join(" · ");

  const pills: DensityPill[] =
    top.length > 0
      ? top.map((e) => ({
          label: RESOURCE_LABELS[e.resourceType],
          value: `${e.pct.toFixed(1)}%`,
          color: RESOURCE_COLORS[e.resourceType] ?? "var(--text-secondary)",
        }))
      : [{ label: "--", value: "None", color: "var(--text-muted)" }];

  return { pills, tooltip };
}

function activePlayersOnMap(buildings: { owner_id: string; class: string }[]): number {
  const owners = new Set<string>();
  for (const b of buildings) {
    if (b.class !== "admin_outpost") continue;
    owners.add(b.owner_id);
  }
  return owners.size;
}

export function MapSelector() {
  const isMobile = useIsMobile();
  const player = useGameStore((s) => s.player);
  const world = useGameStore((s) => s.world);
  const currentMap = useGameStore((s) => s.currentMap);
  const setCurrentMap = useGameStore((s) => s.setCurrentMap);
  const toggleMapSelector = useGameStore((s) => s.toggleMapSelector);

  if (!player || !world || !currentMap) return null;

  const cols = world.maps_per_district_x;
  const rows = world.maps_per_district_y;
  const gridColumns = isMobile ? 1 : cols;
  const districtCount = world.districts_x * world.districts_y;
  const [browseDistrictIndex, setBrowseDistrictIndex] = useState(
    currentMap.dy * world.districts_x + currentMap.dx,
  );
  const [densityByMapKey, setDensityByMapKey] = useState<Record<string, DensitySurvey>>({});
  const [densityLoading, setDensityLoading] = useState(false);

  useEffect(() => {
    setBrowseDistrictIndex(currentMap.dy * world.districts_x + currentMap.dx);
  }, [currentMap.dx, currentMap.dy, world.districts_x]);

  const browseDistrictDx = browseDistrictIndex % world.districts_x;
  const browseDistrictDy = Math.floor(browseDistrictIndex / world.districts_x);
  const districtLabel = districtName(browseDistrictDx, browseDistrictDy, world.districts_x);
  const currentSectorLabel = sectorName(
    currentMap.dx,
    currentMap.dy,
    currentMap.mx,
    currentMap.my,
    world.districts_x,
    world.maps_per_district_x,
    world.maps_per_district_y,
  );

  const hasUnlockNewMap = player.research?.includes("unlock_new_map");

  useEffect(() => {
    let cancelled = false;

    async function loadDistrictDensity() {
      setDensityLoading(true);
      const jobs: Promise<{ mapKey: string; survey: DensitySurvey }>[] = [];

      for (let my = 0; my < rows; my += 1) {
        for (let mx = 0; mx < cols; mx += 1) {
          const mapKey = `${browseDistrictDx}:${browseDistrictDy}:${mx}:${my}`;
          jobs.push(
            fetchMap(browseDistrictDx, browseDistrictDy, mx, my)
              .then((data) => {
                const survey = computeDensitySummary(data.tiles);
                const playerCount = activePlayersOnMap(data.buildings);
                survey.pills.push({
                  label: "👤",
                  value: String(playerCount),
                  color: "var(--accent)",
                });
                survey.tooltip = `${survey.tooltip} · 👤 ${playerCount}`;
                return { mapKey, survey };
              })
              .catch(() => ({
                mapKey,
                survey: {
                  pills: [{ label: "--", value: "N/A", color: "var(--text-muted)" }],
                  tooltip: "Survey unavailable",
                },
              })),
          );
        }
      }

      const results = await Promise.all(jobs);
      if (cancelled) return;

      const next: Record<string, DensitySurvey> = {};
      for (const r of results) {
        next[r.mapKey] = r.survey;
      }
      setDensityByMapKey(next);
      setDensityLoading(false);
    }

    void loadDistrictDensity();
    return () => {
      cancelled = true;
    };
  }, [browseDistrictDx, browseDistrictDy, cols, rows]);

  return (
    <div className="modal-overlay" onClick={toggleMapSelector}>
      <div className="map-selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">SECTOR SELECTOR</span>
          <button className="modal-close" onClick={toggleMapSelector}>&times;</button>
        </div>
        <div className="district-browser">
          <button
            className="icon-btn district-nav-btn"
            onClick={() => setBrowseDistrictIndex((prev) => Math.max(0, prev - 1))}
            disabled={browseDistrictIndex <= 0}
            title="Previous district"
          >
            &#x2039;
          </button>
          <div className="district-browser-center">
            <div className="district-browser-label">District</div>
            <div className="district-browser-name">{districtLabel}</div>
          </div>
          <button
            className="icon-btn district-nav-btn"
            onClick={() => setBrowseDistrictIndex((prev) => Math.min(districtCount - 1, prev + 1))}
            disabled={browseDistrictIndex >= districtCount - 1}
            title="Next district"
          >
            &#x203A;
          </button>
        </div>
        <div className="map-selector-hint">Current sector: {currentSectorLabel}</div>
        <div
          className="map-selector-grid"
          style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}
        >
          {Array.from({ length: rows }, (_, my) =>
            Array.from({ length: cols }, (_, mx) => {
              const mapKey = `${browseDistrictDx}:${browseDistrictDy}:${mx}:${my}`;
              const hasOutpost = !!player.map_accounts?.[mapKey]?.admin_outpost_building_id;
              const isCurrent =
                browseDistrictDx === currentMap.dx &&
                browseDistrictDy === currentMap.dy &&
                mx === currentMap.mx &&
                my === currentMap.my;
              const isHome = browseDistrictDx === 0 && browseDistrictDy === 0 && mx === 0 && my === 0;
              const canNavigate = hasOutpost || hasUnlockNewMap || isHome;
              const targetSectorLabel = sectorName(
                browseDistrictDx,
                browseDistrictDy,
                mx,
                my,
                world.districts_x,
                world.maps_per_district_x,
                world.maps_per_district_y,
              );
              const density = densityByMapKey[mapKey];
              const densityPills = density?.pills ?? [{
                label: "--",
                value: densityLoading ? "..." : "N/A",
                color: "var(--text-muted)",
              }];
              const densityTooltip = density?.tooltip ?? "Survey unavailable";

              return (
                <button
                  key={mapKey}
                  className={`map-cell ${isCurrent ? "current" : ""} ${hasOutpost ? "has-outpost" : ""} ${!canNavigate ? "locked" : ""}`}
                  onClick={() => {
                    if (!canNavigate) return;
                    setCurrentMap({ dx: browseDistrictDx, dy: browseDistrictDy, mx, my });
                    toggleMapSelector();
                  }}
                  disabled={!canNavigate}
                  title={`${targetSectorLabel} · ${densityTooltip}${hasOutpost ? " - Your outpost" : ""}${!canNavigate ? " - Locked" : ""}`}
                >
                  <span className="map-cell-name">{targetSectorLabel}</span>
                  <div className="map-cell-density-pills">
                    {densityPills.map((pill, index) => (
                      <div key={`${mapKey}-${pill.label}-${index}`} className="resource-pill map-density">
                        <span className="label" style={{ color: pill.color }}>{pill.label}</span>
                        <span className="value">{pill.value}</span>
                      </div>
                    ))}
                  </div>
                  {hasOutpost && <span className="map-cell-star">{"\u2605"}</span>}
                  {!canNavigate && (
                    <span className="map-cell-lock">
                      <LockIcon />
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="map-selector-legend">
          {"\u2605"} = Your outpost &middot; Click a sector name to navigate
        </div>
      </div>
    </div>
  );
}
