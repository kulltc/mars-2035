import React, { useMemo } from "react";
import { districtName, sectorName, type Tile, type WorldMeta } from "@mars-2035/shared";

const RAW_RESOURCES = [
  { key: "steel", label: "Fe", color: "#ff8a65", name: "Steel" },
  { key: "silicon", label: "Si", color: "#90caf9", name: "Silicon" },
  { key: "polymer", label: "Po", color: "#ce93d8", name: "Polymer" },
  { key: "rare_earth", label: "RE", color: "#ffcc80", name: "Rare Earth" },
  { key: "carbon", label: "C", color: "#a5d6a7", name: "Carbon" },
] as const;

function toDensityBand(percent: number): string {
  if (percent <= 0) return "None";
  if (percent < 1) return "Very Low";
  if (percent < 2.5) return "Low";
  if (percent < 4.5) return "Medium";
  return "High";
}

interface SectorWelcomeModalProps {
  world: WorldMeta;
  currentMap: { dx: number; dy: number; mx: number; my: number };
  tiles: Map<string, Tile>;
  onClose: () => void;
}

export function SectorWelcomeModal({ world, currentMap, tiles, onClose }: SectorWelcomeModalProps) {
  const districtLabel = districtName(currentMap.dx, currentMap.dy, world.districts_x);
  const sectorLabel = sectorName(
    currentMap.dx,
    currentMap.dy,
    currentMap.mx,
    currentMap.my,
    world.districts_x,
    world.maps_per_district_x,
    world.maps_per_district_y,
  );

  const survey = useMemo(() => {
    const counts: Record<string, number> = {
      steel: 0,
      silicon: 0,
      polymer: 0,
      rare_earth: 0,
      carbon: 0,
    };

    for (const tile of tiles.values()) {
      const type = tile.resource?.type;
      if (!type || !(type in counts)) continue;
      counts[type] += 1;
    }

    const totalTiles = Math.max(tiles.size, 1);
    return RAW_RESOURCES.map((res) => {
      const count = counts[res.key] ?? 0;
      const densityPct = (count / totalTiles) * 100;
      return {
        ...res,
        count,
        densityPct,
        band: toDensityBand(densityPct),
      };
    });
  }, [tiles]);

  const hasTileData = tiles.size > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="sector-welcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">WELCOME TO MARS</span>
          <button className="bd-close" onClick={onClose}>&times;</button>
        </div>

        <div className="sector-welcome-copy">
          You landed in sector <span className="mono">{sectorLabel}</span> in district {districtLabel}.
        </div>
        <div className="sector-welcome-subcopy">Resource survey for this sector:</div>

        {!hasTileData ? (
          <div className="sector-scan-pending">Scanning surface data...</div>
        ) : (
          <div className="sector-resource-grid">
            {survey.map((resource) => {
              const absent = resource.count === 0;
              return (
                <div
                  key={resource.key}
                  className={`sector-resource-row ${absent ? "absent" : ""}`}
                  title={resource.name}
                >
                  <div className={`resource-pill sector ${absent ? "absent" : ""}`}>
                    <span className="label" style={{ color: resource.color }}>{resource.label}</span>
                    <span className="value">{resource.name}</span>
                  </div>
                  <div className="sector-resource-meta">
                    {absent ? (
                      <span className="sector-resource-absent">Not present</span>
                    ) : (
                      <>
                        <span className="mono">{resource.densityPct.toFixed(2)}%</span>
                        <span>{resource.band}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="sector-welcome-actions">
          <button className="btn btn-accent" onClick={onClose}>Continue</button>
        </div>
      </div>
    </div>
  );
}
