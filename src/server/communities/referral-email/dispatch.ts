import { and, eq, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { db as database } from "@/server/db";
import {
  communityInvites,
  communityMemberships,
  communities,
  communityAcquireConfig,
  referralEmailInvites as invites,
  referralEmailSuppressions as suppressions,
  user,
} from "@/server/db/schema";
import { referralLocales, type ReferralLocale } from "@/lib/referral-invites";
import {
  referralEmailEnv,
  referralSendingEnabled,
  referralPhaseEnabled,
} from "./config";
import { sendReferralEmail, type ReferralMessage } from "./mail";

type DB = typeof database;
type Delivery = typeof invites.$inferSelect;
const DAY = 86_400_000;
export function retryReferralDelivery(
  attempts: number,
  firstAttemptAt: Date,
  now: Date,
) {
  // Resend forgets idempotency keys after 24 hours. Stop well before that.
  return (
    attempts < 6 && now.getTime() - firstAttemptAt.getTime() < 23 * 3_600_000
  );
}

/** Dependency seam tests delivery failures without a provider or database. */
export async function deliverClaimedReferral(
  row: Delivery,
  deps: {
    eligible: () => Promise<boolean>;
    send: (message: ReferralMessage) => Promise<string | null>;
    finish: (
      outcome: "sent" | "retry" | "failed" | "suppressed",
    ) => Promise<void>;
  },
  now = new Date(),
) {
  if (!(await deps.eligible())) {
    await deps.finish("suppressed");
    return;
  }
  if (
    !row.recipientEmail ||
    !referralLocales.includes(row.locale as ReferralLocale)
  ) {
    await deps.finish("failed");
    return;
  }
  let outcome: "sent" | "retry" | "failed";
  try {
    const id = await deps.send({
      ...row,
      recipientEmail: row.recipientEmail,
      locale: row.locale as ReferralLocale,
    });
    outcome = id ? "sent" : "retry";
  } catch {
    outcome = retryReferralDelivery(
      row.attempts,
      row.firstAttemptAt ?? now,
      now,
    )
      ? "retry"
      : "failed";
  }
  await deps.finish(outcome);
}

async function eligible(db: DB, row: Delivery, now: Date) {
  if (
    !referralPhaseEnabled(row.phase) ||
    row.joinedAt ||
    !row.recipientEmail ||
    row.createdAt.getTime() <= now.getTime() - 14 * DAY
  )
    return false;
  const [suppressed] = await db
    .select()
    .from(suppressions)
    .where(eq(suppressions.recipientHash, row.recipientHash))
    .limit(1);
  if (suppressed) return false;
  const [grant] = await db
    .select({ id: communityInvites.id })
    .from(communityInvites)
    .innerJoin(communities, eq(communities.id, communityInvites.communityId))
    .innerJoin(
      communityMemberships,
      and(
        eq(communityMemberships.communityId, communities.id),
        eq(communityMemberships.userId, row.senderId),
        eq(communityMemberships.status, "active"),
      ),
    )
    .innerJoin(user, eq(user.id, row.senderId))
    .where(
      and(
        eq(communityInvites.code, row.inviteCode),
        eq(communityInvites.createdBy, row.senderId),
        eq(communities.id, row.communityId),
        isNull(communities.deletedAt),
        eq(user.emailVerified, true),
        isNull(communityInvites.targetEmail),
        isNull(communityInvites.expiresAt),
        isNull(communityInvites.maxUses),
        or(isNull(communityInvites.role), eq(communityInvites.role, "member")),
      ),
    )
    .limit(1);
  if (!grant) return false;
  const [config] = await db
    .select()
    .from(communityAcquireConfig)
    .where(eq(communityAcquireConfig.communityId, row.communityId));
  if (config?.referralsEnabled === false) return false;
  const [member] = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(communityMemberships, eq(communityMemberships.userId, user.id))
    .where(
      and(
        sql`lower(${user.email}) = ${row.recipientEmail}`,
        eq(communityMemberships.communityId, row.communityId),
        or(
          eq(communityMemberships.status, "active"),
          eq(communityMemberships.status, "banned"),
        ),
      ),
    )
    .limit(1);
  return !member;
}

export async function dispatchReferralEmails(
  db: DB,
  batchId?: string,
  now = new Date(),
) {
  if (!referralSendingEnabled()) return 0;
  let processed = 0;
  // Claim one at a time: keep the lease short relative to the provider window.
  for (let index = 0; index < (batchId ? 10 : 50); index++) {
    const row = await db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(invites)
        .where(
          and(
            batchId ? eq(invites.batchId, batchId) : undefined,
            referralPhaseEnabled("reminder")
              ? undefined
              : eq(invites.phase, "invite"),
            isNotNull(invites.recipientEmail),
            isNull(invites.joinedAt),
            lte(invites.nextAttemptAt, now),
            or(
              eq(invites.status, "queued"),
              and(eq(invites.status, "sending"), lt(invites.leaseUntil, now)),
            ),
          ),
        )
        .orderBy(invites.nextAttemptAt)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return null;
      if (
        candidate.firstAttemptAt &&
        !retryReferralDelivery(
          candidate.attempts,
          candidate.firstAttemptAt,
          now,
        )
      ) {
        await tx
          .update(invites)
          .set({ status: "failed", leaseUntil: null })
          .where(eq(invites.id, candidate.id));
        return { ...candidate, status: "failed" as const };
      }
      const [claimed] = await tx
        .update(invites)
        .set({
          status: "sending",
          attempts: candidate.attempts + 1,
          firstAttemptAt: candidate.firstAttemptAt ?? now,
          leaseUntil: new Date(now.getTime() + 10 * 60_000),
        })
        .where(eq(invites.id, candidate.id))
        .returning();
      return claimed!;
    });
    if (!row) break;
    if (row.status === "failed") continue;
    await deliverClaimedReferral(
      row,
      {
        eligible: () => eligible(db, row, new Date()),
        send: (message) => sendReferralEmail(message),
        finish: async (outcome) => {
          const at = new Date();
          await db
            .update(invites)
            .set({
              status: outcome === "retry" ? "queued" : outcome,
              leaseUntil: null,
              ...(outcome === "retry"
                ? { nextAttemptAt: new Date(at.getTime() + 5 * 60_000) }
                : {}),
              ...(outcome === "sent"
                ? row.phase === "invite"
                  ? { sentAt: at }
                  : { remindedAt: at }
                : {}),
              ...(outcome === "suppressed" ? { recipientEmail: null } : {}),
            })
            .where(
              and(
                eq(invites.id, row.id),
                eq(invites.status, "sending"),
                eq(invites.leaseUntil, row.leaseUntil!),
              ),
            );
        },
      },
      now,
    );
    processed++;
  }
  return processed;
}

export async function queueReferralReminders(db: DB, now = new Date()) {
  if (
    !referralSendingEnabled() ||
    referralEmailEnv().REFERRAL_INVITE_REMINDERS_ENABLED !== "true"
  )
    return 0;
  const rows = await db
    .update(invites)
    .set({
      phase: "reminder",
      status: "queued",
      attempts: 0,
      firstAttemptAt: null,
      nextAttemptAt: now,
    })
    .where(
      and(
        eq(invites.phase, "invite"),
        eq(invites.status, "sent"),
        isNotNull(invites.recipientEmail),
        isNull(invites.joinedAt),
        isNull(invites.remindedAt),
        lte(invites.sentAt, new Date(now.getTime() - 4 * DAY)),
        gte(invites.createdAt, new Date(now.getTime() - 14 * DAY)),
      ),
    )
    .returning({ id: invites.id });
  return rows.length;
}
