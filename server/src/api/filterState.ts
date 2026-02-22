import type { Building, Worker, Ambassador } from "@mars-2035/shared";

/**
 * Filter world state so each player only sees full details for their own
 * buildings/workers. Rival buildings are stripped to basic info;
 * rival workers are excluded entirely.
 * Ambassadors: own are shown fully, rival ambassadors show position/owner/state only.
 */
export function filterStateForPlayer(
  playerId: string,
  buildings: Building[],
  workers: Worker[],
  ambassadors: Ambassador[] = [],
): { buildings: Building[]; workers: Worker[]; ambassadors: Ambassador[] } {
  const filteredBuildings = buildings.map((b) => {
    if (b.owner_id === playerId) return b;
    return {
      entity_id: b.entity_id,
      class: b.class,
      owner_id: b.owner_id,
      location: b.location,
      map_key: b.map_key,
      status: b.status,
      inventory: {},
      capacity: 0,
    } as Building;
  });

  const filteredWorkers = workers.filter((w) => w.owner_id === playerId);

  const filteredAmbassadors = ambassadors.map((a) => {
    if (a.owner_id === playerId) return a;
    // Strip sensitive info for rival ambassadors
    return {
      entity_id: a.entity_id,
      owner_id: a.owner_id,
      office_building_id: a.office_building_id,
      map_key: a.map_key,
      x: a.x,
      y: a.y,
      state: a.state,
      carried_money: 0, // hide actual amount
    } as Ambassador;
  });

  return { buildings: filteredBuildings, workers: filteredWorkers, ambassadors: filteredAmbassadors };
}
