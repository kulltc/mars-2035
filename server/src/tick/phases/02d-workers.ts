import {
  type MaterialType,
  type Building,
  type Worker,
  type WorkerTask,
  type PickupTask,
  type DropoffTask,
  type ConstructTask,
  remainingCapacity,
  totalInventory,
  WORKER_MONEY_CAPACITY,
  BUILDING_DEFS,
  MATERIAL_TYPES,
} from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

function findAdminOutpost(store: WorldStore, worker: Worker): string | undefined {
  const player = store.players.get(worker.owner_id);
  if (!player) return undefined;
  const account = player.map_accounts[worker.map_key];
  return account?.admin_outpost_building_id;
}

/** Find the nearest active warehouse or admin outpost for this worker. */
function findNearestStorage(store: WorldStore, worker: Worker): string | undefined {
  const outpostId = findAdminOutpost(store, worker);
  if (!outpostId) return undefined;

  let nearestId = outpostId;
  let nearestDist = Infinity;
  for (const b of store.buildings.values()) {
    if (b.owner_id !== worker.owner_id) continue;
    if (b.map_key !== worker.map_key) continue;
    if (b.status !== "active") continue;
    if (b.class !== "admin_outpost" && b.class !== "warehouse") continue;
    const dist = Math.hypot(b.location.x - worker.x, b.location.y - worker.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestId = b.entity_id;
    }
  }
  return nearestId;
}

/**
 * Per-tick cache for warehouse capacity keyed by "owner_id:map_key".
 * Built lazily on first lookup, valid for the duration of one processWorkers() call.
 */
let warehouseCapacityCache: Map<string, number> | null = null;

function getWarehouseCapacity(store: WorldStore, ownerId: string, mapKey: string): number {
  if (!warehouseCapacityCache) {
    warehouseCapacityCache = new Map();
    for (const b of store.buildings.values()) {
      if (b.class === "warehouse" && b.status === "active") {
        const key = `${b.owner_id}:${b.map_key}`;
        warehouseCapacityCache.set(key, (warehouseCapacityCache.get(key) ?? 0) + b.capacity);
      }
    }
  }
  return warehouseCapacityCache.get(`${ownerId}:${mapKey}`) ?? 0;
}

/**
 * For a warehouse destination, redirect inventory writes to the Admin Outpost and
 * compute pooled capacity (outpost + all active warehouses on same map).
 * For all other buildings, returns the building and its own capacity unchanged.
 */
function resolveStorageDest(
  dest: Building,
  store: WorldStore,
): { inventoryBuilding: Building; effectiveCapacity: number } {
  if (dest.class !== "warehouse") {
    return { inventoryBuilding: dest, effectiveCapacity: dest.capacity };
  }
  const player = store.players.get(dest.owner_id);
  const outpostId = player?.map_accounts[dest.map_key]?.admin_outpost_building_id;
  const outpost = outpostId ? store.buildings.get(outpostId) : undefined;
  if (!outpost) {
    return { inventoryBuilding: dest, effectiveCapacity: dest.capacity };
  }
  const warehouseCapacity = getWarehouseCapacity(store, dest.owner_id, dest.map_key);
  return { inventoryBuilding: outpost, effectiveCapacity: outpost.capacity + warehouseCapacity };
}

function getWorkerTask(store: WorldStore, worker: Worker): WorkerTask | undefined {
  if (!worker.current_task_id) return undefined;
  return store.taskQueue.get(worker.current_task_id);
}

function clearWorkerTask(store: WorldStore, worker: Worker, removeFromQueue = true) {
  if (worker.current_task_id) {
    if (removeFromQueue) store.taskQueue.delete(worker.current_task_id);
    worker.current_task_id = undefined;
  }
}

export function processWorkers(store: WorldStore) {
  // Invalidate per-tick warehouse capacity cache
  warehouseCapacityCache = null;

  // ── Task generation ──
  generatePickupTasks(store);
  generateImpliedAdminOutpostTasks(store);
  generateConstructTasks(store);

  // ── Idle worker dispatch ──
  for (const worker of store.workers.values()) {
    if (worker.state !== "idle") continue;
    if (worker.worker_status === "inactive") continue;

    // If worker has cargo (including money), send it to nearest storage
    if (totalInventory(worker.inventory) > 0 || (worker.inventory.money ?? 0) > 0) {
      const storageId = findNearestStorage(store, worker);
      const storage = storageId ? store.buildings.get(storageId) : undefined;
      if (storage) {
        worker.return_target_id = storageId;
        worker.state = "returning_to_base";
        continue;
      }
    }

    // Claim oldest unclaimed task for this owner+map
    claimTask(store, worker);
  }

  // ── State machine ──
  for (const worker of store.workers.values()) {
    switch (worker.state) {
      case "idle":
        break;

      case "moving_to_pickup": {
        const task = getWorkerTask(store, worker) as PickupTask | undefined;
        if (!task || task.type !== "pickup") { resetWorker(store, worker); break; }
        const src = store.buildings.get(task.from_building_id);
        if (!src || src.status === "constructing") { resetWorker(store, worker); break; }

        if (moveToward(worker, src.location.x, src.location.y)) {
          worker.state = "picking_up";
        }
        break;
      }

      case "picking_up": {
        const task = getWorkerTask(store, worker) as PickupTask | undefined;
        if (!task || task.type !== "pickup") { resetWorker(store, worker); break; }
        const src = store.buildings.get(task.from_building_id);
        if (!src) { resetWorker(store, worker); break; }

        // For warehouses, actual inventory lives on the admin outpost (pooled storage)
        const { inventoryBuilding: srcInv } = resolveStorageDest(src, store);

        const res = task.resource;
        // Check output_buffer first, then inventory
        const bufferAvailable = srcInv.output_buffer?.[res] ?? 0;
        const invAvailable = srcInv.inventory[res] ?? 0;
        const available = bufferAvailable + invAvailable;
        const workerRemaining = res === "money"
          ? Math.max(0, WORKER_MONEY_CAPACITY - (worker.inventory.money ?? 0))
          : worker.capacity - totalInventory(worker.inventory);
        // Respect buffer stock: only pick up amounts above the buffer threshold
        const bufferReserve = src.buffer_stock?.[res] ?? 0;
        const shippable = Math.max(0, available - bufferReserve);
        const amount = Math.min(shippable, workerRemaining);

        // Check destination max_stock (resolve through warehouse pooling if applicable)
        const destForMaxCheck = store.buildings.get(task.to_building_id);
        if (destForMaxCheck) {
          const { inventoryBuilding: actualDest } = resolveStorageDest(destForMaxCheck, store);
          const maxStock = actualDest.max_stock?.[res];
          if (maxStock !== undefined && (actualDest.inventory[res] ?? 0) >= maxStock) {
            clearWorkerTask(store, worker);
            worker.state = "idle";
            break;
          }
        }

        if (amount <= 0) {
          // Source is empty or below buffer — skip this pickup entirely
          clearWorkerTask(store, worker);
          worker.state = "idle";
          break;
        }

        if (amount > 0) {
          // Deduct from the resolved inventory building (admin outpost for warehouses)
          let remaining = amount;
          if (bufferAvailable > 0 && remaining > 0) {
            const fromBuffer = Math.min(bufferAvailable, remaining);
            srcInv.output_buffer![res] = bufferAvailable - fromBuffer;
            remaining -= fromBuffer;
          }
          if (remaining > 0) {
            srcInv.inventory[res] = invAvailable - remaining;
          }
          worker.inventory[res] = (worker.inventory[res] ?? 0) + amount;
          store.pushEvent("worker_pickup", {
            worker_id: worker.entity_id,
            building_id: src.entity_id,
            resource: res,
            amount,
          }, worker.map_key);
        }

        // Remove the pickup task, create a dropoff task (deduplicated)
        store.taskQueue.delete(task.id);

        const destBuilding = store.buildings.get(task.to_building_id);
        if (!destBuilding) {
          worker.current_task_id = undefined;
          worker.state = "idle";
          break;
        }

        // Create a per-worker dropoff task (not shared — shared tasks get
        // deleted when the first worker finishes, stranding others)
        const dropoffTask = createDropoffTask(store, worker.owner_id, worker.map_key, task.to_building_id, res);
        worker.current_task_id = dropoffTask.id;
        worker.state = "moving_to_dropoff";
        break;
      }

      case "moving_to_dropoff": {
        const task = getWorkerTask(store, worker) as DropoffTask | undefined;
        if (!task || task.type !== "dropoff") { resetWorker(store, worker); break; }
        const dest = store.buildings.get(task.building_id);
        if (!dest) { resetWorker(store, worker); break; }

        if (moveToward(worker, dest.location.x, dest.location.y)) {
          worker.state = "dropping_off";
        }
        break;
      }

      case "dropping_off": {
        const task = getWorkerTask(store, worker) as DropoffTask | undefined;
        if (!task || task.type !== "dropoff") { resetWorker(store, worker); break; }
        const dest = store.buildings.get(task.building_id);
        if (!dest) { resetWorker(store, worker); break; }

        const { inventoryBuilding: actualDest, effectiveCapacity } = resolveStorageDest(dest, store);

        const res = task.resource;
        const carrying = worker.inventory[res] ?? 0;
        // Money doesn't count toward storage capacity, so always allow it
        let destRemaining = res === "money" ? carrying : remainingCapacity(actualDest.inventory, effectiveCapacity);
        // Clamp by max_stock if set
        const maxStock = actualDest.max_stock?.[res];
        if (maxStock !== undefined) {
          const currentAmount = actualDest.inventory[res] ?? 0;
          destRemaining = Math.min(destRemaining, Math.max(0, maxStock - currentAmount));
        }
        const amount = Math.min(carrying, destRemaining);

        if (amount > 0) {
          worker.inventory[res] = (worker.inventory[res] ?? 0) - amount;
          actualDest.inventory[res] = (actualDest.inventory[res] ?? 0) + amount;

          if (res === "money" && actualDest.class === "admin_outpost") {
            const player = store.players.get(worker.owner_id);
            if (player?.tutorial_step === 5) {
              player.tutorial_step = 6;
            }
          }

          store.pushEvent("worker_dropoff", {
            worker_id: worker.entity_id,
            building_id: dest.entity_id,
            resource: res,
            amount,
          }, worker.map_key);
        }

        clearWorkerTask(store, worker);
        worker.state = "idle";
        break;
      }

      case "moving_to_construct": {
        const task = getWorkerTask(store, worker) as ConstructTask | undefined;
        if (!task || task.type !== "construct") { resetWorker(store, worker); break; }
        const building = store.buildings.get(task.building_id);
        if (!building) { resetWorker(store, worker); break; }

        if (moveToward(worker, building.location.x, building.location.y)) {
          worker.state = "constructing";
        }
        break;
      }

      case "constructing": {
        const task = getWorkerTask(store, worker) as ConstructTask | undefined;
        if (!task || task.type !== "construct") { resetWorker(store, worker); break; }
        const building = store.buildings.get(task.building_id);
        if (!building) { resetWorker(store, worker); break; }

        task.ticks_remaining--;
        if (task.ticks_remaining <= 0) {
          building.status = "active";
          store.pushEvent("construction_complete", {
            building_id: building.entity_id,
            building_class: building.class,
            owner_id: building.owner_id,
          }, worker.map_key);

          // Spawn ambassador when embassy finishes
          if (building.class === "embassy") {
            const ambId = `amb_${++store.ambassadorCounter}`;
            store.ambassadors.set(ambId, {
              entity_id: ambId,
              owner_id: building.owner_id,
              office_building_id: building.entity_id,
              map_key: building.map_key,
              x: building.location.x,
              y: building.location.y,
              state: "idle",
              carried_money: 0,
              cooldown_ticks: 0,
            });
          }

          clearWorkerTask(store, worker);
          worker.state = "idle";
        }
        break;
      }

      case "returning_to_base": {
        const targetId = worker.return_target_id ?? findAdminOutpost(store, worker);
        const target = targetId ? store.buildings.get(targetId) : undefined;
        if (!target) { worker.state = "idle"; worker.return_target_id = undefined; break; }

        if (moveToward(worker, target.location.x, target.location.y)) {
          worker.state = "unloading";
        }
        break;
      }

      case "unloading": {
        const targetId = worker.return_target_id ?? findAdminOutpost(store, worker);
        const target = targetId ? store.buildings.get(targetId) : undefined;
        if (!target) { worker.state = "idle"; worker.return_target_id = undefined; break; }

        // Resolve through warehouse pooling so inventory is written to the right place
        const { inventoryBuilding: actualDest, effectiveCapacity } = resolveStorageDest(target, store);

        // Dump inventory; money always accepted,
        // materials capped by remaining capacity (excess is destroyed)
        let totalDumped = 0;
        let moneyDumped = 0;
        let remaining = remainingCapacity(actualDest.inventory, effectiveCapacity);
        for (const key of Object.keys(worker.inventory) as MaterialType[]) {
          const amount = worker.inventory[key] ?? 0;
          if (amount <= 0) continue;
          worker.inventory[key] = 0;
          if (key === "money") {
            actualDest.inventory[key] = (actualDest.inventory[key] ?? 0) + amount;
            moneyDumped += amount;
            totalDumped += amount;
          } else {
            const accepted = Math.min(amount, remaining);
            if (accepted > 0) {
              actualDest.inventory[key] = (actualDest.inventory[key] ?? 0) + accepted;
              remaining -= accepted;
              totalDumped += accepted;
            }
            // any excess beyond capacity is destroyed
          }
        }

        if (moneyDumped > 0) {
          const player = store.players.get(worker.owner_id);
          if (player?.tutorial_step === 5) {
            player.tutorial_step = 6;
          }
        }

        if (totalDumped > 0) {
          store.pushEvent("worker_dropoff", {
            worker_id: worker.entity_id,
            building_id: target.entity_id,
            resource: "mixed",
            amount: totalDumped,
          }, worker.map_key);
        }

        worker.return_target_id = undefined;
        worker.state = "idle";
        break;
      }
    }
  }
}

// ── Task generation ──

function generatePickupTasks(store: WorldStore) {
  for (const building of store.buildings.values()) {
    if (building.status === "constructing") continue;
    if (!building.outgoing_routes) continue;

    // For warehouses, the actual inventory lives on the admin outpost (pooled storage)
    const { inventoryBuilding: srcInv } = resolveStorageDest(building, store);

    for (const route of building.outgoing_routes) {
      // Expand "all" routes into per-resource tasks
      const resources: MaterialType[] = route.resource === "all"
        ? MATERIAL_TYPES.filter((m) => {
            if (m === "money") return false;
            const available = (srcInv.output_buffer?.[m] ?? 0) + (srcInv.inventory[m] ?? 0);
            const buffer = building.buffer_stock?.[m] ?? 0;
            return available - buffer > 0;
          })
        : [route.resource];

      for (const res of resources) {
        // Skip if building has no shippable stock (respecting buffer_stock)
        const available = (srcInv.output_buffer?.[res] ?? 0) + (srcInv.inventory[res] ?? 0);
        const buffer = building.buffer_stock?.[res] ?? 0;
        if (available - buffer <= 0) continue;

        // Skip if destination is at or above max_stock for this resource
        const dest = store.buildings.get(route.to_building_id);
        if (dest) {
          const maxStock = dest.max_stock?.[res];
          if (maxStock !== undefined && (dest.inventory[res] ?? 0) >= maxStock) continue;
        }

        // Only skip if an unclaimed pickup task is already pending in the queue
        const exists = taskExists(store, "pickup", (t: PickupTask) =>
          t.from_building_id === building.entity_id &&
          t.to_building_id === route.to_building_id &&
          t.resource === res
        );
        if (exists) continue;

        const taskId = `task_${++store.taskCounter}`;
        const task: PickupTask = {
          id: taskId,
          type: "pickup",
          owner_id: building.owner_id,
          map_key: building.map_key,
          from_building_id: building.entity_id,
          to_building_id: route.to_building_id,
          resource: res,
        };
        store.taskQueue.set(taskId, task);
      }
    }
  }
}

// Find the nearest active storage node (warehouse or admin outpost) on the same map.
function findNearestStorageForBuilding(store: WorldStore, building: Building): string | null {
  const player = store.players.get(building.owner_id);
  if (!player) return null;
  const account = player.map_accounts[building.map_key];
  const outpostId = account?.admin_outpost_building_id;
  if (!outpostId || outpostId === building.entity_id) return null;

  let nearestId = outpostId;
  let nearestDist = Infinity;
  for (const b of store.buildings.values()) {
    if (b.owner_id !== building.owner_id) continue;
    if (b.map_key !== building.map_key) continue;
    if (b.status !== "active") continue;
    if (b.class !== "admin_outpost" && b.class !== "warehouse") continue;
    if (b.entity_id === building.entity_id) continue;
    const dist = Math.hypot(b.location.x - building.location.x, b.location.y - building.location.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestId = b.entity_id;
    }
  }
  return nearestId;
}

// Auto-routing: send outputs to storage and collect inputs from storage.
// Only applies to buildings with auto_route !== false.
// "Outputs" = output_buffer for recipe buildings, all inventory for mines.
// "Inputs" = recipe input materials, collected from storage up to max_stock.
function generateImpliedAdminOutpostTasks(store: WorldStore) {
  for (const building of store.buildings.values()) {
    if (building.status === "constructing") continue;
    if (building.class === "admin_outpost") continue;
    if (building.class === "warehouse") continue;
    if (building.auto_route === false) continue;

    const nearestStorageId = findNearestStorageForBuilding(store, building);
    if (!nearestStorageId) continue;

    const def = BUILDING_DEFS[building.class];
    const recipe = def?.recipe;

    // Determine which materials are outputs that should be sent to storage
    const outputMaterials = new Set<MaterialType>();
    if (recipe) {
      // Recipe building: only the recipe output is an output
      outputMaterials.add(recipe.output);
    } else if (building.class === "mine" && building.resource_type) {
      // Mine: the mined resource is its output
      outputMaterials.add(building.resource_type as MaterialType);
    }

    // --- Send OUTPUTS to nearest storage ---
    for (const res of outputMaterials) {
      const available = (building.output_buffer?.[res] ?? 0) + (building.inventory[res] ?? 0);
      const buffer = building.buffer_stock?.[res] ?? 0;
      if (available - buffer <= 0) continue;

      // Suppress if there is an active user-configured route for this resource
      const hasActiveRoute = building.outgoing_routes?.some((route) => {
        const covers = route.resource === "all" || route.resource === res;
        if (!covers) return false;
        const dest = store.buildings.get(route.to_building_id);
        if (!dest) return false;
        const maxStock = dest.max_stock?.[res];
        return maxStock === undefined || (dest.inventory[res] ?? 0) < maxStock;
      }) ?? false;
      if (hasActiveRoute) continue;

      const exists = taskExists(store, "pickup", (t: PickupTask) =>
        t.from_building_id === building.entity_id &&
        t.to_building_id === nearestStorageId &&
        t.resource === res
      );
      if (exists) continue;

      const taskId = `task_${++store.taskCounter}`;
      store.taskQueue.set(taskId, {
        id: taskId,
        type: "pickup",
        owner_id: building.owner_id,
        map_key: building.map_key,
        from_building_id: building.entity_id,
        to_building_id: nearestStorageId,
        resource: res,
      } satisfies PickupTask);
    }

    // --- Collect INPUTS from nearest storage ---
    if (recipe) {
      const { inventoryBuilding: storageInv } = resolveStorageDest(
        store.buildings.get(nearestStorageId)!, store
      );

      for (const inputMat of Object.keys(recipe.inputs) as MaterialType[]) {
        // Don't collect if building is already at or above max_stock
        const maxStock = building.max_stock?.[inputMat];
        const current = building.inventory[inputMat] ?? 0;
        if (maxStock !== undefined && current >= maxStock) continue;

        // Only collect if storage actually has this material
        const storageAvailable = storageInv.inventory[inputMat] ?? 0;
        const storageBuffer = storageInv.buffer_stock?.[inputMat] ?? 0;
        if (storageAvailable - storageBuffer <= 0) continue;

        const exists = taskExists(store, "pickup", (t: PickupTask) =>
          t.from_building_id === nearestStorageId &&
          t.to_building_id === building.entity_id &&
          t.resource === inputMat
        );
        if (exists) continue;

        const taskId = `task_${++store.taskCounter}`;
        store.taskQueue.set(taskId, {
          id: taskId,
          type: "pickup",
          owner_id: building.owner_id,
          map_key: building.map_key,
          from_building_id: nearestStorageId,
          to_building_id: building.entity_id,
          resource: inputMat,
        } satisfies PickupTask);
      }
    }
  }
}

function generateConstructTasks(store: WorldStore) {
  for (const building of store.buildings.values()) {
    if (building.status !== "constructing") continue;

    // Check if a construct task already exists for this building
    const hasTask = taskExists(store, "construct", (t: ConstructTask) =>
      t.building_id === building.entity_id
    );
    if (hasTask) continue;

    // Check if a worker is already actively constructing it
    let workerHasIt = false;
    for (const worker of store.workers.values()) {
      if (!worker.current_task_id) continue;
      const task = store.taskQueue.get(worker.current_task_id);
      if (task?.type === "construct" && (task as ConstructTask).building_id === building.entity_id) {
        workerHasIt = true;
        break;
      }
    }
    if (workerHasIt) continue;

    // Re-create construct task (full build time — progress was lost with the task)
    const def = BUILDING_DEFS[building.class];
    const taskId = `task_${++store.taskCounter}`;
    const task: ConstructTask = {
      id: taskId,
      type: "construct",
      owner_id: building.owner_id,
      map_key: building.map_key,
      building_id: building.entity_id,
      ticks_remaining: def.build_ticks,
    };
    store.taskQueue.set(taskId, task);
  }
}

/** Check if an unclaimed task matching the predicate exists in the queue. */
function taskExists<T extends WorkerTask>(store: WorldStore, type: T["type"], pred: (t: T) => boolean): boolean {
  for (const task of store.taskQueue.values()) {
    if (task.type === type && pred(task as T) && !isTaskClaimed(store, task.id)) return true;
  }
  return false;
}


function createDropoffTask(store: WorldStore, ownerId: string, mapKey: string, buildingId: string, resource: MaterialType): DropoffTask {
  const taskId = `task_${++store.taskCounter}`;
  const task: DropoffTask = {
    id: taskId,
    type: "dropoff",
    owner_id: ownerId,
    map_key: mapKey,
    building_id: buildingId,
    resource,
  };
  store.taskQueue.set(taskId, task);
  return task;
}

// ── Idle worker dispatch ──

function matchesFilter(store: WorldStore, worker: Worker, task: WorkerTask): boolean {
  const filter = worker.task_filter;
  if (!filter) return true;

  // Task type check
  if (filter.task_types && filter.task_types.length > 0) {
    if (!filter.task_types.includes(task.type)) return false;
  }

  // Resource check (only for pickup tasks)
  if (filter.resources && filter.resources.length > 0 && task.type === "pickup") {
    const pt = task as PickupTask;
    if (!filter.resources.includes(pt.resource)) return false;
  }

  // Area check — look up building location
  if (filter.area && filter.area.length > 0) {
    let building: { location: { x: number; y: number } } | undefined;
    if (task.type === "pickup") {
      building = store.buildings.get((task as PickupTask).from_building_id);
    } else if (task.type === "construct") {
      building = store.buildings.get((task as ConstructTask).building_id);
    }
    if (building) {
      const { x, y } = building.location;
      // Order-dependent: iterate rects in draw order, last one that contains the
      // point wins. This lets users add → subtract → re-add sub-regions freely.
      let included = false;
      for (const r of filter.area) {
        if (x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) {
          included = r.op === "add";
        }
      }
      if (!included) return false;
    }
  }

  return true;
}

function claimTask(store: WorldStore, worker: Worker) {
  for (const task of store.taskQueue.values()) {
    if (task.owner_id !== worker.owner_id) continue;
    if (task.map_key !== worker.map_key) continue;
    if (task.type !== "pickup" && task.type !== "construct") continue;
    if (isTaskClaimed(store, task.id)) continue;
    if (!matchesFilter(store, worker, task)) continue;

    worker.current_task_id = task.id;
    if (task.type === "pickup") {
      worker.state = "moving_to_pickup";
    } else {
      worker.state = "moving_to_construct";
    }
    return;
  }
}

function isTaskClaimed(store: WorldStore, taskId: string): boolean {
  for (const w of store.workers.values()) {
    if (w.current_task_id === taskId) return true;
  }
  return false;
}

// ── Movement ──

function resetWorker(store: WorldStore, worker: Worker) {
  clearWorkerTask(store, worker);
  worker.state = "idle";
}

function moveToward(worker: { x: number; y: number }, tx: number, ty: number): boolean {
  if (worker.x !== tx) {
    worker.x += worker.x < tx ? 1 : -1;
  } else if (worker.y !== ty) {
    worker.y += worker.y < ty ? 1 : -1;
  }
  return worker.x === tx && worker.y === ty;
}
