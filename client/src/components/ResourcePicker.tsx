import React, { useEffect, useRef } from "react";
import { useGameStore } from "../state/store.js";
import { MATERIAL_TYPES, type RouteResource } from "@mars-2035/shared";
import { submitCommand } from "../api/client.js";
import { DISPLAY_NAMES } from "./MapCanvas.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { BottomSheet } from "./BottomSheet.js";

const ROUTE_DOT_COLORS: Record<string, string> = {
  money: "#ffd54f",
  steel: "#ff8a65", ferrite_alloy: "#ff7043", morphic_composite: "#f4511e",
  morphic_core: "#e64a19", servo_cortex: "#d84315", autonomic_matrix: "#bf360c",
  silicon: "#90caf9", thermoplast: "#ba68c8", lattice_fiber: "#ab47bc",
  toroidin_plate: "#9c27b0", muphrid_cell: "#8e24aa", paradox_weave: "#7b1fa2",
  polymer: "#ce93d8", cryite: "#4dd0e1", null_phase_gel: "#26c6da",
  xenotherm_crystal: "#00bcd4", absolute_lattice: "#00acc1", zero_point_shard: "#0097a7",
  rare_earth: "#ffcc80", psi_crystal: "#ec407a", esper_thread: "#e91e63",
  psychon_core: "#d81b60", peep_shield: "#c2185b", noetic_matrix: "#ad1457",
  carbon: "#a5d6a7",
};

export function ResourcePicker() {
  const isMobile = useIsMobile();
  const routePickerTarget = useGameStore((s) => s.routePickerTarget);
  const setRoutePickerTarget = useGameStore((s) => s.setRoutePickerTarget);
  const buildings = useGameStore((s) => s.buildings);
  const updateBuilding = useGameStore((s) => s.updateBuilding);
  const addNotification = useGameStore((s) => s.addNotification);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!routePickerTarget) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setRoutePickerTarget(null);
      }
    };
    // Delay to avoid catching the mouseup that opened us
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [routePickerTarget, setRoutePickerTarget]);

  if (!routePickerTarget) return null;

  const fromBuilding = buildings.find((b) => b.entity_id === routePickerTarget.fromBuildingId);
  const toBuilding = buildings.find((b) => b.entity_id === routePickerTarget.toBuildingId);
  if (!fromBuilding || !toBuilding) return null;

  const handleSelect = async (resource: RouteResource) => {
    // Optimistic update
    const newRoute = { resource, to_building_id: toBuilding.entity_id };
    const prevRoutes = fromBuilding.outgoing_routes ?? [];
    // If "all", remove existing specific routes to same destination
    const filteredRoutes = resource === "all"
      ? prevRoutes.filter((r) => !(r.to_building_id === toBuilding.entity_id && r.resource !== "money"))
      : prevRoutes;
    updateBuilding({
      ...fromBuilding,
      outgoing_routes: [...filteredRoutes, newRoute],
    });
    const label = resource === "all" ? "all materials" : resource.replace(/_/g, " ");
    addNotification(
      `Route: ${label} \u2192 ${DISPLAY_NAMES[toBuilding.class] ?? toBuilding.class}`,
      "success"
    );
    setRoutePickerTarget(null);

    const result = await submitCommand("configure_route", {
      from_building_id: fromBuilding.entity_id,
      to_building_id: toBuilding.entity_id,
      resource,
    });
    if (result.error) {
      addNotification(`Route failed: ${result.error}`, "error");
      // Revert
      updateBuilding({
        ...fromBuilding,
        outgoing_routes: prevRoutes,
      });
    }
  };

  const pickerContent = (
    <div
      ref={ref}
      className={isMobile ? "resource-picker mobile" : "resource-picker"}
      style={isMobile ? undefined : {
        left: routePickerTarget.screenX + 8,
        top: routePickerTarget.screenY - 8,
      }}
    >
      <div className="rp-title">Route resource</div>
      <div
        className="rp-item"
        onClick={() => handleSelect("all")}
      >
        <span className="rp-dot" style={{ background: "#ffffff" }} />
        all materials
      </div>
      {MATERIAL_TYPES.map((m) => (
        <div
          key={m}
          className="rp-item"
          onClick={() => handleSelect(m)}
        >
          <span className="rp-dot" style={{ background: ROUTE_DOT_COLORS[m] ?? "#888" }} />
          {m.replace(/_/g, " ")}
        </div>
      ))}
    </div>
  );

  if (isMobile) {
    return <BottomSheet onClose={() => setRoutePickerTarget(null)}>{pickerContent}</BottomSheet>;
  }
  return pickerContent;
}
