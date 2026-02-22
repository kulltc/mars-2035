import { tileKey } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

/**
 * Bankruptcy detection: if a player has no buildings except admin outpost(s)
 * and zero money across all admin outposts, they are bankrupt.
 * This triggers an automatic forfeit and marks them with a bankrupt flag
 * so the client can show a "You went bankrupt" modal on next login/refresh.
 */
export function processBankruptcy(store: WorldStore) {
  for (const player of store.players.values()) {
    // Skip players that already have no colonies (fresh / already forfeited)
    const mapKeys = Object.keys(player.map_accounts);
    if (mapKeys.length === 0) continue;

    // Skip players already flagged bankrupt
    if (player.bankrupt) continue;

    // Check: does this player have any non-admin_outpost building?
    let hasNonAdmin = false;
    let totalMoney = 0;

    for (const building of store.buildings.values()) {
      if (building.owner_id !== player.entity_id) continue;
      if (building.class !== "admin_outpost") {
        // Include constructing buildings — they still have value
        hasNonAdmin = true;
        break;
      } else {
        totalMoney += building.inventory.money ?? 0;
      }
    }

    if (hasNonAdmin) continue;
    if (totalMoney > 0) continue;

    // Also skip if they have any workers carrying money
    let workerMoney = 0;
    for (const worker of store.workers.values()) {
      if (worker.owner_id !== player.entity_id) continue;
      workerMoney += worker.inventory.money ?? 0;
    }
    if (workerMoney > 0) continue;

    // Check that this player has actually started (has at least one admin outpost)
    let hasAdminOutpost = false;
    for (const account of Object.values(player.map_accounts)) {
      if (account.admin_outpost_building_id) {
        hasAdminOutpost = true;
        break;
      }
    }
    if (!hasAdminOutpost) continue;

    console.log(`Player ${player.name} (${player.entity_id}) is bankrupt — auto-forfeiting`);

    // Perform the same cleanup as handleForfeit
    const playerId = player.entity_id;

    // Remove all workers
    for (const [wid, worker] of store.workers) {
      if (worker.owner_id !== playerId) continue;
      if (worker.current_task_id) store.taskQueue.delete(worker.current_task_id);
      store.workers.delete(wid);
    }

    // Remove all ambassadors
    for (const [ambId, amb] of store.ambassadors) {
      if (amb.owner_id !== playerId) continue;
      store.ambassadors.delete(ambId);
    }
    store.salesTaxHistory.delete(playerId);

    // Remove all buildings
    const buildingIds: string[] = [];
    for (const [bid, building] of store.buildings) {
      if (building.owner_id !== playerId) continue;
      buildingIds.push(bid);

      const mapTiles = store.tiles.get(building.map_key);
      if (mapTiles) {
        const tk = tileKey(building.location.x, building.location.y);
        const tile = mapTiles.get(tk);
        if (tile) delete tile.building_id;
      }

      store.buildings.delete(bid);
    }

    // Remove routes referencing deleted buildings
    for (const b of store.buildings.values()) {
      if (!b.outgoing_routes) continue;
      b.outgoing_routes = b.outgoing_routes.filter(
        (r) => !buildingIds.includes(r.to_building_id)
      );
    }

    // Remove remaining tasks
    for (const [taskId, task] of store.taskQueue) {
      if (task.owner_id === playerId) store.taskQueue.delete(taskId);
    }

    // Reset player state and mark bankrupt
    player.map_accounts = {};
    player.research = [];
    player.tutorial_step = 1;
    player.bankrupt = true;

    store.pushEvent("player_bankrupt", {
      player_id: playerId,
      name: player.name,
    });
  }
}
