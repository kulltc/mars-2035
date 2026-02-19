import React from "react";
import { useGameStore } from "../state/store.js";

export function MapSelector() {
  const player = useGameStore((s) => s.player);
  const world = useGameStore((s) => s.world);
  const currentMap = useGameStore((s) => s.currentMap);
  const setCurrentMap = useGameStore((s) => s.setCurrentMap);
  const toggleMapSelector = useGameStore((s) => s.toggleMapSelector);

  if (!player || !world || !currentMap) return null;

  const cols = world.maps_per_district_x;
  const rows = world.maps_per_district_y;

  const hasUnlockNewMap = player.research?.includes("unlock_new_map");

  return (
    <div className="modal-overlay" onClick={toggleMapSelector}>
      <div className="map-selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">MAP SELECTOR</span>
          <button className="bd-close" onClick={toggleMapSelector}>&times;</button>
        </div>
        <div className="map-selector-hint">Navigate to a map to build</div>
        <div
          className="map-selector-grid"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: rows }, (_, my) =>
            Array.from({ length: cols }, (_, mx) => {
              const mapKey = `${currentMap.dx}:${currentMap.dy}:${mx}:${my}`;
              const hasOutpost = !!player.map_accounts?.[mapKey]?.admin_outpost_building_id;
              const isCurrent = mx === currentMap.mx && my === currentMap.my;
              const isHome = mx === 0 && my === 0;
              const canNavigate = hasOutpost || hasUnlockNewMap || isHome;

              return (
                <button
                  key={mapKey}
                  className={`map-cell ${isCurrent ? "current" : ""} ${hasOutpost ? "has-outpost" : ""} ${!canNavigate ? "locked" : ""}`}
                  onClick={() => {
                    if (!canNavigate) return;
                    setCurrentMap({ dx: currentMap.dx, dy: currentMap.dy, mx, my });
                    toggleMapSelector();
                  }}
                  disabled={!canNavigate}
                  title={`Map (${mx}, ${my})${hasOutpost ? " - Your outpost" : ""}${!canNavigate ? " - Locked" : ""}`}
                >
                  <span className="map-cell-coords">{mx},{my}</span>
                  {hasOutpost && <span className="map-cell-star">{"\u2605"}</span>}
                  {!canNavigate && <span className="map-cell-lock">{"\uD83D\uDD12"}</span>}
                </button>
              );
            })
          )}
        </div>
        <div className="map-selector-legend">
          {"\u2605"} = Your outpost &middot; Click a map to navigate
        </div>
      </div>
    </div>
  );
}
