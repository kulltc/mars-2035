import type { Building, Worker } from "@mars-2035/shared";

/**
 * Filter world state so each player only sees full details for their own
 * buildings/workers. Rival buildings are stripped to basic info;
 * rival workers are excluded entirely.
 */
export function filterStateForPlayer(
  playerId: string,
  buildings: Building[],
  workers: Worker[]
): { buildings: Building[]; workers: Worker[] } {
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

  return { buildings: filteredBuildings, workers: filteredWorkers };
}
