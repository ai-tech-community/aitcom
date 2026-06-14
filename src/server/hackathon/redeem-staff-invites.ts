// Redeems any pending hackathon-staff invites for a freshly-created account.
// Pure db operations only (no Payload) — communityId + challengeTitle are
// snapshotted on the invite row. Runs in the Better Auth user.create.after hook.
import { and, eq, isNull } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import {
  communityMemberships,
  hackathonStaff,
  hackathonStaffInvite,
  notifications,
} from "@/server/db/schema";
import { isInviteRedeemable } from "./staff-invite";

export async function redeemPendingStaffInvites(
  db: typeof Db,
  args: { userId: string; email: string; now: Date },
): Promise<void> {
  const invites = await db
    .select({
      id: hackathonStaffInvite.id,
      challengeId: hackathonStaffInvite.challengeId,
      communityId: hackathonStaffInvite.communityId,
      challengeTitle: hackathonStaffInvite.challengeTitle,
      role: hackathonStaffInvite.role,
      invitedBy: hackathonStaffInvite.invitedBy,
      revokedAt: hackathonStaffInvite.revokedAt,
      redeemedAt: hackathonStaffInvite.redeemedAt,
      expiresAt: hackathonStaffInvite.expiresAt,
    })
    .from(hackathonStaffInvite)
    .where(
      and(
        eq(hackathonStaffInvite.email, args.email),
        isNull(hackathonStaffInvite.redeemedAt),
        isNull(hackathonStaffInvite.revokedAt),
      ),
    );

  for (const invite of invites) {
    if (!isInviteRedeemable(invite, args.now)) continue;

    if (invite.communityId) {
      await db
        .insert(communityMemberships)
        .values({
          communityId: invite.communityId,
          userId: args.userId,
          status: "active",
          role: "member",
          invitedBy: invite.invitedBy,
        })
        .onConflictDoNothing();
    }

    await db
      .insert(hackathonStaff)
      .values({
        challengeId: invite.challengeId,
        userId: args.userId,
        role: invite.role,
        grantedBy: invite.invitedBy,
      })
      .onConflictDoUpdate({
        target: [
          hackathonStaff.challengeId,
          hackathonStaff.userId,
          hackathonStaff.role,
        ],
        set: {
          revokedAt: null,
          grantedBy: invite.invitedBy,
          grantedAt: args.now,
        },
      });

    await db.insert(notifications).values({
      userId: args.userId,
      type: "hackathon_staff_grant",
      title:
        invite.role === "organizer"
          ? "You're now an organizer"
          : "You're now a judge",
      content: `You were added as ${invite.role === "organizer" ? "an organizer" : "a judge"} for "${invite.challengeTitle}".`,
      metadata: { challengeId: String(invite.challengeId), role: invite.role },
      communityId: invite.communityId ?? null,
    });

    await db
      .update(hackathonStaffInvite)
      .set({ redeemedAt: args.now, redeemedUserId: args.userId })
      .where(eq(hackathonStaffInvite.id, invite.id));
  }
}
