import { AMBASSADOR_COOLDOWN_TICKS } from "@mars-2035/shared";
import type { WorldStore } from "../../store/WorldStore.js";

function getMaxPercent(store: WorldStore, playerId: string): number {
  const player = store.players.get(playerId);
  if (!player) return 0;
  if (player.research.includes("foreign_affairs_3")) return 0.50;
  if (player.research.includes("foreign_affairs_2")) return 0.30;
  if (player.research.includes("foreign_affairs_1")) return 0.10;
  return 0;
}

function sumTaxHistory(store: WorldStore, playerId: string): number {
  const history = store.salesTaxHistory.get(playerId);
  if (!history) return 0;
  let sum = 0;
  for (const v of history) sum += v;
  return sum;
}

function moveToward(entity: { x: number; y: number }, tx: number, ty: number): boolean {
  if (entity.x !== tx) {
    entity.x += entity.x < tx ? 1 : -1;
  } else if (entity.y !== ty) {
    entity.y += entity.y < ty ? 1 : -1;
  }
  return entity.x === tx && entity.y === ty;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function processAmbassadors(store: WorldStore) {
  for (const ambassador of store.ambassadors.values()) {
    // Tick down cooldown
    if (ambassador.cooldown_ticks > 0) {
      ambassador.cooldown_ticks--;
      // Auto-dispatch when cooldown just hit 0
      if (ambassador.cooldown_ticks === 0 && ambassador.state === "idle" && ambassador.auto_target_building_id) {
        const player = store.players.get(ambassador.owner_id);
        if (player && player.research.includes("foreign_affairs_4")) {
          const target = store.buildings.get(ambassador.auto_target_building_id);
          const office = store.buildings.get(ambassador.office_building_id);
          if (
            target && office &&
            target.map_key === office.map_key &&
            target.owner_id !== ambassador.owner_id &&
            !store.isNewPlayerProtectionActive(target.owner_id, target.map_key) &&
            !store.isNewPlayerProtectionActive(ambassador.owner_id, office.map_key)
          ) {
            ambassador.state = "moving_to_target";
            ambassador.target_building_id = ambassador.auto_target_building_id;
            store.pushEvent("ambassador_dispatched", {
              ambassador_id: ambassador.entity_id,
              owner_id: ambassador.owner_id,
              office_building_id: ambassador.office_building_id,
              target_building_id: ambassador.auto_target_building_id,
              target_owner_id: target.owner_id,
              auto: true,
            }, ambassador.map_key);
          } else {
            // Target invalid, clear auto-target
            ambassador.auto_target_building_id = undefined;
          }
        }
      }
      continue; // skip all other processing while on cooldown
    }

    if (ambassador.state === "moving_to_target") {
      const targetBuilding = ambassador.target_building_id
        ? store.buildings.get(ambassador.target_building_id)
        : undefined;
      if (!targetBuilding) {
        // Target no longer exists, return home
        ambassador.state = "returning";
        ambassador.target_building_id = undefined;
        continue;
      }

      const arrived = moveToward(ambassador, targetBuilding.location.x, targetBuilding.location.y);
      if (arrived) {
        // Calculate percentage based on sales tax history
        const senderTax = sumTaxHistory(store, ambassador.owner_id);
        const targetOwnerTax = sumTaxHistory(store, targetBuilding.owner_id);
        const maxPercent = getMaxPercent(store, ambassador.owner_id);

        let pct = 0;
        if (senderTax === 0 && targetOwnerTax === 0) {
          pct = 0;
        } else if (senderTax === 0) {
          pct = -maxPercent;
        } else {
          pct = Math.max(-maxPercent, Math.min(maxPercent, (senderTax - targetOwnerTax) / senderTax));
        }

        const cashInTarget = targetBuilding.inventory.money ?? 0;
        const amount = round2(pct * cashInTarget);

        if (amount > 0) {
          // Take from target building
          const take = Math.min(amount, cashInTarget);
          targetBuilding.inventory.money = (targetBuilding.inventory.money ?? 0) - take;
          ambassador.carried_money = take;
        } else if (amount < 0) {
          // Pay from sender's admin outpost on this map
          const senderPlayer = store.players.get(ambassador.owner_id);
          const account = senderPlayer?.map_accounts[ambassador.map_key];
          const adminOutpost = account?.admin_outpost_building_id
            ? store.buildings.get(account.admin_outpost_building_id)
            : undefined;
          if (adminOutpost) {
            const pay = Math.min(Math.abs(amount), adminOutpost.inventory.money ?? 0);
            adminOutpost.inventory.money = (adminOutpost.inventory.money ?? 0) - pay;
            targetBuilding.inventory.money = (targetBuilding.inventory.money ?? 0) + pay;
          }
          ambassador.carried_money = 0;
        } else {
          ambassador.carried_money = 0;
        }

        ambassador.state = "returning";
        store.pushEvent("ambassador_arrived", {
          ambassador_id: ambassador.entity_id,
          owner_id: ambassador.owner_id,
          target_building_id: ambassador.target_building_id,
          target_owner_id: targetBuilding.owner_id,
          carried_money: ambassador.carried_money,
          pct,
        }, ambassador.map_key);
      }
    }

    if (ambassador.state === "returning") {
      const office = store.buildings.get(ambassador.office_building_id);
      if (!office) {
        // Office destroyed, ambassador disappears
        store.ambassadors.delete(ambassador.entity_id);
        continue;
      }

      const arrived = moveToward(ambassador, office.location.x, office.location.y);
      if (arrived) {
        // Deposit carried money into office inventory
        if (ambassador.carried_money > 0) {
          office.inventory.money = (office.inventory.money ?? 0) + ambassador.carried_money;
          ambassador.carried_money = 0;
        }
        ambassador.state = "idle";
        ambassador.target_building_id = undefined;
        ambassador.cooldown_ticks = AMBASSADOR_COOLDOWN_TICKS;
        store.pushEvent("ambassador_returned", {
          ambassador_id: ambassador.entity_id,
          owner_id: ambassador.owner_id,
          office_building_id: ambassador.office_building_id,
        }, ambassador.map_key);
      }
    }
  }
}
