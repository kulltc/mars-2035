import type { WorldStore } from "../../store/WorldStore.js";

export function processTutorial(store: WorldStore) {
  for (const player of store.players.values()) {
    const step = player.tutorial_step;
    if (step === undefined || step < 1 || step > 5) continue;

    switch (step) {
      case 1: {
        // Advance when player has an admin outpost
        for (const account of Object.values(player.map_accounts)) {
          if (account.admin_outpost_building_id) {
            player.tutorial_step = 2;
            break;
          }
        }
        break;
      }
      case 2: {
        // Advance when player owns a mine
        for (const b of store.buildings.values()) {
          if (b.owner_id === player.entity_id && b.class === "mine" && b.status !== "constructing") {
            player.tutorial_step = 3;
            break;
          }
        }
        break;
      }
      case 3: {
        // Advance when player owns a port AND a mine has a route to a port
        let hasPort = false;
        let hasRouteToPort = false;
        for (const b of store.buildings.values()) {
          if (b.owner_id !== player.entity_id) continue;
          if (b.class === "port" && b.status !== "constructing") hasPort = true;
          if (b.class === "mine" && b.outgoing_routes) {
            for (const route of b.outgoing_routes) {
              const dest = store.buildings.get(route.to_building_id);
              if (dest && dest.class === "port") {
                hasRouteToPort = true;
              }
            }
          }
        }
        if (hasPort && hasRouteToPort) {
          player.tutorial_step = 4;
        }
        break;
      }
      case 4: {
        // Advance when any port owned by player has money > 0
        for (const b of store.buildings.values()) {
          if (b.owner_id === player.entity_id && b.class === "port" && (b.inventory.money ?? 0) > 0) {
            player.tutorial_step = 5;
            break;
          }
        }
        break;
      }
      case 5: {
        // Advanced by explicit money-shipping actions in command/worker phases.
        break;
      }
    }
  }
}
