import { and, eq } from "drizzle-orm";

import { logActivity } from "@/server/agent/activity";
import type { db as _db } from "@/server/db";
import { communityMemberships } from "@/server/db/schema";
import type { MembershipStatus } from "./invite-policy";
import type { CommunityRole } from "./role-utils";

type DB = typeof _db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type ActivateMembershipInput = {
  communityId: string;
  userId: string;
  /**
   * The user's membership row as the caller read it, or null when they have
   * none. An existing row is only changed while it still has this status,
   * and a new row only when none appeared meanwhile, so a concurrent change
   * (a ban, a decline, a second join) is never overwritten.
   */
  existing: { id: string; status: MembershipStatus } | null;
  /** The role to hold. Omitted: an existing row keeps its role, a new one is a member. */
  role?: CommunityRole;
  /**
   * Who brought them in. Omitted: an existing row keeps its inviter and a
   * new row has none. Given: written on update and insert alike.
   */
  invitedBy?: string | null;
  /** Who acted, for the activity log. Defaults to the member themself. */
  actor?: { id: string; type: "member" | "agent" };
  /** Extra detail for the `community.joined` event (e.g. `via`). */
  metadata?: Record<string, unknown>;
  /**
   * Work that must commit together with the activation, or not at all —
   * e.g. using up one of an invite link's uses, or resolving the
   * invitation notice. It runs in the same transaction, after the
   * membership is written; throwing aborts both, and the error reaches the
   * caller.
   */
  alongside?: (tx: Tx) => Promise<void>;
};

/** The membership changed under us: roll back, report false. */
class MembershipChanged extends Error {}

async function writeActiveRow(
  tx: Tx,
  input: ActivateMembershipInput,
): Promise<boolean> {
  const { communityId, userId, existing } = input;
  if (existing) {
    const updated = await tx
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
    return updated.length > 0;
  }
  // A second join racing this one already holds the (community, user) row.
  const inserted = await tx
    .insert(communityMemberships)
    .values({
      communityId,
      userId,
      role: input.role ?? "member",
      status: "active",
      invitedBy: input.invitedBy ?? null,
    })
    .onConflictDoNothing({
      target: [communityMemberships.communityId, communityMemberships.userId],
    })
    .returning({ id: communityMemberships.id });
  return inserted.length > 0;
}

/**
 * The one way a join makes someone an active member: the membership row
 * becomes (or is created) active — together with any `alongside` work, in
 * one transaction — and then a `community.joined` event is logged (Insights,
 * the directory's activity and challenge progress read it). The caller
 * decides whether the join is allowed — policy, bans, invite links —
 * before calling.
 *
 * Returns false, and writes nothing, when the membership changed since the
 * caller read it. Callers report that as a conflict.
 */
export async function activateMembership(
  db: DB,
  input: ActivateMembershipInput,
): Promise<boolean> {
  try {
    await db.transaction(async (tx) => {
      if (!(await writeActiveRow(tx, input))) throw new MembershipChanged();
      await input.alongside?.(tx);
    });
  } catch (error) {
    if (error instanceof MembershipChanged) return false;
    throw error;
  }

  // After commit: the event's follow-up work (challenge progress) runs on
  // its own, and must not hold or outlive the transaction.
  await logActivity(db, {
    actorId: input.actor?.id ?? input.userId,
    actorType: input.actor?.type ?? "member",
    action: "community.joined",
    targetType: "community",
    targetId: input.communityId,
    communityId: input.communityId,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });

  return true;
}
