import { TICK_INTERVAL_MS } from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";
import { processCommands } from "./phases/01-commands.js";
import { processProduction } from "./phases/02-production.js";
import { processUpkeep } from "./phases/03-upkeep.js";
import { processTaxes } from "./phases/04-taxes.js";
import { processCommit } from "./phases/05-commit.js";

export class TickRunner {
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private store: WorldStore) {}

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

    processCommands(this.store);
    processProduction(this.store);
    processUpkeep(this.store);
    processTaxes(this.store);
    processCommit(this.store);

    const elapsed = (performance.now() - t0).toFixed(1);
    console.log(`Tick ${this.store.tick} completed in ${elapsed}ms`);
  }
}
