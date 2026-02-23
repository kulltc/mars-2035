import Fastify from "fastify";
import fastifyWebSocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { WorldStore } from "./store/WorldStore.js";
import { TickRunner } from "./tick/TickRunner.js";
import { registerRoutes } from "./api/routes.js";
import { registerWebSocket } from "./api/ws.js";
import { registerAuthRoutes, setPlayerCounter } from "./api/auth.js";
import { setBuildingCounter } from "./systems/building.js";
import { initDb, loadLatestSnapshot, isResourceTilesSeeded, seedResourceTiles } from "./db.js";
import { generateWorld } from "./seed/worldGen.js";

const PORT = Number(process.env.PORT ?? 3000);
const JWT_SECRET = process.env.JWT_SECRET ?? "mars-2035-dev-secret";
const SNAPSHOT_INTERVAL_TICKS = Number(process.env.SNAPSHOT_INTERVAL_TICKS ?? 1);

async function main() {
  const app = Fastify({ logger: false });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyWebSocket);
  await app.register(fastifyJwt, { secret: JWT_SECRET });

  // Initialize database
  await initDb();

  // Seed resource tiles into DB if not already present
  const tilesSeeded = await isResourceTilesSeeded();
  if (!tilesSeeded) {
    console.log("Generating world resource tiles...");
    const resourceTiles = generateWorld(42);
    console.log(`Seeding ${resourceTiles.length} resource tiles into DB...`);
    await seedResourceTiles(resourceTiles);
    console.log("Resource tiles seeded");
  } else {
    console.log("Resource tiles already in DB, skipping generation");
  }

  // Initialize world — restore from snapshot if available
  let store: WorldStore;
  const snapshot = await loadLatestSnapshot("mars-alpha");

  if (snapshot) {
    store = WorldStore.fromSnapshot(snapshot);

    // Restore building counter from max building ID (bld_N)
    let maxBld = 0;
    for (const id of store.buildings.keys()) {
      const n = parseInt(id.replace("bld_", ""), 10);
      if (n > maxBld) maxBld = n;
    }
    setBuildingCounter(maxBld);

    // Restore player counter from max player ID (plr_<ts>_N)
    let maxPlr = 0;
    for (const id of store.players.keys()) {
      const parts = id.split("_");
      const n = parseInt(parts[parts.length - 1], 10);
      if (n > maxPlr) maxPlr = n;
    }
    setPlayerCounter(maxPlr);

    console.log(`Restored from tick ${snapshot.tick} (${store.players.size} players, ${store.buildings.size} buildings)`);
  } else {
    store = new WorldStore();
    console.log("Fresh world initialized (tiles in DB)");
  }

  // Register routes
  registerAuthRoutes(app, store);
  registerRoutes(app, store);
  registerWebSocket(app, store);

  // Start tick runner
  const ticker = new TickRunner(store, { snapshotIntervalTicks: SNAPSHOT_INTERVAL_TICKS });
  ticker.start();

  // Start server
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log("Tick running every 5s");

  // Graceful shutdown
  const shutdown = () => {
    ticker.stop();
    app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
