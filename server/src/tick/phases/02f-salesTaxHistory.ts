import { SALES_TAX_HISTORY_LENGTH } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

export function processSalesTaxHistory(store: WorldStore) {
  // Push current tick's sales tax onto each player's history
  for (const player of store.players.values()) {
    const playerId = player.entity_id;
    const taxThisTick = store.currentTickSalesTax.get(playerId) ?? 0;
    const history = store.salesTaxHistory.get(playerId) ?? [];
    history.push(taxThisTick);
    // Trim to last N entries
    while (history.length > SALES_TAX_HISTORY_LENGTH) {
      history.shift();
    }
    store.salesTaxHistory.set(playerId, history);
  }
  // Clear transient accumulator
  store.currentTickSalesTax.clear();
}
