import Fastify from "fastify";
import fastifyWebSocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import { WorldStore } from "./store/WorldStore.js";
import { TickRunner } from "./tick/TickRunner.js";
import { registerRoutes } from "./api/routes.js";
import { registerWebSocket } from "./api/ws.js";

const PORT = Number(process.env.PORT ?? 3000);

async function main() {
  const app = Fastify({ logger: false });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyWebSocket);

  // Initialize world
  const store = new WorldStore(42);
  console.log("World seeded with 4 districts, 100 maps");

  // Register routes
  registerRoutes(app, store);
  registerWebSocket(app, store);

  // Start tick runner
  const ticker = new TickRunner(store);
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
