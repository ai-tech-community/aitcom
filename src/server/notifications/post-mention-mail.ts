import { eq, inArray } from "drizzle-orm";
import { after } from "next/server";

import type { db as DbInstance } from "@/server/db";
import { hubMailPrefs, user } from "@/server/db/schema";
import { sendPostMentionEmail } from "@/server/email";

import type { HubMailLocale } from "./hub-dm-mail-copy";
import { pinHubConversationUrl } from "./hub-dm-mail";
import { canSendHubMail, resolveHubMailPrefs } from "./hub-mail-prefs";
import type { PostMentionMail } from "./post-mention-mail-copy";

type DB = typeof DbInstance;

export type MentionEmailInput = {
  mail: PostMentionMail;
  /** Where the post is, without a locale ("/communities/…"). */
  path: string;
  /** Members just notified in the app (each once per post). */
  recipientIds: string[];
  /** Members have no stored language yet: English until they do. */
  locale?: HubMailLocale;
};

/**
 * Emails each just-mentioned member who left mention mail on (the default),
 * one by one; a failed send is logged and skips only that member. Called
 * once per new in-app mention, which is the record that keeps it to one
 * email per member per post. Returns how many were sent.
 */
export async function emailMentionedMembers(
  db: DB,
  input: MentionEmailInput,
  send: typeof sendPostMentionEmail = sendPostMentionEmail,
): Promise<number> {
  if (input.recipientIds.length === 0) return 0;
  const locale = input.locale ?? "en";
  const rows = await db
    .select({
      email: user.email,
      mention: hubMailPrefs.mention,
    })
    .from(user)
    .leftJoin(hubMailPrefs, eq(hubMailPrefs.userId, user.id))
    .where(inArray(user.id, input.recipientIds));
  const urls = {
    post: pinHubConversationUrl(`/${locale}${input.path}`),
    manage: pinHubConversationUrl(`/${locale}/dashboard/notifications`),
  };
  let sent = 0;
  for (const { email, mention } of rows) {
    // No prefs row: the defaults (mention mail on).
    const resolved = resolveHubMailPrefs(mention === null ? null : { mention });
    if (!canSendHubMail(resolved, "mention")) continue;
    try {
      if (await send(email, { locale, mail: input.mail, urls })) sent += 1;
    } catch (error) {
      console.error("[post-mention-mail] send failed", error);
    }
  }
  return sent;
}

/**
 * Sends the mention emails after the response, so saving a post never
 * waits on them, while the platform keeps the function alive until they
 * are out (a bare promise is dropped when the instance freezes). Outside a
 * request (scripts, tests) it runs right away.
 */
export function scheduleMentionEmails(db: DB, input: MentionEmailInput): void {
  const run = () =>
    emailMentionedMembers(db, input).catch((error: unknown) => {
      console.error("[post-mention-mail] scheduled send failed", error);
      return 0;
    });
  try {
    after(() => run());
  } catch {
    void run();
  }
}
