import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as PaymentsAccess from "@/server/payments/access";

const payments = vi.hoisted(() => ({
  membershipPaymentAllowed: vi.fn(),
}));
vi.mock("@/server/payments/access", async (importOriginal) => ({
  ...(await importOriginal<typeof PaymentsAccess>()),
  membershipPaymentAllowed: payments.membershipPaymentAllowed,
}));

import {
  activeCommunityRole,
  isActiveCommunityMember,
} from "./content-visibility-queries";

beforeEach(() => {
  payments.membershipPaymentAllowed.mockReset().mockResolvedValue(true);
});

function fakeDb(role: string | null) {
  const findFirst = vi
    .fn()
    .mockResolvedValue(role === null ? undefined : { role });
  return {
    db: { query: { communityMemberships: { findFirst } } } as never,
    findFirst,
  };
}

describe("activeCommunityRole", () => {
  it("is null for a signed-out visitor, without a lookup", async () => {
    const { db, findFirst } = fakeDb("member");
    await expect(activeCommunityRole(db, "c1", null)).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("is null without an active membership", async () => {
    const { db } = fakeDb(null);
    await expect(activeCommunityRole(db, "c1", "u1")).resolves.toBeNull();
  });

  it("is the role of a member whose paid membership is in order", async () => {
    const { db } = fakeDb("member");
    await expect(activeCommunityRole(db, "c1", "u1")).resolves.toBe("member");
    expect(payments.membershipPaymentAllowed).toHaveBeenCalledWith(
      db,
      "c1",
      "u1",
    );
  });

  it("is null for a member whose paid membership lapsed", async () => {
    payments.membershipPaymentAllowed.mockResolvedValue(false);
    const { db } = fakeDb("member");
    await expect(activeCommunityRole(db, "c1", "u1")).resolves.toBeNull();
    await expect(isActiveCommunityMember(db, "c1", "u1")).resolves.toBe(false);
  });

  it("is a staff role without asking about payment", async () => {
    const { db } = fakeDb("moderator");
    await expect(activeCommunityRole(db, "c1", "u1")).resolves.toBe(
      "moderator",
    );
    expect(payments.membershipPaymentAllowed).not.toHaveBeenCalled();
  });
});
