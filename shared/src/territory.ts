import type { BuildingClass } from "./types.js";
import { TERRITORY_RADIUS } from "./constants.js";

export interface TerritoryBuilding {
  x: number;
  y: number;
  class: BuildingClass;
  owner_id: string;
}

export interface TerritoryInfo {
  inTerritory: boolean;
  fullTerritory: boolean;
  contested: boolean;
}

/**
 * Check territory status for a tile relative to a player.
 * - inTerritory: tile is within Manhattan distance of any of the player's territory buildings
 * - fullTerritory: tile is covered by admin_outpost or infra_tower (not research_station only)
 * - contested: tile is also within another player's territory
 */
export function getTerritoryInfo(
  territoryBuildings: TerritoryBuilding[],
  tx: number,
  ty: number,
  playerId: string,
): TerritoryInfo {
  let inTerritory = false;
  let fullTerritory = false;
  let otherTerritory = false;

  for (const b of territoryBuildings) {
    const radius = TERRITORY_RADIUS[b.class];
    if (radius == null) continue;

    const dist = Math.abs(tx - b.x) + Math.abs(ty - b.y);
    if (dist > radius) continue;

    if (b.owner_id === playerId) {
      inTerritory = true;
      if (b.class === "admin_outpost" || b.class === "infra_tower") {
        fullTerritory = true;
      }
    } else {
      otherTerritory = true;
    }
  }

  return {
    inTerritory,
    fullTerritory,
    contested: inTerritory && otherTerritory,
  };
}
