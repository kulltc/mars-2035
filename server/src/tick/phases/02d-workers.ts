import {
  type MaterialType,
  type Worker,
  type WorkerTask,
  type PickupTask,
  type DropoffTask,
  type ConstructTask,
  remainingCapacity,
  totalInventory,
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
  // ── Task generation: create pickup tasks from buildings with routes ──
  generatePickupTasks(store);

  // ── Idle worker dispatch ──
  for (const worker of store.workers.values()) {
    if (worker.state !== "idle") continue;
    if (worker.worker_status === "inactive") continue;

    // If worker has cargo, send it home first
    if (totalInventory(worker.inventory) > 0) {
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
        const available = src.inventory[res] ?? 0;
        const workerRemaining = worker.capacity - totalInventory(worker.inventory);
        const amount = Math.min(available, workerRemaining);

        if (amount > 0) {
          src.inventory[res] = (src.inventory[res] ?? 0) - amount;
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

        // Create deduplicated dropoff task
        const dropoffTask = findOrCreateDropoffTask(store, worker.owner_id, worker.map_key, task.to_building_id, res);
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
        const destRemaining = remainingCapacity(dest.inventory, dest.capacity);
        const amount = Math.min(carrying, destRemaining);

        if (amount > 0) {
          worker.inventory[res] = (worker.inventory[res] ?? 0) - amount;
          dest.inventory[res] = (dest.inventory[res] ?? 0) + amount;
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
        for (const key of Object.keys(worker.inventory) as MaterialType[]) {
          const amount = worker.inventory[key] ?? 0;
          if (amount <= 0) continue;
          worker.inventory[key] = 0;
          outpost.inventory[key] = (outpost.inventory[key] ?? 0) + amount;
          totalDumped += amount;
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
      const exists = taskExists(store, "pickup", (t: PickupTask) =>
        t.from_building_id === building.entity_id &&
        t.to_building_id === route.to_building_id &&
        t.resource === route.resource
      );
      if (exists) continue;

      const workerHasIt = workerHasPickup(store, building.entity_id, route.to_building_id, route.resource);
      if (workerHasIt) continue;

      const taskId = `task_${++store.taskCounter}`;
      const task: PickupTask = {
        id: taskId,
        type: "pickup",
        owner_id: building.owner_id,
        map_key: building.map_key,
        from_building_id: building.entity_id,
        to_building_id: route.to_building_id,
        resource: route.resource,
      };
      store.taskQueue.set(taskId, task);
    }
  }
}

function taskExists<T extends WorkerTask>(store: WorldStore, type: T["type"], pred: (t: T) => boolean): boolean {
  for (const task of store.taskQueue.values()) {
    if (task.type === type && pred(task as T)) return true;
  }
  return false;
}

function workerHasPickup(store: WorldStore, fromId: string, toId: string, resource: MaterialType): boolean {
  for (const worker of store.workers.values()) {
    if (!worker.current_task_id) continue;
    const task = store.taskQueue.get(worker.current_task_id);
    if (!task || task.type !== "pickup") continue;
    const pt = task as PickupTask;
    if (pt.from_building_id === fromId && pt.to_building_id === toId && pt.resource === resource) return true;
  }
  return false;
}

function findOrCreateDropoffTask(store: WorldStore, ownerId: string, mapKey: string, buildingId: string, resource: MaterialType): DropoffTask {
  for (const task of store.taskQueue.values()) {
    if (task.type === "dropoff" && task.building_id === buildingId && task.resource === resource) {
      return task as DropoffTask;
    }
  }

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

function claimTask(store: WorldStore, worker: Worker) {
  for (const task of store.taskQueue.values()) {
    if (task.owner_id !== worker.owner_id) continue;
    if (task.map_key !== worker.map_key) continue;
    if (task.type !== "pickup" && task.type !== "construct") continue;
    if (isTaskClaimed(store, task.id)) continue;

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
