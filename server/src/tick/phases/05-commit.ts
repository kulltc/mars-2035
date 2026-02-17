import {
  DISTRICTS_X,
  DISTRICTS_Y,
  toDistrictKey,
} from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";
import { recalculateDistrict } from "../../systems/influence.js";

export function processCommit(store: WorldStore) {
  // Recalculate all district ownership
  for (let dx = 0; dx < DISTRICTS_X; dx++) {
    for (let dy = 0; dy < DISTRICTS_Y; dy++) {
      recalculateDistrict(store, toDistrictKey(dx, dy));
    }
  }

  // Push tick_complete event
  store.pushEvent("tick_complete", { tick: store.tick });

  // Collect events for this tick, grouped by map
  const tickEvents = store.events.filter((e) => e.tick === store.tick);
  const byMap = new Map<string, typeof tickEvents>();

  for (const evt of tickEvents) {
    const key = evt.map_key ?? "__global__";
    let arr = byMap.get(key);
    if (!arr) {
      arr = [];
      byMap.set(key, arr);
    }
    arr.push(evt);
  }

  // Broadcast to subscribers
  for (const [mapKey, events] of byMap) {
    if (mapKey === "__global__") {
      // Broadcast global events to all subscribers
      for (const [, subs] of store.subscribers) {
        for (const cb of subs) cb(events);
      }
    } else {
      store.broadcast(mapKey, events);
    }
  }
}
