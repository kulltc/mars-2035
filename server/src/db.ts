import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:password@localhost:5432/postgres",
});

export interface WorldSnapshotPayload {
  tick: number;
  seq: number;
  players: Record<string, import("@mars-2035/shared").Player>;
  buildings: Record<string, import("@mars-2035/shared").Building>;
  marketPrices?: import("@mars-2035/shared").MarketPrices;
  supplyPressure?: Record<string, number>;
  workers?: Record<string, import("@mars-2035/shared").Worker>;
  taskQueue?: Record<string, import("@mars-2035/shared").WorkerTask>;
  taskCounter?: number;
  ambassadors?: Record<string, import("@mars-2035/shared").Ambassador>;
  ambassadorCounter?: number;
  salesTaxHistory?: Record<string, number[]>;
}

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      username   TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      player_id  TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS world_snapshots (
      id         SERIAL PRIMARY KEY,
      world_id   TEXT NOT NULL,
      tick       INTEGER NOT NULL,
      seq        INTEGER NOT NULL,
      snapshot   JSONB NOT NULL,
      saved_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_world_snapshots_world_tick
      ON world_snapshots (world_id, tick DESC);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS resource_tiles (
      map_key  TEXT NOT NULL,
      x        INTEGER NOT NULL,
      y        INTEGER NOT NULL,
      resource_type TEXT NOT NULL,
      richness REAL NOT NULL,
      PRIMARY KEY (map_key, x, y)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_resource_tiles_map ON resource_tiles (map_key);
  `);
  console.log("Database initialized");
}

export interface ResourceTileRow {
  map_key: string;
  x: number;
  y: number;
  resource_type: string;
  richness: number;
}

export async function isResourceTilesSeeded(): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM resource_tiles LIMIT 1");
  return result.rows.length > 0;
}

export async function seedResourceTiles(tiles: ResourceTileRow[]): Promise<void> {
  if (tiles.length === 0) return;
  // Bulk insert in batches of 5000
  const BATCH = 5000;
  for (let i = 0; i < tiles.length; i += BATCH) {
    const batch = tiles.slice(i, i + BATCH);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const t = batch[j];
      const offset = j * 5;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
      values.push(t.map_key, t.x, t.y, t.resource_type, t.richness);
    }
    await pool.query(
      `INSERT INTO resource_tiles (map_key, x, y, resource_type, richness) VALUES ${placeholders.join(", ")}`,
      values
    );
  }
}

export async function getResourceTilesForMap(mapKey: string): Promise<ResourceTileRow[]> {
  const result = await pool.query(
    "SELECT map_key, x, y, resource_type, richness FROM resource_tiles WHERE map_key = $1",
    [mapKey]
  );
  return result.rows as ResourceTileRow[];
}

export async function getResourceTile(mapKey: string, x: number, y: number): Promise<ResourceTileRow | null> {
  const result = await pool.query(
    "SELECT map_key, x, y, resource_type, richness FROM resource_tiles WHERE map_key = $1 AND x = $2 AND y = $3",
    [mapKey, x, y]
  );
  return result.rows.length > 0 ? (result.rows[0] as ResourceTileRow) : null;
}

export async function saveSnapshot(worldId: string, payload: WorldSnapshotPayload): Promise<void> {
  await pool.query(
    "INSERT INTO world_snapshots (world_id, tick, seq, snapshot) VALUES ($1, $2, $3, $4)",
    [worldId, payload.tick, payload.seq, JSON.stringify(payload)]
  );
  // Prune to last 5 snapshots
  await pool.query(`
    DELETE FROM world_snapshots
    WHERE world_id = $1
      AND id NOT IN (
        SELECT id FROM world_snapshots
        WHERE world_id = $1
        ORDER BY id DESC
        LIMIT 5
      )
  `, [worldId]);
}

export async function loadLatestSnapshot(worldId: string): Promise<WorldSnapshotPayload | null> {
  const result = await pool.query(
    "SELECT snapshot FROM world_snapshots WHERE world_id = $1 ORDER BY id DESC LIMIT 1",
    [worldId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].snapshot as WorldSnapshotPayload;
}
