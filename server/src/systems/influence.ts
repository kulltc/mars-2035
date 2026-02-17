import {
  type DistrictKey,
  type DistrictState,
  CONTEST_DELTA,
} from "@mars-2035/shared";
import type { WorldStore } from "../store/WorldStore.js";

export function recalculateDistrict(store: WorldStore, districtKey: DistrictKey): DistrictState {
  const buildings = store.getBuildingsByDistrict(districtKey);
  const scores: Record<string, number> = {};

  for (const b of buildings) {
    if (b.influence_value && b.status === "active") {
      scores[b.owner_id] = (scores[b.owner_id] ?? 0) + b.influence_value;
    }
  }

  // Find top two
  let topPlayer: string | undefined;
  let topScore = 0;
  let runnerUpScore = 0;

  for (const [playerId, score] of Object.entries(scores)) {
    if (score > topScore) {
      runnerUpScore = topScore;
      topPlayer = playerId;
      topScore = score;
    } else if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }

  const contested = topScore > 0 && topScore - runnerUpScore < CONTEST_DELTA;
  const ownerId = topScore > 0 && !contested ? topPlayer : undefined;

  const state: DistrictState = {
    district_id: districtKey,
    owner_id: ownerId,
    contested,
    influence_scores: scores,
  };

  store.districts.set(districtKey, state);
  return state;
}
