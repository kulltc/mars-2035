import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "../state/store.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import {
  TICK_INTERVAL_MS, TILES_PER_MAP,
  totalInventory, BUILDING_DEFS, TERRITORY_RADIUS,
  type Building, type BuildingClass, type MaterialType,
  getTerritoryInfo, type TerritoryBuilding, toMapKey,
} from "@mars-2035/shared";
import { submitCommand } from "../api/client.js";

// ── Constants ──

const BASE_TILE = 36;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
const DRAG_THRESHOLD = 5;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

// ── Colors ──

const RESOURCE_COLORS: Record<string, string> = {
  steel: "#5c7080",
  silicon: "#3a5560",
  polymer: "#553a55",
  rare_earth: "#605530",
  carbon: "#383838",
};

const BUILDING_COLORS: Record<string, string> = {
  admin_outpost: "#4fc3f7",
  infra_tower: "#26c6da",
  research_lab: "#7e57c2",
  research_station: "#ab47bc",
  mine: "#ffb74d",
  port: "#81c784",
  smelter: "#e65100", magnetic_press: "#d84315", morphic_forge: "#bf360c",
  servo_assembly: "#a52714", replication_chamber: "#8b1a1a",
  polymer_kiln: "#7b1fa2", crystal_grower: "#6a1b9a", toroidin_foundry: "#4a148c",
  muphrid_lab: "#38006b", solar_loom: "#2c0054",
  cryo_distillery: "#00838f", phase_condenser: "#006064", xenotherm_reactor: "#004d40",
  deep_freeze_synth: "#00363a", iceworld_refinery: "#002626",
  resonance_tuner: "#ad1457", neural_loom: "#880e4f", psychophysical_amp: "#6a0037",
  dampening_forge: "#560027", consciousness_engine: "#3e001f",
  quantum_relay: "#64b5f6",
};

const BUILDING_ICONS: Record<string, string> = {
  admin_outpost: "⌂", infra_tower: "△", research_lab: "⚗", research_station: "◉",
  mine: "⛏", port: "$",
  smelter: "♨", magnetic_press: "⌬", morphic_forge: "⚒",
  servo_assembly: "⚙", replication_chamber: "⧉",
  polymer_kiln: "◌", crystal_grower: "✧", toroidin_foundry: "⊚",
  muphrid_lab: "⚛", solar_loom: "☼",
  cryo_distillery: "❄", phase_condenser: "◈", xenotherm_reactor: "☢",
  deep_freeze_synth: "❆", iceworld_refinery: "⬡",
  resonance_tuner: "♬", neural_loom: "∿", psychophysical_amp: "Ψ",
  dampening_forge: "⊟", consciousness_engine: "◎",
  quantum_relay: "⬢",
};

export const DISPLAY_NAMES: Record<string, string> = {
  admin_outpost: "Admin Outpost", infra_tower: "Infra Tower", research_lab: "Research Lab", research_station: "Research Station",
  mine: "Mine", port: "Trade Center",
  smelter: "Smelter", magnetic_press: "Magnetic Press", morphic_forge: "Morphic Forge",
  servo_assembly: "Servo Assembly", replication_chamber: "Replication Chamber",
  polymer_kiln: "Polymer Kiln", crystal_grower: "Crystal Grower", toroidin_foundry: "Toroidin Foundry",
  muphrid_lab: "Muphrid Lab", solar_loom: "Solar Loom",
  cryo_distillery: "Cryo Distillery", phase_condenser: "Phase Condenser", xenotherm_reactor: "Xenotherm Reactor",
  deep_freeze_synth: "Deep-Freeze Synth", iceworld_refinery: "Iceworld Refinery",
  resonance_tuner: "Resonance Tuner", neural_loom: "Neural Loom", psychophysical_amp: "Psychophysical Amp",
  dampening_forge: "Dampening Forge", consciousness_engine: "Consciousness Engine",
  quantum_relay: "Quantum Relay",
};

function isInForeignTerritory(
  territoryBuildings: TerritoryBuilding[],
  tx: number,
  ty: number,
  playerId: string,
): boolean {
  return territoryBuildings.some((b) => {
    if (b.owner_id === playerId) return false;
    const radius = TERRITORY_RADIUS[b.class];
    if (radius == null) return false;
    const dist = Math.abs(tx - b.x) + Math.abs(ty - b.y);
    return dist <= radius;
  });
}

function getRouteColor(resource: string): string {
  if (resource === "all") return "#ffffff";
  if (resource === "money") return "#ffd54f";
  const morphic = ["steel", "ferrite_alloy", "morphic_composite", "morphic_core", "servo_cortex", "autonomic_matrix"];
  const toroidin = ["silicon", "thermoplast", "lattice_fiber", "toroidin_plate", "muphrid_cell", "paradox_weave"];
  const cryo = ["polymer", "cryite", "null_phase_gel", "xenotherm_crystal", "absolute_lattice", "zero_point_shard"];
  const psycho = ["rare_earth", "psi_crystal", "esper_thread", "psychon_core", "peep_shield", "noetic_matrix"];
  if (morphic.includes(resource)) return "#ff7043";
  if (toroidin.includes(resource)) return "#ba68c8";
  if (cryo.includes(resource)) return "#4dd0e1";
  if (psycho.includes(resource)) return "#f48fb1";
  return "#a5d6a7"; // carbon
}

function formatMaterialName(mat: string): string {
  if (mat === "money") return "$";
  return mat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBuildCost(cls: string): string {
  const def = BUILDING_DEFS[cls as BuildingClass];
  if (!def) return "Unknown";
  const entries = Object.entries(def.cost).filter(([, v]) => v && v > 0);
  if (entries.length === 0) return "Free";
  return entries
    .map(([mat, amt]) => (mat === "money" ? `$${amt}` : `${amt} ${formatMaterialName(mat)}`))
    .join(", ");
}

// ── Tooltip state type ──

interface TooltipData {
  screenX: number;
  screenY: number;
  building: Building;
  isOwn: boolean;
}

// ── Mouse state machine ──

type MouseAction =
  | { type: "idle" }
  | { type: "potential"; startX: number; startY: number; onBuildingId: string | null }
  | { type: "panning"; startX: number; startY: number; startCamX: number; startCamY: number }
  | { type: "routing"; fromBuildingId: string }
  | { type: "area"; startTileX: number; startTileY: number };

// ── Touch state machine ──

type TouchMode =
  | "idle"
  | "potential-tap"
  | "panning"
  | "pinching"
  | "long-press"
  | "routing"
  | "area";

export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store refs for render loop
  const storeRef = useRef(useGameStore.getState());
  useEffect(() => {
    const unsub = useGameStore.subscribe((state) => { storeRef.current = state; });
    return unsub;
  }, []);

  // Camera state (local — x,y = top-left world tile)
  const cameraRef = useRef({ x: 130, y: 130, zoom: 1.0 });
  const [, forceRender] = useState(0);

  // Mouse interaction
  const mouseActionRef = useRef<MouseAction>({ type: "idle" });
  const mousePosRef = useRef({ x: 0, y: 0 }); // current screen mouse pos
  const routeDragEndRef = useRef<{ x: number; y: number } | null>(null);

  // Tooltip state (React-rendered overlay)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Center on admin outpost once
  const centeredRef = useRef(false);

  // ── Coordinate helpers ──

  const tileSize = () => BASE_TILE * cameraRef.current.zoom;

  const worldToScreen = useCallback((wx: number, wy: number) => ({
    x: (wx - cameraRef.current.x) * tileSize(),
    y: (wy - cameraRef.current.y) * tileSize(),
  }), []);

  const screenToWorld = useCallback((sx: number, sy: number) => ({
    x: sx / tileSize() + cameraRef.current.x,
    y: sy / tileSize() + cameraRef.current.y,
  }), []);

  const screenToTile = useCallback((sx: number, sy: number) => {
    const w = screenToWorld(sx, sy);
    return { x: Math.floor(w.x), y: Math.floor(w.y) };
  }, [screenToWorld]);

  // ── Canvas resize ──

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
    };

    const obs = new ResizeObserver(resize);
    obs.observe(container);
    resize();
    return () => obs.disconnect();
  }, []);

  // ── Render loop ──

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animId: number;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cam = cameraRef.current;
      const ts = BASE_TILE * cam.zoom;
      const state = storeRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Visible tile range
      const minTX = Math.floor(cam.x);
      const maxTX = Math.ceil(cam.x + w / ts);
      const minTY = Math.floor(cam.y);
      const maxTY = Math.ceil(cam.y + h / ts);

      // Build index
      const buildingByTile = new Map<string, Building>();
      for (const b of state.buildings) {
        buildingByTile.set(`${b.location.x}:${b.location.y}`, b);
      }

      // Center on admin outpost once
      if (!centeredRef.current && state.player && state.buildings.length > 0) {
        const admin = state.buildings.find(
          (b) => b.class === "admin_outpost" && b.owner_id === state.player!.entity_id
        );
        if (admin) {
          cameraRef.current.x = admin.location.x - w / ts / 2;
          cameraRef.current.y = admin.location.y - h / ts / 2;
        }
        centeredRef.current = true;
      }

      // ── Draw tiles ──
      for (let ty = minTY; ty <= maxTY; ty++) {
        for (let tx = minTX; tx <= maxTX; tx++) {
          if (tx < 0 || ty < 0 || tx >= TILES_PER_MAP || ty >= TILES_PER_MAP) continue;
          const sx = (tx - cam.x) * ts;
          const sy = (ty - cam.y) * ts;
          const tile = state.tiles.get(`${tx}:${ty}`);

          // Background
          let bg = "#1e1008";
          if (tile?.resource) {
            bg = RESOURCE_COLORS[tile.resource.type] ?? bg;
          }
          ctx.fillStyle = bg;
          ctx.fillRect(sx, sy, ts, ts);

          // Grid
          ctx.strokeStyle = "#2a180e";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
        }
      }

      // ── Territory overlay ──
      const playerId = state.player?.entity_id;
      if (playerId) {
        const currentMapKey = state.currentMap
          ? toMapKey(state.currentMap.dx, state.currentMap.dy, state.currentMap.mx, state.currentMap.my)
          : null;
        const hasAdminOutpostOnCurrentMap = currentMapKey
          ? Boolean(state.player?.map_accounts[currentMapKey]?.admin_outpost_building_id)
          : false;
        const showForeignForInitialOutpost =
          state.buildMode === "admin_outpost" && !hasAdminOutpostOnCurrentMap;

        // Collect territory buildings on this map
        const terBuildings: TerritoryBuilding[] = [];
        for (const b of state.buildings) {
          if (TERRITORY_RADIUS[b.class] != null) {
            terBuildings.push({ x: b.location.x, y: b.location.y, class: b.class, owner_id: b.owner_id });
          }
        }

        if (terBuildings.length > 0) {
          for (let ty = minTY; ty <= maxTY; ty++) {
            for (let tx = minTX; tx <= maxTX; tx++) {
              if (tx < 0 || ty < 0 || tx >= TILES_PER_MAP || ty >= TILES_PER_MAP) continue;
              const info = getTerritoryInfo(terBuildings, tx, ty, playerId);
              const inForeignTerritory = showForeignForInitialOutpost
                ? isInForeignTerritory(terBuildings, tx, ty, playerId)
                : false;
              if (!info.inTerritory && !inForeignTerritory) continue;

              const sx = (tx - cam.x) * ts;
              const sy = (ty - cam.y) * ts;
              const isForeignOnly = inForeignTerritory && !info.inTerritory;
              ctx.fillStyle = isForeignOnly
                ? "rgba(244, 67, 54, 0.10)"
                : info.contested
                  ? "rgba(255, 183, 77, 0.10)"
                  : "rgba(79, 195, 247, 0.08)";
              ctx.fillRect(sx, sy, ts, ts);

              // Border edges: draw dashed line on sides that border non-territory
              ctx.strokeStyle = isForeignOnly
                ? "rgba(244, 67, 54, 0.30)"
                : info.contested
                  ? "rgba(255, 183, 77, 0.25)"
                  : "rgba(79, 195, 247, 0.18)";
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);

              // Check adjacent tiles
              const left = tx > 0 && (isForeignOnly
                ? isInForeignTerritory(terBuildings, tx - 1, ty, playerId)
                : getTerritoryInfo(terBuildings, tx - 1, ty, playerId).inTerritory);
              const right = tx < TILES_PER_MAP - 1 && (isForeignOnly
                ? isInForeignTerritory(terBuildings, tx + 1, ty, playerId)
                : getTerritoryInfo(terBuildings, tx + 1, ty, playerId).inTerritory);
              const top = ty > 0 && (isForeignOnly
                ? isInForeignTerritory(terBuildings, tx, ty - 1, playerId)
                : getTerritoryInfo(terBuildings, tx, ty - 1, playerId).inTerritory);
              const bottom = ty < TILES_PER_MAP - 1 && (isForeignOnly
                ? isInForeignTerritory(terBuildings, tx, ty + 1, playerId)
                : getTerritoryInfo(terBuildings, tx, ty + 1, playerId).inTerritory);

              if (!left) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + ts); ctx.stroke(); }
              if (!right) { ctx.beginPath(); ctx.moveTo(sx + ts, sy); ctx.lineTo(sx + ts, sy + ts); ctx.stroke(); }
              if (!top) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + ts, sy); ctx.stroke(); }
              if (!bottom) { ctx.beginPath(); ctx.moveTo(sx, sy + ts); ctx.lineTo(sx + ts, sy + ts); ctx.stroke(); }

              ctx.setLineDash([]);
            }
          }
        }
      }

      // ── Build-mode cursor validation & territory preview ──
      if (state.buildMode && playerId) {
        const bClass = state.buildMode as BuildingClass;
        const currentMapKey = state.currentMap
          ? toMapKey(state.currentMap.dx, state.currentMap.dy, state.currentMap.mx, state.currentMap.my)
          : null;
        const hasAdminOutpostOnCurrentMap = currentMapKey
          ? Boolean(state.player?.map_accounts[currentMapKey]?.admin_outpost_building_id)
          : false;
        const mouseScreen = mousePosRef.current;
        const mWorld = { x: mouseScreen.x / ts + cam.x, y: mouseScreen.y / ts + cam.y };
        const hoverTX = Math.floor(mWorld.x);
        const hoverTY = Math.floor(mWorld.y);

        if (hoverTX >= 0 && hoverTY >= 0 && hoverTX < TILES_PER_MAP && hoverTY < TILES_PER_MAP) {
          // Collect territory buildings (reuse from overlay if available)
          const bTerBuildings: TerritoryBuilding[] = [];
          for (const b of state.buildings) {
            if (TERRITORY_RADIUS[b.class] != null) {
              bTerBuildings.push({ x: b.location.x, y: b.location.y, class: b.class, owner_id: b.owner_id });
            }
          }

          // Determine if placement is valid
          let canPlace = true;
          const hoverTile = state.tiles.get(`${hoverTX}:${hoverTY}`);

          // Tile already occupied
          if (buildingByTile.has(`${hoverTX}:${hoverTY}`)) {
            canPlace = false;
          }

          // Mine must be on resource tile
          if (bClass === "mine" && !hoverTile?.resource) {
            canPlace = false;
          }

          // Territory checks (skip for admin_outpost and research_station)
          if (bClass !== "admin_outpost" && bClass !== "research_station" && bTerBuildings.length > 0) {
            const info = getTerritoryInfo(bTerBuildings, hoverTX, hoverTY, playerId);
            if (!info.inTerritory) {
              canPlace = false;
            }
            // Territory buildings need full territory and no contest
            if (TERRITORY_RADIUS[bClass] != null) {
              if (!info.fullTerritory || info.contested) {
                canPlace = false;
              }
            }
          }

          // First admin outpost cannot be placed in other players' territory
          if (bClass === "admin_outpost" && !hasAdminOutpostOnCurrentMap) {
            if (isInForeignTerritory(bTerBuildings, hoverTX, hoverTY, playerId)) {
              canPlace = false;
            }
          }

          // Draw cursor tile tint
          const csx = (hoverTX - cam.x) * ts;
          const csy = (hoverTY - cam.y) * ts;
          ctx.fillStyle = canPlace
            ? "rgba(79, 195, 247, 0.2)"
            : "rgba(244, 67, 54, 0.25)";
          ctx.fillRect(csx, csy, ts, ts);
          ctx.strokeStyle = canPlace ? "#4fc3f7" : "#f44336";
          ctx.lineWidth = 2;
          ctx.strokeRect(csx + 1, csy + 1, ts - 2, ts - 2);

          // Territory influence diamond preview for territory buildings
          const radius = TERRITORY_RADIUS[bClass];
          if (radius != null) {
            ctx.fillStyle = canPlace
              ? "rgba(79, 195, 247, 0.12)"
              : "rgba(244, 67, 54, 0.08)";
            for (let dy = -radius; dy <= radius; dy++) {
              const maxDx = radius - Math.abs(dy);
              for (let dx = -maxDx; dx <= maxDx; dx++) {
                if (dx === 0 && dy === 0) continue; // already drew center
                const px = hoverTX + dx;
                const py = hoverTY + dy;
                if (px < 0 || py < 0 || px >= TILES_PER_MAP || py >= TILES_PER_MAP) continue;
                const psx = (px - cam.x) * ts;
                const psy = (py - cam.y) * ts;
                ctx.fillRect(psx, psy, ts, ts);
              }
            }
          }
        }
      }

      // ── Draw route arrows (all buildings) ──
      const selectedBuildingId = state.selectedTile
        ? buildingByTile.get(`${state.selectedTile.x}:${state.selectedTile.y}`)?.entity_id
        : undefined;
      const now = Date.now();
      const dashOffset = -(now % 2000) / 2000 * 24;

      // Collect routes
      type RouteInfo = { from: Building; to: Building; resource: string; related: boolean };
      const routes: RouteInfo[] = [];
      for (const b of state.buildings) {
        if (!b.outgoing_routes) continue;
        for (const route of b.outgoing_routes) {
          const dest = state.buildings.find((d) => d.entity_id === route.to_building_id);
          if (!dest) continue;
          const related = b.entity_id === selectedBuildingId || dest.entity_id === selectedBuildingId;
          routes.push({ from: b, to: dest, resource: route.resource, related });
        }
      }

      // Non-selected routes (subtle)
      for (const r of routes) {
        if (r.related) continue;
        drawRoute(ctx, r, ts, cam, 0.12, dashOffset);
      }
      // Selected routes (bold)
      for (const r of routes) {
        if (!r.related) continue;
        drawRoute(ctx, r, ts, cam, 0.8, dashOffset);
      }

      // ── Draw buildings ──
      for (let ty = minTY; ty <= maxTY; ty++) {
        for (let tx = minTX; tx <= maxTX; tx++) {
          const b = buildingByTile.get(`${tx}:${ty}`);
          if (!b) continue;
          const sx = (tx - cam.x) * ts;
          const sy = (ty - cam.y) * ts;
          const isOwn = b.owner_id === playerId;
          const isSelected = state.selectedTile?.x === tx && state.selectedTile?.y === ty;
          drawBuilding(ctx, b, sx, sy, ts, isOwn, isSelected, now);
        }
      }

      // ── Draw pending (optimistic) buildings ──
      for (const pb of state.pendingBuildings) {
        const sx = (pb.x - cam.x) * ts;
        const sy = (pb.y - cam.y) * ts;
        const alpha = 0.3 + 0.2 * Math.sin(now / 300);
        ctx.globalAlpha = alpha;
        const color = BUILDING_COLORS[pb.buildingClass] ?? "#4fc3f7";
        const pad = ts * 0.12;
        ctx.fillStyle = color;
        roundRect(ctx, sx + pad, sy + pad, ts - pad * 2, ts - pad * 2, 4);
        ctx.fill();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "#ffb74d";
        ctx.lineWidth = 1.5;
        roundRect(ctx, sx + pad, sy + pad, ts - pad * 2, ts - pad * 2, 4);
        ctx.stroke();
        ctx.setLineDash([]);
        // Icon
        const icon = BUILDING_ICONS[pb.buildingClass] ?? "?";
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${ts * 0.35}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(icon, sx + ts / 2, sy + ts / 2);
        ctx.globalAlpha = 1;
      }

      // ── Draw workers ──
      const workerAlpha = state.workerUpdateAt > 0
        ? Math.min(1, (now - state.workerUpdateAt) / TICK_INTERVAL_MS)
        : 1;

      // Compute positions with overlap spreading
      const workerPositions: Array<{ w: typeof state.workers[0]; wx: number; wy: number }> = [];
      for (const wk of state.workers) {
        const isMoving = wk.state === "moving_to_pickup" || wk.state === "moving_to_dropoff" ||
                         wk.state === "returning_to_base" || wk.state === "moving_to_construct";
        const prev = state.workerPrevPositions.get(wk.entity_id);
        let wx = wk.x, wy = wk.y;
        if (isMoving && prev) {
          wx = lerp(prev.x, wk.x, workerAlpha);
          wy = lerp(prev.y, wk.y, workerAlpha);
        }
        workerPositions.push({ w: wk, wx, wy });
      }

      // Group by tile for spread
      const tileGroups = new Map<string, number>();
      for (const wp of workerPositions) {
        const tk = `${Math.round(wp.wx)}:${Math.round(wp.wy)}`;
        tileGroups.set(tk, (tileGroups.get(tk) ?? 0) + 1);
      }
      const tileIndex = new Map<string, number>();

      for (const { w: wk, wx, wy } of workerPositions) {
        const vsx = (wx - cam.x) * ts + ts / 2;
        const vsy = (wy - cam.y) * ts + ts / 2;
        if (vsx < -ts || vsx > w + ts || vsy < -ts || vsy > h + ts) continue;

        let cx = vsx, cy = vsy;
        const tk = `${Math.round(wx)}:${Math.round(wy)}`;
        const count = tileGroups.get(tk) ?? 1;
        if (count > 1) {
          const idx = tileIndex.get(tk) ?? 0;
          tileIndex.set(tk, idx + 1);
          const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
          const spread = Math.min(ts * 0.3, 3 + count * 2);
          cx += Math.cos(angle) * spread;
          cy += Math.sin(angle) * spread;
        }

        const carrying = totalInventory(wk.inventory) > 0 || (wk.inventory.money ?? 0) > 0;
        const isInactive = wk.worker_status === "inactive";
        const isSelected = wk.entity_id === state.selectedWorkerId;
        const radius = Math.max(3, ts * 0.12);

        if (isSelected) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = "#4fc3f7";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = isInactive ? "#555" : carrying ? "#ffd54f" : "#bbb";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#4fc3f7" : "rgba(0,0,0,0.6)";
        ctx.lineWidth = isSelected ? 1.5 : 1;
        ctx.stroke();
      }

      // ── Selection highlight ──
      if (state.selectedTile) {
        const sx = (state.selectedTile.x - cam.x) * ts;
        const sy = (state.selectedTile.y - cam.y) * ts;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
        ctx.strokeStyle = "rgba(79,195,247,0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 1, sy - 1, ts + 2, ts + 2);
      }

      // ── Route drag line ──
      const mAction = mouseActionRef.current;
      if (mAction.type === "routing") {
        const fromB = state.buildings.find((b) => b.entity_id === mAction.fromBuildingId);
        if (fromB) {
          const fsx = (fromB.location.x - cam.x) * ts + ts / 2;
          const fsy = (fromB.location.y - cam.y) * ts + ts / 2;
          const end = routeDragEndRef.current;
          if (end) {
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = "#4fc3f7";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(fsx, fsy);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Highlight target building under cursor
            const tgt = screenToTile(end.x, end.y);
            const tgtB = buildingByTile.get(`${tgt.x}:${tgt.y}`);
            if (tgtB && tgtB.entity_id !== mAction.fromBuildingId && tgtB.owner_id === playerId) {
              const tsx2 = (tgt.x - cam.x) * ts;
              const tsy2 = (tgt.y - cam.y) * ts;
              ctx.strokeStyle = "#4fc3f7";
              ctx.lineWidth = 2;
              ctx.strokeRect(tsx2, tsy2, ts, ts);
              ctx.fillStyle = "rgba(79,195,247,0.15)";
              ctx.fillRect(tsx2, tsy2, ts, ts);
            }
          }
        }
      }

      // ── Area draw rectangle ──
      if (mAction.type === "area") {
        const end = routeDragEndRef.current;
        if (end) {
          const startSx = (mAction.startTileX - cam.x) * ts;
          const startSy = (mAction.startTileY - cam.y) * ts;
          const endTile = screenToTile(end.x, end.y);
          const endSx = (endTile.x + 1 - cam.x) * ts;
          const endSy = (endTile.y + 1 - cam.y) * ts;
          const rx = Math.min(startSx, endSx);
          const ry = Math.min(startSy, endSy);
          const rw = Math.abs(endSx - startSx);
          const rh = Math.abs(endSy - startSy);
          ctx.fillStyle = "rgba(79,195,247,0.1)";
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeStyle = "#4fc3f7";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.setLineDash([]);
        }
      }

      // ── Worker saved activity area ──
      if (state.selectedWorkerId) {
        const sw = state.workers.find((wk) => wk.entity_id === state.selectedWorkerId);
        if (sw) {
          const swFilter = state.pendingWorkerFilter?.workerId === sw.entity_id
            ? state.pendingWorkerFilter.filter
            : sw.task_filter;
          if (swFilter?.area) {
            const a = swFilter.area;
            const ax = (a.x1 - cam.x) * ts;
            const ay = (a.y1 - cam.y) * ts;
            const aw = (a.x2 - a.x1 + 1) * ts;
            const ah = (a.y2 - a.y1 + 1) * ts;
            ctx.strokeStyle = "#ef5350";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(ax, ay, aw, ah);
            ctx.setLineDash([]);
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mouse handlers ──

  const getBuildingAt = useCallback((sx: number, sy: number): Building | null => {
    const state = storeRef.current;
    const tile = screenToTile(sx, sy);
    return state.buildings.find(
      (b) => b.location.x === tile.x && b.location.y === tile.y
    ) ?? null;
  }, [screenToTile]);

  const getWorkerAt = useCallback((sx: number, sy: number): string | null => {
    const state = storeRef.current;
    const cam = cameraRef.current;
    const ts = BASE_TILE * cam.zoom;
    const workerAlpha = state.workerUpdateAt > 0
      ? Math.min(1, (Date.now() - state.workerUpdateAt) / TICK_INTERVAL_MS)
      : 1;
    const hitR = Math.max(8, ts * 0.2);

    for (const wk of state.workers) {
      const isMoving = wk.state === "moving_to_pickup" || wk.state === "moving_to_dropoff" ||
                       wk.state === "returning_to_base" || wk.state === "moving_to_construct";
      const prev = state.workerPrevPositions.get(wk.entity_id);
      let wx = wk.x, wy = wk.y;
      if (isMoving && prev) {
        wx = lerp(prev.x, wk.x, workerAlpha);
        wy = lerp(prev.y, wk.y, workerAlpha);
      }
      const wsx = (wx - cam.x) * ts + ts / 2;
      const wsy = (wy - cam.y) * ts + ts / 2;
      const dist = Math.hypot(sx - wsx, sy - wsy);
      if (dist < hitR) return wk.entity_id;
    }
    return null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2 || e.button === 1) {
      // Right/middle click = always pan
      mouseActionRef.current = {
        type: "panning",
        startX: e.nativeEvent.offsetX,
        startY: e.nativeEvent.offsetY,
        startCamX: cameraRef.current.x,
        startCamY: cameraRef.current.y,
      };
      return;
    }
    const state = storeRef.current;
    const sx = e.nativeEvent.offsetX;
    const sy = e.nativeEvent.offsetY;

    // Area draw mode
    if (state.areaDrawMode) {
      const tile = screenToTile(sx, sy);
      mouseActionRef.current = { type: "area", startTileX: tile.x, startTileY: tile.y };
      routeDragEndRef.current = { x: sx, y: sy };
      return;
    }

    // Check for building under cursor (for potential route drag)
    const building = getBuildingAt(sx, sy);
    const onOwn = building && building.owner_id === state.player?.entity_id;

    mouseActionRef.current = {
      type: "potential",
      startX: sx,
      startY: sy,
      onBuildingId: onOwn ? building.entity_id : null,
    };
    mousePosRef.current = { x: sx, y: sy };
  }, [screenToTile, getBuildingAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const sx = e.nativeEvent.offsetX;
    const sy = e.nativeEvent.offsetY;
    mousePosRef.current = { x: sx, y: sy };
    const action = mouseActionRef.current;

    if (action.type === "potential") {
      const dist = Math.hypot(sx - action.startX, sy - action.startY);
      if (dist > DRAG_THRESHOLD) {
        if (action.onBuildingId && !storeRef.current.buildMode) {
          // Start route drag
          mouseActionRef.current = { type: "routing", fromBuildingId: action.onBuildingId };
          routeDragEndRef.current = { x: sx, y: sy };
        } else {
          // Start panning
          mouseActionRef.current = {
            type: "panning",
            startX: action.startX,
            startY: action.startY,
            startCamX: cameraRef.current.x,
            startCamY: cameraRef.current.y,
          };
        }
      }
      return;
    }

    if (action.type === "panning") {
      const ts = tileSize();
      const dx = sx - action.startX;
      const dy = sy - action.startY;
      cameraRef.current.x = action.startCamX - dx / ts;
      cameraRef.current.y = action.startCamY - dy / ts;
      return;
    }

    if (action.type === "routing" || action.type === "area") {
      routeDragEndRef.current = { x: sx, y: sy };
      return;
    }

    // Hover tooltip (only when idle)
    if (action.type === "idle") {
      clearTimeout(tooltipTimeoutRef.current);
      const building = getBuildingAt(sx, sy);
      if (building) {
        tooltipTimeoutRef.current = setTimeout(() => {
          const state = storeRef.current;
          setTooltip({
            screenX: sx,
            screenY: sy,
            building,
            isOwn: building.owner_id === state.player?.entity_id,
          });
        }, 200);
      } else {
        setTooltip(null);
      }
    }
  }, [getBuildingAt]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const sx = e.nativeEvent.offsetX;
    const sy = e.nativeEvent.offsetY;
    const action = mouseActionRef.current;
    const state = storeRef.current;

    if (action.type === "potential") {
      // This was a click (no drag)
      setTooltip(null);

      if (state.buildMode && state.player && state.currentMap) {
        // Place building
        const tile = screenToTile(sx, sy);
        if (tile.x >= 0 && tile.y >= 0 && tile.x < TILES_PER_MAP && tile.y < TILES_PER_MAP) {
          state.addPendingBuilding({
            buildingClass: state.buildMode as BuildingClass,
            x: tile.x,
            y: tile.y,
          });
          submitCommand("place_building", {
            building_class: state.buildMode,
            location: {
              dx: state.currentMap.dx, dy: state.currentMap.dy,
              mx: state.currentMap.mx, my: state.currentMap.my,
              x: tile.x, y: tile.y,
            },
          }).then((res) => {
            if (res.error) {
              state.addNotification(`Build failed: ${res.error}`, "error");
              useGameStore.setState((s) => ({
                pendingBuildings: s.pendingBuildings.filter(
                  (pb) => !(pb.x === tile.x && pb.y === tile.y)
                ),
              }));
            } else {
              state.addNotification(
                `${DISPLAY_NAMES[state.buildMode!] ?? state.buildMode} placed at (${tile.x}, ${tile.y})`,
                "success"
              );
            }
          });
          state.setBuildMode(null);
        }
      } else {
        // Check for worker click first
        const workerId = getWorkerAt(sx, sy);
        if (workerId) {
          state.setSelectedWorkerId(workerId);
          state.setSelectedTile(null);
        } else {
          // Select tile
          const tile = screenToTile(sx, sy);
          state.setSelectedTile({ x: tile.x, y: tile.y });
          state.setSelectedWorkerId(null);
        }
        state.setRoutePickerTarget(null);
      }
    }

    if (action.type === "routing") {
      // Check if ended on a valid target building
      const tile = screenToTile(sx, sy);
      const targetBuilding = state.buildings.find(
        (b) => b.location.x === tile.x && b.location.y === tile.y
      );
      if (
        targetBuilding &&
        targetBuilding.entity_id !== action.fromBuildingId &&
        targetBuilding.owner_id === state.player?.entity_id
      ) {
        // Show resource picker at this position
        state.setRoutePickerTarget({
          fromBuildingId: action.fromBuildingId,
          toBuildingId: targetBuilding.entity_id,
          screenX: sx,
          screenY: sy,
        });
      }
      routeDragEndRef.current = null;
    }

    if (action.type === "area") {
      const endTile = screenToTile(sx, sy);
      const x1 = Math.min(action.startTileX, endTile.x);
      const y1 = Math.min(action.startTileY, endTile.y);
      const x2 = Math.max(action.startTileX, endTile.x);
      const y2 = Math.max(action.startTileY, endTile.y);

      const workerId = state.areaDrawMode;
      if (workerId) {
        const worker = state.workers.find((wk) => wk.entity_id === workerId);
        if (worker) {
          const existingFilter = (state.pendingWorkerFilter?.workerId === workerId
            ? state.pendingWorkerFilter.filter
            : worker.task_filter) ?? {};
          const newFilter = { ...existingFilter, area: { x1, y1, x2, y2 } };
          state.setPendingWorkerFilter(workerId, newFilter);
          submitCommand("configure_worker", {
            worker_id: workerId,
            task_filter: newFilter,
          });
        }
      }
      state.setAreaDrawMode(null);
      routeDragEndRef.current = null;
    }

    mouseActionRef.current = { type: "idle" };
  }, [screenToTile, getWorkerAt]);

  // Wheel zoom via native listener (non-passive, so preventDefault works)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      const sx = e.offsetX;
      const sy = e.offsetY;
      const oldTs = BASE_TILE * cam.zoom;
      const worldX = sx / oldTs + cam.x;
      const worldY = sy / oldTs + cam.y;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * delta));
      const newTs = BASE_TILE * cam.zoom;
      cam.x = worldX - sx / newTs;
      cam.y = worldY - sy / newTs;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Camera target (locate worker)
  const cameraTarget = useGameStore((s) => s.cameraTarget);
  const setCameraTarget = useGameStore((s) => s.setCameraTarget);
  useEffect(() => {
    if (!cameraTarget || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const ts = BASE_TILE * cameraRef.current.zoom;
    cameraRef.current.x = cameraTarget.x - w / ts / 2 + 0.5;
    cameraRef.current.y = cameraTarget.y - h / ts / 2 + 0.5;
    setCameraTarget(null);
  }, [cameraTarget, setCameraTarget]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const state = storeRef.current;
      if (e.key === "Escape") {
        state.setBuildMode(null);
        state.setAreaDrawMode(null);
        state.setRoutePickerTarget(null);
        mouseActionRef.current = { type: "idle" };
        routeDragEndRef.current = null;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ── Touch handlers ──

  const touchModeRef = useRef<TouchMode>("idle");
  const touchStartRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const pinchStartDistRef = useRef(0);
  const pinchStartZoomRef = useRef(1);
  const pinchMidRef = useRef({ x: 0, y: 0 });
  const TOUCH_DRAG_THRESHOLD = 10;
  const LONG_PRESS_MS = 500;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getOffset = (t: Touch) => {
      const rect = canvas.getBoundingClientRect();
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    };

    const pinchDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touches = e.touches;

      if (touches.length === 2) {
        // Start pinch
        clearTimeout(longPressTimerRef.current);
        touchModeRef.current = "pinching";
        pinchStartDistRef.current = pinchDist(touches[0], touches[1]);
        pinchStartZoomRef.current = cameraRef.current.zoom;
        const rect = canvas.getBoundingClientRect();
        pinchMidRef.current = {
          x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
          y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
        };
        return;
      }

      if (touches.length === 1) {
        const pos = getOffset(touches[0]);
        touchStartRef.current = { x: pos.x, y: pos.y, time: Date.now() };
        touchModeRef.current = "potential-tap";

        const state = storeRef.current;

        // Area draw mode
        if (state.areaDrawMode) {
          const tile = screenToTile(pos.x, pos.y);
          mouseActionRef.current = { type: "area", startTileX: tile.x, startTileY: tile.y };
          routeDragEndRef.current = { x: pos.x, y: pos.y };
          touchModeRef.current = "area";
          return;
        }

        // Long press timer for route drag
        const building = getBuildingAt(pos.x, pos.y);
        const onOwn = building && building.owner_id === state.player?.entity_id;

        longPressTimerRef.current = setTimeout(() => {
          if (touchModeRef.current !== "potential-tap") return;
          if (onOwn && building && !state.buildMode) {
            touchModeRef.current = "routing";
            mouseActionRef.current = { type: "routing", fromBuildingId: building.entity_id };
            routeDragEndRef.current = { x: pos.x, y: pos.y };
            // Haptic feedback if available
            if (navigator.vibrate) navigator.vibrate(30);
          } else {
            touchModeRef.current = "long-press";
          }
        }, LONG_PRESS_MS);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touches = e.touches;

      if (touchModeRef.current === "pinching" && touches.length >= 2) {
        const newDist = pinchDist(touches[0], touches[1]);
        const scale = newDist / pinchStartDistRef.current;
        const cam = cameraRef.current;
        const mid = pinchMidRef.current;
        const oldTs = BASE_TILE * cam.zoom;
        const worldX = mid.x / oldTs + cam.x;
        const worldY = mid.y / oldTs + cam.y;
        cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartZoomRef.current * scale));
        const newTs = BASE_TILE * cam.zoom;
        cam.x = worldX - mid.x / newTs;
        cam.y = worldY - mid.y / newTs;
        return;
      }

      if (touches.length !== 1) return;
      const pos = getOffset(touches[0]);

      if (touchModeRef.current === "routing") {
        routeDragEndRef.current = { x: pos.x, y: pos.y };
        return;
      }

      if (touchModeRef.current === "area") {
        routeDragEndRef.current = { x: pos.x, y: pos.y };
        return;
      }

      if (touchModeRef.current === "potential-tap") {
        const dist = Math.hypot(pos.x - touchStartRef.current.x, pos.y - touchStartRef.current.y);
        if (dist > TOUCH_DRAG_THRESHOLD) {
          clearTimeout(longPressTimerRef.current);
          touchModeRef.current = "panning";
        } else {
          return;
        }
      }

      if (touchModeRef.current === "panning") {
        const ts = BASE_TILE * cameraRef.current.zoom;
        const dx = pos.x - touchStartRef.current.x;
        const dy = pos.y - touchStartRef.current.y;
        cameraRef.current.x -= dx / ts;
        cameraRef.current.y -= dy / ts;
        touchStartRef.current.x = pos.x;
        touchStartRef.current.y = pos.y;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      clearTimeout(longPressTimerRef.current);
      const mode = touchModeRef.current;

      if (mode === "potential-tap" || mode === "long-press") {
        // Tap — select or place
        const pos = touchStartRef.current;
        const state = storeRef.current;

        if (state.buildMode && state.player && state.currentMap) {
          const tile = screenToTile(pos.x, pos.y);
          if (tile.x >= 0 && tile.y >= 0 && tile.x < TILES_PER_MAP && tile.y < TILES_PER_MAP) {
            state.addPendingBuilding({
              buildingClass: state.buildMode as BuildingClass,
              x: tile.x, y: tile.y,
            });
            submitCommand("place_building", {
              building_class: state.buildMode,
              location: {
                dx: state.currentMap.dx, dy: state.currentMap.dy,
                mx: state.currentMap.mx, my: state.currentMap.my,
                x: tile.x, y: tile.y,
              },
            }).then((res) => {
              if (res.error) {
                state.addNotification(`Build failed: ${res.error}`, "error");
                useGameStore.setState((s) => ({
                  pendingBuildings: s.pendingBuildings.filter(
                    (pb) => !(pb.x === tile.x && pb.y === tile.y)
                  ),
                }));
              } else {
                state.addNotification(
                  `${DISPLAY_NAMES[state.buildMode!] ?? state.buildMode} placed at (${tile.x}, ${tile.y})`,
                  "success"
                );
              }
            });
            state.setBuildMode(null);
          }
        } else if (mode === "potential-tap") {
          // Check for worker first
          const workerId = getWorkerAt(pos.x, pos.y);
          if (workerId) {
            state.setSelectedWorkerId(workerId);
            state.setSelectedTile(null);
          } else {
            const tile = screenToTile(pos.x, pos.y);
            state.setSelectedTile({ x: tile.x, y: tile.y });
            state.setSelectedWorkerId(null);
          }
          state.setRoutePickerTarget(null);
        }
      }

      if (mode === "routing") {
        const pos = routeDragEndRef.current;
        if (pos) {
          const tile = screenToTile(pos.x, pos.y);
          const state = storeRef.current;
          const action = mouseActionRef.current;
          if (action.type === "routing") {
            const targetBuilding = state.buildings.find(
              (b) => b.location.x === tile.x && b.location.y === tile.y
            );
            if (
              targetBuilding &&
              targetBuilding.entity_id !== action.fromBuildingId &&
              targetBuilding.owner_id === state.player?.entity_id
            ) {
              state.setRoutePickerTarget({
                fromBuildingId: action.fromBuildingId,
                toBuildingId: targetBuilding.entity_id,
                screenX: pos.x,
                screenY: pos.y,
              });
            }
          }
        }
        routeDragEndRef.current = null;
      }

      if (mode === "area") {
        const endPos = routeDragEndRef.current;
        if (endPos) {
          const action = mouseActionRef.current;
          if (action.type === "area") {
            const endTile = screenToTile(endPos.x, endPos.y);
            const x1 = Math.min(action.startTileX, endTile.x);
            const y1 = Math.min(action.startTileY, endTile.y);
            const x2 = Math.max(action.startTileX, endTile.x);
            const y2 = Math.max(action.startTileY, endTile.y);
            const state = storeRef.current;
            const workerId = state.areaDrawMode;
            if (workerId) {
              const worker = state.workers.find((wk) => wk.entity_id === workerId);
              if (worker) {
                const existingFilter = (state.pendingWorkerFilter?.workerId === workerId
                  ? state.pendingWorkerFilter.filter
                  : worker.task_filter) ?? {};
                const newFilter = { ...existingFilter, area: { x1, y1, x2, y2 } };
                state.setPendingWorkerFilter(workerId, newFilter);
                submitCommand("configure_worker", {
                  worker_id: workerId,
                  task_filter: newFilter,
                });
              }
            }
            state.setAreaDrawMode(null);
          }
        }
        routeDragEndRef.current = null;
      }

      touchModeRef.current = "idle";
      mouseActionRef.current = { type: "idle" };
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [screenToTile, getBuildingAt, getWorkerAt]);

  // Derive cursor style
  const state = useGameStore();
  const isMobile = useIsMobile();
  let cursor = "grab";
  if (state.buildMode) cursor = "crosshair";
  else if (state.areaDrawMode) cursor = "crosshair";
  else if (mouseActionRef.current.type === "panning") cursor = "grabbing";

  return (
    <div ref={containerRef} className="map-viewport">
      <canvas
        ref={canvasRef}
        className="map-canvas"
        style={{ cursor, touchAction: "none" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (mouseActionRef.current.type === "panning") {
            mouseActionRef.current = { type: "idle" };
          }
          setTooltip(null);
        }}
        onContextMenu={handleContextMenu}
      />

      {/* Build mode banner */}
      {state.buildMode && (
        <div className="build-mode-indicator">
          <span className="build-mode-label">
            Placing: {DISPLAY_NAMES[state.buildMode] ?? state.buildMode} - Cost: {formatBuildCost(state.buildMode)}
          </span>
          {isMobile ? (
            <button
              className="build-mode-cancel"
              onClick={() => state.setBuildMode(null)}
            >
              &#x2715;
            </button>
          ) : (
            <span> — Click tile to place, Esc to cancel</span>
          )}
        </div>
      )}

      {/* Area draw banner */}
      {state.areaDrawMode && (
        <div className="area-draw-indicator">
          <span>Draw worker activity area — Click & drag to set</span>
          <button
            className="build-mode-cancel"
            onClick={() => state.setAreaDrawMode(null)}
          >
            &#x2715;
          </button>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && !state.buildMode && mouseActionRef.current.type === "idle" && (
        <div
          className="map-tooltip"
          style={{
            left: Math.min(tooltip.screenX + 16, (containerRef.current?.clientWidth ?? 800) - 230),
            top: Math.max(8, tooltip.screenY - 10),
          }}
        >
          <div className="tt-header">
            <span style={{ color: BUILDING_COLORS[tooltip.building.class] }}>
              {BUILDING_ICONS[tooltip.building.class]}
            </span>
            {DISPLAY_NAMES[tooltip.building.class] ?? tooltip.building.class}
            <span style={{ color: "var(--text-muted)", fontSize: 10, marginLeft: "auto", fontFamily: "var(--font-mono)" }}>
              ({tooltip.building.location.x}, {tooltip.building.location.y})
            </span>
          </div>
          <span className={`tt-status ${tooltip.building.status}`}>
            {tooltip.building.status}
          </span>
          {tooltip.isOwn && (() => {
            const b = tooltip.building;
            const def = BUILDING_DEFS[b.class];
            const used = totalInventory(b.inventory);
            const pct = b.capacity > 0 ? Math.min(100, (used / b.capacity) * 100) : 0;
            return (
              <>
                {def.recipe && (
                  <div className="tt-row" style={{ marginTop: 4 }}>
                    <span>
                      {Object.entries(def.recipe.inputs).filter(([, v]) => v && v > 0).map(([m, a]) => `${a} ${m.replace(/_/g, " ")}`).join(" + ")}
                      {" \u2192 "}
                      {def.recipe.output_amount} {def.recipe.output.replace(/_/g, " ")}
                    </span>
                  </div>
                )}
                {b.capacity > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div className="tt-row">
                      <span>Storage</span>
                      <span className="val">{used.toFixed(0)}/{b.capacity}</span>
                    </div>
                    <div className="tt-bar">
                      <div
                        className="tt-bar-fill"
                        style={{
                          width: `${pct}%`,
                          background: pct > 90 ? "var(--danger)" : pct > 60 ? "var(--warning)" : "var(--success)",
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            );
          })()}
          {!tooltip.isOwn && (
            <div style={{ color: "var(--text-muted)", fontSize: 10, fontStyle: "italic", marginTop: 2 }}>
              Opponent's building
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Canvas helpers ──

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBuilding(
  ctx: CanvasRenderingContext2D, b: Building,
  sx: number, sy: number, ts: number,
  isOwn: boolean, isSelected: boolean, now: number
) {
  const color = isOwn ? (BUILDING_COLORS[b.class] ?? "#888") : "#444";
  const pad = ts * 0.1;
  const bx = sx + pad, by = sy + pad, bw = ts - pad * 2, bh = ts - pad * 2;

  // Alpha for constructing/suspended
  if (b.status === "constructing") {
    ctx.globalAlpha = 0.4 + 0.15 * Math.sin(now / 400);
  } else if (b.status === "suspended") {
    ctx.globalAlpha = 0.35;
  }

  // Fill
  ctx.fillStyle = color;
  roundRect(ctx, bx, by, bw, bh, ts * 0.1);
  ctx.fill();

  // Glow for own active buildings
  if (isOwn && b.status === "active") {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = ts * 0.25;
    roundRect(ctx, bx, by, bw, bh, ts * 0.1);
    ctx.fill();
    ctx.restore();
  }

  // Border
  if (b.status === "suspended") {
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "#ef5350";
  } else if (b.status === "constructing") {
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "#ffb74d";
  } else {
    ctx.strokeStyle = isOwn ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)";
  }
  ctx.lineWidth = isSelected ? 2 : 1;
  roundRect(ctx, bx, by, bw, bh, ts * 0.1);
  ctx.stroke();
  ctx.setLineDash([]);

  // Icon
  const icon = BUILDING_ICONS[b.class] ?? b.class[0].toUpperCase();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.max(8, ts * 0.35)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, sx + ts / 2, sy + ts / 2);

  ctx.globalAlpha = 1;
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  route: { from: Building; to: Building; resource: string },
  ts: number, cam: { x: number; y: number },
  alpha: number, dashOffset: number
) {
  const color = getRouteColor(route.resource);
  const x1 = (route.from.location.x - cam.x) * ts + ts / 2;
  const y1 = (route.from.location.y - cam.y) * ts + ts / 2;
  const x2 = (route.to.location.x - cam.x) * ts + ts / 2;
  const y2 = (route.to.location.y - cam.y) * ts + ts / 2;

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = alpha > 0.5 ? 2.5 : 1.5;

  if (alpha > 0.5) {
    // Animated dashes for selected routes
    ctx.setLineDash([8, 4]);
    ctx.lineDashOffset = dashOffset;
  }

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // Arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = alpha > 0.5 ? 10 : 6;
  // Pull arrowhead back from center of target tile
  const pullback = ts * 0.4;
  const ax = x2 - Math.cos(angle) * pullback;
  const ay = y2 - Math.sin(angle) * pullback;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax - headLen * Math.cos(angle - 0.4), ay - headLen * Math.sin(angle - 0.4));
  ctx.lineTo(ax - headLen * Math.cos(angle + 0.4), ay - headLen * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
}
