import { and, eq, or, sql } from "drizzle-orm";

import type { db as DbInstance } from "@/server/db";
import {
  CANONICAL_PRODUCTION_ORIGIN,
  type AuthUrlEnv,
} from "@/server/better-auth/base-url";
import {
  conversationParticipants,
  conversations,
  hubDmMailLog,
  hubMailPrefs,
  messages,
  user,
} from "@/server/db/schema";
import {
  canSendHubMail,
  resolveHubMailPrefs,
  unreadAnchorKey,
  type HubMailPrefs,
} from "./hub-mail-prefs";
import {
  hubDmMailCopy,
  renderHubDmPingHtml,
  type HubMailLocale,
} from "./hub-dm-mail-copy";

export {
  hubDmMailCopy,
  renderHubDmPingHtml,
  localeFromCookieHeader,
  type HubMailLocale,
} from "./hub-dm-mail-copy";

export type HubDmRecipient = {
  email: string;
  lastReadAt: Date | null;
};

export type UnreadHubDm = {
  userId: string;
  conversationId: string;
  lastReadAt: Date | null;
  email: string;
};

export type HubDmMailStore = {
  getPrefs(userId: string): Promise<Partial<HubMailPrefs> | null>;
  getRecipient(
    userId: string,
    conversationId: string,
  ): Promise<HubDmRecipient | null>;
  claim(
    userId: string,
    conversationId: string,
    unreadAnchor: string,
  ): Promise<boolean>;
  listUnreadDms(): Promise<UnreadHubDm[]>;
};

export type HubDmPingPayload = {
  to: string;
  locale: HubMailLocale;
  hubUrl: string;
  subject: string;
  html: string;
};

export type NotifyHubDmResult =
  | "sent"
  | "skipped_pref"
  | "skipped_dedupe"
  | "skipped_no_recipient"
  | "failed";

type DB = typeof DbInstance;

export function hubConversationPath(
  locale: HubMailLocale,
  conversationId: string,
): string {
  return `/${locale}/messages/${encodeURIComponent(conversationId)}`;
}

/** Production: absolute www. Preview/dev: relative so a hop cannot mint apex. */
export function pinHubConversationUrl(
  path: string,
  env: AuthUrlEnv = process.env,
): string {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  if (env.VERCEL_ENV === "production") {
    return `${CANONICAL_PRODUCTION_ORIGIN}${safePath}`;
  }
  return safePath;
}

export function buildHubDmPing(args: {
  to: string;
  locale: HubMailLocale;
  conversationId: string;
  env?: AuthUrlEnv;
}): HubDmPingPayload {
  const locale = args.locale;
  const hubUrl = pinHubConversationUrl(
    hubConversationPath(locale, args.conversationId),
    args.env,
  );
  const copy = hubDmMailCopy(locale);
  return {
    to: args.to,
    locale,
    hubUrl,
    subject: copy.subject,
    html: renderHubDmPingHtml(locale, hubUrl),
  };
}

async function defaultSend(payload: HubDmPingPayload): Promise<boolean> {
  const { sendHubDmPingEmail } = await import("@/server/email");
  return sendHubDmPingEmail(payload.to, {
    locale: payload.locale,
    hubUrl: payload.hubUrl,
  });
}

export async function notifyUnreadHubDm(
  store: HubDmMailStore,
  input: {
    recipientUserId: string;
    conversationId: string;
    locale?: HubMailLocale;
    env?: AuthUrlEnv;
  },
  send: (payload: HubDmPingPayload) => Promise<boolean> = defaultSend,
): Promise<NotifyHubDmResult> {
  const prefs = resolveHubMailPrefs(
    await store.getPrefs(input.recipientUserId),
  );
  if (!canSendHubMail(prefs, "dm")) return "skipped_pref";

  const recipient = await store.getRecipient(
    input.recipientUserId,
    input.conversationId,
  );
  if (!recipient?.email) return "skipped_no_recipient";

  const unreadAnchor = unreadAnchorKey(recipient.lastReadAt);
  const claimed = await store.claim(
    input.recipientUserId,
    input.conversationId,
    unreadAnchor,
  );
  if (!claimed) return "skipped_dedupe";

  const payload = buildHubDmPing({
    to: recipient.email,
    locale: input.locale ?? "en",
    conversationId: input.conversationId,
    env: input.env,
  });

  try {
    const ok = await send(payload);
    return ok ? "sent" : "failed";
  } catch (err) {
    console.error("[hub-dm-mail] send failed:", err);
    return "failed";
  }
}

export async function backfillUnreadHubDmMail(
  store: HubDmMailStore,
  send: (payload: HubDmPingPayload) => Promise<boolean> = defaultSend,
  opts?: { env?: AuthUrlEnv; locale?: HubMailLocale },
): Promise<{ scanned: number; sent: number }> {
  const unread = await store.listUnreadDms();
  let sent = 0;
  for (const row of unread) {
    const result = await notifyUnreadHubDm(
      {
        ...store,
        async getRecipient() {
          return { email: row.email, lastReadAt: row.lastReadAt };
        },
      },
      {
        recipientUserId: row.userId,
        conversationId: row.conversationId,
        locale: opts?.locale ?? "en",
        env: opts?.env,
      },
      send,
    );
    if (result === "sent") sent++;
  }
  return { scanned: unread.length, sent };
}

export function createDbHubDmMailStore(db: DB): HubDmMailStore {
  return {
    async getPrefs(userId) {
      const [row] = await db
        .select({
          dm: hubMailPrefs.dm,
          mention: hubMailPrefs.mention,
          forumReply: hubMailPrefs.forumReply,
          digest: hubMailPrefs.digest,
          agentJob: hubMailPrefs.agentJob,
        })
        .from(hubMailPrefs)
        .where(eq(hubMailPrefs.userId, userId))
        .limit(1);
      return row ?? null;
    },

    async getRecipient(userId, conversationId) {
      const [row] = await db
        .select({
          email: user.email,
          lastReadAt: conversationParticipants.lastReadAt,
        })
        .from(conversationParticipants)
        .innerJoin(user, eq(user.id, conversationParticipants.userId))
        .innerJoin(
          conversations,
          eq(conversations.id, conversationParticipants.conversationId),
        )
        .where(
          and(
            eq(conversationParticipants.userId, userId),
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversations.type, "dm"),
          ),
        )
        .limit(1);
      if (!row?.email) return null;
      return { email: row.email, lastReadAt: row.lastReadAt };
    },

    async claim(userId, conversationId, unreadAnchor) {
      const inserted = await db
        .insert(hubDmMailLog)
        .values({ userId, conversationId, unreadAnchor })
        .onConflictDoNothing()
        .returning({ id: hubDmMailLog.id });
      return inserted.length > 0;
    },

    async listUnreadDms() {
      return db
        .select({
          userId: conversationParticipants.userId,
          conversationId: conversationParticipants.conversationId,
          lastReadAt: conversationParticipants.lastReadAt,
          email: user.email,
        })
        .from(conversationParticipants)
        .innerJoin(
          conversations,
          eq(conversations.id, conversationParticipants.conversationId),
        )
        .innerJoin(user, eq(user.id, conversationParticipants.userId))
        .innerJoin(
          messages,
          eq(messages.conversationId, conversationParticipants.conversationId),
        )
        .where(
          and(
            eq(conversations.type, "dm"),
            or(
              sql`${messages.senderId} != ${conversationParticipants.userId}`,
              sql`${messages.senderType} != 'human'`,
            ),
            sql`(${conversationParticipants.lastReadAt} IS NULL OR ${messages.createdAt} > ${conversationParticipants.lastReadAt})`,
          ),
        )
        .groupBy(
          conversationParticipants.userId,
          conversationParticipants.conversationId,
          conversationParticipants.lastReadAt,
          user.email,
        );
    },
  };
}

export async function notifyUnreadHubDmForRecipient(
  db: DB,
  input: {
    recipientUserId: string;
    conversationId: string;
    locale?: HubMailLocale;
  },
): Promise<NotifyHubDmResult> {
  try {
    return await notifyUnreadHubDm(createDbHubDmMailStore(db), input);
  } catch (err) {
    console.error("[hub-dm-mail] notify failed:", err);
    return "failed";
  }
}

export async function backfillUnreadHubDmMailFromDb(db: DB) {
  return backfillUnreadHubDmMail(createDbHubDmMailStore(db));
}
