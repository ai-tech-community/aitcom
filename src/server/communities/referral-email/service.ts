import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import type { db as database } from "@/server/db";
import type { Tx } from "@/server/communities/activate-membership";
import {
  communities,
  communityAcquireConfig,
  communityInvites,
  communityMemberships,
  referralCredits,
  referralEmailInvites as invites,
  referralEmailSuppressions as suppressions,
  referralInviteBatches as batches,
  referralInviteBudgets as budgets,
  user,
} from "@/server/db/schema";
import {
  REFERRAL_DAILY_LIMIT,
  REFERRAL_RETENTION_DAYS,
  referralSenderFallback,
  type ReferralLocale,
} from "@/lib/referral-invites";
import { referralSecret, referralSendingEnabled } from "./config";
import { recipientHash } from "./tokens";

type DB = typeof database;
const days = (n: number) => n * 86_400_000;
export const utcDay = (now: Date) => now.toISOString().slice(0, 10);

export async function referralContext(db: DB, userId: string, slug: string) {
  const [row] = await db
    .select({
      community: communities,
      membership: communityMemberships,
      sender: user,
    })
    .from(communities)
    .innerJoin(
      communityMemberships,
      and(
        eq(communityMemberships.communityId, communities.id),
        eq(communityMemberships.userId, userId),
      ),
    )
    .innerJoin(user, eq(user.id, userId))
    .where(
      and(
        eq(communities.slug, slug),
        isNull(communities.deletedAt),
        eq(communityMemberships.status, "active"),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "FORBIDDEN" });
  const [config] = await db
    .select()
    .from(communityAcquireConfig)
    .where(eq(communityAcquireConfig.communityId, row.community.id))
    .limit(1);
  return { ...row, referralsEnabled: config?.referralsEnabled !== false };
}
export type ReferralContext = Awaited<ReturnType<typeof referralContext>>;

/** Personal links cannot reuse a grant to an elevated role or another email. */
export async function personalReferralLink(db: DB, context: ReferralContext) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`referral-link:${context.sender.id}:${context.community.id}`}, 0))`,
    );
    const [existing] = await tx
      .select({ code: communityInvites.code })
      .from(communityInvites)
      .where(
        and(
          eq(communityInvites.communityId, context.community.id),
          eq(communityInvites.createdBy, context.sender.id),
          isNull(communityInvites.targetEmail),
          or(
            isNull(communityInvites.role),
            eq(communityInvites.role, "member"),
          ),
          isNull(communityInvites.expiresAt),
          isNull(communityInvites.maxUses),
        ),
      )
      .orderBy(asc(communityInvites.createdAt))
      .limit(1);
    if (existing) return existing;
    const code = crypto.randomUUID().replaceAll("-", "");
    await tx.insert(communityInvites).values({
      communityId: context.community.id,
      createdBy: context.sender.id,
      code,
    });
    return { code };
  });
}

export async function referralWorkspace(
  db: DB,
  context: ReferralContext,
  now = new Date(),
) {
  const [summary] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${invites.sentAt} is not null)::int`,
      joined: sql<number>`count(distinct ${invites.recipientHash}) filter (where ${invites.joinedAt} is not null)::int`,
      pending: sql<number>`count(*) filter (where ${invites.status} in ('queued', 'sending') and ${invites.phase} = 'invite')::int`,
      failed: sql<number>`count(*) filter (where ${invites.status} = 'failed' and ${invites.phase} = 'invite')::int`,
    })
    .from(invites)
    .where(
      and(
        eq(invites.senderId, context.sender.id),
        eq(invites.communityId, context.community.id),
      ),
    );
  const [activated] = await db
    .select({ count: count() })
    .from(referralCredits)
    .where(
      and(
        eq(referralCredits.referrerId, context.sender.id),
        eq(referralCredits.communityId, context.community.id),
      ),
    );
  const [budget] = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.senderId, context.sender.id),
        eq(budgets.day, utcDay(now)),
      ),
    );
  return {
    communityName: context.community.name,
    senderName: context.sender.name,
    canSend:
      referralSendingEnabled() &&
      context.referralsEnabled &&
      Boolean(context.sender.emailVerified),
    unavailableReason: !context.referralsEnabled
      ? ("community" as const)
      : !context.sender.emailVerified
        ? ("verification" as const)
        : !referralSendingEnabled()
          ? ("launch" as const)
          : null,
    remaining: Math.max(0, REFERRAL_DAILY_LIMIT - (budget?.used ?? 0)),
    sent: summary?.sent ?? 0,
    joined: summary?.joined ?? 0,
    pending: summary?.pending ?? 0,
    failed: summary?.failed ?? 0,
    activated: activated?.count ?? 0,
  };
}

export async function queueReferralBatch(
  db: DB,
  context: ReferralContext,
  input: { requestId: string; emails: string[]; locale: ReferralLocale },
  now = new Date(),
) {
  if (!referralSendingEnabled())
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Invitations are not enabled",
    });
  if (!context.referralsEnabled || !context.sender.emailVerified)
    throw new TRPCError({ code: "FORBIDDEN" });
  const secret = referralSecret();
  const emails = [
    ...new Set(input.emails.map((email) => email.trim().toLowerCase())),
  ];
  const recipients = emails
    .map((email) => ({ email, hash: recipientHash(email, secret) }))
    .sort((a, b) => a.hash.localeCompare(b.hash));
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        context.community.id,
        input.locale,
        recipients.map((r) => r.hash),
      ]),
    )
    .digest("hex");
  const { code } = await personalReferralLink(db, context);
  return db.transaction(async (tx) => {
    const batchId = crypto.randomUUID();
    const inserted = await tx
      .insert(batches)
      .values({
        id: batchId,
        senderId: context.sender.id,
        requestId: input.requestId,
        fingerprint,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) {
      const [previous] = await tx
        .select()
        .from(batches)
        .where(
          and(
            eq(batches.senderId, context.sender.id),
            eq(batches.requestId, input.requestId),
          ),
        )
        .limit(1);
      if (previous?.fingerprint !== fingerprint)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Invitation request changed; start a new batch",
        });
      return { batchId: previous.id, skipped: previous.skipped };
    }
    await tx
      .insert(budgets)
      .values({ senderId: context.sender.id, day: utcDay(now) })
      .onConflictDoNothing();
    const [budget] = await tx
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.senderId, context.sender.id),
          eq(budgets.day, utcDay(now)),
        ),
      )
      .for("update");
    const accepted: typeof recipients = [];
    for (const recipient of recipients) {
      // Sorted recipient locks serialize dedupe across members and communities.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`referral-recipient:${recipient.hash}`}, 0))`,
      );
      if (recipient.hash === recipientHash(context.sender.email, secret))
        continue;
      const [suppressed] = await tx
        .select()
        .from(suppressions)
        .where(eq(suppressions.recipientHash, recipient.hash))
        .limit(1);
      if (suppressed) continue;
      const [recent] = await tx
        .select({ id: invites.id })
        .from(invites)
        .where(
          and(
            eq(invites.recipientHash, recipient.hash),
            gte(
              invites.createdAt,
              new Date(now.getTime() - days(REFERRAL_RETENTION_DAYS)),
            ),
          ),
        )
        .limit(1);
      if (recent) continue;
      const [member] = await tx
        .select({ id: user.id })
        .from(user)
        .innerJoin(
          communityMemberships,
          eq(communityMemberships.userId, user.id),
        )
        .where(
          and(
            sql`lower(${user.email}) = ${recipient.email}`,
            eq(communityMemberships.communityId, context.community.id),
            inArray(communityMemberships.status, ["active", "banned"]),
          ),
        )
        .limit(1);
      if (member) continue;
      accepted.push(recipient);
    }
    if ((budget?.used ?? 0) + accepted.length > REFERRAL_DAILY_LIMIT)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Daily invitation limit reached",
      });
    if (accepted.length) {
      await tx.insert(invites).values(
        accepted.map((recipient) => ({
          id: crypto.randomUUID(),
          batchId,
          senderId: context.sender.id,
          communityId: context.community.id,
          inviteCode: code,
          recipientHash: recipient.hash,
          recipientEmail: recipient.email,
          senderName:
            (context.sender.name?.trim() ?? "") ||
            referralSenderFallback[input.locale],
          communityName: context.community.name,
          locale: input.locale,
          createdAt: now,
          nextAttemptAt: now,
        })),
      );
      await tx
        .update(budgets)
        .set({ used: sql`${budgets.used} + ${accepted.length}` })
        .where(
          and(
            eq(budgets.senderId, context.sender.id),
            eq(budgets.day, utcDay(now)),
          ),
        );
    }
    const skipped = recipients.length - accepted.length;
    await tx.update(batches).set({ skipped }).where(eq(batches.id, batchId));
    return { batchId, skipped };
  });
}

/** Same advisory key as queuing; retries/webhook replays safely converge. */
export async function suppressReferralEmail(
  db: DB,
  hash: string,
  reason: "unsubscribe" | "bounce" | "complaint",
) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`referral-recipient:${hash}`}, 0))`,
    );
    await tx
      .insert(suppressions)
      .values({ recipientHash: hash, reason })
      .onConflictDoNothing();
    await tx
      .update(invites)
      .set({ status: "suppressed", recipientEmail: null, leaseUntil: null })
      .where(eq(invites.recipientHash, hash));
  });
}

/** Matches the authenticated recipient, never a UTM/ref value or an email in a URL. */
export async function recordReferralEmailJoin(
  db: DB | Tx,
  input: {
    deliveryId?: string;
    code: string;
    userId: string;
    email: string;
    communityId: string;
    senderId: string;
    newlyJoined?: boolean;
  },
  now = new Date(),
) {
  if (!input.deliveryId || !process.env.REFERRAL_INVITE_SECRET) return;
  const [delivery] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.id, input.deliveryId),
        eq(invites.inviteCode, input.code),
        eq(invites.communityId, input.communityId),
        eq(invites.senderId, input.senderId),
        eq(invites.recipientHash, recipientHash(input.email, referralSecret())),
        isNotNull(invites.sentAt),
        isNull(invites.joinedAt),
      ),
    )
    .limit(1);
  if (!delivery || delivery.senderId === input.userId) return;
  // Hub signup auto-enrolls before redemption. Only a membership joined after
  // this invitation, with no competing referrer, can be attributed here.
  const attributed = await db
    .update(communityMemberships)
    .set({ invitedBy: delivery.senderId })
    .where(
      and(
        eq(communityMemberships.userId, input.userId),
        eq(communityMemberships.communityId, delivery.communityId),
        eq(communityMemberships.status, "active"),
        input.newlyJoined
          ? undefined
          : gte(communityMemberships.joinedAt, delivery.createdAt),
        or(
          isNull(communityMemberships.invitedBy),
          eq(communityMemberships.invitedBy, delivery.senderId),
        ),
      ),
    )
    .returning({ id: communityMemberships.id });
  if (!attributed.length) return;
  await db
    .update(invites)
    .set({
      joinedAt: now,
      joinedUserId: input.userId,
      recipientEmail: null,
      leaseUntil: null,
      status: "sent",
    })
    .where(and(eq(invites.id, delivery.id), isNull(invites.joinedAt)));
}

export async function referralBatchResult(
  db: DB,
  senderId: string,
  batchId: string,
  skipped: number,
  emails: string[],
) {
  const rows = await db
    .select({
      id: invites.id,
      status: invites.status,
      sentAt: invites.sentAt,
      recipientHash: invites.recipientHash,
    })
    .from(invites)
    .where(and(eq(invites.batchId, batchId), eq(invites.senderId, senderId)));
  const handled = new Set(
    rows
      .filter(
        (row) =>
          row.sentAt !== null || ["queued", "sending"].includes(row.status),
      )
      .map((row) => row.recipientHash),
  );
  const secret = referralSecret();
  return {
    accepted: rows.length,
    sent: rows.filter((row) => row.sentAt).length,
    pending: rows.filter((row) => ["queued", "sending"].includes(row.status))
      .length,
    failed: rows.filter((row) => row.status === "failed").length,
    skipped,
    unsentEmails: emails.filter(
      (email) => !handled.has(recipientHash(email, secret)),
    ),
  };
}

export async function cleanReferralEmails(db: DB, now = new Date()) {
  const cutoff = new Date(now.getTime() - days(REFERRAL_RETENTION_DAYS));
  const cleaned = await db
    .update(invites)
    .set({
      recipientEmail: null,
      status: sql`case when ${invites.status} in ('queued', 'sending') then 'failed' else ${invites.status} end`,
      leaseUntil: null,
    })
    .where(
      and(isNotNull(invites.recipientEmail), lt(invites.createdAt, cutoff)),
    )
    .returning({ id: invites.id });
  await db
    .delete(budgets)
    .where(lt(budgets.day, utcDay(new Date(now.getTime() - days(2)))));
  return cleaned.length;
}
