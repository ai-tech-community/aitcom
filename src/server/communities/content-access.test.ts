import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as PaymentsAccess from "@/server/payments/access";

const payments = vi.hoisted(() => ({
  membershipPaymentAllowed: vi.fn(),
  canReadPaidCommunity: vi.fn(),
  paymentsEnabled: vi.fn(),
}));
vi.mock("@/server/payments/access", async (importOriginal) => ({
  ...(await importOriginal<typeof PaymentsAccess>()),
  membershipPaymentAllowed: payments.membershipPaymentAllowed,
  canReadPaidCommunity: payments.canReadPaidCommunity,
  paymentsEnabled: payments.paymentsEnabled,
}));

import {
  NOT_AN_ACTIVE_MEMBER,
  requireActiveMember,
  requireActiveMemberBySlug,
  requireActiveMemberOf,
  requireJoinTermsReader,
  requireReadableCommunity,
  requireReadableCommunityBySlug,
  requireReadableContentOf,
  requireReadableRosterBySlug,
} from "./content-access";
import {
  activeMemberCommunityIds,
  COMMUNITY_VISIBILITY_COLUMNS,
  type CommunityRef,
} from "./content-visibility-queries";

beforeEach(() => {
  payments.membershipPaymentAllowed.mockReset().mockResolvedValue(true);
  payments.canReadPaidCommunity.mockReset().mockResolvedValue(true);
  payments.paymentsEnabled.mockReset().mockReturnValue(false);
});

const INVITE_ONLY: CommunityRef = {
  id: "c1",
  slug: "closed",
  isListedInDirectory: true,
  joinPolicy: "invite_only",
};
const APPROVAL: CommunityRef = {
  ...INVITE_ONLY,
  joinPolicy: "approval_required",
};
const UNLISTED: CommunityRef = {
  ...INVITE_ONLY,
  isListedInDirectory: false,
  joinPolicy: "open",
};
const PUBLIC: CommunityRef = { ...INVITE_ONLY, joinPolicy: "open" };
const HUB: CommunityRef = { ...UNLISTED, id: "hub", slug: "ait" };

const MEMBERS_ONLY = [
  ["listed invite_only", INVITE_ONLY],
  ["listed approval_required", APPROVAL],
  ["unlisted", UNLISTED],
] as const;

/**
 * A database with one community row and one membership row for the caller.
 * `membership` is the caller's row (any status), or null for none.
 */
function fakeDb(
  community: CommunityRef | null,
  membership: { role: string; status: string } | null = null,
) {
  const communityRow = vi.fn().mockResolvedValue(community ?? undefined);
  // The active-membership lookups ask for status "active" in the where
  // clause; the fake answers like Postgres would for that row.
  const membershipRow = vi.fn(async (query: { columns?: object }) => {
    if (!membership) return undefined;
    const wantsStatus = query.columns && "status" in query.columns;
    if (!wantsStatus && membership.status !== "active") return undefined;
    return membership;
  });
  return {
    db: {
      query: {
        communities: { findFirst: communityRow },
        communityMemberships: { findFirst: membershipRow },
      },
    } as never,
    communityRow,
    membershipRow,
  };
}

const MEMBER = { role: "member", status: "active" };

describe("requireReadableCommunity", () => {
  it.each(MEMBERS_ONLY)(
    "answers NOT_FOUND to a guest or outsider of a %s community",
    async (_label, community) => {
      for (const userId of [null, "outsider"]) {
        await expect(
          requireReadableCommunity(fakeDb(community).db, community, userId),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    },
  );

  it.each(["pending_approval", "invited", "banned"])(
    "answers NOT_FOUND to a %s viewer of a private community",
    async (status) => {
      const { db } = fakeDb(INVITE_ONLY, { role: "member", status });
      await expect(
        requireReadableCommunity(db, INVITE_ONLY, "u1"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    },
  );

  it("lets an active member read a private community", async () => {
    const { db } = fakeDb(INVITE_ONLY, MEMBER);
    await expect(
      requireReadableCommunity(db, INVITE_ONLY, "u1"),
    ).resolves.toBeUndefined();
  });

  it("refuses a member whose paid membership lapsed", async () => {
    payments.membershipPaymentAllowed.mockResolvedValue(false);
    const { db } = fakeDb(INVITE_ONLY, MEMBER);
    await expect(
      requireReadableCommunity(db, INVITE_ONLY, "u1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets anyone read a public community and the Hub, without a lookup", async () => {
    for (const community of [PUBLIC, HUB]) {
      const { db, membershipRow } = fakeDb(community);
      await expect(
        requireReadableCommunity(db, community, null),
      ).resolves.toBeUndefined();
      expect(membershipRow).not.toHaveBeenCalled();
    }
  });

  it("carries the caller's not-found message", async () => {
    await expect(
      requireReadableCommunity(fakeDb(INVITE_ONLY).db, INVITE_ONLY, null, {
        notFound: "Thread not found",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Thread not found" });
  });
});

describe("requireReadableCommunityBySlug", () => {
  it("answers a missing community and a hidden one the same way", async () => {
    await expect(
      requireReadableCommunityBySlug(fakeDb(null).db, "nope", null),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      requireReadableCommunityBySlug(fakeDb(INVITE_ONLY).db, "closed", null),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the community's visibility facts to a reader", async () => {
    const { db, communityRow } = fakeDb(PUBLIC);
    await expect(
      requireReadableCommunityBySlug(db, "closed", null),
    ).resolves.toEqual(PUBLIC);
    expect(communityRow).toHaveBeenCalledWith(
      expect.objectContaining({ columns: COMMUNITY_VISIBILITY_COLUMNS }),
    );
  });
});

describe("requireReadableRosterBySlug", () => {
  it("hides a members-only roster from outsiders, and the Hub's too", async () => {
    for (const community of [INVITE_ONLY, APPROVAL, UNLISTED, HUB]) {
      await expect(
        requireReadableRosterBySlug(fakeDb(community).db, "x", "outsider"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("shows a members-only roster to a member, and a public one to anyone", async () => {
    await expect(
      requireReadableRosterBySlug(fakeDb(APPROVAL, MEMBER).db, "x", "u1"),
    ).resolves.toEqual(APPROVAL);
    await expect(
      requireReadableRosterBySlug(fakeDb(PUBLIC).db, "x", null),
    ).resolves.toEqual(PUBLIC);
  });

  it("answers NOT_FOUND for a missing community", async () => {
    await expect(
      requireReadableRosterBySlug(fakeDb(null).db, "x", "u1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("requireReadableContentOf", () => {
  it("lets anyone read Hub-wide content (no community)", async () => {
    const { db, communityRow } = fakeDb(null);
    await expect(
      requireReadableContentOf(db, null, null),
    ).resolves.toBeUndefined();
    expect(communityRow).not.toHaveBeenCalled();
  });

  it("hides a members-only community's row from an outsider", async () => {
    await expect(
      requireReadableContentOf(fakeDb(APPROVAL).db, "c1", "outsider"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("hides a row whose community is gone", async () => {
    await expect(
      requireReadableContentOf(fakeDb(null).db, "c1", "u1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("requireActiveMember", () => {
  it("returns an active member's role", async () => {
    const { db } = fakeDb(INVITE_ONLY, { role: "admin", status: "active" });
    await expect(requireActiveMember(db, INVITE_ONLY, "u1")).resolves.toBe(
      "admin",
    );
  });

  it.each(MEMBERS_ONLY)(
    "answers NOT_FOUND to a non-member of a %s community, never FORBIDDEN",
    async (_label, community) => {
      for (const membership of [
        null,
        { role: "member", status: "pending_approval" },
        { role: "member", status: "invited" },
        { role: "member", status: "banned" },
      ]) {
        const { db } = fakeDb(community, membership);
        await expect(
          requireActiveMember(db, community, "u1"),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    },
  );

  it("answers FORBIDDEN to a non-member who can already read the content", async () => {
    for (const community of [PUBLIC, HUB]) {
      await expect(
        requireActiveMember(fakeDb(community).db, community, "u1"),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: NOT_AN_ACTIVE_MEMBER,
      });
    }
  });

  it("refuses a signed-out caller", async () => {
    await expect(
      requireActiveMember(fakeDb(PUBLIC).db, PUBLIC, null),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a member whose paid membership lapsed", async () => {
    payments.membershipPaymentAllowed.mockResolvedValue(false);
    const { db } = fakeDb(PUBLIC, MEMBER);
    await expect(requireActiveMember(db, PUBLIC, "u1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("requireActiveMemberBySlug and requireActiveMemberOf", () => {
  it("answer NOT_FOUND for a missing community", async () => {
    await expect(
      requireActiveMemberBySlug(fakeDb(null).db, "nope", "u1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      requireActiveMemberOf(fakeDb(null).db, "c1", "u1"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("return the community and the member's role", async () => {
    const { db } = fakeDb(INVITE_ONLY, MEMBER);
    await expect(
      requireActiveMemberBySlug(db, "closed", "u1"),
    ).resolves.toEqual({ ...INVITE_ONLY, role: "member" });
    await expect(requireActiveMemberOf(db, "c1", "u1")).resolves.toEqual({
      ...INVITE_ONLY,
      role: "member",
    });
  });

  it("leave Hub-wide content (no community) open to any signed-in user", async () => {
    const { db, communityRow } = fakeDb(null);
    await expect(requireActiveMemberOf(db, null, "u1")).resolves.toBeNull();
    expect(communityRow).not.toHaveBeenCalled();
  });
});

describe("requireJoinTermsReader", () => {
  it.each(["invited", "pending_approval"])(
    "lets a %s viewer read a private community's rules",
    async (status) => {
      const { db } = fakeDb(INVITE_ONLY, { role: "member", status });
      await expect(requireJoinTermsReader(db, "closed", "u1")).resolves.toEqual(
        INVITE_ONLY,
      );
    },
  );

  it("hides a private community's rules from strangers and banned members", async () => {
    for (const membership of [null, { role: "member", status: "banned" }]) {
      const { db } = fakeDb(INVITE_ONLY, membership);
      await expect(
        requireJoinTermsReader(db, "closed", "u1"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(
      requireJoinTermsReader(fakeDb(INVITE_ONLY).db, "closed", null),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows a public community's rules to anyone, and a member's own", async () => {
    await expect(
      requireJoinTermsReader(fakeDb(PUBLIC).db, "closed", null),
    ).resolves.toEqual(PUBLIC);
    await expect(
      requireJoinTermsReader(fakeDb(INVITE_ONLY, MEMBER).db, "closed", "u1"),
    ).resolves.toEqual(INVITE_ONLY);
  });
});

describe("activeMemberCommunityIds", () => {
  function selectDb(
    memberships: { communityId: string; role: string }[],
    paidIds: string[] = [],
  ) {
    const results = [memberships, paidIds.map((id) => ({ id }))];
    const select = vi.fn(() => {
      const rows = results.shift() ?? [];
      const chain = {
        from: () => chain,
        where: () => Promise.resolve(rows),
      };
      return chain;
    });
    return { db: { select } as never, select };
  }

  it("is every active membership while payments are off", async () => {
    const { db, select } = selectDb([
      { communityId: "a", role: "member" },
      { communityId: "b", role: "owner" },
    ]);
    await expect(activeMemberCommunityIds(db, "u1")).resolves.toEqual(
      new Set(["a", "b"]),
    );
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("drops a paid community whose membership lapsed, but not a staff role", async () => {
    payments.paymentsEnabled.mockReturnValue(true);
    payments.membershipPaymentAllowed.mockImplementation(
      async (_db: unknown, id: string) => id !== "paid",
    );
    const { db } = selectDb(
      [
        { communityId: "paid", role: "member" },
        { communityId: "free", role: "member" },
        { communityId: "staffed", role: "admin" },
      ],
      ["paid"],
    );
    await expect(activeMemberCommunityIds(db, "u1")).resolves.toEqual(
      new Set(["free", "staffed"]),
    );
    expect(payments.membershipPaymentAllowed).toHaveBeenCalledTimes(1);
  });
});
