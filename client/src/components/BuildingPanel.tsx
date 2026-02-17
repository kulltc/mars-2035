import React, { useEffect, useRef, useState } from "react";
import { useGameStore } from "../state/store.js";
import { submitCommand } from "../api/client.js";
import {
  MATERIAL_TYPES,
  type MaterialType,
  type ResourceType,
  type AutoSellRule,
  type OutgoingRoute,
  type Building,
} from "@mars-2035/shared";

const RESOURCES: ResourceType[] = ["steel", "silicon", "polymer", "rare_earth", "carbon"];

type LocalAutoSell = Partial<Record<ResourceType, AutoSellRule | null>>;

export function BuildingPanel() {
  const selectedTile = useGameStore((s) => s.selectedTile);
  const buildings = useGameStore((s) => s.buildings);
  const player = useGameStore((s) => s.player);
  const marketPrices = useGameStore((s) => s.marketPrices);

  const [transferMat, setTransferMat] = useState<MaterialType>("steel");
  const [transferAmt, setTransferAmt] = useState(10);
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [routeResource, setRouteResource] = useState<MaterialType>("steel");
  const [routeTarget, setRouteTarget] = useState<string>("");

  // Status feedback
  const [status, setStatus] = useState<{ text: string; color: string } | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout>>();

  // Optimistic local state
  const [localAutoSell, setLocalAutoSell] = useState<LocalAutoSell>({});
  const [localRoutes, setLocalRoutes] = useState<OutgoingRoute[] | null>(null); // null = use server
  const trackedBuildingId = useRef<string | null>(null);

  const building = (() => {
    if (!selectedTile || !player) return null;
    const b = buildings.find(
      (b) => b.location.x === selectedTile.x && b.location.y === selectedTile.y
    );
    if (!b || b.owner_id !== player.entity_id) return null;
    return b;
  })();

  // Other buildings on the same map owned by the same player
  const otherBuildings = building
    ? buildings.filter(
        (b) => b.owner_id === player?.entity_id && b.entity_id !== building.entity_id
      )
    : [];

  // Reset local state when selected building changes
  useEffect(() => {
    if (building?.entity_id !== trackedBuildingId.current) {
      trackedBuildingId.current = building?.entity_id ?? null;
      setLocalAutoSell({});
      setLocalRoutes(null);
      setTransferTarget("");
      setRouteTarget("");
      setStatus(null);
    }
  }, [building?.entity_id]);

  // Clear local overrides when server catches up
  useEffect(() => {
    if (!building) return;

    // Auto-sell: clear overrides that server now reflects
    setLocalAutoSell((prev) => {
      const next: LocalAutoSell = {};
      let changed = false;
      for (const [res, localRule] of Object.entries(prev)) {
        const serverRule = building.auto_sell?.[res as ResourceType];
        const serverMode = serverRule?.mode ?? "off";
        const localMode = localRule?.mode ?? "off";
        if (localMode !== serverMode) {
          next[res as ResourceType] = localRule;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Routes: if server now has routes, clear local override
    setLocalRoutes((prev) => {
      if (prev === null) return null;
      // Server has caught up if route count matches our optimistic state
      const serverRoutes = building.outgoing_routes ?? [];
      if (serverRoutes.length >= prev.length) return null;
      return prev;
    });
  }, [building]);

  if (!selectedTile || !player || !building) return null;

  function showStatus(text: string, color: string) {
    setStatus({ text, color });
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 3000);
  }

  const effectiveRoutes: OutgoingRoute[] = localRoutes ?? (building.outgoing_routes ?? []);

  async function runCommand(label: string, type: string, data: Record<string, unknown>): Promise<boolean> {
    const result = await submitCommand(type, data);
    if (result.error) {
      showStatus(`Error: ${result.error}`, "#ef5350");
      return false;
    }
    return true;
  }

  const handleTransfer = async () => {
    if (!transferTarget) return;
    showStatus("Sending...", "#90caf9");
    const ok = await runCommand("transfer", "transfer", {
      from_building_id: building.entity_id,
      to_building_id: transferTarget,
      material: transferMat,
      amount: transferAmt,
    });
    if (ok) showStatus(`Queued: send ${transferAmt} ${transferMat}`, "#81c784");
  };

  const handleExport = async () => {
    if (building.class !== "port") return;
    showStatus("Exporting...", "#90caf9");
    const ok = await runCommand("export", "export", {
      building_id: building.entity_id,
      material: transferMat,
      amount: transferAmt,
    });
    if (ok) showStatus(`Queued: export ${transferAmt} ${transferMat}`, "#81c784");
  };

  const handleAutoSellChange = async (resource: ResourceType, mode: string, minPrice?: number) => {
    let rule: AutoSellRule | null = null;
    if (mode === "any_rate") {
      rule = { mode: "any_rate" };
    } else if (mode === "min_rate") {
      rule = { mode: "min_rate", min_price: minPrice ?? 1 };
    }
    setLocalAutoSell((prev) => ({ ...prev, [resource]: rule }));
    await runCommand("auto-sell", "configure_auto_sell", {
      building_id: building.entity_id,
      resource,
      rule,
    });
  };

  const handleAddRoute = async () => {
    if (!routeTarget) return;
    const newRoute: OutgoingRoute = { resource: routeResource, to_building_id: routeTarget };
    // Optimistic: add to local routes
    setLocalRoutes([...effectiveRoutes, newRoute]);
    const dest = otherBuildings.find(b => b.entity_id === routeTarget);
    showStatus(`Route: ${routeResource} → ${dest ? buildingLabel(dest) : routeTarget}`, "#81c784");
    const ok = await runCommand("route", "configure_route", {
      from_building_id: building.entity_id,
      to_building_id: routeTarget,
      resource: routeResource,
    });
    if (!ok) {
      // Revert optimistic update
      setLocalRoutes(effectiveRoutes);
    }
  };

  const handleDeleteRoute = async (toBuildingId: string, resource: MaterialType) => {
    const prev = effectiveRoutes;
    // Optimistic: remove from local routes
    setLocalRoutes(effectiveRoutes.filter(
      (r) => !(r.resource === resource && r.to_building_id === toBuildingId)
    ));
    showStatus(`Route removed`, "#ffb74d");
    const ok = await runCommand("delete route", "delete_route", {
      from_building_id: building.entity_id,
      to_building_id: toBuildingId,
      resource,
    });
    if (!ok) {
      // Revert optimistic update
      setLocalRoutes(prev);
    }
  };

  const getEffectiveRule = (res: ResourceType): AutoSellRule | null => {
    if (res in localAutoSell) return localAutoSell[res] ?? null;
    return building.auto_sell?.[res] ?? null;
  };

  const buildingLabel = (b: Building) =>
    `${b.class === "port" ? "port" : b.class.replace(/_/g, " ")} (${b.location.x},${b.location.y})`;

  return (
    <div style={panelStyle}>
      <h3 style={{ marginBottom: 6 }}>
        {building.class === "port" ? "Trading Outpost" : building.class.replace(/_/g, " ")} — Actions
      </h3>

      {/* Status feedback bar */}
      {status && (
        <div style={{
          padding: "3px 8px", marginBottom: 6, borderRadius: 3,
          backgroundColor: "#1a2744", color: status.color, fontSize: 11,
          border: `1px solid ${status.color}40`,
        }}>
          {status.text}
        </div>
      )}

      {/* ── Transfer section ── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: "bold", fontSize: 12, color: "#aaa", marginBottom: 4 }}>Transfer</div>
        <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
          <select value={transferMat} onChange={(e) => setTransferMat(e.target.value as MaterialType)} style={selectStyle}>
            {MATERIAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            type="number" value={transferAmt} min={1}
            onChange={(e) => setTransferAmt(Number(e.target.value))}
            style={{ ...selectStyle, width: 55 }}
          />
          <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: 80 }}>
            <option value="">To...</option>
            {otherBuildings.map((b) => (
              <option key={b.entity_id} value={b.entity_id}>{buildingLabel(b)}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={handleTransfer} disabled={!transferTarget} style={{ ...btnStyle, opacity: transferTarget ? 1 : 0.4 }}>
            Send
          </button>
          {building.class === "port" && (
            <button onClick={handleExport} style={{ ...btnStyle, backgroundColor: "#388e3c" }}>
              Export {transferMat}
            </button>
          )}
        </div>
      </div>

      {/* ── Routes section ── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: "bold", fontSize: 12, color: "#aaa", marginBottom: 4 }}>Auto-Routes</div>
        {effectiveRoutes.length === 0 && (
          <div style={{ color: "#555", fontSize: 11, marginBottom: 4 }}>No routes configured</div>
        )}
        {effectiveRoutes.map((route, i) => {
          const dest = buildings.find((b) => b.entity_id === route.to_building_id);
          return (
            <div key={`${route.resource}-${route.to_building_id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2, fontSize: 12 }}>
              <span style={{ color: route.resource === "money" ? "#ffd54f" : "#ccc" }}>{route.resource}</span>
              <span style={{ color: "#888" }}>&rarr;</span>
              <span style={{ color: "#90caf9" }}>
                {dest ? buildingLabel(dest) : route.to_building_id}
              </span>
              <button
                onClick={() => handleDeleteRoute(route.to_building_id, route.resource)}
                style={{ ...btnStyle, padding: "1px 6px", fontSize: 10, color: "#e57373", marginLeft: "auto" }}
              >
                x
              </button>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <select value={routeResource} onChange={(e) => setRouteResource(e.target.value as MaterialType)} style={{ ...selectStyle, fontSize: 11 }}>
            {MATERIAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={routeTarget} onChange={(e) => setRouteTarget(e.target.value)} style={{ ...selectStyle, fontSize: 11, flex: 1, minWidth: 80 }}>
            <option value="">To...</option>
            {otherBuildings.map((b) => (
              <option key={b.entity_id} value={b.entity_id}>{buildingLabel(b)}</option>
            ))}
          </select>
          <button onClick={handleAddRoute} disabled={!routeTarget} style={{ ...btnStyle, fontSize: 11, opacity: routeTarget ? 1 : 0.4 }}>
            + Route
          </button>
        </div>
      </div>

      {/* ── Auto-sell section (port only) ── */}
      {building.class === "port" && (
        <div>
          <div style={{ fontWeight: "bold", fontSize: 12, color: "#aaa", marginBottom: 4 }}>Auto-Sell</div>
          {RESOURCES.map((res) => {
            const rule = getEffectiveRule(res);
            const currentMode = rule?.mode ?? "off";
            const price = marketPrices?.[res];
            return (
              <div key={res} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3, fontSize: 12 }}>
                <span style={{ width: 65, color: "#ccc" }}>{res.replace(/_/g, " ")}</span>
                <span style={{ width: 38, color: "#888", fontSize: 11 }}>
                  {price != null ? `$${price.toFixed(2)}` : "—"}
                </span>
                <select
                  value={currentMode}
                  onChange={(e) => handleAutoSellChange(res, e.target.value, rule?.min_price)}
                  style={{ ...selectStyle, width: 85, fontSize: 11 }}
                >
                  <option value="off">Off</option>
                  <option value="any_rate">Any Rate</option>
                  <option value="min_rate">Min Rate</option>
                </select>
                {currentMode === "min_rate" && (
                  <input
                    type="number" step="0.1" min="0.1"
                    value={rule?.min_price ?? 1}
                    onChange={(e) => handleAutoSellChange(res, "min_rate", Number(e.target.value))}
                    style={{ ...selectStyle, width: 50, fontSize: 11 }}
                  />
                )}
              </div>
            );
          })}
        </div>
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

const selectStyle: React.CSSProperties = {
  background: "#0f3460",
  color: "#e0e0e0",
  border: "1px solid #444",
  padding: "3px 5px",
  borderRadius: 3,
  fontSize: 12,
};

const btnStyle: React.CSSProperties = {
  background: "#0f3460",
  color: "#e0e0e0",
  border: "1px solid #444",
  padding: "3px 8px",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 12,
};
