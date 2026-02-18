import type { WorldStore } from "../../store/WorldStore.js";

export function processCommit(store: WorldStore) {
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

  // Broadcast to all subscribed maps (even those with no events this tick)
  // so clients always get fresh building state
  for (const [mapKey, subs] of store.subscribers) {
    if (subs.size === 0) continue;
    const events = byMap.get(mapKey) ?? [];
    const globalEvents = byMap.get("__global__") ?? [];
    const allEvents = [...events, ...globalEvents];
    const buildings = store.getBuildingsByMap(mapKey);
    const workers = store.getWorkersByMap(mapKey);
    for (const cb of subs) cb(allEvents, buildings, workers);
  }
}
