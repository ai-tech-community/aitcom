/**
 * A member's own progress on every badge track (`badges.myProgress`): each
 * track's metric, read by the same functions the engine earns with, so the
 * owner's "3 of 5" always agrees with what earning will see.
 */
import { BADGE_TRACK_IDS } from "@/lib/badges/catalog";
import { toTrackProgress, type TrackProgress } from "@/lib/badges/progress";
import { getPayloadClient } from "@/server/payload";

import { TRACK_METRICS, type BadgeDb, type BadgeSources } from "./metrics";

/**
 * Reads every track's metric for one member, in parallel. A track whose
 * metric fails is left out (and logged): its locked tiers then show
 * without progress instead of failing the whole tab.
 */
export async function loadTrackProgress(
  db: BadgeDb,
  userId: string,
  sources: Pick<BadgeSources, "payload"> = { payload: getPayloadClient },
): Promise<TrackProgress[]> {
  const all: BadgeSources = { db, payload: sources.payload };
  const results = await Promise.allSettled(
    BADGE_TRACK_IDS.map((track) => TRACK_METRICS[track](all, userId)),
  );
  return results.flatMap((result, index) => {
    const track = BADGE_TRACK_IDS[index]!;
    if (result.status === "fulfilled") {
      return [toTrackProgress(track, result.value)];
    }
    console.error(`badges: progress for ${track} failed`, result.reason);
    return [];
  });
}
