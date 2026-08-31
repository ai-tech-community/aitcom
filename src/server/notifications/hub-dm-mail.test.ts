import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";
import {
  DEFAULT_HUB_MAIL_PREFS,
  HUB_MAIL_CASES,
  canSendHubMail,
  isHubDmConversation,
  resolveHubMailPrefs,
  unreadAnchorKey,
} from "./hub-mail-prefs";
import {
  backfillUnreadHubDmMail,
  hubConversationPath,
  hubDmMailCopy,
  localeFromCookieHeader,
  notifyUnreadHubDm,
  pinHubConversationUrl,
  renderHubDmPingHtml,
  type HubDmMailStore,
  type UnreadHubDm,
} from "./hub-dm-mail";

const SECRET_INVITE =
  "Welcome to AIT — here is the private onboarding copy you must never email.";

function memoryStore(init?: {
  prefs?: Partial<ReturnType<typeof resolveHubMailPrefs>>;
  email?: string;
  lastReadAt?: Date | null;
  unread?: UnreadHubDm[];
}): HubDmMailStore & { claims: string[] } {
  const claims: string[] = [];
  const claimSet = new Set<string>();
  return {
    claims,
    async getPrefs() {
      return init?.prefs === undefined ? null : { ...init.prefs };
    },
    async getRecipient() {
      if (init?.email === null) return null;
      return {
        email: init?.email ?? "member@example.org",
        lastReadAt: init?.lastReadAt ?? null,
      };
    },
    async claim(userId, conversationId, unreadAnchor) {
      const key = `${userId}:${conversationId}:${unreadAnchor}`;
      if (claimSet.has(key)) return false;
      claimSet.add(key);
      claims.push(key);
      return true;
    },
    async listUnreadDms() {
      return init?.unread ?? [];
    },
  };
}

describe("hub mail prefs", () => {
  it("defaults DM on and every other case off when no row exists", () => {
    expect(resolveHubMailPrefs(null)).toEqual({
      dm: true,
      mention: false,
      forumReply: false,
      digest: false,
      agentJob: false,
    });
    expect(DEFAULT_HUB_MAIL_PREFS.dm).toBe(true);
    expect(HUB_MAIL_CASES).toEqual([
      "dm",
      "mention",
      "forumReply",
      "digest",
      "agentJob",
    ]);
  });

  it("lets a member turn Hub DM mail off", () => {
    const prefs = resolveHubMailPrefs({ dm: false });
    expect(canSendHubMail(prefs, "dm")).toBe(false);
  });

  it("stores other cases but never sends them in this first cut", () => {
    const allOn = resolveHubMailPrefs({
      dm: true,
      mention: true,
      forumReply: true,
      digest: true,
      agentJob: true,
    });
    expect(canSendHubMail(allOn, "dm")).toBe(true);
    expect(canSendHubMail(allOn, "mention")).toBe(false);
    expect(canSendHubMail(allOn, "forumReply")).toBe(false);
    expect(canSendHubMail(allOn, "digest")).toBe(false);
    expect(canSendHubMail(allOn, "agentJob")).toBe(false);
  });

  it("only treats Hub DM conversations as mail-worthy", () => {
    expect(isHubDmConversation("dm")).toBe(true);
    expect(isHubDmConversation("agent")).toBe(false);
    expect(isHubDmConversation("space")).toBe(false);
  });
});

describe("hub DM ping mail", () => {
  it("sends a ping with a Hub conversation link and no message copy", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const result = await notifyUnreadHubDm(
      memoryStore(),
      {
        recipientUserId: "member-1",
        conversationId: "conv-42",
        locale: "en",
        env: { VERCEL_ENV: "production" },
      },
      send,
    );

    expect(result).toBe("sent");
    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]?.[0] as {
      to: string;
      locale: string;
      hubUrl: string;
      subject: string;
      html: string;
    };
    expect(payload.to).toBe("member@example.org");
    expect(payload.hubUrl).toBe(
      `${CANONICAL_PRODUCTION_ORIGIN}/en/messages/conv-42`,
    );
    expect(payload.hubUrl).not.toContain("https://aitcommunity.org/");
    expect(payload.hubUrl.startsWith("https://www.aitcommunity.org/")).toBe(
      true,
    );
    expect(payload.subject).toBe("You have a message in the community");
    expect(payload.html).toContain("Open Hub");
    expect(payload.html).toContain(payload.hubUrl);
    expect(payload.html).not.toContain(SECRET_INVITE);
    expect(JSON.stringify(payload)).not.toContain(SECRET_INVITE);
  });

  it("does not send when the DM toggle is off", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const result = await notifyUnreadHubDm(
      memoryStore({ prefs: { dm: false } }),
      { recipientUserId: "member-1", conversationId: "conv-42" },
      send,
    );
    expect(result).toBe("skipped_pref");
    expect(send).not.toHaveBeenCalled();
  });

  it("deduplicates so one unread conversation cannot spam", async () => {
    const store = memoryStore();
    const send = vi.fn().mockResolvedValue(true);
    const input = {
      recipientUserId: "member-1",
      conversationId: "conv-42",
    } as const;

    expect(await notifyUnreadHubDm(store, input, send)).toBe("sent");
    expect(await notifyUnreadHubDm(store, input, send)).toBe("skipped_dedupe");
    expect(send).toHaveBeenCalledOnce();
  });

  it("renders EN and NL copy without a message body slot", () => {
    const en = hubDmMailCopy("en");
    const nl = hubDmMailCopy("nl");
    expect(en.subject).toMatch(/message in the community/i);
    expect(nl.subject).toMatch(/bericht in de community/i);
    expect(en.cta).toBe("Open Hub");
    expect(nl.cta).toBe("Open Hub");

    const html = renderHubDmPingHtml(
      "en",
      "https://www.aitcommunity.org/en/messages/x",
    );
    expect(html).not.toMatch(/\{\{.*body.*\}\}/i);
    expect(html).not.toContain(SECRET_INVITE);
    expect(html).toContain("https://www.aitcommunity.org/en/messages/x");
  });

  it("keeps preview Hub links relative and pins production to www", () => {
    expect(hubConversationPath("nl", "conv-9")).toBe("/nl/messages/conv-9");
    expect(
      pinHubConversationUrl("/en/messages/conv-9", { VERCEL_ENV: "preview" }),
    ).toBe("/en/messages/conv-9");
    expect(
      pinHubConversationUrl("/en/messages/conv-9", {
        VERCEL_ENV: "production",
      }),
    ).toBe(`${CANONICAL_PRODUCTION_ORIGIN}/en/messages/conv-9`);
    expect(
      pinHubConversationUrl("/en/messages/conv-9", {
        VERCEL_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://aitcommunity.org",
      }),
    ).toBe(`${CANONICAL_PRODUCTION_ORIGIN}/en/messages/conv-9`);
    expect(localeFromCookieHeader("NEXT_LOCALE=nl; other=1")).toBe("nl");
    expect(localeFromCookieHeader("NEXT_LOCALE=en")).toBe("en");
  });
});

describe("unread Hub DM backfill", () => {
  it("pings each currently unread conversation once and skips a second run", async () => {
    const unread: UnreadHubDm[] = [
      {
        userId: "m1",
        conversationId: "c1",
        lastReadAt: null,
        email: "one@example.org",
      },
      {
        userId: "m2",
        conversationId: "c2",
        lastReadAt: null,
        email: "two@example.org",
      },
    ];
    const store = memoryStore({ unread });
    const send = vi.fn().mockResolvedValue(true);

    const first = await backfillUnreadHubDmMail(store, send, {
      env: { VERCEL_ENV: "production" },
    });
    const second = await backfillUnreadHubDmMail(store, send, {
      env: { VERCEL_ENV: "production" },
    });

    expect(first).toEqual({ scanned: 2, sent: 2 });
    expect(second).toEqual({ scanned: 2, sent: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    const urls = send.mock.calls.map(
      (call) => (call[0] as { hubUrl: string }).hubUrl,
    );
    expect(urls).toContain(`${CANONICAL_PRODUCTION_ORIGIN}/en/messages/c1`);
    expect(urls).toContain(`${CANONICAL_PRODUCTION_ORIGIN}/en/messages/c2`);
  });

  it("does not backfill members who turned the DM toggle off", async () => {
    const store = memoryStore({
      prefs: { dm: false },
      unread: [
        {
          userId: "m1",
          conversationId: "c1",
          lastReadAt: null,
          email: "one@example.org",
        },
      ],
    });
    const send = vi.fn().mockResolvedValue(true);
    const result = await backfillUnreadHubDmMail(store, send);
    expect(result).toEqual({ scanned: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("unread anchor", () => {
  it("changes after a read so a later DM can ping again", () => {
    expect(unreadAnchorKey(null)).toBe("never");
    const readAt = new Date("2026-08-31T12:00:00.000Z");
    expect(unreadAnchorKey(readAt)).toBe(readAt.toISOString());
    expect(unreadAnchorKey(readAt)).not.toBe(unreadAnchorKey(null));
  });
});

describe("verify / signup / invite-token mail stay unchanged", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("does not import hub DM mail into verification or Better Auth config", () => {
    const verify = readFileSync(
      join(root, "../better-auth/send-verification-email.ts"),
      "utf8",
    );
    const config = readFileSync(join(root, "../better-auth/config.ts"), "utf8");
    expect(verify).not.toContain("hub-dm-mail");
    expect(verify).toContain("Verify your email — AIT Community");
    expect(config).not.toContain("hub-dm-mail");
    expect(config).toContain("sendMemberWelcome");
    expect(config).toContain("sendVerificationEmail");
  });

  it("does not rewrite invite-token or signup welcome senders", () => {
    const email = readFileSync(join(root, "../email.ts"), "utf8");
    expect(email).toContain("export async function sendMemberWelcome");
    expect(email).toContain("export async function sendHackathonStaffInvite");
    expect(email).toContain("Welcome to AIT Community");
    expect(email).toContain("Create your account to accept");
    const welcome = email.slice(
      email.indexOf("export async function sendMemberWelcome"),
      email.indexOf("export async function sendHackathonStaffInvite"),
    );
    expect(welcome).not.toContain("sendHubDmPingEmail");
    expect(welcome).not.toContain("hubDmMailCopy");
  });
});
