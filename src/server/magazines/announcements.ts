import { sql as payloadSql } from "@payloadcms/db-postgres";
import {
  and,
  asc,
  count,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notExists,
  sql,
} from "drizzle-orm";

import {
  communities,
  communityMemberships,
  magazineIssueAnnouncements as announcements,
  magazineIssueDeliveries as deliveries,
  magazineSubscriptions as subscriptions,
} from "@/server/db/schema";
import {
  digestListUnsubscribeHeaders,
  signUnsubscribeToken,
  unsubscribeSecret,
} from "@/server/notifications/unsubscribe-token";

import type { Deps } from "./deps";
import {
  issueAccessFacts,
  issueAudience,
  type IssueAudience,
} from "./issue-access";
import {
  insertMagazineNoticesIn,
  issuePublishedNotices,
} from "./notifications";
import {
  absoluteIssueUrl,
  issueMail,
  magazineUnsubscribeUrl,
  type MagazineMailer,
} from "./subscriptions/mail";
import { activeMembershipCondition } from "./viewer-role";

import type { PayloadTransaction } from "./payload-writes";

/** Records the issue's one announcement inside its publish transaction. */
export async function recordIssueAnnouncement(
  tx: PayloadTransaction,
  input: { issueId: number; magazineId: number; publishedAt: string },
): Promise<void> {
  await tx.execute(payloadSql`
    INSERT INTO "app"."magazine_issue_announcement"
      ("issue_id", "magazine_id", "published_at")
    VALUES (${input.issueId}, ${input.magazineId}, ${input.publishedAt}::timestamptz)
    ON CONFLICT ("issue_id") DO NOTHING
  `);
}

export const INBOX_BATCH = 500;
export const EMAIL_BATCH = 100;
export const EMAIL_CHUNK = 20;
export const EMAIL_PACE_MS = 600;
export const OPEN_ANNOUNCEMENTS_PER_RUN = 10;
export const ANNOUNCEMENT_MAX_DAYS = 7;

export type AnnouncementRecipients = {
  issueId: number;
  magazineId: number;
  communityId: string;
  publishedAt: Date;
  audience: IssueAudience;
};
type RecipientReader = Pick<Deps["db"], "select">;

function inboxAudienceCondition(
  reader: RecipientReader,
  input: AnnouncementRecipients,
) {
  switch (input.audience) {
    case "everyone":
      return sql`true`;
    case "members":
      return exists(
        reader
          .select({ id: communityMemberships.id })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, input.communityId),
              eq(communityMemberships.userId, subscriptions.userId),
              activeMembershipCondition(),
            ),
          ),
      );
    case "nobody":
      return sql`false`;
  }
  const exhaustive: never = input.audience;
  return exhaustive;
}

function emailAudienceCondition(audience: IssueAudience) {
  switch (audience) {
    case "everyone":
      return sql`true`;
    case "members":
    case "nobody":
      return sql`false`;
  }
  const exhaustive: never = audience;
  return exhaustive;
}

/** The inbox query, shared by delivery, completion and resolver parity tests. */
export function eligibleInboxSubscriptions(
  reader: RecipientReader,
  input: AnnouncementRecipients,
) {
  return reader
    .select({ id: subscriptions.id, userId: subscriptions.userId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.magazineId, input.magazineId),
        isNotNull(subscriptions.userId),
        lte(subscriptions.confirmedAt, input.publishedAt),
        inboxAudienceCondition(reader, input),
        notExists(
          reader
            .select({ id: deliveries.subscriptionId })
            .from(deliveries)
            .where(
              and(
                eq(deliveries.issueId, input.issueId),
                eq(deliveries.subscriptionId, subscriptions.id),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(subscriptions.id));
}

/** The email query, shared by delivery, completion and resolver parity tests. */
export function eligibleEmailSubscriptions(
  reader: RecipientReader,
  input: AnnouncementRecipients,
  afterId?: string,
) {
  return reader
    .select({
      id: subscriptions.id,
      email: subscriptions.email,
      locale: subscriptions.locale,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.magazineId, input.magazineId),
        isNotNull(subscriptions.email),
        lte(subscriptions.confirmedAt, input.publishedAt),
        afterId ? gt(subscriptions.id, afterId) : undefined,
        emailAudienceCondition(input.audience),
        notExists(
          reader
            .select({ id: deliveries.subscriptionId })
            .from(deliveries)
            .where(
              and(
                eq(deliveries.issueId, input.issueId),
                eq(deliveries.subscriptionId, subscriptions.id),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(subscriptions.id));
}

/** Reload at every batch, so current access always decides who hears of it. */
async function loadAnnouncement(deps: Deps, issueId: number) {
  const announcement = await deps.db.query.magazineIssueAnnouncements.findFirst(
    { where: eq(announcements.issueId, issueId) },
  );
  if (!announcement) return null;
  const issue = await deps.payload.findByID({
    collection: "magazine-issues",
    id: issueId,
    locale: "en",
    depth: 0,
    disableErrors: true,
  });
  if (!issue) return null;
  const [magazine, community] = await Promise.all([
    deps.payload.findByID({
      collection: "magazines",
      id: announcement.magazineId,
      locale: "en",
      depth: 0,
      disableErrors: true,
    }),
    deps.db.query.communities.findFirst({
      where: eq(communities.id, issue.communityId),
    }),
  ]);
  const facts = issueAccessFacts(issue);
  const audience =
    facts && magazine
      ? issueAudience(
          community
            ? { ...community, deleted: community.deletedAt !== null }
            : null,
          facts,
        )
      : "nobody";
  return {
    announcement,
    issue,
    magazine,
    community,
    recipients: {
      issueId,
      magazineId: announcement.magazineId,
      communityId: issue.communityId,
      publishedAt: announcement.publishedAt,
      audience,
    } satisfies AnnouncementRecipients,
  };
}

/** Each batch commits its claims and inbox rows together. Never fails publish. */
export async function deliverInboxAnnouncement(
  deps: Deps,
  issueId: number,
): Promise<number> {
  let written = 0;
  try {
    for (;;) {
      const context = await loadAnnouncement(deps, issueId);
      if (
        !context?.magazine ||
        !context.community ||
        context.recipients.audience === "nobody"
      )
        break;
      const { recipients, issue, magazine, community } = context;
      const count = await deps.db.transaction(async (tx) => {
        const rows = await eligibleInboxSubscriptions(tx, recipients).limit(
          INBOX_BATCH,
        );
        if (!rows.length) return 0;
        const claimed = await tx
          .insert(deliveries)
          .values(
            rows.map((row) => ({
              issueId,
              subscriptionId: row.id,
              channel: "inbox" as const,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: deliveries.subscriptionId });
        const ids = new Set(claimed.map((row) => row.id));
        const userIds = rows
          .filter((row) => ids.has(row.id))
          .map((row) => row.userId!);
        await insertMagazineNoticesIn(
          tx,
          await issuePublishedNotices({ userIds, issue, magazine, community }),
        );
        return userIds.length;
      });
      written += count;
      if (!count) break;
    }
  } catch (error) {
    console.error("[magazines] inbox announcement failed", { issueId, error });
  }
  return written;
}

export type DeliveryResult = {
  inbox: number;
  email: number;
  completed: number;
};

async function complete(
  deps: Deps,
  issueId: number,
  now: Date,
): Promise<number> {
  const rows = await deps.db
    .update(announcements)
    .set({ completedAt: now })
    .where(
      and(
        eq(announcements.issueId, issueId),
        isNull(announcements.completedAt),
      ),
    )
    .returning({ id: announcements.issueId });
  return rows.length;
}

/** Lock before reading eligibility: a concurrent refusal either reopens after
 * this transaction, or commits before these fresh reads. Neither can be lost.
 */
async function completeIfDelivered(
  deps: Deps,
  input: AnnouncementRecipients,
  now: Date,
): Promise<number> {
  return deps.db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: announcements.issueId })
      .from(announcements)
      .where(
        and(
          eq(announcements.issueId, input.issueId),
          isNull(announcements.completedAt),
        ),
      )
      .for("update");
    if (!locked.length) return 0;
    const inbox = await eligibleInboxSubscriptions(tx, input).limit(1);
    const email = await eligibleEmailSubscriptions(tx, input).limit(1);
    if (inbox.length || email.length) return 0;
    const completed = await tx
      .update(announcements)
      .set({ completedAt: now })
      .where(
        and(
          eq(announcements.issueId, input.issueId),
          isNull(announcements.completedAt),
        ),
      )
      .returning({ id: announcements.issueId });
    return completed.length;
  });
}

async function remaining(
  deps: Deps,
  input: AnnouncementRecipients,
): Promise<number> {
  const [inbox, email] = await Promise.all([
    deps.db
      .select({ count: count() })
      .from(eligibleInboxSubscriptions(deps.db, input).as("owed_inbox")),
    deps.db
      .select({ count: count() })
      .from(eligibleEmailSubscriptions(deps.db, input).as("owed_email")),
  ]);
  return inbox[0]!.count + email[0]!.count;
}

/** Rotate unfinished work; email claims survive an uncertain send, but not a refusal. */
export async function deliverPendingAnnouncements(
  deps: Deps,
  mailer: MagazineMailer,
  now: Date,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { inbox: 0, email: 0, completed: 0 };
  const old = await deps.db
    .select({ issueId: announcements.issueId })
    .from(announcements)
    .where(
      and(
        isNull(announcements.completedAt),
        lt(
          announcements.publishedAt,
          new Date(now.getTime() - ANNOUNCEMENT_MAX_DAYS * 86400000),
        ),
      ),
    );
  for (const row of old) {
    try {
      const context = await loadAnnouncement(deps, row.issueId);
      const leftOver = context ? await remaining(deps, context.recipients) : 0;
      const completed = await complete(deps, row.issueId, now);
      result.completed += completed;
      if (completed)
        console.error("[magazines] announcement given up", {
          issueId: row.issueId,
          leftOver,
        });
    } catch (error) {
      console.error("[magazines] announcement expiry failed", {
        issueId: row.issueId,
        error,
      });
    }
  }
  const picked = await deps.db.transaction(async (tx) => {
    const rows = await tx
      .select({ issueId: announcements.issueId })
      .from(announcements)
      .where(isNull(announcements.completedAt))
      .orderBy(
        sql`${announcements.lastAttemptedAt} ASC NULLS FIRST`,
        asc(announcements.createdAt),
      )
      .limit(OPEN_ANNOUNCEMENTS_PER_RUN)
      .for("update", { skipLocked: true });
    if (rows.length)
      await tx
        .update(announcements)
        .set({ lastAttemptedAt: now })
        .where(
          inArray(
            announcements.issueId,
            rows.map((row) => row.issueId),
          ),
        );
    return rows;
  });
  const secret = unsubscribeSecret();
  if (!secret) console.error("[magazines] announcement email secret missing");
  let attempted = 0;
  let emailRefused = false;
  for (const { issueId } of picked) {
    try {
      let context = await loadAnnouncement(deps, issueId);
      if (!context || context.recipients.audience === "nobody") {
        result.completed += await complete(deps, issueId, now);
        continue;
      }
      result.inbox += await deliverInboxAnnouncement(deps, issueId);
      let afterId: string | undefined;
      while (secret && !emailRefused && attempted < EMAIL_BATCH) {
        context = await loadAnnouncement(deps, issueId);
        if (
          !context?.magazine ||
          !context.community ||
          context.recipients.audience !== "everyone"
        )
          break;
        const { recipients, issue, magazine, community } = context;
        const rows = await eligibleEmailSubscriptions(
          deps.db,
          recipients,
          afterId,
        ).limit(Math.min(EMAIL_CHUNK, EMAIL_BATCH - attempted));
        if (!rows.length) break;
        afterId = rows.at(-1)!.id;
        const dutch = await deps.payload.findByID({
          collection: "magazine-issues",
          id: issueId,
          locale: "nl",
          fallbackLocale: "en",
          depth: 0,
        });
        for (const row of rows) {
          // Skips count too: a gated, unclaimed row must not keep this run
          // reading the same chunk forever.
          attempted++;
          const to = mailer.recipient(row.email!);
          if (!to) continue;
          const token = signUnsubscribeToken(
            { scope: "magazine", subscriptionId: row.id },
            secret,
          );
          const mail = await issueMail({
            locale: row.locale,
            magazineName: magazine.name,
            communityName: community.name,
            issue: {
              number: Number(issue.number),
              title:
                row.locale === "nl" ? dutch.title || issue.title : issue.title,
            },
            issueUrl: absoluteIssueUrl(row.locale, magazine, issue),
            unsubscribeUrl: magazineUnsubscribeUrl(row.locale, token),
          });
          const claimed = await deps.db
            .insert(deliveries)
            .values({ issueId, subscriptionId: row.id, channel: "email" })
            .onConflictDoNothing()
            .returning({ id: deliveries.subscriptionId });
          if (!claimed.length) continue;
          try {
            const sent = await mailer.send(to, {
              ...mail,
              headers: digestListUnsubscribeHeaders(token),
            });
            if (sent) result.email++;
            else {
              emailRefused = true;
              await deps.db.transaction(async (tx) => {
                await tx
                  .delete(deliveries)
                  .where(
                    and(
                      eq(deliveries.issueId, issueId),
                      eq(deliveries.subscriptionId, row.id),
                      eq(deliveries.channel, "email"),
                    ),
                  );
                await tx
                  .update(announcements)
                  .set({ completedAt: null })
                  .where(eq(announcements.issueId, issueId));
              });
            }
          } catch (error) {
            console.error("[magazines] announcement email failed", {
              issueId,
              subscriptionId: row.id,
              error: error instanceof Error ? error.name : typeof error,
            });
          }
          if (emailRefused) break;
          await (
            mailer.sleep ??
            ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
          )(EMAIL_PACE_MS);
        }
      }
      // Reload access again before deciding whether any work remains.
      const latest = await loadAnnouncement(deps, issueId);
      if (latest)
        result.completed += await completeIfDelivered(
          deps,
          latest.recipients,
          now,
        );
    } catch (error) {
      console.error("[magazines] announcement delivery failed", {
        issueId,
        error,
      });
    }
  }
  return result;
}
