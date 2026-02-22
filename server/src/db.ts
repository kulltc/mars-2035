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
  console.log("Database initialized");
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
