import {
  DISTRICTS_X,
  DISTRICTS_Y,
  MAPS_PER_DISTRICT_X,
  MAPS_PER_DISTRICT_Y,
  TILES_PER_MAP,
  RESOURCE_DENSITY,
  RESOURCE_TYPES,
  type Tile,
  type ResourceType,
  toMapKey,
  tileKey,
} from "@mars-2035/shared";

// Simple seeded PRNG (mulberry32)
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedMap {
  mapKey: string;
  tiles: Map<string, Tile>; // key: "x:y"
}

export function generateWorld(seed = 42): Map<string, Map<string, Tile>> {
  const rng = mulberry32(seed);
  const world = new Map<string, Map<string, Tile>>();

  for (let dx = 0; dx < DISTRICTS_X; dx++) {
    for (let dy = 0; dy < DISTRICTS_Y; dy++) {
      for (let mx = 0; mx < MAPS_PER_DISTRICT_X; mx++) {
        for (let my = 0; my < MAPS_PER_DISTRICT_Y; my++) {
          const mapKey = toMapKey(dx, dy, mx, my);
          const tiles = new Map<string, Tile>();

          for (let x = 0; x < TILES_PER_MAP; x++) {
            for (let y = 0; y < TILES_PER_MAP; y++) {
              const tile: Tile = { x, y };

              if (rng() < RESOURCE_DENSITY) {
                const type = RESOURCE_TYPES[
                  Math.floor(rng() * RESOURCE_TYPES.length)
                ] as ResourceType;
                const richness = 1.0 + rng() * 2.0; // 1.0 – 3.0
                tile.resource = { type, richness: Math.round(richness * 100) / 100 };
              }

              tiles.set(tileKey(x, y), tile);
            }
          }

          world.set(mapKey, tiles);
        }
      }
    }
  }

  return world;
}
