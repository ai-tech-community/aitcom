/** Shared awaiting-response (greeter) queue computation. No profile hydration,
 *  no sort — callers hydrate/sort as needed. `now` injected for testability. */

import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";

import {
  activityEvents,
  communityMemberships,
  communityActivationConfig,
} from "@/server/db/schema";
import {
  RESPONSE_ACTIONS,
  RESPONDABLE_ACTIONS,
} from "@/server/communities/activation";
import { windowStart } from "@/server/communities/insights";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

export const ACTIVATION_COHORT_DAYS = 30;
export const GREETER_GRACE_HOURS = 48;

// Drizzle inArray wants string[]; the source tuples are readonly.
const RESPONSE_LIST: string[] = [...RESPONSE_ACTIONS];
const RESPONDABLE_LIST: string[] = [...RESPONDABLE_ACTIONS];

export const DEFAULT_WINDOW_DAYS = 7;

export type AwaitingResponseItem = {
  userId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  contributionAt: Date;
};

/** The greeter queue: cohort members (active, joined ≤ ACTIVATION_COHORT_DAYS)
 *  whose earliest respondable contribution is still unanswered and whose age is
 *  in [GREETER_GRACE_HOURS, windowDays]. Returns RAW items (no profiles). */
export async function loadAwaitingResponse(
  db: DB,
  communityId: string,
  now: Date,
): Promise<AwaitingResponseItem[]> {
  const cohortStart = windowStart(now, ACTIVATION_COHORT_DAYS);

  const [cfgRow] = await db
    .select({ windowDays: communityActivationConfig.windowDays })
    .from(communityActivationConfig)
    .where(eq(communityActivationConfig.communityId, communityId))
    .limit(1);
  const windowDays = cfgRow?.windowDays ?? DEFAULT_WINDOW_DAYS;

  const memberships = await db
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.status, "active"),
        gte(communityMemberships.joinedAt, cohortStart),
      ),
    );
  const cohortIds = memberships.map((m) => m.userId);
  if (cohortIds.length === 0) return [];

  const respondable = await db
    .select({
      actorId: activityEvents.actorId,
      action: activityEvents.action,
      targetType: activityEvents.targetType,
      targetId: activityEvents.targetId,
      metadata: activityEvents.metadata,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.communityId, communityId),
        gte(activityEvents.createdAt, cohortStart),
        inArray(activityEvents.actorId, cohortIds),
        inArray(activityEvents.action, RESPONDABLE_LIST),
      ),
    );
  const earliestRespondable = new Map<string, (typeof respondable)[number]>();
  for (const e of respondable) {
    const cur = earliestRespondable.get(e.actorId);
    if (!cur || e.createdAt < cur.createdAt) {
      earliestRespondable.set(e.actorId, e);
    }
  }

  const responseEvents = await db
    .select({
      recipientId: activityEvents.recipientId,
      actorId: activityEvents.actorId,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.communityId, communityId),
        gte(activityEvents.createdAt, cohortStart),
        isNotNull(activityEvents.recipientId),
        inArray(activityEvents.recipientId, cohortIds),
        inArray(activityEvents.action, RESPONSE_LIST),
      ),
    );
  const respondedSet = new Set<string>(
    responseEvents.flatMap((e) =>
      e.recipientId !== null && e.recipientId !== e.actorId
        ? [e.recipientId]
        : [],
    ),
  );

  const DAY_MS = 24 * 60 * 60 * 1000;
  const graceMs = GREETER_GRACE_HOURS * 60 * 60 * 1000;
  // Floor the effective window above the grace so a small windowDays (≤2) can't
  // collapse the actionable range to empty — keep at least ~1 day of headroom.
  const windowMs = Math.max(windowDays * DAY_MS, graceMs + DAY_MS);
  return [...earliestRespondable.entries()]
    .filter(([userId, e]) => {
      if (respondedSet.has(userId)) return false;
      const ageMs = now.getTime() - e.createdAt.getTime();
      return ageMs >= graceMs && ageMs <= windowMs;
    })
    .map(([userId, e]) => ({
      userId,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      metadata: e.metadata,
      contributionAt: e.createdAt,
    }));
}
