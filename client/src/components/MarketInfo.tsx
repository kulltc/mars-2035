import React from "react";
import { useGameStore } from "../state/store.js";
import { RESOURCE_TYPES, TRADEABLE_TYPES, type ResourceType } from "@mars-2035/shared";

const RAW_SET = new Set<string>(RESOURCE_TYPES);

export function MarketInfo() {
  const marketPrices = useGameStore((s) => s.marketPrices);

  if (!marketPrices) return null;

  const raw = TRADEABLE_TYPES.filter((r) => RAW_SET.has(r));
  const processed = TRADEABLE_TYPES.filter((r) => !RAW_SET.has(r));

  const renderRow = (res: ResourceType) => {
    const price = marketPrices[res];
    if (price == null) return null;
    return (
      <div key={res} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ color: "#ccc" }}>{res.replace(/_/g, " ")}</span>
        <span style={{ color: "#81c784", fontWeight: "bold" }}>
          ${price.toFixed(2)}
        </span>
      </div>
    );
  };

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>Market Prices</h3>
      <div style={{ fontSize: 10, color: "#666", marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>Raw</div>
      {raw.map(renderRow)}
      {processed.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: "#666", marginTop: 6, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>Processed</div>
          {processed.map(renderRow)}
        </>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: 10,
  backgroundColor: "#16213e",
  borderRadius: 4,
  fontSize: 13,
};
