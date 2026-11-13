import { eq, or, sql, type SQL } from "drizzle-orm";

import { DELETED_AUTHOR_ID } from "@/lib/account-deletion";
import { type db } from "@/server/db";
import {
  account,
  activityEvents,
  agentApiKeys,
  agentDrafts,
  agentProfiles,
  agentSuggestions,
  agentWebhooks,
  challengeThreads,
  communityMatchingProfiles,
  eventRegistrations,
  hackathonStaffInvite,
  hubMailPrefs,
  magazineSubscriptions,
  memberProfiles,
  messages,
  newsStorySuggestions,
  notificationOptouts,
  notifications,
  onboardingSteps,
  paymentComplimentaryMembers,
  paymentOrders,
  paymentSubscriptions,
  referralEmailInvites,
  session,
  socialIdentities,
  startupMemberCvs,
  startups,
  user,
  verification,
} from "@/server/db/schema";

/**
 * Shared label stored on anonymized public posts. The settings copy is
 * translated; this value is what already-published rows keep.
 */
export const DELETED_MEMBER_NAME = "Deleted member";

export { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/account-deletion";
export { DELETED_AUTHOR_ID };

const REDACTED_EMAIL = "redacted@deleted.invalid";
const IDENTIFIER = /^[a-z_]+$/;

/**
 * A Payload table holding content we keep that points at its author by id.
 * `name` is the column a copied display name lives in, when the table keeps
 * one; readers of a table without it show the sentinel id as a deleted
 * member themselves.
 */
type AuthoredTable = { table: string; id: string; name?: string };

/**
 * Payload tables that copy the member's id (and, most of them, display name)
 * onto content we keep. Author ids here are text, not foreign keys, so they
 * can leave the account entirely.
 */
export const AUTHORED_CONTENT: readonly AuthoredTable[] = [
  { table: "forum_threads", id: "author_id", name: "author_name" },
  { table: "forum_replies", id: "author_id", name: "author_name" },
  { table: "community_ideas", id: "author_id", name: "author_name" },
  { table: "comments", id: "author_id", name: "author_name" },
  { table: "feed_posts", id: "author_id", name: "author_name" },
  { table: "feed_comments", id: "author_id", name: "author_name" },
  { table: "courses", id: "author_id", name: "author_name" },
  { table: "launchpad_projects", id: "author_id", name: "author_name" },
  { table: "articles", id: "author_id", name: "author_name" },
  {
    table: "_articles_v",
    id: "version_author_id",
    name: "version_author_name",
  },
  // Gallery photos and videos stay up, by no one (spec 2026-11-13).
  { table: "gallery_items", id: "uploader_id" },
  { table: "gallery_batches", id: "uploader_id" },
];

export class AccountNotFoundError extends Error {
  constructor() {
    super("Account not found");
    this.name = "AccountNotFoundError";
  }
}

export function deletedAccountEmail(userId: string): string {
  return `deleted+${userId}@deleted.invalid`;
}

type Database = Pick<typeof db, "transaction">;

/**
 * Irreversibly anonymize one member account.
 *
 * The user row stays. Dozens of app tables reference it with NOT NULL foreign
 * keys and no ON DELETE clause, and several of those (memberships, votes)
 * are unique per member, so a shared tombstone user would collide. The row
 * keeps no name, email, or image. Sessions and auth accounts are removed, so
 * the old email and linked providers cannot sign in.
 *
 * Public posts, replies, and ideas keep their text. Their author id is
 * rewritten to a non-account sentinel and the copied name becomes
 * "Deleted member". Gallery photos and videos stay too, their uploader id
 * rewritten the same way (they copy no name). Votes stay on the anonymized
 * account id so counts and one-vote rows do not collapse together.
 *
 * Payment orders and subscriptions stay for the Dutch seven-year bookkeeping
 * duty. The buyer link, mandate token, and buyer email are removed. Provider
 * references stay so a receipt can still be matched at Mollie or Adyen.
 */
export async function deleteMemberAccount(
  database: Database,
  userId: string,
): Promise<void> {
  await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!existing) throw new AccountNotFoundError();

    const email = existing.email;

    await tx.delete(session).where(eq(session.userId, userId));
    await tx.delete(account).where(eq(account.userId, userId));
    // Password-reset rows store the user id in `value` and a random token in
    // `identifier`. Match both exactly so a shorter email cannot hit another row.
    await tx
      .delete(verification)
      .where(
        or(eq(verification.identifier, email), eq(verification.value, userId)),
      );
    await tx.delete(memberProfiles).where(eq(memberProfiles.userId, userId));
    await tx
      .delete(socialIdentities)
      .where(eq(socialIdentities.userId, userId));
    await tx
      .delete(startupMemberCvs)
      .where(eq(startupMemberCvs.userId, userId));
    await tx
      .delete(communityMatchingProfiles)
      .where(eq(communityMatchingProfiles.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx
      .delete(notificationOptouts)
      .where(eq(notificationOptouts.userId, userId));
    await tx.delete(hubMailPrefs).where(eq(hubMailPrefs.userId, userId));
    await tx.delete(onboardingSteps).where(eq(onboardingSteps.userId, userId));
    await tx
      .delete(newsStorySuggestions)
      .where(eq(newsStorySuggestions.userId, userId));
    await tx.delete(agentApiKeys).where(eq(agentApiKeys.ownerId, userId));
    await tx.delete(agentWebhooks).where(eq(agentWebhooks.ownerId, userId));
    await tx.delete(agentDrafts).where(eq(agentDrafts.ownerId, userId));
    await tx
      .delete(agentSuggestions)
      .where(eq(agentSuggestions.ownerId, userId));
    await tx
      .delete(paymentComplimentaryMembers)
      .where(eq(paymentComplimentaryMembers.userId, userId));

    await tx
      .update(agentProfiles)
      .set({
        ownerId: null,
        claimToken: null,
        claimTokenExpiresAt: null,
        verificationCode: null,
        xHandle: null,
        canReadOwnerDMs: false,
      })
      .where(eq(agentProfiles.ownerId, userId));

    await tx
      .update(user)
      .set({
        name: DELETED_MEMBER_NAME,
        firstName: null,
        lastName: null,
        email: deletedAccountEmail(userId),
        emailVerified: false,
        image: null,
        newsStoryEmailOptedOutAt: new Date(),
      })
      .where(eq(user.id, userId));

    await tx
      .update(eventRegistrations)
      .set({ answers: {} })
      .where(eq(eventRegistrations.userId, userId));

    await tx
      .update(paymentOrders)
      .set({ buyerId: null, buyerEmail: REDACTED_EMAIL })
      .where(eq(paymentOrders.buyerId, userId));
    await tx
      .update(paymentSubscriptions)
      .set({ userId: null, token: null, cancelAtPeriodEnd: true })
      .where(eq(paymentSubscriptions.userId, userId));

    await tx
      .update(messages)
      .set({
        content: "[deleted]",
        metadata: null,
        uiResource: null,
        uiProducerTrust: null,
      })
      .where(eq(messages.senderId, userId));
    await tx
      .update(activityEvents)
      .set({ metadata: null })
      .where(eq(activityEvents.actorId, userId));
    await tx
      .update(challengeThreads)
      .set({ metadata: null })
      .where(eq(challengeThreads.authorId, userId));
    await tx
      .update(referralEmailInvites)
      .set({ senderName: DELETED_MEMBER_NAME })
      .where(eq(referralEmailInvites.senderId, userId));
    await tx
      .update(magazineSubscriptions)
      .set({ email: null, confirmTokenHash: null })
      .where(
        or(
          eq(magazineSubscriptions.userId, userId),
          eq(magazineSubscriptions.email, email),
        ),
      );
    await tx
      .update(hackathonStaffInvite)
      .set({ email: `redacted+${userId}@deleted.invalid` })
      .where(eq(hackathonStaffInvite.email, email));

    await tx
      .update(startups)
      .set({
        claimedByUserId: null,
        claimStatus: null,
        claimDraft: null,
        claimedAt: null,
      })
      .where(eq(startups.claimedByUserId, userId));
    await tx
      .update(startups)
      .set({ submittedByUserId: null })
      .where(eq(startups.submittedByUserId, userId));

    for (const statement of authoredContentStatements(userId)) {
      await tx.execute(statement);
    }
  });
}

export function authoredContentStatements(userId: string): SQL[] {
  return AUTHORED_CONTENT.map((entry) => {
    const table = quoteTable(entry.table);
    const id = quoteColumn(entry.id);
    const name =
      entry.name === undefined
        ? sql``
        : sql`${quoteColumn(entry.name)} = ${DELETED_MEMBER_NAME}, `;
    return sql`UPDATE ${table} SET ${name}${id} = ${DELETED_AUTHOR_ID} WHERE ${id} = ${userId}`;
  });
}

function quoteTable(value: string): SQL {
  return sql.raw(`public."${ident(value)}"`);
}

function quoteColumn(value: string): SQL {
  return sql.raw(`"${ident(value)}"`);
}

function ident(value: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return value;
}
