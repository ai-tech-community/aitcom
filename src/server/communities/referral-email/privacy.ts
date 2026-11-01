import { and, eq, sql } from "drizzle-orm";
import type { db as database } from "@/server/db";
import type { Tx } from "@/server/communities/activate-membership";
import {
  communityMemberships,
  referralEmailInvites as invites,
  user,
} from "@/server/db/schema";
import { recipientHash } from "./tokens";

/** Joining scrubs addresses even through a different entry route. Attribution
 * follows the real membership inviter; it is never invented by this cleanup.
 */
export async function scrubJoinedReferralEmails(
  db: typeof database | Tx,
  userId: string,
  communityId: string,
  now = new Date(),
) {
  const secret = process.env.REFERRAL_INVITE_SECRET?.trim();
  if (!secret || secret.length < 32) return;
  const [member] = await db
    .select({ email: user.email, invitedBy: communityMemberships.invitedBy })
    .from(user)
    .innerJoin(
      communityMemberships,
      and(
        eq(communityMemberships.userId, user.id),
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.status, "active"),
      ),
    )
    .where(eq(user.id, userId))
    .limit(1);
  if (!member) return;
  await db
    .update(invites)
    .set({
      recipientEmail: null,
      leaseUntil: null,
      status: sql`case when ${invites.sentAt} is null then 'suppressed' else 'sent' end`,
      joinedAt: sql`case when ${invites.senderId} = ${member.invitedBy} and ${invites.sentAt} is not null then coalesce(${invites.joinedAt}, ${now}) else ${invites.joinedAt} end`,
      joinedUserId: sql`case when ${invites.senderId} = ${member.invitedBy} and ${invites.sentAt} is not null then ${userId} else ${invites.joinedUserId} end`,
    })
    .where(
      and(
        eq(invites.communityId, communityId),
        eq(invites.recipientHash, recipientHash(member.email, secret)),
      ),
    );
}
