import {
  DISTRICTS_X,
  DISTRICTS_Y,
  MAPS_PER_DISTRICT_X,
  MAPS_PER_DISTRICT_Y,
  TILES_PER_MAP,
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

// ── Resource generation config ──

// Sporadic resources: placed tile-by-tile with a probability
interface SporadicConfig {
  type: ResourceType;
  density: number; // probability per tile
}

// Clustered resources: placed in rectangular patches
interface ClusterConfig {
  type: ResourceType;
  patchCount: number;      // number of patches per map
  regionW: number;         // region width (tiles)
  regionH: number;         // region height (tiles)
  fillRatio: number;       // fraction of tiles in region that get the resource
}

function placeSporadic(
  rng: () => number,
  tiles: Map<string, Tile>,
  config: SporadicConfig,
) {
  for (let x = 0; x < TILES_PER_MAP; x++) {
    for (let y = 0; y < TILES_PER_MAP; y++) {
      if (rng() >= config.density) continue;
      const tile = tiles.get(tileKey(x, y))!;
      if (tile.resource) continue; // don't overwrite
      const richness = 1.0 + rng() * 2.0;
      tile.resource = { type: config.type, richness: Math.round(richness * 100) / 100 };
    }
  }
}

function placeClusters(
  rng: () => number,
  tiles: Map<string, Tile>,
  config: ClusterConfig,
) {
  for (let p = 0; p < config.patchCount; p++) {
    // Pick random top-left for the region
    const rx = Math.floor(rng() * (TILES_PER_MAP - config.regionW));
    const ry = Math.floor(rng() * (TILES_PER_MAP - config.regionH));

    for (let dx = 0; dx < config.regionW; dx++) {
      for (let dy = 0; dy < config.regionH; dy++) {
        if (rng() >= config.fillRatio) continue;
        const x = rx + dx;
        const y = ry + dy;
        const tile = tiles.get(tileKey(x, y))!;
        if (tile.resource) continue;
        const richness = 1.0 + rng() * 2.0;
        tile.resource = { type: config.type, richness: Math.round(richness * 100) / 100 };
      }
    }
  }
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

          // Create empty tiles
          for (let x = 0; x < TILES_PER_MAP; x++) {
            for (let y = 0; y < TILES_PER_MAP; y++) {
              tiles.set(tileKey(x, y), { x, y });
            }
          }

          // Steel: clustered in patches (~5x6 region, ~1/3 fill, several patches)
          placeClusters(rng, tiles, {
            type: "steel",
            patchCount: 25,
            regionW: 5,
            regionH: 6,
            fillRatio: 0.33,
          });

          // Carbon: sporadic, half the old density (~3.5% of tiles)
          placeSporadic(rng, tiles, { type: "carbon", density: 0.035 });

          // Silicon: sporadic, half the old density (~3.5% of tiles)
          placeSporadic(rng, tiles, { type: "silicon", density: 0.035 });

          // Each map gets either rare_earth or polymer (not both)
          const hasRareEarth = rng() < 0.5;
          placeSporadic(rng, tiles, {
            type: hasRareEarth ? "rare_earth" : "polymer",
            density: 0.015,
          });

          world.set(mapKey, tiles);
        }
      }
    }
  }

  return world;
}
