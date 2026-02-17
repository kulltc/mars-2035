import React from "react";
import { useGameStore } from "../state/store.js";
import type { ResourceType } from "@mars-2035/shared";

const RESOURCES: ResourceType[] = ["steel", "silicon", "polymer", "rare_earth", "carbon"];

export function MarketInfo() {
  const marketPrices = useGameStore((s) => s.marketPrices);

  if (!marketPrices) return null;

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>Market Prices</h3>
      {RESOURCES.map((res) => {
        const price = marketPrices[res];
        return (
          <div key={res} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ color: "#ccc" }}>{res.replace(/_/g, " ")}</span>
            <span style={{ color: "#81c784", fontWeight: "bold" }}>
              ${price.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: 10,
  backgroundColor: "#16213e",
  borderRadius: 4,
  fontSize: 13,
};
