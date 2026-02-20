import {
  DISTRICTS_X,
  MAPS_PER_DISTRICT_X,
  MAPS_PER_DISTRICT_Y,
} from "./constants.js";

export const DISTRICT_NAMES: string[] = [
  "Aonia",
  "Syrtis",
  "Noctis",
  "Elysium",
  "Tempe",
  "Arcadia",
  "Amazonis",
  "Utopia",
  "Ismenia",
  "Cimmeria",
  "Oxia",
  "Aurorae",
  "Chryse",
  "Hellas",
  "Tharsis",
  "Promethei",
  "Meridiani",
  "Diacria",
  "Iani",
  "Tyrrhena",
  "Aeolis",
  "Nili",
  "Daedalia",
  "Argyre",
  "Erebus",
];

export const SECTOR_NAMES: string[] = [
  "Basalt Meridian",
  "Aether Spur",
  "Kepler Verge",
  "Ion Reach",
  "Perihelion Gate",
  "Magnetar Rise",
  "Crimson Shear",
  "Dryfall Nexus",
  "Helion Rift",
  "Spectral Shelf",
  "Cinder Arc",
  "Zenith Trench",
  "Vallis Prime",
  "Obsidian Strand",
  "Solstice Expanse",
  "Pioneer Fold",
  "Redline Corridor",
  "Ares Margin",
  "Borealis Track",
  "Sable Frontier",
  "Meridian Delta",
  "Penumbral Basin",
  "Argon Step",
  "Vigil Horizon",
  "Helix Divide",
  "Fracture Plain",
  "Karman Shelf",
  "Solis Drift",
  "Voidline Terrace",
  "Ember Field",
  "Orion Causeway",
  "Marek Span",
  "Echolith Range",
  "Vector Narrows",
  "Radiant Cut",
  "Farpoint Mesa",
  "Astra Ledge",
  "Torchline Reach",
  "Morrow Basin",
  "Copper Vault",
  "Driftglass Expanse",
  "Coriolis Row",
  "Redshift Bar",
  "Pallas Track",
  "Galeframe Step",
  "Tecton Verge",
  "Pulse Quarry",
  "Monolith Span",
  "Dawnline Strip",
  "Perimeter V",
];

export const DISTRICT_FALLBACK_START = 100;
export const SECTOR_FALLBACK_START = 101;

function byIndexWithFallback(
  names: string[],
  prefix: string,
  index: number,
  fallbackStart: number,
): string {
  if (index >= 0 && index < names.length) return names[index];
  const overflowIndex = Math.max(0, index - names.length);
  return `${prefix} ${fallbackStart + overflowIndex}`;
}

export function districtIndex(dx: number, dy: number, districtsX = DISTRICTS_X): number {
  return dy * districtsX + dx;
}

export function sectorIndex(
  dx: number,
  dy: number,
  mx: number,
  my: number,
  districtsX = DISTRICTS_X,
  mapsPerDistrictX = MAPS_PER_DISTRICT_X,
  mapsPerDistrictY = MAPS_PER_DISTRICT_Y,
): number {
  const district = districtIndex(dx, dy, districtsX);
  const sectorsPerDistrict = mapsPerDistrictX * mapsPerDistrictY;
  return district * sectorsPerDistrict + my * mapsPerDistrictX + mx;
}

export function districtNameByIndex(index: number): string {
  return byIndexWithFallback(DISTRICT_NAMES, "District", index, DISTRICT_FALLBACK_START);
}

export function sectorNameByIndex(index: number): string {
  return byIndexWithFallback(SECTOR_NAMES, "Sector", index, SECTOR_FALLBACK_START);
}

export function districtName(dx: number, dy: number, districtsX = DISTRICTS_X): string {
  return districtNameByIndex(districtIndex(dx, dy, districtsX));
}

export function sectorName(
  dx: number,
  dy: number,
  mx: number,
  my: number,
  districtsX = DISTRICTS_X,
  mapsPerDistrictX = MAPS_PER_DISTRICT_X,
  mapsPerDistrictY = MAPS_PER_DISTRICT_Y,
): string {
  return sectorNameByIndex(
    sectorIndex(dx, dy, mx, my, districtsX, mapsPerDistrictX, mapsPerDistrictY),
  );
}