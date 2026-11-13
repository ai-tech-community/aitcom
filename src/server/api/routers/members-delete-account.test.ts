import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteMemberAccount = vi.fn();

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/lib/gamification", () => ({
  computeStreakData: vi.fn(),
  pointsTriggerType: vi.fn(),
  isProfileComplete: vi.fn(),
  awardXp: vi.fn(),
}));
vi.mock("@/server/badges/engine", () => ({
  awardMilestone: vi.fn(async () => false),
  awardEarlyAdopterIfEligible: vi.fn(async () => false),
  evaluateBadges: vi.fn(async () => []),
  recordTrackMetric: vi.fn(async () => []),
}));
vi.mock("@/server/members/delete-account", () => ({
  deleteMemberAccount,
  AccountNotFoundError: class AccountNotFoundError extends Error {},
  ACCOUNT_DELETION_CONFIRMATION: "DELETE",
}));

const { createCaller } = await import("@/server/api/root");

const fakeDb = { tag: "db" };

function caller(userId: string | null) {
  return createCaller({
    db: fakeDb as never,
    session: userId
      ? ({
          user: { id: userId, name: "Ada", email: "ada@example.com" },
          session: { id: `session-${userId}` },
        } as never)
      : null,
    headers: new Headers(),
  });
}

beforeEach(() => {
  deleteMemberAccount.mockReset();
  deleteMemberAccount.mockResolvedValue(undefined);
});

describe("members.deleteAccount", () => {
  it("rejects a signed-out caller before any deletion", async () => {
    await expect(
      caller(null).members.deleteAccount({ confirmation: "DELETE" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(deleteMemberAccount).not.toHaveBeenCalled();
  });

  it("rejects a confirmation other than DELETE and does not delete", async () => {
    await expect(
      caller("user-a").members.deleteAccount({
        confirmation: "delete" as "DELETE",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(deleteMemberAccount).not.toHaveBeenCalled();
  });

  it("deletes only the signed-in member", async () => {
    await caller("user-a").members.deleteAccount({ confirmation: "DELETE" });
    await caller("user-b").members.deleteAccount({ confirmation: "DELETE" });

    expect(deleteMemberAccount).toHaveBeenNthCalledWith(1, fakeDb, "user-a");
    expect(deleteMemberAccount).toHaveBeenNthCalledWith(2, fakeDb, "user-b");
  });

  it("ignores an extra user id and still deletes the session member", async () => {
    await caller("user-a").members.deleteAccount({
      confirmation: "DELETE",
      userId: "someone-else",
    } as never);

    expect(deleteMemberAccount).toHaveBeenCalledTimes(1);
    expect(deleteMemberAccount).toHaveBeenCalledWith(fakeDb, "user-a");
  });
});
