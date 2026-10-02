import { and, eq, gt } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";
import { createPerUserLimit } from "@/server/rate-limit/per-user-window";
import type { Tx } from "./activate-membership";

type DB = typeof _db | Tx;

/**
 * How many direct invitations one organizer may send per hour, across all
 * their communities. Generous for real use; it stops a script from
 * notifying the whole platform.
 */
export const INVITES_PER_HOUR = 30;

/** One organizer's direct-invite budget (per server instance). */
export const checkInviteRateLimit = createPerUserLimit({
  windowMs: 3_600_000,
  max: INVITES_PER_HOUR,
});

/** After a member declines, the community may not invite them again for this long. */
export const INVITE_DECLINE_COOLDOWN_DAYS = 30;

/** The activity event that records a declined invitation (and starts the cooldown). */
export const INVITE_DECLINED_ACTION = "community.invite_declined";

/**
 * Records that a member declined a community's invitation. Written in the
 * decline's transaction, so the cooldown exists exactly when the
 * invitation is gone. A plain row, not `logActivity`: declining is not a
 * contribution, so no challenge progress follows from it.
 */
export async function recordInviteDeclined(
  db: DB,
  input: { userId: string; communityId: string; invitedBy: string | null },
): Promise<void> {
  await db.insert(activityEvents).values({
    actorId: input.userId,
    actorType: "member",
    action: INVITE_DECLINED_ACTION,
    targetType: "community",
    targetId: input.communityId,
    communityId: input.communityId,
    metadata: input.invitedBy ? { invitedBy: input.invitedBy } : {},
  });
}

/** Whether the member declined this community's invitation within the cooldown. */
export async function declinedInviteRecently(
  db: DB,
  input: { userId: string; communityId: string; now?: Date },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const since = new Date(
    now.getTime() - INVITE_DECLINE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );
  const [row] = await db
    .select({ id: activityEvents.id })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.communityId, input.communityId),
        eq(activityEvents.action, INVITE_DECLINED_ACTION),
        eq(activityEvents.actorId, input.userId),
        gt(activityEvents.createdAt, since),
      ),
    )
    .limit(1);
  return Boolean(row);
}
