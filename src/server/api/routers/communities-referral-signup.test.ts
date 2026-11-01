// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the real redemption procedure, with only storage/auth infrastructure
// replaced. No database connection or email transport is available to this test.
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));
vi.mock("@/server/api/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.create();
  return {
    createTRPCRouter: t.router,
    protectedProcedure: t.procedure,
    publicProcedure: t.procedure,
    communityProcedure: t.procedure,
    HUB_SLUG: "ait",
  };
});
import { communitiesRouter } from "./communities";
import {
  createInviteSignupIntent,
  SECURE_INVITE_SIGNUP_COOKIE,
} from "@/server/communities/referral-email/signup-attribution";

const entered = new Date("2026-11-01T09:00:00Z");
const now = new Date("2026-11-01T09:02:00Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("BETTER_AUTH_SECRET", "test-auth-secret-at-least-32-characters");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function fixture({
  createdAt = new Date("2026-11-01T09:01:00Z"),
  cookie = true,
  status = "active",
  assigned = false,
} = {}) {
  const intent = createInviteSignupIntent("personal", entered)!;
  const set = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi
        .fn()
        .mockResolvedValue(assigned ? [] : [{ id: "membership" }]),
    }),
  });
  const tx = { update: vi.fn().mockReturnValue({ set }) };
  const db = {
    query: {
      communityInvites: {
        findFirst: vi.fn().mockResolvedValue({
          id: "invite",
          code: "personal",
          communityId: "hub",
          createdBy: "referrer",
          expiresAt: null,
          targetEmail: null,
          role: null,
          maxUses: null,
          community: { slug: "ait", deletedAt: null },
        }),
      },
      communityMemberships: {
        findFirst: vi.fn().mockResolvedValue({
          id: "membership",
          userId: "friend",
          status,
          role: "member",
        }),
      },
    },
    transaction: vi.fn(async (task: (tx: unknown) => Promise<unknown>) =>
      task(tx),
    ),
  };
  const caller = communitiesRouter.createCaller({
    db,
    headers: new Headers(
      cookie ? { cookie: `${SECURE_INVITE_SIGNUP_COOKIE}=${intent}` } : {},
    ),
    session: {
      user: { id: "friend", email: "friend@example.test", createdAt },
    },
  } as never);
  return { caller, db, tx, set, intent };
}
describe("copied Hub link after signup auto-enrolment", () => {
  it("attributes the fresh member even though Hub enrollment already made them active", async () => {
    const test = fixture();
    expect(await test.caller.redeemInvite({ token: "personal" })).toEqual({
      communitySlug: "ait",
      status: "active",
    });
    expect(test.set).toHaveBeenCalledExactlyOnceWith({ invitedBy: "referrer" });
  });
  it("never attributes an account that predates the browser's invite entry", async () => {
    const test = fixture({ createdAt: new Date("2026-10-01") });
    await test.caller.redeemInvite({ token: "personal" });
    expect(test.tx.update).not.toHaveBeenCalled();
  });
  it("ignores proof smuggled into the RPC body rather than the HttpOnly cookie", async () => {
    const test = fixture({ cookie: false });
    await test.caller.redeemInvite({
      token: "personal",
      signupIntent: test.intent,
    } as never);
    expect(test.db.transaction).not.toHaveBeenCalled();
  });
  it("still refuses banned members before considering referral context", async () => {
    const test = fixture({ status: "banned" });
    await expect(
      test.caller.redeemInvite({ token: "personal" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(test.db.transaction).not.toHaveBeenCalled();
  });
  it("leaves an existing referral assignment unchanged", async () => {
    const test = fixture({ assigned: true });
    expect(await test.caller.redeemInvite({ token: "personal" })).toEqual({
      communitySlug: "ait",
      status: "active",
    });
    expect(test.set).toHaveBeenCalledTimes(1);
  });
});
