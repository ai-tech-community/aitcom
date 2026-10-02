import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { after } from "next/server";

import type { db as DbInstance } from "@/server/db";
import { hubMailPrefs, postMentionMailLog, user } from "@/server/db/schema";
import { sendPostMentionEmail } from "@/server/email";

import type { HubMailLocale } from "./hub-dm-mail-copy";
import { NOTIFICATION_SETTINGS_HREF } from "@/lib/dashboard-routes";

import { pinHubConversationUrl } from "./hub-dm-mail";
import { canSendHubMail, resolveHubMailPrefs } from "./hub-mail-prefs";
import type { PostMentionMail } from "./post-mention-mail-copy";

type DB = typeof DbInstance;

/** At most one mention email per author to one member in this window. */
export const MENTION_MAIL_AUTHOR_WINDOW_MS = 60 * 60 * 1000;
/** At most this many mention emails to one member a day, from anyone. */
export const MENTION_MAIL_DAILY_CAP = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export type MentionEmailInput = {
  postId: number;
  authorId: string;
  mail: PostMentionMail;
  /** Where the post is, without a locale ("/communities/…"). */
  path: string;
  /** Members just notified in the app. */
  recipientIds: string[];
  /** Members have no stored language yet: English until they do. */
  locale?: HubMailLocale;
};

/**
 * Emails each just-mentioned member who left mention mail on (the default),
 * one by one. Each email is claimed first in `post_mention_mail_log` (one
 * per member per post, a record members cannot delete) and released if
 * sending fails. Limits keep mentions from becoming a way to flood
 * someone's inbox: one email per author per member an hour, and
 * MENTION_MAIL_DAILY_CAP a day in all; the in-app notice still arrives.
 * Returns how many were sent.
 */
export async function emailMentionedMembers(
  db: DB,
  input: MentionEmailInput,
  send: typeof sendPostMentionEmail = sendPostMentionEmail,
  now: Date = new Date(),
): Promise<number> {
  if (input.recipientIds.length === 0) return 0;
  const locale = input.locale ?? "en";
  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      mention: hubMailPrefs.mention,
    })
    .from(user)
    .leftJoin(hubMailPrefs, eq(hubMailPrefs.userId, user.id))
    .where(inArray(user.id, input.recipientIds));
  const wanted = rows.filter(({ mention }) =>
    // No prefs row: the defaults (mention mail on).
    canSendHubMail(
      resolveHubMailPrefs(mention === null ? null : { mention }),
      "mention",
    ),
  );
  if (wanted.length === 0) return 0;

  const recent = await db
    .select({
      userId: postMentionMailLog.userId,
      fromAuthor: sql<number>`count(*) filter (where ${postMentionMailLog.authorId} = ${input.authorId} and ${postMentionMailLog.createdAt} > ${new Date(now.getTime() - MENTION_MAIL_AUTHOR_WINDOW_MS)})::int`,
      today: sql<number>`count(*)::int`,
    })
    .from(postMentionMailLog)
    .where(
      and(
        inArray(
          postMentionMailLog.userId,
          wanted.map((row) => row.userId),
        ),
        gt(postMentionMailLog.createdAt, new Date(now.getTime() - DAY_MS)),
      ),
    )
    .groupBy(postMentionMailLog.userId);
  const limited = new Set(
    recent
      .filter(
        (row) => row.fromAuthor > 0 || row.today >= MENTION_MAIL_DAILY_CAP,
      )
      .map((row) => row.userId),
  );

  const urls = {
    post: pinHubConversationUrl(`/${locale}${input.path}`),
    manage: pinHubConversationUrl(`/${locale}${NOTIFICATION_SETTINGS_HREF}`),
  };
  let sent = 0;
  for (const { userId, email } of wanted) {
    if (limited.has(userId)) continue;
    const [claimed] = await db
      .insert(postMentionMailLog)
      .values({ userId, postId: input.postId, authorId: input.authorId })
      .onConflictDoNothing()
      .returning({ id: postMentionMailLog.id });
    if (!claimed) continue;
    let ok = false;
    try {
      ok = await send(email, { locale, mail: input.mail, urls });
    } catch (error) {
      console.error("[post-mention-mail] send failed", error);
    }
    if (ok) {
      sent += 1;
    } else {
      // Not sent: free the claim, so a later save may try again.
      await db
        .delete(postMentionMailLog)
        .where(eq(postMentionMailLog.id, claimed.id));
    }
  }
  return sent;
}

/**
 * Sends the mention emails after the response, so saving a post never
 * waits on them, while the platform keeps the function alive until they
 * are out (a bare promise is dropped when the instance freezes). Outside a
 * request (scripts, tests) it runs now and is awaited.
 */
export async function scheduleMentionEmails(
  db: DB,
  input: MentionEmailInput,
): Promise<void> {
  const run = () =>
    emailMentionedMembers(db, input).catch((error: unknown) => {
      console.error("[post-mention-mail] scheduled send failed", error);
      return 0;
    });
  try {
    after(() => run());
  } catch {
    await run();
  }
}
