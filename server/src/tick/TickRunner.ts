import { TICK_INTERVAL_MS } from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";
import { updateMarketPrices } from "../systems/market.js";
import { processCommands } from "./phases/01-commands.js";
import { processProduction } from "./phases/02-production.js";
import { processAutoSell } from "./phases/02b-autosell.js";
import { processRoutes } from "./phases/02c-routes.js";
import { processUpkeep } from "./phases/03-upkeep.js";
import { processCommit } from "./phases/05-commit.js";
import { saveSnapshot } from "../db.js";

export class TickRunner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private snapshotInterval: number;

  constructor(
    private store: WorldStore,
    options?: { snapshotIntervalTicks?: number }
  ) {
    this.snapshotInterval = options?.snapshotIntervalTicks ?? 1;
  }

  start() {
    console.log(`Tick runner starting (interval: ${TICK_INTERVAL_MS}ms)`);
    this.interval = setInterval(() => this.runTick(), TICK_INTERVAL_MS);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private runTick() {
    this.store.tick++;
    const t0 = performance.now();

    // 1. Update market prices (so displayed price = sell price this tick)
    updateMarketPrices(this.store);
    // 2. Process player commands
    processCommands(this.store);
    // 3. Mines produce resources
    processProduction(this.store);
    // 4. Routes move resources between buildings
    processRoutes(this.store);
    // 5. Ports auto-sell resources at market price
    processAutoSell(this.store);
    // 6. Routes again (move auto-sell revenue, e.g. money from port → admin)
    processRoutes(this.store);
    // 7. Deduct upkeep from admin outpost
    processUpkeep(this.store);
    // 8. Broadcast events to WS clients
    processCommit(this.store);

    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`Tick ${this.store.tick} completed in ${elapsed}ms`);

    // Fire-and-forget snapshot save
    if (this.snapshotInterval > 0 && this.store.tick % this.snapshotInterval === 0) {
      saveSnapshot(this.store.worldId, this.store.toSnapshot()).catch((err) =>
        console.error("Snapshot save failed:", err)
      );
    }
  }
}
