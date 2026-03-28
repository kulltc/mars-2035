import React, { useState } from "react";
import { useGameStore } from "../state/store.js";
import { useMonitoringData, useMonitoringSnapshots } from "../hooks/useMonitoringData.js";
import { RESOURCE_TYPES, BUILDING_DEFS, WORKER_UPKEEP } from "@mars-2035/shared";
import type { ResourceType } from "@mars-2035/shared";
import type { TrendDirection, TickSnapshot } from "../state/monitoringCollector.js";

// ── Chain groups (reused from MarketPanel pattern) ──

const CHAIN_GROUPS: { label: string; color: string; items: ResourceType[] }[] = [
  { label: "Raw Materials", color: "var(--text-secondary)", items: RESOURCE_TYPES as unknown as ResourceType[] },
  {
    label: "Morphic Chain", color: "#e65100",
    items: ["ferrite_alloy", "morphic_composite", "morphic_core", "servo_cortex", "autonomic_matrix"],
  },
  {
    label: "Toroidin Chain", color: "#7b1fa2",
    items: ["thermoplast", "lattice_fiber", "toroidin_plate", "muphrid_cell", "paradox_weave"],
  },
  {
    label: "Cryogenic Chain", color: "#00838f",
    items: ["cryite", "null_phase_gel", "xenotherm_crystal", "absolute_lattice", "zero_point_shard"],
  },
  {
    label: "Psychophysical Chain", color: "#ad1457",
    items: ["psi_crystal", "esper_thread", "psychon_core", "peep_shield", "noetic_matrix"],
  },
];

type TabType = "production" | "consumption" | "financial";
type WindowSize = 10 | 50 | 100;

function formatNum(n: number, decimals = 1): string {
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 100) return n.toFixed(decimals > 1 ? 1 : decimals);
  return n.toFixed(decimals);
}

function formatMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(1)}`;
}

function formatName(s: string): string {
  return s.replace(/_/g, " ");
}

function trendArrow(t: TrendDirection): { symbol: string; color: string } {
  switch (t) {
    case "increasing": return { symbol: "\u25B2", color: "var(--success)" };
    case "decreasing": return { symbol: "\u25BC", color: "var(--danger)" };
    case "stable": return { symbol: "\u2500", color: "var(--text-muted)" };
  }
}

function efficiencyColor(pct: number): string {
  if (pct >= 70) return "var(--success)";
  if (pct >= 40) return "var(--warning)";
  return "var(--danger)";
}

// ── Sparkline Component ──

function Sparkline({ data, color, height = 20, width = 80 }: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 0.001);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block", opacity: 0.7 }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Production Tab ──

function ProductionTab({ windowSize }: { windowSize: WindowSize }) {
  const data = useMonitoringData(windowSize);
  const snapshots = useMonitoringSnapshots(windowSize);

  if (data.ticksCaptured === 0) {
    return <div className="monitoring-empty">Collecting data... wait for ticks to arrive.</div>;
  }

  return (
    <div className="monitoring-tab-content">
      {CHAIN_GROUPS.map((group) => {
        const activeItems = group.items.filter(
          (res) => (data.producingBuildingCount[res] ?? 0) > 0 || (data.avgProductionPerTick[res] ?? 0) > 0
        );
        if (activeItems.length === 0) return null;

        return (
          <div key={group.label} className="monitoring-section">
            <div className="monitoring-section-title" style={{ color: group.color }}>
              {group.label}
            </div>
            <div className="monitoring-col-headers">
              <span className="monitoring-col-name">Resource</span>
              <span className="monitoring-col-val">Avg/tick</span>
              <span className="monitoring-col-val">Max/tick</span>
              <span className="monitoring-col-eff">Efficiency</span>
            </div>
            {activeItems.map((res) => {
              const avg = data.avgProductionPerTick[res] ?? 0;
              const max = data.theoreticalMax[res] ?? 0;
              const eff = data.efficiency[res] ?? 0;
              const count = data.producingBuildingCount[res] ?? 0;
              const perBuilding = data.avgProductionPerBuilding[res] ?? 0;

              // Sparkline data
              const sparkData = snapshots.map(
                (s) => (s.production[res] ?? 0) + (s.processing[res] ?? 0)
              );

              return (
                <div key={res} className="monitoring-prod-row">
                  <div className="monitoring-prod-main">
                    <span className="monitoring-res-name" title={`${count} building${count !== 1 ? "s" : ""}, ${formatNum(perBuilding)}/tick/building`}>
                      {formatName(res)}
                      <span className="monitoring-building-count">{count}x</span>
                    </span>
                    <span className="monitoring-val mono">{formatNum(avg)}</span>
                    <span className="monitoring-val-dim mono">{formatNum(max)}</span>
                    <div className="monitoring-eff-cell">
                      <div className="monitoring-eff-bar-track">
                        <div
                          className="monitoring-eff-bar-fill"
                          style={{
                            width: `${Math.min(100, eff)}%`,
                            background: efficiencyColor(eff),
                          }}
                        />
                      </div>
                      <span className="monitoring-eff-pct mono" style={{ color: efficiencyColor(eff) }}>
                        {eff.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="monitoring-sparkline-row">
                    <Sparkline data={sparkData} color={group.color} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="monitoring-section">
        <div className="monitoring-section-title" style={{ color: "var(--accent)" }}>Workers</div>
        <div className="monitoring-stat-row">
          <span className="monitoring-stat-label">Active / Total</span>
          <span className="monitoring-stat-value mono">
            {data.avgWorkers.active} / {data.avgWorkers.total}
          </span>
        </div>
        <div className="monitoring-stat-row">
          <span className="monitoring-stat-label">Idle</span>
          <span className="monitoring-stat-value mono">{data.avgWorkers.idle}</span>
        </div>
      </div>
    </div>
  );
}

// ── Consumption Tab ──

function ConsumptionTab({ windowSize }: { windowSize: WindowSize }) {
  const data = useMonitoringData(windowSize);
  const snapshots = useMonitoringSnapshots(windowSize);

  if (data.ticksCaptured === 0) {
    return <div className="monitoring-empty">Collecting data... wait for ticks to arrive.</div>;
  }

  const allResources = new Set<ResourceType>([
    ...Object.keys(data.totalProduction) as ResourceType[],
    ...Object.keys(data.totalConsumption) as ResourceType[],
  ]);

  return (
    <div className="monitoring-tab-content">
      {CHAIN_GROUPS.map((group) => {
        const activeItems = group.items.filter((res) => allResources.has(res));
        if (activeItems.length === 0) return null;

        return (
          <div key={group.label} className="monitoring-section">
            <div className="monitoring-section-title" style={{ color: group.color }}>
              {group.label}
            </div>
            <div className="monitoring-col-headers">
              <span className="monitoring-col-name">Resource</span>
              <span className="monitoring-col-val">Prod/t</span>
              <span className="monitoring-col-val">Cons/t</span>
              <span className="monitoring-col-net">Net/t</span>
            </div>
            {activeItems.map((res) => {
              const prod = data.avgProductionPerTick[res] ?? 0;
              const cons = data.avgConsumptionPerTick[res] ?? 0;
              const net = data.netChange[res] ?? 0;
              const t = data.trend[res] ?? "stable";
              const arrow = trendArrow(t);

              const sparkData = snapshots.map((s) => {
                const p = (s.production[res] ?? 0) + (s.processing[res] ?? 0);
                const c = s.consumption[res] ?? 0;
                return p - c;
              });

              return (
                <div key={res} className="monitoring-cons-row">
                  <div className="monitoring-cons-main">
                    <span className="monitoring-res-name">{formatName(res)}</span>
                    <span className="monitoring-val mono" style={{ color: "var(--success)" }}>
                      +{formatNum(prod)}
                    </span>
                    <span className="monitoring-val mono" style={{ color: cons > 0 ? "var(--danger)" : "var(--text-muted)" }}>
                      {cons > 0 ? `-${formatNum(cons)}` : "0"}
                    </span>
                    <span
                      className="monitoring-net-val mono"
                      style={{ color: net >= 0 ? "var(--success)" : "var(--danger)" }}
                    >
                      <span className="monitoring-trend-arrow" style={{ color: arrow.color }}>
                        {arrow.symbol}
                      </span>
                      {net >= 0 ? "+" : ""}{formatNum(net)}
                    </span>
                  </div>
                  <div className="monitoring-sparkline-row">
                    <Sparkline data={sparkData} color={net >= 0 ? "var(--success)" : "var(--danger)"} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="monitoring-section monitoring-summary">
        <div className="monitoring-section-title" style={{ color: "var(--accent)" }}>
          Summary
        </div>
        {(() => {
          const resources = [...allResources];
          const netPositive = resources.filter(r => (data.netChange[r] ?? 0) > 0);
          const netNegative = resources.filter(r => (data.netChange[r] ?? 0) < 0);

          return (
            <>
              {netPositive.length > 0 && (
                <div className="monitoring-summary-line">
                  <span style={{ color: "var(--success)", fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>
                    Surplus
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {netPositive.map(r => formatName(r)).join(", ")}
                  </span>
                </div>
              )}
              {netNegative.length > 0 && (
                <div className="monitoring-summary-line">
                  <span style={{ color: "var(--danger)", fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>
                    Deficit
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    {netNegative.map(r => formatName(r)).join(", ")}
                  </span>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── Financial Tab ──

function FinancialTab({ windowSize }: { windowSize: WindowSize }) {
  const data = useMonitoringData(windowSize);
  const snapshots = useMonitoringSnapshots(windowSize);

  if (data.ticksCaptured === 0) {
    return <div className="monitoring-empty">Collecting data... wait for ticks to arrive.</div>;
  }

  const totalIncome = data.totalSalesRevenue + data.totalTaxIncome + data.totalAmbassadorIncome;
  const totalExpenses = data.totalUpkeep + data.totalImportCosts + data.totalConstructionCosts + data.totalTaxPaid + data.totalAmbassadorExpense;
  const net = totalIncome - totalExpenses;

  // Sparkline for net P&L per tick
  const plSparkData = snapshots.map(
    (s) => (s.salesRevenue + s.taxCollected + s.ambassadorIncome) - (s.upkeepCharged + s.importCosts + s.constructionSpend + s.taxPaid + s.ambassadorExpense)
  );

  return (
    <div className="monitoring-tab-content">
      {/* Net P&L Hero */}
      <div className="monitoring-pl-hero">
        <div className="monitoring-pl-label">Net Profit / Loss</div>
        <div
          className="monitoring-pl-value mono"
          style={{ color: net >= 0 ? "var(--success)" : "var(--danger)" }}
        >
          {net >= 0 ? "+" : ""}{formatMoney(net)}
        </div>
        <div className="monitoring-pl-pertick mono" style={{ color: data.avgNetPerTick >= 0 ? "var(--success)" : "var(--danger)" }}>
          {data.avgNetPerTick >= 0 ? "+" : ""}{formatMoney(data.avgNetPerTick)}/tick
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
          <Sparkline data={plSparkData} color={net >= 0 ? "var(--success)" : "var(--danger)"} width={120} height={24} />
        </div>
      </div>

      {/* Income */}
      <div className="monitoring-section">
        <div className="monitoring-section-title" style={{ color: "var(--success)" }}>Income</div>
        <FinancialRow
          label="Sales Revenue"
          total={data.totalSalesRevenue}
          perTick={data.totalSalesRevenue / data.ticksCaptured}
          color="var(--success)"
        />
        <FinancialRow
          label="Tax Income"
          total={data.totalTaxIncome}
          perTick={data.totalTaxIncome / data.ticksCaptured}
          color="var(--success)"
        />
        {data.totalAmbassadorIncome > 0 && (
          <FinancialRow
            label="Ambassador Income"
            total={data.totalAmbassadorIncome}
            perTick={data.totalAmbassadorIncome / data.ticksCaptured}
            color="var(--success)"
          />
        )}
        <div className="monitoring-fin-total">
          <span>Total Income</span>
          <span className="mono" style={{ color: "var(--success)" }}>{formatMoney(totalIncome)}</span>
        </div>
      </div>

      {/* Expenses */}
      <div className="monitoring-section">
        <div className="monitoring-section-title" style={{ color: "var(--danger)" }}>Expenses</div>
        <FinancialRow
          label="Building Upkeep"
          total={data.buildingUpkeep * data.ticksCaptured}
          perTick={data.buildingUpkeep}
          color="var(--danger)"
        />
        <FinancialRow
          label="Worker Upkeep"
          total={data.workerUpkeep * data.ticksCaptured}
          perTick={data.workerUpkeep}
          color="var(--danger)"
        />
        <FinancialRow
          label="Import Costs"
          total={data.totalImportCosts}
          perTick={data.totalImportCosts / data.ticksCaptured}
          color="var(--danger)"
        />
        <FinancialRow
          label="Construction"
          total={data.totalConstructionCosts}
          perTick={data.totalConstructionCosts / data.ticksCaptured}
          color="var(--text-muted)"
        />
        {data.totalTaxPaid > 0 && (
          <FinancialRow
            label="Wealth Tax"
            total={data.totalTaxPaid}
            perTick={data.totalTaxPaid / data.ticksCaptured}
            color="var(--danger)"
          />
        )}
        {data.totalAmbassadorExpense > 0 && (
          <FinancialRow
            label="Ambassador Losses"
            total={data.totalAmbassadorExpense}
            perTick={data.totalAmbassadorExpense / data.ticksCaptured}
            color="var(--danger)"
          />
        )}
        <div className="monitoring-fin-total">
          <span>Total Expenses</span>
          <span className="mono" style={{ color: "var(--danger)" }}>{formatMoney(totalExpenses)}</span>
        </div>
      </div>

      {/* Revenue by Resource */}
      {Object.keys(data.totalProduction).length > 0 && (
        <div className="monitoring-section">
          <div className="monitoring-section-title" style={{ color: "var(--money)" }}>
            Sales by Resource
          </div>
          {(() => {
            // Collect sales by resource from snapshots
            const salesByRes: Partial<Record<ResourceType, number>> = {};
            for (const snap of snapshots) {
              for (const [res, amt] of Object.entries(snap.salesByResource)) {
                salesByRes[res as ResourceType] = (salesByRes[res as ResourceType] ?? 0) + (amt ?? 0);
              }
            }
            const entries = Object.entries(salesByRes)
              .filter(([, v]) => (v ?? 0) > 0)
              .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));

            if (entries.length === 0) {
              return <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>No sales yet</div>;
            }

            return entries.map(([res, total]) => (
              <div key={res} className="monitoring-fin-row">
                <span className="monitoring-fin-label">{formatName(res)}</span>
                <span className="monitoring-fin-pertick mono">{formatMoney((total ?? 0) / data.ticksCaptured)}/t</span>
                <span className="monitoring-fin-total-val mono" style={{ color: "var(--money)" }}>
                  {formatMoney(total ?? 0)}
                </span>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

function FinancialRow({ label, total, perTick, color }: {
  label: string;
  total: number;
  perTick: number;
  color: string;
}) {
  return (
    <div className="monitoring-fin-row">
      <span className="monitoring-fin-label">{label}</span>
      <span className="monitoring-fin-pertick mono">{formatMoney(perTick)}/t</span>
      <span className="monitoring-fin-total-val mono" style={{ color }}>{formatMoney(total)}</span>
    </div>
  );
}

// ── Main Panel ──

export function MonitoringPanel() {
  const toggleMonitoringPanel = useGameStore((s) => s.toggleMonitoringPanel);
  const [activeTab, setActiveTab] = useState<TabType>("production");
  const [windowSize, setWindowSize] = useState<WindowSize>(50);
  const data = useMonitoringData(windowSize);

  return (
    <div className="monitoring-panel">
      {/* Header */}
      <div className="monitoring-header">
        <span className="monitoring-title">Monitoring</span>
        <button className="modal-close" onClick={toggleMonitoringPanel}>&times;</button>
      </div>

      {/* Window selector + tick counter */}
      <div className="monitoring-controls">
        <div className="monitoring-window-selector">
          {([10, 50, 100] as WindowSize[]).map((w) => (
            <button
              key={w}
              className={`monitoring-window-btn${windowSize === w ? " active" : ""}`}
              onClick={() => setWindowSize(w)}
            >
              {w}t
            </button>
          ))}
        </div>
        <span className="monitoring-tick-count">
          {data.ticksCaptured} tick{data.ticksCaptured !== 1 ? "s" : ""} captured
        </span>
      </div>

      {/* Tabs */}
      <div className="monitoring-tab-bar">
        {(["production", "consumption", "financial"] as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`monitoring-tab-btn${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "production" ? "Production" : tab === "consumption" ? "Flow" : "Financial"}
          </button>
        ))}
      </div>

      {/* Tab content — inner scroll wrapper so scrollbar overlaps padding, not content */}
      <div className="monitoring-scroll-area">
        <div className="monitoring-scroll-inner">
          {activeTab === "production" && <ProductionTab windowSize={windowSize} />}
          {activeTab === "consumption" && <ConsumptionTab windowSize={windowSize} />}
          {activeTab === "financial" && <FinancialTab windowSize={windowSize} />}
        </div>
      </div>
    </div>
  );
}
