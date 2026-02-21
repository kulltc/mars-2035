import {
  type MaterialType,
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
  // ── Task generation ──
  generatePickupTasks(store);
  generateConstructTasks(store);

  // ── Idle worker dispatch ──
  for (const worker of store.workers.values()) {
    if (worker.state !== "idle") continue;
    if (worker.worker_status === "inactive") continue;

    // If worker has cargo (including money), send it home first
    if (totalInventory(worker.inventory) > 0 || (worker.inventory.money ?? 0) > 0) {
      const outpostId = findAdminOutpost(store, worker);
      const outpost = outpostId ? store.buildings.get(outpostId) : undefined;
      if (outpost) {
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

        const res = task.resource;
        // Check output_buffer first, then inventory
        const bufferAvailable = src.output_buffer?.[res] ?? 0;
        const invAvailable = src.inventory[res] ?? 0;
        const available = bufferAvailable + invAvailable;
        const workerRemaining = res === "money"
          ? Math.max(0, WORKER_MONEY_CAPACITY - (worker.inventory.money ?? 0))
          : worker.capacity - totalInventory(worker.inventory);
        // Respect buffer stock: only pick up amounts above the buffer threshold
        const bufferReserve = src.buffer_stock?.[res] ?? 0;
        const shippable = Math.max(0, available - bufferReserve);
        const amount = Math.min(shippable, workerRemaining);

        if (amount <= 0) {
          // Source is empty or below buffer — skip this pickup entirely
          clearWorkerTask(store, worker);
          worker.state = "idle";
          break;
        }

        if (amount > 0) {
          // Deduct from output_buffer first, then inventory
          let remaining = amount;
          if (bufferAvailable > 0 && remaining > 0) {
            const fromBuffer = Math.min(bufferAvailable, remaining);
            src.output_buffer![res] = bufferAvailable - fromBuffer;
            remaining -= fromBuffer;
          }
          if (remaining > 0) {
            src.inventory[res] = invAvailable - remaining;
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

        const res = task.resource;
        const carrying = worker.inventory[res] ?? 0;
        // Money doesn't count toward storage capacity, so always allow it
        const destRemaining = res === "money" ? carrying : remainingCapacity(dest.inventory, dest.capacity);
        const amount = Math.min(carrying, destRemaining);

        if (amount > 0) {
          worker.inventory[res] = (worker.inventory[res] ?? 0) - amount;
          dest.inventory[res] = (dest.inventory[res] ?? 0) + amount;

          if (res === "money" && dest.class === "admin_outpost") {
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
          clearWorkerTask(store, worker);
          worker.state = "idle";
        }
        break;
      }

      case "returning_to_base": {
        const outpostId = findAdminOutpost(store, worker);
        const outpost = outpostId ? store.buildings.get(outpostId) : undefined;
        if (!outpost) { worker.state = "idle"; break; }

        if (moveToward(worker, outpost.location.x, outpost.location.y)) {
          worker.state = "unloading";
        }
        break;
      }

      case "unloading": {
        const outpostId = findAdminOutpost(store, worker);
        const outpost = outpostId ? store.buildings.get(outpostId) : undefined;
        if (!outpost) { worker.state = "idle"; break; }

        // Dump all inventory into admin outpost (always accept — it's home base)
        let totalDumped = 0;
        let moneyDumped = 0;
        for (const key of Object.keys(worker.inventory) as MaterialType[]) {
          const amount = worker.inventory[key] ?? 0;
          if (amount <= 0) continue;
          worker.inventory[key] = 0;
          outpost.inventory[key] = (outpost.inventory[key] ?? 0) + amount;
          if (key === "money") moneyDumped += amount;
          totalDumped += amount;
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
            building_id: outpost.entity_id,
            resource: "mixed",
            amount: totalDumped,
          }, worker.map_key);
        }

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

    for (const route of building.outgoing_routes) {
      // Expand "all" routes into per-resource tasks
      const resources: MaterialType[] = route.resource === "all"
        ? MATERIAL_TYPES.filter((m) => {
            const available = (building.output_buffer?.[m] ?? 0) + (building.inventory[m] ?? 0);
            const buffer = building.buffer_stock?.[m] ?? 0;
            return available - buffer > 0;
          })
        : [route.resource];

      for (const res of resources) {
        // Skip if building has no shippable stock (respecting buffer_stock)
        const available = (building.output_buffer?.[res] ?? 0) + (building.inventory[res] ?? 0);
        const buffer = building.buffer_stock?.[res] ?? 0;
        if (available - buffer <= 0) continue;

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
  if (filter.area) {
    let building: { location: { x: number; y: number } } | undefined;
    if (task.type === "pickup") {
      building = store.buildings.get((task as PickupTask).from_building_id);
    } else if (task.type === "construct") {
      building = store.buildings.get((task as ConstructTask).building_id);
    }
    if (building) {
      const { x, y } = building.location;
      const a = filter.area;
      if (x < a.x1 || x > a.x2 || y < a.y1 || y > a.y2) return false;
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
