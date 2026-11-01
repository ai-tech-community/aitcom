// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { communityMemberships } from "@/server/db/schema";
import {
  createInviteSignupIntent,
  readInviteSignupIntent,
  verifyInviteSignupIntent,
  recordHubSignupReferral,
  inviteSignupIntentFromHeaders,
  SECURE_INVITE_SIGNUP_COOKIE,
} from "./signup-attribution";

const entered = new Date("2026-11-01T09:00:00Z");
const created = new Date("2026-11-01T09:01:00Z");
const now = new Date("2026-11-01T09:02:00Z");
const grant = {
  code: "personal",
  createdBy: "referrer",
  communityId: "hub",
  maxUses: null,
  expiresAt: null,
  targetEmail: null,
  role: null,
  community: { slug: "ait" },
};
beforeEach(() =>
  vi.stubEnv("BETTER_AUTH_SECRET", "test-auth-secret-at-least-32-characters"),
);
afterEach(() => vi.unstubAllEnvs());
function recordingDb(rows = [{ id: "membership" }]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return { db: { update }, set, where, update };
}
describe("browser-bound copied-link attribution", () => {
  it("requires the host-protected cookie in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      inviteSignupIntentFromHeaders(
        new Headers({ cookie: "ait-invite-signup=planted" }),
      ),
    ).toBeUndefined();
  });
  it("permits the HTTP cookie fallback only during local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(
      inviteSignupIntentFromHeaders(
        new Headers({ cookie: "ait-invite-signup=local" }),
      ),
    ).toBe("local");
  });
  it("accepts only a signed entry before account creation, for the same code", () => {
    const intent = createInviteSignupIntent("personal", entered);
    expect(verifyInviteSignupIntent(intent, "personal", created, now)).toBe(
      true,
    );
    expect(verifyInviteSignupIntent(intent, "other", created, now)).toBe(false);
    expect(
      verifyInviteSignupIntent(intent, "personal", new Date("2026-10-01"), now),
    ).toBe(false);
    expect(
      verifyInviteSignupIntent(intent, "personal", new Date("invalid"), now),
    ).toBe(false);
    expect(
      verifyInviteSignupIntent(
        intent,
        "personal",
        new Date(now.getTime() + 1),
        now,
      ),
    ).toBe(false);
  });
  it("rejects tampering, wrong keys, future/expired entries and oversized tokens", () => {
    const intent = createInviteSignupIntent("personal", entered)!;
    expect(
      readInviteSignupIntent(
        intent,
        "personal",
        new Date(entered.getTime() - 1),
      ),
    ).toBeNull();
    expect(
      readInviteSignupIntent(
        intent,
        "personal",
        new Date(entered.getTime() + 86_400_000),
      ),
    ).toBeNull();
    expect(readInviteSignupIntent(`x${intent}`, "personal", now)).toBeNull();
    expect(
      readInviteSignupIntent("x".repeat(2048), "personal", now),
    ).toBeNull();
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "another-auth-secret-at-least-32-characters",
    );
    expect(verifyInviteSignupIntent(intent, "personal", created, now)).toBe(
      false,
    );
  });
  it("is independent from email-launch configuration and fails closed without auth signing", () => {
    vi.stubEnv("REFERRAL_INVITES_ENABLED", "false");
    vi.stubEnv("REFERRAL_INVITE_SECRET", "");
    expect(createInviteSignupIntent("personal", entered)).toBeDefined();
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(createInviteSignupIntent("personal", entered)).toBeUndefined();
  });
  it("reads the host-protected cookie instead of a shareable query value", () => {
    expect(
      inviteSignupIntentFromHeaders(
        new Headers({
          cookie: `other=1; ${SECURE_INVITE_SIGNUP_COOKIE}=signed-proof; ait-invite-signup=untrusted-fallback`,
        }),
      ),
    ).toBe("signed-proof");
    expect(inviteSignupIntentFromHeaders(new Headers())).toBeUndefined();
  });
  it("attributes an auto-enrolled fresh Hub member without awarding XP or changing roles", async () => {
    const fake = recordingDb();
    expect(
      await recordHubSignupReferral(
        fake.db as never,
        grant,
        { id: "friend", createdAt: created },
        createInviteSignupIntent("personal", entered),
        now,
      ),
    ).toBe(true);
    expect(fake.update).toHaveBeenCalledExactlyOnceWith(communityMemberships);
    expect(fake.set).toHaveBeenCalledExactlyOnceWith({ invitedBy: "referrer" });
    const query = new PgDialect({ casing: "snake_case" }).sqlToQuery(
      fake.where.mock.calls[0]![0],
    );
    expect(query.sql).toContain('"invited_by" is null');
    expect(query.params).toEqual(
      expect.arrayContaining([
        "hub",
        "friend",
        "active",
        created.toISOString(),
      ]),
    );
  });
  it("does not overwrite an already assigned membership", async () => {
    const fake = recordingDb([]);
    expect(
      await recordHubSignupReferral(
        fake.db as never,
        grant,
        { id: "friend", createdAt: created },
        createInviteSignupIntent("personal", entered),
        now,
      ),
    ).toBe(false);
  });
  it.each([
    { ...grant, community: { slug: "another" } },
    { ...grant, maxUses: 1 },
    { ...grant, expiresAt: new Date("2026-12-01") },
    { ...grant, targetEmail: "friend@example.test" },
    { ...grant, role: "admin" },
    { ...grant, createdBy: "friend" },
  ])(
    "never uses signup context to bypass restricted grants or self-referrals",
    async (invite) => {
      const fake = recordingDb();
      expect(
        await recordHubSignupReferral(
          fake.db as never,
          invite,
          { id: "friend", createdAt: created },
          createInviteSignupIntent("personal", entered),
          now,
        ),
      ).toBe(false);
      expect(fake.update).not.toHaveBeenCalled();
    },
  );
});
