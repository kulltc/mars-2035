import type {
  AutoSellRule,
  BuildingClass,
  Command,
  CommandType,
  ConstructTask,
  GameEvent,
  Location,
  MapKey,
  MaterialType,
  OutgoingRoute,
  Player,
  QuantumRelayRule,
  ResourceType,
  RouteResource,
  WorkerFilter,
} from "@mars-2035/shared";
import { remainingCapacity, WORKER_COST, BUILDING_DEFS, tileKey, RESEARCH_TREE, RESOURCE_TYPES, IMPORT_PRICE_MULTIPLIER } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";
import { placeBuilding, spawnWorker, applyResearchEffects } from "../../systems/building.js";

// ── Handler result type ──

type HandlerResult =
  | { ok: true; events: Array<{ type: GameEvent["type"]; data: Record<string, unknown>; mapKey?: string }> }
  | { ok: false; error: string };

type CommandHandler = (store: WorldStore, player: Player, data: Record<string, unknown>) => HandlerResult;

const MAX_QUANTUM_RULES = 3;

// ── Handlers ──

function handlePlaceBuilding(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { building_class, location } = data as {
    building_class: BuildingClass;
    location: Location;
  };

  const def = BUILDING_DEFS[building_class];
  const initialStatus = def.build_ticks > 0 ? "constructing" as const : "active" as const;

  const result = placeBuilding(store, player, building_class, location, initialStatus);
  if (!result.ok) return result;

  // Create a construct task for buildings that need construction time
  if (def.build_ticks > 0) {
    const mapKey = result.building.map_key;
    const taskId = `task_${++store.taskCounter}`;
    const task: ConstructTask = {
      id: taskId,
      type: "construct",
      owner_id: player.entity_id,
      map_key: mapKey,
      building_id: result.building.entity_id,
      ticks_remaining: def.build_ticks,
    };
    store.taskQueue.set(taskId, task);
  }

  return {
    ok: true,
    events: [{
      type: "building_placed",
      data: {
        building_id: result.building.entity_id,
        building_class,
        owner_id: player.entity_id,
        location,
        status: initialStatus,
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

  if (material !== "money") {
    return { ok: false, error: "Only money transfers are supported" };
  }
  if (from.class !== "admin_outpost" || to.class !== "admin_outpost") {
    return { ok: false, error: "Money transfers must be admin outpost to admin outpost" };
  }

  const bufferAvailable = from.output_buffer?.[material] ?? 0;
  const invAvailable = from.inventory[material] ?? 0;
  const available = bufferAvailable + invAvailable;
  if (available < amount) return { ok: false, error: `Insufficient ${material} (have ${available.toFixed(1)})` };

  const actual = amount;

  // Deduct from output_buffer first, then inventory
  let rem = actual;
  if (bufferAvailable > 0 && rem > 0) {
    const fromBuf = Math.min(bufferAvailable, rem);
    from.output_buffer![material] = bufferAvailable - fromBuf;
    rem -= fromBuf;
  }
  if (rem > 0) {
    from.inventory[material] = invAvailable - rem;
  }
  to.inventory[material] = (to.inventory[material] ?? 0) + actual;

  if (actual > 0 && player.tutorial_step === 5) {
    player.tutorial_step = 6;
  }

  return {
    ok: true,
    events: [{
      type: "transfer",
      data: {
        from_building_id,
        to_building_id,
        material,
        amount: actual,
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

  const bufAvail = building.output_buffer?.[material] ?? 0;
  const invAvail = building.inventory[material] ?? 0;
  const available = bufAvail + invAvail;
  if (available < amount) return { ok: false, error: `Insufficient ${material} (have ${available.toFixed(1)})` };

  const price = store.marketPrices[material as ResourceType] ?? 1;
  const revenue = Math.round(amount * price * 100) / 100;

  // Deduct from output_buffer first, then inventory
  let rem2 = amount;
  if (bufAvail > 0 && rem2 > 0) {
    const fromBuf = Math.min(bufAvail, rem2);
    building.output_buffer![material] = bufAvail - fromBuf;
    rem2 -= fromBuf;
  }
  if (rem2 > 0) {
    building.inventory[material] = invAvail - rem2;
  }
  building.inventory.money = (building.inventory.money ?? 0) + revenue;

  // Supply pressure
  const resType = material as ResourceType;
  store.supplyPressure[resType] = (store.supplyPressure[resType] ?? 0) + amount;

  return {
    ok: true,
    events: [{
      type: "export",
      data: { building_id, material, amount, price, revenue, player_id: player.entity_id },
      mapKey: building.map_key,
    }],
  };
}

function handleImport(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { building_id, material, amount } = data as {
    building_id: string;
    material: ResourceType;
    amount: number;
  };

  if (!amount || amount <= 0) return { ok: false, error: "Amount must be positive" };
  if (!RESOURCE_TYPES.includes(material)) return { ok: false, error: "Can only import base materials" };

  const building = store.buildings.get(building_id);
  if (!building) return { ok: false, error: "Building not found" };
  if (building.class !== "port") return { ok: false, error: "Only ports can import" };
  if (building.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };

  const price = store.marketPrices[material] ?? 1;
  const cost = Math.round(amount * price * IMPORT_PRICE_MULTIPLIER * 100) / 100;
  const money = building.inventory.money ?? 0;
  if (money < cost) return { ok: false, error: `Insufficient money (need ${cost.toFixed(1)}, have ${money.toFixed(1)})` };

  // Check capacity
  const remaining = remainingCapacity(building.inventory, building.capacity);
  if (remaining < amount) return { ok: false, error: `Insufficient storage (need ${amount}, have ${remaining.toFixed(0)} free)` };

  building.inventory.money = money - cost;
  building.inventory[material] = (building.inventory[material] ?? 0) + amount;

  return {
    ok: true,
    events: [{
      type: "import",
      data: { building_id, material, amount, price, cost, player_id: player.entity_id },
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
    resource: RouteResource;
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

  if (resource === "all") {
    // Adding "all" removes existing non-money specific routes to same destination (redundant)
    // Money can coexist as a separate route.
    from.outgoing_routes = from.outgoing_routes.filter(
      (r) => !(r.to_building_id === to_building_id && r.resource !== "money")
    );
  } else {
    // Adding a specific non-money route when "all" exists to same destination is rejected.
    // Money route is allowed because "all" excludes money.
    const hasAll = from.outgoing_routes.some(
      (r) => r.resource === "all" && r.to_building_id === to_building_id
    );
    if (hasAll && resource !== "money") {
      return { ok: false, error: "An 'all resources' route already exists to this destination" };
    }
  }

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
    resource: RouteResource;
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

function handleBuyWorker(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { map_key } = data as { map_key: MapKey };

  const account = player.map_accounts[map_key];
  if (!account?.admin_outpost_building_id) return { ok: false, error: "No admin outpost on this map" };

  const admin = store.buildings.get(account.admin_outpost_building_id);
  if (!admin) return { ok: false, error: "Admin outpost not found" };

  // Deduct cost
  for (const [mat, cost] of Object.entries(WORKER_COST)) {
    if (!cost) continue;
    const available = admin.inventory[mat as MaterialType] ?? 0;
    if (available < cost) {
      return { ok: false, error: `Insufficient ${mat} (need ${cost}, have ${available.toFixed(1)})` };
    }
  }
  for (const [mat, cost] of Object.entries(WORKER_COST)) {
    if (!cost) continue;
    admin.inventory[mat as MaterialType] = (admin.inventory[mat as MaterialType] ?? 0) - cost;
  }

  const worker = spawnWorker(store, player.entity_id, map_key, admin.location.x, admin.location.y);

  return {
    ok: true,
    events: [{
      type: "worker_spawned",
      data: { worker_id: worker.entity_id, owner_id: player.entity_id, map_key },
      mapKey: map_key,
    }],
  };
}

function handleSellBuilding(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { building_id } = data as { building_id: string };

  const building = store.buildings.get(building_id);
  if (!building) return { ok: false, error: "Building not found" };
  if (building.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };
  if (building.class === "admin_outpost") return { ok: false, error: "Cannot sell admin outpost" };

  // Refund 50% of building cost to admin outpost
  const account = player.map_accounts[building.map_key];
  const adminOutpost = account?.admin_outpost_building_id
    ? store.buildings.get(account.admin_outpost_building_id)
    : undefined;

  if (adminOutpost) {
    const def = BUILDING_DEFS[building.class];
    for (const [mat, cost] of Object.entries(def.cost)) {
      if (!cost) continue;
      const refund = Math.floor(cost * 0.5);
      if (refund > 0) {
        adminOutpost.inventory[mat as MaterialType] =
          (adminOutpost.inventory[mat as MaterialType] ?? 0) + refund;
      }
    }
    // Transfer any remaining inventory to admin outpost
    for (const [mat, amount] of Object.entries(building.inventory)) {
      if (!amount || amount <= 0) continue;
      adminOutpost.inventory[mat as MaterialType] =
        (adminOutpost.inventory[mat as MaterialType] ?? 0) + amount;
    }
    // Transfer output buffer contents too
    if (building.output_buffer) {
      for (const [mat, amount] of Object.entries(building.output_buffer)) {
        if (!amount || amount <= 0) continue;
        adminOutpost.inventory[mat as MaterialType] =
          (adminOutpost.inventory[mat as MaterialType] ?? 0) + amount;
      }
    }
  }

  // Remove routes referencing this building from other buildings
  for (const b of store.buildings.values()) {
    if (!b.outgoing_routes) continue;
    b.outgoing_routes = b.outgoing_routes.filter(
      (r) => r.to_building_id !== building_id
    );
    if (b.quantum_rules) {
      b.quantum_rules = b.quantum_rules.filter((r) => r.to_building_id !== building_id);
      if (b.quantum_rules.length === 0) delete b.quantum_rules;
    }
  }

  // Remove tasks referencing this building
  for (const [taskId, task] of store.taskQueue) {
    if (
      (task.type === "pickup" && (task.from_building_id === building_id || task.to_building_id === building_id)) ||
      (task.type === "dropoff" && task.building_id === building_id) ||
      (task.type === "construct" && task.building_id === building_id)
    ) {
      store.taskQueue.delete(taskId);
    }
  }

  // Reset workers that had tasks for this building
  for (const worker of store.workers.values()) {
    if (!worker.current_task_id) continue;
    if (!store.taskQueue.has(worker.current_task_id)) {
      worker.current_task_id = undefined;
      worker.state = "idle";
    }
  }

  // Remove ambassadors belonging to this building (if ambassadors_office)
  if (building.class === "ambassadors_office") {
    for (const [ambId, amb] of store.ambassadors) {
      if (amb.office_building_id === building_id) {
        store.ambassadors.delete(ambId);
      }
    }
  }

  // Clear tile
  const mapTiles = store.tiles.get(building.map_key);
  if (mapTiles) {
    const tk = tileKey(building.location.x, building.location.y);
    const tile = mapTiles.get(tk);
    if (tile) delete tile.building_id;
  }

  const mapKey = building.map_key;
  store.buildings.delete(building_id);

  return {
    ok: true,
    events: [{
      type: "building_destroyed",
      data: { building_id, building_class: building.class, owner_id: player.entity_id, reason: "sold" },
      mapKey,
    }],
  };
}

function handleRemoveWorker(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { worker_id } = data as { worker_id: string };

  const worker = store.workers.get(worker_id);
  if (!worker) return { ok: false, error: "Worker not found" };
  if (worker.owner_id !== player.entity_id) return { ok: false, error: "Not your worker" };

  // Cancel current task
  if (worker.current_task_id) {
    store.taskQueue.delete(worker.current_task_id);
  }

  // Transfer any cargo to admin outpost
  const account = player.map_accounts[worker.map_key];
  const adminOutpost = account?.admin_outpost_building_id
    ? store.buildings.get(account.admin_outpost_building_id)
    : undefined;
  if (adminOutpost) {
    for (const [mat, amount] of Object.entries(worker.inventory)) {
      if (!amount || amount <= 0) continue;
      adminOutpost.inventory[mat as MaterialType] =
        (adminOutpost.inventory[mat as MaterialType] ?? 0) + amount;
    }
  }

  const mapKey = worker.map_key;
  store.workers.delete(worker_id);

  return {
    ok: true,
    events: [{
      type: "worker_spawned",
      data: { worker_id, owner_id: player.entity_id, map_key: mapKey, removed: true },
      mapKey,
    }],
  };
}

function handleConfigureWorker(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { worker_id, task_filter } = data as {
    worker_id: string;
    task_filter: WorkerFilter | null;
  };

  const worker = store.workers.get(worker_id);
  if (!worker) return { ok: false, error: "Worker not found" };
  if (worker.owner_id !== player.entity_id) return { ok: false, error: "Not your worker" };

  worker.task_filter = task_filter ?? undefined;

  return {
    ok: true,
    events: [{
      type: "worker_spawned",
      data: { worker_id, owner_id: player.entity_id, map_key: worker.map_key, configured: true },
      mapKey: worker.map_key,
    }],
  };
}

function handleDoResearch(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { research_id } = data as { research_id: string };

  const def = RESEARCH_TREE[research_id];
  if (!def) return { ok: false, error: "Unknown research" };

  if (player.research.includes(research_id)) {
    return { ok: false, error: "Already researched" };
  }

  // Check prerequisites
  for (const req of def.requires) {
    if (!player.research.includes(req)) {
      return { ok: false, error: `Prerequisite not met: ${RESEARCH_TREE[req]?.name ?? req}` };
    }
  }

  // Find a research_lab owned by this player (any map)
  let labMapKey: string | null = null;
  for (const b of store.buildings.values()) {
    if (b.class === "research_lab" && b.owner_id === player.entity_id && b.status === "active") {
      labMapKey = b.map_key;
      break;
    }
  }
  if (!labMapKey) return { ok: false, error: "No active Research Lab" };

  // Find admin outpost on the lab's map to deduct materials
  const account = player.map_accounts[labMapKey];
  if (!account?.admin_outpost_building_id) return { ok: false, error: "No admin outpost on lab's map" };
  const admin = store.buildings.get(account.admin_outpost_building_id);
  if (!admin) return { ok: false, error: "Admin outpost not found" };

  // Check and deduct costs
  for (const [mat, cost] of Object.entries(def.cost)) {
    if (!cost) continue;
    const available = admin.inventory[mat as MaterialType] ?? 0;
    if (available < cost) {
      return { ok: false, error: `Insufficient ${mat.replace(/_/g, " ")} (need ${cost}, have ${available.toFixed(1)})` };
    }
  }
  for (const [mat, cost] of Object.entries(def.cost)) {
    if (!cost) continue;
    admin.inventory[mat as MaterialType] = (admin.inventory[mat as MaterialType] ?? 0) - cost;
  }

  player.research.push(research_id);

  // Retroactively apply capacity bonuses to existing buildings/workers
  if (def.effect) {
    applyResearchEffects(store, player);
  }

  return {
    ok: true,
    events: [{
      type: "research_complete",
      data: {
        research_id,
        player_id: player.entity_id,
        name: def.name,
      },
      mapKey: labMapKey,
    }],
  };
}

function handleSetBufferStock(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { building_id, resource, amount } = data as {
    building_id: string;
    resource: MaterialType;
    amount: number;
  };

  const building = store.buildings.get(building_id);
  if (!building) return { ok: false, error: "Building not found" };
  if (building.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };

  if (amount > 0) {
    if (!building.buffer_stock) building.buffer_stock = {};
    building.buffer_stock[resource] = amount;
  } else {
    if (building.buffer_stock) {
      delete building.buffer_stock[resource];
      if (Object.keys(building.buffer_stock).length === 0) {
        delete building.buffer_stock;
      }
    }
  }

  return {
    ok: true,
    events: [{
      type: "route_executed",
      data: { building_id, resource, buffer_stock: amount, configured: true },
      mapKey: building.map_key,
    }],
  };
}

function handleConfigureQuantumRule(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { building_id, to_building_id, materials } = data as {
    building_id: string;
    to_building_id: string;
    materials: MaterialType[];
  };

  const building = store.buildings.get(building_id);
  if (!building) return { ok: false, error: "Building not found" };
  if (building.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };
  if (building.class !== "quantum_relay") return { ok: false, error: "Only quantum relays support quantum rules" };

  const destination = store.buildings.get(to_building_id);
  if (!destination) return { ok: false, error: "Destination building not found" };
  if (destination.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };
  if (destination.class !== "quantum_relay") return { ok: false, error: "Destination must be a quantum relay" };
  if (destination.entity_id === building.entity_id) return { ok: false, error: "Cannot route to self" };

  const unique = Array.from(new Set((materials ?? []).filter((m) => m && m !== "money")));
  if (unique.length === 0) return { ok: false, error: "Select at least one material" };

  if (!building.quantum_rules) building.quantum_rules = [];

  const existingIdx = building.quantum_rules.findIndex((r) => r.to_building_id === to_building_id);
  if (existingIdx >= 0) {
    building.quantum_rules[existingIdx] = { to_building_id, materials: unique };
  } else {
    if (building.quantum_rules.length >= MAX_QUANTUM_RULES) {
      return { ok: false, error: `Maximum ${MAX_QUANTUM_RULES} quantum rules` };
    }
    const newRule: QuantumRelayRule = { to_building_id, materials: unique };
    building.quantum_rules.push(newRule);
  }

  return {
    ok: true,
    events: [{
      type: "route_executed",
      data: { building_id, to_building_id, materials: unique, quantum_rule: true, configured: true },
      mapKey: building.map_key,
    }],
  };
}

function handleDeleteQuantumRule(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { building_id, to_building_id } = data as {
    building_id: string;
    to_building_id: string;
  };

  const building = store.buildings.get(building_id);
  if (!building) return { ok: false, error: "Building not found" };
  if (building.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };
  if (building.class !== "quantum_relay") return { ok: false, error: "Only quantum relays support quantum rules" };
  if (!building.quantum_rules || building.quantum_rules.length === 0) return { ok: false, error: "No quantum rules configured" };

  const before = building.quantum_rules.length;
  building.quantum_rules = building.quantum_rules.filter((r) => r.to_building_id !== to_building_id);
  if (building.quantum_rules.length === before) return { ok: false, error: "Quantum rule not found" };
  if (building.quantum_rules.length === 0) delete building.quantum_rules;

  return {
    ok: true,
    events: [{
      type: "route_executed",
      data: { building_id, to_building_id, quantum_rule: true, deleted: true },
      mapKey: building.map_key,
    }],
  };
}

function handleForfeit(store: WorldStore, player: Player, _data: Record<string, unknown>): HandlerResult {
  const playerId = player.entity_id;

  // Remove all workers belonging to this player
  for (const [wid, worker] of store.workers) {
    if (worker.owner_id !== playerId) continue;
    if (worker.current_task_id) store.taskQueue.delete(worker.current_task_id);
    store.workers.delete(wid);
  }

  // Remove all ambassadors belonging to this player
  for (const [ambId, amb] of store.ambassadors) {
    if (amb.owner_id !== playerId) continue;
    store.ambassadors.delete(ambId);
  }
  store.salesTaxHistory.delete(playerId);

  // Remove all buildings belonging to this player
  const buildingIds: string[] = [];
  for (const [bid, building] of store.buildings) {
    if (building.owner_id !== playerId) continue;
    buildingIds.push(bid);

    // Clear tile
    const mapTiles = store.tiles.get(building.map_key);
    if (mapTiles) {
      const tk = tileKey(building.location.x, building.location.y);
      const tile = mapTiles.get(tk);
      if (tile) delete tile.building_id;
    }

    store.buildings.delete(bid);
  }

  // Remove routes referencing deleted buildings from other players' buildings
  for (const b of store.buildings.values()) {
    if (!b.outgoing_routes) continue;
    b.outgoing_routes = b.outgoing_routes.filter(
      (r) => !buildingIds.includes(r.to_building_id)
    );
  }

  // Remove any remaining tasks for this player
  for (const [taskId, task] of store.taskQueue) {
    if (task.owner_id === playerId) store.taskQueue.delete(taskId);
  }

  // Reset player state
  player.map_accounts = {};
  player.research = [];
  player.tutorial_step = 1;

  return {
    ok: true,
    events: [{
      type: "player_registered",
      data: { player_id: playerId, name: player.name, forfeit: true },
    }],
  };
}

function handleSendAmbassador(store: WorldStore, player: Player, data: Record<string, unknown>): HandlerResult {
  const { office_building_id, target_building_id } = data as {
    office_building_id: string;
    target_building_id: string;
  };

  const office = store.buildings.get(office_building_id);
  if (!office) return { ok: false, error: "Office not found" };
  if (office.class !== "ambassadors_office") return { ok: false, error: "Not an Ambassadors Office" };
  if (office.owner_id !== player.entity_id) return { ok: false, error: "Not your building" };
  if (office.status !== "active") return { ok: false, error: "Office not active" };

  // Find an idle ambassador at this office (not on cooldown)
  let ambassador: import("@mars-2035/shared").Ambassador | undefined;
  for (const a of store.ambassadors.values()) {
    if (a.office_building_id === office_building_id && a.state === "idle" && a.cooldown_ticks <= 0) {
      ambassador = a;
      break;
    }
  }
  if (!ambassador) return { ok: false, error: "No idle ambassador available (may be on cooldown)" };

  const target = store.buildings.get(target_building_id);
  if (!target) return { ok: false, error: "Target building not found" };
  if (target.map_key !== office.map_key) return { ok: false, error: "Target must be on same map" };
  if (target.owner_id === player.entity_id) return { ok: false, error: "Cannot target your own building" };

  // Check new player protection
  if (store.isNewPlayerProtectionActive(target.owner_id, target.map_key)) {
    return { ok: false, error: "Target player is under new player protection" };
  }
  if (store.isNewPlayerProtectionActive(player.entity_id, office.map_key)) {
    return { ok: false, error: "You are under new player protection" };
  }

  ambassador.state = "moving_to_target";
  ambassador.target_building_id = target_building_id;

  return {
    ok: true,
    events: [{
      type: "ambassador_dispatched",
      data: {
        ambassador_id: ambassador.entity_id,
        owner_id: player.entity_id,
        office_building_id,
        target_building_id,
        target_owner_id: target.owner_id,
      },
      mapKey: office.map_key,
    }],
  };
}

function handleDismissTutorial(_store: WorldStore, player: Player, _data: Record<string, unknown>): HandlerResult {
  player.tutorial_step = undefined;
  return { ok: true, events: [] };
}

// ── Handler registry ──

const handlers: Record<CommandType, CommandHandler> = {
  place_building: handlePlaceBuilding,
  transfer: handleTransfer,
  export: handleExport,
  import: handleImport,
  configure_auto_sell: handleConfigureAutoSell,
  configure_route: handleConfigureRoute,
  delete_route: handleDeleteRoute,
  buy_worker: handleBuyWorker,
  sell_building: handleSellBuilding,
  remove_worker: handleRemoveWorker,
  configure_worker: handleConfigureWorker,
  do_research: handleDoResearch,
  set_buffer_stock: handleSetBufferStock,
  configure_quantum_rule: handleConfigureQuantumRule,
  delete_quantum_rule: handleDeleteQuantumRule,
  forfeit: handleForfeit,
  dismiss_tutorial: handleDismissTutorial,
  send_ambassador: handleSendAmbassador,
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
