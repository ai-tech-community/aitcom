import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as PaymentsAccess from "@/server/payments/access";

const payments = vi.hoisted(() => ({
  membershipPaymentAllowed: vi.fn(),
  canReadPaidCommunity: vi.fn(),
}));
vi.mock("@/server/payments/access", async (importOriginal) => ({
  ...(await importOriginal<typeof PaymentsAccess>()),
  membershipPaymentAllowed: payments.membershipPaymentAllowed,
  canReadPaidCommunity: payments.canReadPaidCommunity,
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));

import { participantsAmong } from "./challenge-access";

beforeEach(() => {
  payments.membershipPaymentAllowed.mockReset().mockResolvedValue(true);
  payments.canReadPaidCommunity.mockReset().mockResolvedValue(true);
});

/** One community row; memberships are answered per test. */
function fakeDb(
  community: { isListedInDirectory: boolean; joinPolicy: string } | null,
) {
  const communityRow = vi.fn(async () =>
    community ? { id: "c1", slug: "c", ...community } : undefined,
  );
  const membershipRow = vi.fn(
    async (): Promise<{ role: string } | undefined> => undefined,
  );
  const db = {
    query: {
      communities: { findFirst: communityRow },
      communityMemberships: { findFirst: membershipRow },
    },
  } as never;
  return { db, communityRow, membershipRow };
}

describe("participantsAmong", () => {
  it("keeps everyone for a Hub-wide challenge, without a lookup", async () => {
    const { db, communityRow } = fakeDb(null);
    await expect(
      participantsAmong(db, { communityId: null }, ["a", "b"]),
    ).resolves.toEqual(new Set(["a", "b"]));
    expect(communityRow).not.toHaveBeenCalled();
  });

  it("keeps everyone in a public community", async () => {
    const { db } = fakeDb({ isListedInDirectory: true, joinPolicy: "open" });
    await expect(
      participantsAmong(db, { communityId: "c1" }, ["a", "b"]),
    ).resolves.toEqual(new Set(["a", "b"]));
  });

  it("drops people who lost access to a members-only community", async () => {
    const { db, membershipRow } = fakeDb({
      isListedInDirectory: true,
      joinPolicy: "invite_only",
    });
    // Membership reads come in list order: "a" is still an active member,
    // "b" was banned (no active row).
    membershipRow
      .mockResolvedValueOnce({ role: "member" })
      .mockResolvedValueOnce(undefined);
    const kept = await participantsAmong(db, { communityId: "c1" }, ["a", "b"]);
    expect(kept).toEqual(new Set(["a"]));
  });

  it("drops everyone when the community is gone", async () => {
    await expect(
      participantsAmong(fakeDb(null).db, { communityId: "c1" }, ["a"]),
    ).resolves.toEqual(new Set());
  });
});
