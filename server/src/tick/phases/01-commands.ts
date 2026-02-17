import type {
  AutoSellRule,
  BuildingClass,
  Command,
  CommandType,
  GameEvent,
  Location,
  MaterialType,
  OutgoingRoute,
  Player,
  ResourceType,
} from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";
import { placeBuilding } from "../../systems/building.js";

// ── Handler result type ──

type HandlerResult =
  | { ok: true; events: Array<{ type: GameEvent["type"]; data: Record<string, unknown>; mapKey?: string }> }
  | { ok: false; error: string };

type CommandHandler = (store: WorldStore, player: Player, data: Record<string, unknown>) => HandlerResult;

// ── Handlers ──

function handlePlaceBuilding(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { building_class, location } = data as {
    building_class: BuildingClass;
    location: Location;
  };

  const result = placeBuilding(store, player, building_class, location);
  if (!result.ok) return result;

  return {
    ok: true,
    events: [{
      type: "building_placed",
      data: {
        building_id: result.building.entity_id,
        building_class,
        owner_id: player.entity_id,
        location,
      },
      mapKey: result.building.map_key,
    }],
  };
}

function handleTransfer(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { from_building_id, to_building_id, material, amount } = data as {
    from_building_id: string;
    to_building_id: string;
    material: MaterialType;
    amount: number;
  };

  if (!amount || amount <= 0) return { ok: false, error: "Amount must be positive" };

  const from = store.buildings.get(from_building_id);
  if (!from) return { ok: false, error: "Source building not found" };
  if (from.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };

  const to = store.buildings.get(to_building_id);
  if (!to) return { ok: false, error: "Destination building not found" };
  if (to.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };
  if (from.map_key !== to.map_key) return { ok: false, error: "Buildings must be on same map" };

  const available = from.inventory[material] ?? 0;
  if (available < amount) return { ok: false, error: `Insufficient ${material} (have ${available.toFixed(1)})` };

  from.inventory[material] = available - amount;
  to.inventory[material] = (to.inventory[material] ?? 0) + amount;

  return {
    ok: true,
    events: [{
      type: "transfer",
      data: {
        from_building_id,
        to_building_id,
        material,
        amount,
        player_id: player.entity_id,
      },
      mapKey: from.map_key,
    }],
  };
}

function handleExport(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { building_id, material, amount } = data as {
    building_id: string;
    material: MaterialType;
    amount: number;
  };

  if (!amount || amount <= 0) return { ok: false, error: "Amount must be positive" };

  const building = store.buildings.get(building_id);
  if (!building) return { ok: false, error: "Building not found" };
  if (building.class !== "port") return { ok: false, error: "Only ports can export" };
  if (building.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };

  const available = building.inventory[material] ?? 0;
  if (available < amount) return { ok: false, error: `Insufficient ${material} (have ${available.toFixed(1)})` };

  const price = store.marketPrices[material as ResourceType] ?? 1;
  const revenue = Math.round(amount * price * 100) / 100;

  building.inventory[material] = available - amount;
  building.inventory.money = (building.inventory.money ?? 0) + revenue;

  return {
    ok: true,
    events: [{
      type: "export",
      data: { building_id, material, amount, price, revenue, player_id: player.entity_id },
      mapKey: building.map_key,
    }],
  };
}

function handleConfigureAutoSell(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { building_id, resource, rule } = data as {
    building_id: string;
    resource: ResourceType;
    rule: AutoSellRule | null;
  };

  const building = store.buildings.get(building_id);
  if (!building) return { ok: false, error: "Building not found" };
  if (building.class !== "port") return { ok: false, error: "Only ports support auto-sell" };
  if (building.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };

  if (rule) {
    if (!building.auto_sell) building.auto_sell = {};
    building.auto_sell[resource] = rule;
  } else {
    if (building.auto_sell) delete building.auto_sell[resource];
  }

  return {
    ok: true,
    events: [{
      type: "auto_sell",
      data: { building_id, resource, rule: rule ?? "off", configured: true },
      mapKey: building.map_key,
    }],
  };
}

function handleConfigureRoute(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { from_building_id, to_building_id, resource } = data as {
    from_building_id: string;
    to_building_id: string;
    resource: MaterialType;
  };

  const from = store.buildings.get(from_building_id);
  if (!from) return { ok: false, error: "Source building not found" };
  if (from.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };

  const to = store.buildings.get(to_building_id);
  if (!to) return { ok: false, error: "Destination building not found" };
  if (to.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };
  if (from.map_key !== to.map_key) return { ok: false, error: "Buildings must be on same map" };
  if (from_building_id === to_building_id) return { ok: false, error: "Cannot route to self" };

  if (!from.outgoing_routes) from.outgoing_routes = [];

  // Check for duplicate
  const exists = from.outgoing_routes.some(
    (r) => r.resource === resource && r.to_building_id === to_building_id
  );
  if (exists) return { ok: false, error: "Route already exists" };

  from.outgoing_routes.push({ resource, to_building_id });

  return {
    ok: true,
    events: [{
      type: "route_executed",
      data: { from_building_id, to_building_id, resource, configured: true },
      mapKey: from.map_key,
    }],
  };
}

function handleDeleteRoute(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { from_building_id, to_building_id, resource } = data as {
    from_building_id: string;
    to_building_id: string;
    resource: MaterialType;
  };

  const from = store.buildings.get(from_building_id);
  if (!from) return { ok: false, error: "Source building not found" };
  if (from.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };

  if (!from.outgoing_routes) return { ok: false, error: "No routes configured" };

  const idx = from.outgoing_routes.findIndex(
    (r) => r.resource === resource && r.to_building_id === to_building_id
  );
  if (idx === -1) return { ok: false, error: "Route not found" };

  from.outgoing_routes.splice(idx, 1);

  return {
    ok: true,
    events: [{
      type: "route_executed",
      data: { from_building_id, to_building_id, resource, deleted: true },
      mapKey: from.map_key,
    }],
  };
}

// ── Handler registry ──

const handlers: Record<CommandType, CommandHandler> = {
  place_building: handlePlaceBuilding,
  transfer: handleTransfer,
  export: handleExport,
  configure_auto_sell: handleConfigureAutoSell,
  configure_route: handleConfigureRoute,
  delete_route: handleDeleteRoute,
};

// ── Main processor ──

export function processCommands(store: WorldStore) {
  const commands = store.commandQueue.splice(0);

  if (commands.length > 0) {
    console.log(`Processing ${commands.length} command(s): ${commands.map(c => c.type).join(", ")}`);
  }

  for (const cmd of commands) {
    const player = store.players.get(cmd.player_id);
    if (!player) {
      console.log(`  ${cmd.type}: FAILED - player not found (${cmd.player_id})`);
      store.pushEvent("command_failed", { command_id: cmd.id, command_type: cmd.type, error: "Player not found" });
      continue;
    }

    const handler = handlers[cmd.type];
    if (!handler) {
      store.pushEvent("command_failed", { command_id: cmd.id, command_type: cmd.type, error: `Unknown command: ${cmd.type}` });
      continue;
    }

    const result = handler(store, player, cmd.data);

    if (result.ok) {
      console.log(`  ${cmd.type}: OK (${result.events.map(e => e.type).join(", ")})`);
      for (const evt of result.events) {
        store.pushEvent(evt.type, { ...evt.data, command_id: cmd.id }, evt.mapKey);
      }
    } else {
      console.log(`  ${cmd.type}: FAILED - ${result.error}`);
      store.pushEvent("command_failed", {
        command_id: cmd.id,
        command_type: cmd.type,
        error: result.error,
        player_id: player.entity_id,
      });
    }
  }
}
