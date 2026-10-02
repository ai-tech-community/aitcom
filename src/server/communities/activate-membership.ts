import { and, eq } from "drizzle-orm";

import { logActivity } from "@/server/agent/activity";
import type { db as _db } from "@/server/db";
import { communityMemberships } from "@/server/db/schema";
import type { MembershipStatus } from "./invite-policy";
import type { CommunityRole } from "./role-utils";

type DB = typeof _db;

export type ActivateMembershipInput = {
  communityId: string;
  userId: string;
  /**
   * The user's membership row as the caller read it, or null when they have
   * none. An existing row is only changed while it still has this status,
   * so a concurrent change (a ban, a decline) is never overwritten.
   */
  existing: { id: string; status: MembershipStatus } | null;
  /** The role to hold. Omitted: an existing row keeps its role, a new one is a member. */
  role?: CommunityRole;
  /** Who brought them in. Omitted: an existing row keeps its inviter. */
  invitedBy?: string | null;
  /** Who acted, for the activity log. Defaults to the member themself. */
  actor?: { id: string; type: "member" | "agent" };
  /** Extra detail for the `community.joined` event (e.g. `via`). */
  metadata?: Record<string, unknown>;
};

/**
 * The one way a join makes someone an active member: the membership row
 * becomes (or is created) active, and a `community.joined` event is logged
 * (Insights, the directory's activity and challenge progress read it).
 * The caller decides whether the join is allowed — policy, bans, invite
 * links — before calling.
 *
 * Returns false, and writes nothing, when the existing row no longer has
 * the status the caller read.
 */
export async function activateMembership(
  db: DB,
  input: ActivateMembershipInput,
): Promise<boolean> {
  const { communityId, userId, existing } = input;

  if (existing) {
    const [updated] = await db
      .update(communityMemberships)
      .set({
        status: "active",
        ...(input.role ? { role: input.role } : {}),
        ...(input.invitedBy !== undefined
          ? { invitedBy: input.invitedBy }
          : {}),
      })
      .where(
        and(
          eq(communityMemberships.id, existing.id),
          eq(communityMemberships.status, existing.status),
        ),
      )
      .returning({ id: communityMemberships.id });
    if (!updated) return false;
  } else {
    await db.insert(communityMemberships).values({
      communityId,
      userId,
      role: input.role ?? "member",
      status: "active",
      invitedBy: input.invitedBy ?? null,
    });
  }

  await logActivity(db, {
    actorId: input.actor?.id ?? userId,
    actorType: input.actor?.type ?? "member",
    action: "community.joined",
    targetType: "community",
    targetId: communityId,
    communityId,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });

  return true;
}
