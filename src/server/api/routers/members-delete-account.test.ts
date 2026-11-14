import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteMemberAccount = vi.fn();
const photos = vi.hoisted(() => ({
  deleteProfilePhotoFiles: vi.fn(),
  removeProfilePhoto: vi.fn(),
}));
vi.mock("@/server/members/profile-photo", () => photos);

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
  photos.deleteProfilePhotoFiles.mockReset();
  photos.deleteProfilePhotoFiles.mockResolvedValue(undefined);
  photos.removeProfilePhoto.mockReset();
  photos.removeProfilePhoto.mockResolvedValue(undefined);
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

describe("members.deleteAccount profile photos", () => {
  it("deletes the member's uploaded photos after the account", async () => {
    await caller("user-a").members.deleteAccount({ confirmation: "DELETE" });

    expect(photos.deleteProfilePhotoFiles).toHaveBeenCalledWith(
      expect.anything(),
      "user-a",
    );
    expect(deleteMemberAccount.mock.invocationCallOrder[0]!).toBeLessThan(
      photos.deleteProfilePhotoFiles.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps photos when the account deletion fails", async () => {
    deleteMemberAccount.mockRejectedValue(new Error("db down"));
    await expect(
      caller("user-a").members.deleteAccount({ confirmation: "DELETE" }),
    ).rejects.toThrow();
    expect(photos.deleteProfilePhotoFiles).not.toHaveBeenCalled();
  });

  it("still reports the account deleted when a photo cannot be deleted", async () => {
    photos.deleteProfilePhotoFiles.mockRejectedValue(new Error("s3 down"));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      caller("user-a").members.deleteAccount({ confirmation: "DELETE" }),
    ).resolves.toEqual({ deleted: true });
    error.mockRestore();
  });
});

describe("members.removeProfilePhoto", () => {
  it("rejects a signed-out caller", async () => {
    await expect(
      caller(null).members.removeProfilePhoto(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(photos.removeProfilePhoto).not.toHaveBeenCalled();
  });

  it("removes only the signed-in member's photo", async () => {
    await expect(
      caller("user-a").members.removeProfilePhoto(),
    ).resolves.toEqual({ image: null });
    expect(photos.removeProfilePhoto).toHaveBeenCalledWith(
      expect.objectContaining({ db: fakeDb }),
      "user-a",
    );
  });
});
