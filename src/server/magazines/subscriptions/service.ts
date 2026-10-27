import {
  and,
  count,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";

import type { AppLocale } from "@/i18n/messages";
import {
  CONFIRM_LINK_DAYS,
  CONFIRM_MAGAZINES_PER_ADDRESS_PER_DAY,
  CONFIRM_MAILS_PER_MAGAZINE_PER_DAY,
  CONFIRM_RESEND_MINUTES,
  CONFIRM_SENDS_PER_SUBSCRIPTION,
  normalizeSubscriberEmail,
  PENDING_SUBSCRIPTION_DAYS,
} from "@/lib/magazines/subscriptions";
import {
  magazineSubscriptions as subscriptions,
  user,
} from "@/server/db/schema";

import type { Deps } from "../deps";
import { loadIssueReadScope } from "../readable-issues";
import { readableIssueExists } from "../reading";
import {
  confirmationMail,
  magazineConfirmUrl,
  type MagazineMailer,
} from "./mail";
import { hashConfirmToken, newConfirmToken } from "./tokens";

const DAY_MS = 86_400_000;

export type SubscriberCounts = {
  withAccount: number;
  byEmail: number;
  waiting: number;
};

export async function subscribeAccount(
  db: Deps["db"],
  magazineId: number,
  userId: string,
  locale: AppLocale,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [account] = await tx
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId));
    if (!account) return;
    const email = normalizeSubscriberEmail(account.email);
    let confirmedAt = now;
    if (email) {
      // Share the email request lock so a concurrent request cannot recreate the merged row.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${"magazine-confirm:" + email}))`,
      );
      const [previous] = await tx
        .delete(subscriptions)
        .where(
          and(
            eq(subscriptions.magazineId, magazineId),
            eq(subscriptions.email, email),
          ),
        )
        .returning({ confirmedAt: subscriptions.confirmedAt });
      if (previous?.confirmedAt && previous.confirmedAt < now)
        confirmedAt = previous.confirmedAt;
    }
    await tx
      .insert(subscriptions)
      .values({ magazineId, userId, locale, confirmedAt })
      .onConflictDoNothing({
        target: [subscriptions.magazineId, subscriptions.userId],
        where: isNotNull(subscriptions.userId),
      });
  });
}

export async function unsubscribeAccount(
  db: Deps["db"],
  magazineId: number,
  userId: string,
): Promise<void> {
  await db
    .delete(subscriptions)
    .where(
      and(
        eq(subscriptions.magazineId, magazineId),
        eq(subscriptions.userId, userId),
      ),
    );
}

export async function isAccountSubscribed(
  db: Deps["db"],
  magazineId: number,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.magazineId, magazineId),
        eq(subscriptions.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function subscribeByEmail(
  deps: Deps,
  input: {
    magazine: { id: number; name: string };
    email: string;
    locale: AppLocale;
  },
  mailer: MagazineMailer,
  now: Date,
): Promise<void> {
  const email = normalizeSubscriberEmail(input.email);
  if (!email) return;
  if (
    !(await readableIssueExists(
      deps,
      await loadIssueReadScope(deps.db, null),
      input.magazine.id,
    ))
  )
    return;
  const { token, hash } = newConfirmToken();
  const row = await deps.db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"magazine-confirm:" + email}))`,
    );
    // Different addresses also share the magazine's daily quota across instances.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"magazine-confirm-magazine:" + input.magazine.id}))`,
    );
    const [account] = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .innerJoin(user, eq(subscriptions.userId, user.id))
      .where(
        and(
          eq(subscriptions.magazineId, input.magazine.id),
          sql`lower(trim(${user.email})) = ${email}`,
        ),
      )
      .limit(1);
    if (account) return;
    const recent = gte(
      subscriptions.confirmSentAt,
      new Date(now.getTime() - DAY_MS),
    );
    const [addressCount] = await tx
      .select({ value: count() })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.email, email),
          ne(subscriptions.magazineId, input.magazine.id),
          recent,
        ),
      );
    if (addressCount!.value >= CONFIRM_MAGAZINES_PER_ADDRESS_PER_DAY) return;
    const [magazineCount] = await tx
      .select({ value: count() })
      .from(subscriptions)
      .where(and(eq(subscriptions.magazineId, input.magazine.id), recent));
    if (magazineCount!.value >= CONFIRM_MAILS_PER_MAGAZINE_PER_DAY) return;
    const [stored] = await tx
      .insert(subscriptions)
      .values({
        magazineId: input.magazine.id,
        email,
        locale: input.locale,
        confirmTokenHash: hash,
        confirmSentAt: now,
        confirmSendCount: 1,
      })
      .onConflictDoUpdate({
        target: [subscriptions.magazineId, subscriptions.email],
        targetWhere: isNotNull(subscriptions.email),
        set: {
          confirmTokenHash: hash,
          confirmSentAt: now,
          confirmSendCount: sql`${subscriptions.confirmSendCount} + 1`,
          locale: input.locale,
        },
        setWhere: and(
          isNull(subscriptions.confirmedAt),
          or(
            isNull(subscriptions.confirmSentAt),
            lt(
              subscriptions.confirmSentAt,
              new Date(now.getTime() - CONFIRM_RESEND_MINUTES * 60_000),
            ),
          ),
          lt(subscriptions.confirmSendCount, CONFIRM_SENDS_PER_SUBSCRIPTION),
        ),
      })
      .returning({ id: subscriptions.id });
    return stored;
  });
  if (!row) return;
  try {
    const mail = await confirmationMail({
      locale: input.locale,
      magazineName: input.magazine.name,
      confirmUrl: magazineConfirmUrl(input.locale, token),
    });
    if (!(await mailer.send(email, mail)))
      console.error("[magazines] confirmation mail failed");
  } catch {
    console.error("[magazines] confirmation mail failed");
  }
}

export type ConfirmLinkStatus = "ready" | "subscribed" | "expired" | "invalid";
export type ConfirmLink = {
  status: ConfirmLinkStatus;
  magazine: { name: string; slug: string } | null;
};

export async function readConfirmLink(
  deps: Deps,
  token: string,
  now: Date,
): Promise<ConfirmLink> {
  const [row] = await deps.db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.confirmTokenHash, hashConfirmToken(token)))
    .limit(1);
  if (!row) return { status: "invalid", magazine: null };
  const { docs } = await deps.payload.find({
    collection: "magazines",
    where: { id: { equals: row.magazineId } },
    depth: 0,
    limit: 1,
  });
  const magazine = docs[0];
  if (!magazine) return { status: "invalid", magazine: null };
  return {
    status: row.confirmedAt
      ? "subscribed"
      : !row.confirmSentAt ||
          row.confirmSentAt.getTime() <
            now.getTime() - CONFIRM_LINK_DAYS * DAY_MS
        ? "expired"
        : "ready",
    magazine: { name: magazine.name, slug: magazine.slug },
  };
}

export async function confirmEmailSubscription(
  deps: Deps,
  token: string,
  now: Date,
): Promise<ConfirmLink> {
  const link = await readConfirmLink(deps, token, now);
  if (link.status !== "ready") return link;
  await deps.db
    .update(subscriptions)
    .set({ confirmedAt: now })
    .where(
      and(
        eq(subscriptions.confirmTokenHash, hashConfirmToken(token)),
        isNull(subscriptions.confirmedAt),
        gte(
          subscriptions.confirmSentAt,
          new Date(now.getTime() - CONFIRM_LINK_DAYS * DAY_MS),
        ),
      ),
    );
  // A rotated or removed link must not claim it confirmed the replacement row.
  return readConfirmLink(deps, token, now);
}

export async function removeSubscription(
  db: Deps["db"],
  subscriptionId: string,
): Promise<void> {
  await db.delete(subscriptions).where(eq(subscriptions.id, subscriptionId));
}

export async function countSubscribers(
  db: Deps["db"],
  magazineId: number,
): Promise<SubscriberCounts> {
  const [counts] = await db
    .select({
      withAccount:
        sql<number>`count(*) FILTER (WHERE ${subscriptions.userId} IS NOT NULL)`.mapWith(
          Number,
        ),
      byEmail:
        sql<number>`count(*) FILTER (WHERE ${subscriptions.email} IS NOT NULL AND ${subscriptions.confirmedAt} IS NOT NULL)`.mapWith(
          Number,
        ),
      waiting:
        sql<number>`count(*) FILTER (WHERE ${subscriptions.email} IS NOT NULL AND ${subscriptions.confirmedAt} IS NULL)`.mapWith(
          Number,
        ),
    })
    .from(subscriptions)
    .where(eq(subscriptions.magazineId, magazineId));
  return counts!;
}

export async function purgeUnconfirmedSubscriptions(
  db: Deps["db"],
  now: Date,
): Promise<number> {
  const removed = await db
    .delete(subscriptions)
    .where(
      and(
        isNotNull(subscriptions.email),
        isNull(subscriptions.confirmedAt),
        sql`COALESCE(${subscriptions.confirmSentAt}, ${subscriptions.createdAt}) < ${new Date(now.getTime() - PENDING_SUBSCRIPTION_DAYS * DAY_MS)}`,
      ),
    )
    .returning({ id: subscriptions.id });
  return removed.length;
}
