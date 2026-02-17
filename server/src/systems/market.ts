import {
  RESOURCE_TYPES,
  BASE_MARKET_PRICES,
  MARKET_VOLATILITY,
  MARKET_PRICE_MIN,
  MARKET_PRICE_MAX,
} from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";

export function updateMarketPrices(store: WorldStore) {
  for (const res of RESOURCE_TYPES) {
    const current = store.marketPrices[res];
    const base = BASE_MARKET_PRICES[res];

    // Random walk with mean reversion toward base price
    const noise = (Math.random() - 0.5) * 2 * MARKET_VOLATILITY;
    const reversion = (base - current) * 0.05;
    const next = Math.max(
      MARKET_PRICE_MIN,
      Math.min(MARKET_PRICE_MAX, current + noise + reversion)
    );

    store.marketPrices[res] = Math.round(next * 100) / 100;
  }

  store.pushEvent("market_update", { prices: { ...store.marketPrices } });
}
