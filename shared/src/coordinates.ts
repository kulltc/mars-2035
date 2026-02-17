import type { DistrictKey, Location, MapKey } from "./types.js";
import {
  MAPS_PER_DISTRICT_X,
  MAPS_PER_DISTRICT_Y,
  TILES_PER_MAP,
} from "./constants.js";

export function toMapKey(dx: number, dy: number, mx: number, my: number): MapKey {
  return `${dx}:${dy}:${mx}:${my}`;
}

export function parseMapKey(key: MapKey): { dx: number; dy: number; mx: number; my: number } {
  const [dx, dy, mx, my] = key.split(":").map(Number);
  return { dx, dy, mx, my };
}

export function toDistrictKey(dx: number, dy: number): DistrictKey {
  return `${dx}:${dy}`;
}

export function parseDistrictKey(key: DistrictKey): { dx: number; dy: number } {
  const [dx, dy] = key.split(":").map(Number);
  return { dx, dy };
}

export function locationToMapKey(loc: Location): MapKey {
  return toMapKey(loc.dx, loc.dy, loc.mx, loc.my);
}

export function locationToDistrictKey(loc: Location): DistrictKey {
  return toDistrictKey(loc.dx, loc.dy);
}

export function toWorldTile(loc: Location): { wx: number; wy: number } {
  return {
    wx: loc.dx * MAPS_PER_DISTRICT_X * TILES_PER_MAP + loc.mx * TILES_PER_MAP + loc.x,
    wy: loc.dy * MAPS_PER_DISTRICT_Y * TILES_PER_MAP + loc.my * TILES_PER_MAP + loc.y,
  };
}

export function tileKey(x: number, y: number): string {
  return `${x}:${y}`;
}
