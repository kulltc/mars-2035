import type { Assets, MaterialType, Player, Building } from "@mars-2035/shared";

function getAsset(assets: Assets, mat: MaterialType): number {
  return assets[mat] ?? 0;
}

function addAsset(assets: Assets, mat: MaterialType, amount: number) {
  assets[mat] = (assets[mat] ?? 0) + amount;
}

/** Move materials from building inventory → player map account */
export function transferToPlayer(
  player: Player,
  building: Building,
  material: MaterialType,
  amount: number
): { ok: true } | { ok: false; error: string } {
  if (building.owner_id !== player.entity_id) {
    return { ok: false, error: "Not your building" };
  }

  const available = getAsset(building.inventory, material);
  if (available < amount) {
    return { ok: false, error: `Insufficient ${material} in building (have ${available})` };
  }

  const account = player.map_accounts[building.map_key];
  if (!account) {
    return { ok: false, error: "No map account on this map" };
  }

  building.inventory[material] = available - amount;
  addAsset(account.assets, material, amount);

  return { ok: true };
}

/** Move materials from player map account → building inventory */
export function transferToBuilding(
  player: Player,
  building: Building,
  material: MaterialType,
  amount: number
): { ok: true } | { ok: false; error: string } {
  if (building.owner_id !== player.entity_id) {
    return { ok: false, error: "Not your building" };
  }

  const account = player.map_accounts[building.map_key];
  if (!account) {
    return { ok: false, error: "No map account on this map" };
  }

  const available = getAsset(account.assets, material);
  if (available < amount) {
    return { ok: false, error: `Insufficient ${material} in account (have ${available})` };
  }

  account.assets[material] = available - amount;
  addAsset(building.inventory, material, amount);

  return { ok: true };
}
