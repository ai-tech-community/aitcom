/** Shared DB input-loaders for at-risk and unactivated-newcomer selectors.
 *
 *  These perform the raw DB queries whose results are fed into `selectAtRisk`
 *  and `selectUnactivated` (pure functions in `insights.ts`).  Extracted here
 *  so the three callers (insights router, advisory router, hub-digest cron) do
 *  not duplicate the query logic.
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { activityEvents, communityMemberships } from "@/server/db/schema";
import type { db as _db } from "@/server/db";
import {
  CONTRIBUTION_ACTIONS,
  AT_RISK_PRIOR_WINDOW_DAYS,
  windowStart,
  type ActivityRow,
  type MembershipRow,
} from "@/server/communities/insights";

type DB = typeof _db;

// Drizzle inArray wants string[]; the source tuple is readonly.
const CONTRIBUTION_ACTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];

// ---------------------------------------------------------------------------
// loadAtRiskInputs
// ---------------------------------------------------------------------------

export type AtRiskInputs = {
  memberships: MembershipRow[];
  contributions: ActivityRow[];
};

/**
 * Fetches the membership and contribution-event rows that `selectAtRisk` needs.
 *
 * - memberships: all active members of the community
 * - contributions: contribution events in the prior `AT_RISK_PRIOR_WINDOW_DAYS`
 *   window (the selector itself partitions them into current vs. prior buckets)
 */
export async function loadAtRiskInputs(
  db: DB,
  communityId: string,
  now: Date,
): Promise<AtRiskInputs> {
  const since = windowStart(now, AT_RISK_PRIOR_WINDOW_DAYS);

  const [memberships, contributions] = await Promise.all([
    db
      .select({
        userId: communityMemberships.userId,
        role: communityMemberships.role,
        status: communityMemberships.status,
        joinedAt: communityMemberships.joinedAt,
      })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.status, "active"),
        ),
      ),
    db
      .select({
        actorId: activityEvents.actorId,
        action: activityEvents.action,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.communityId, communityId),
          gte(activityEvents.createdAt, since),
          inArray(activityEvents.action, CONTRIBUTION_ACTION_LIST),
          // Commissioned work-cell completions are not an activation signal.
          sql`NOT COALESCE((${activityEvents.metadata}->>'isCommissioned')::boolean, false)`,
        ),
      ),
  ]);

  return {
    memberships: memberships as MembershipRow[],
    contributions: contributions as ActivityRow[],
  };
}

// ---------------------------------------------------------------------------
// loadUnactivatedInputs
// ---------------------------------------------------------------------------

export type UnactivatedInputs = {
  memberships: MembershipRow[];
  contributorUserIds: string[];
};

/**
 * Fetches the membership and contributor-id rows that `selectUnactivated` needs.
 *
 * - memberships: all active members of the community
 * - contributorUserIds: distinct actorIds who have EVER contributed (no date
 *   filter — the selector's "never contributed" check is all-time)
 */
export async function loadUnactivatedInputs(
  db: DB,
  communityId: string,
): Promise<UnactivatedInputs> {
  const [memberships, contributorRows] = await Promise.all([
    db
      .select({
        userId: communityMemberships.userId,
        role: communityMemberships.role,
        status: communityMemberships.status,
        joinedAt: communityMemberships.joinedAt,
      })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.status, "active"),
        ),
      ),
    db
      .selectDistinct({ actorId: activityEvents.actorId })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.communityId, communityId),
          inArray(activityEvents.action, CONTRIBUTION_ACTION_LIST),
          // Commissioned work-cell completions are not an activation signal.
          sql`NOT COALESCE((${activityEvents.metadata}->>'isCommissioned')::boolean, false)`,
        ),
      ),
  ]);

  return {
    memberships: memberships as MembershipRow[],
    contributorUserIds: contributorRows.map((r) => r.actorId),
  };
}
