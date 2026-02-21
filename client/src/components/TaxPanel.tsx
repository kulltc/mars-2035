import React from "react";
import { TAX_PER_BUILDING } from "@mars-2035/shared";
import { useGameStore } from "../state/store.js";

export function TaxPanel() {
  const taxInfo = useGameStore((s) => s.taxInfo);
  const toggleTaxPanel = useGameStore((s) => s.toggleTaxPanel);

  if (!taxInfo) return null;

  const ratePercent = (taxInfo.taxRate * 100).toFixed(1);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) toggleTaxPanel(); }}
    >
      <div className="modal-content tax-panel">
        <div className="modal-header">
          <span className="modal-title">Tax Overview</span>
          <button className="modal-close" onClick={toggleTaxPanel}>&times;</button>
        </div>

        <div className="tax-rate-display">
          <span className="tax-rate-label">Tax Rate</span>
          <span className="tax-rate-value">{ratePercent}%</span>
        </div>

        {taxInfo.players.length > 0 ? (
          <table className="tax-player-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Buildings</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {taxInfo.players.map((p) => (
                <tr key={p.playerId}>
                  <td>{p.name}</td>
                  <td>{p.buildings}</td>
                  <td>{(p.share * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="tax-no-buildings">No territory buildings on this map</div>
        )}

        <div className="tax-explanation">
          Each territory building (Admin Outpost, Infra Tower, Research Station)
          adds {(TAX_PER_BUILDING * 100).toFixed(1)}% to the map's tax rate. Tax is levied on all market sales and
          distributed proportionally to territory building owners.
        </div>
      </div>
    </div>
  );
}
