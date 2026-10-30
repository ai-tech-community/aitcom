import { and, eq, or, sql } from "drizzle-orm";
import { activityEvents, communityMemberships } from "@/server/db/schema";

/** Existing issue-statistics attribution: joined, or a request now approved. */
export function magazineJoinEventCondition() {
  return or(
    eq(activityEvents.action, "community.joined"),
    and(
      eq(activityEvents.action, "community.join_requested"),
      sql`EXISTS (
        SELECT 1 FROM ${communityMemberships}
        WHERE ${communityMemberships.communityId} = ${activityEvents.communityId}
          AND ${communityMemberships.userId} = ${activityEvents.actorId}
          AND ${communityMemberships.status} = 'active'
      )`,
    ),
  );
}
