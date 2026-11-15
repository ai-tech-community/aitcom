import { PgDialect } from "drizzle-orm/pg-core";
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

import {
  activeCommunityRole,
  COMMUNITY_VISIBILITY_COLUMNS,
  communityStanding,
  contentPrivateCommunitySql,
  contentPublicCommunitySql,
  findReadableCommunityBySlug,
  isActiveCommunityMember,
  publicCommunitySql,
  publicDirectoryCommunitySql,
  viewerCanReadContent,
  viewerCanReadContentOf,
  viewerCanReadRoster,
  viewerCommunityAccess,
} from "./content-visibility-queries";

beforeEach(() => {
  payments.membershipPaymentAllowed.mockReset().mockResolvedValue(true);
  payments.canReadPaidCommunity.mockReset().mockResolvedValue(true);
});

function render(query: ReturnType<typeof publicCommunitySql>) {
  return new PgDialect().sqlToQuery(query);
}

describe("visibility SQL twins", () => {
  it("makes a community public only when it is listed and open", () => {
    const { sql, params } = render(publicCommunitySql());
    expect(sql).toBe(
      '("app"."community"."isListedInDirectory" = $1 and "app"."community"."joinPolicy" = $2)',
    );
    expect(params).toEqual([true, "open"]);
  });

  it("puts listed communities and the Hub on the directory, by listing only", () => {
    const { sql, params } = render(publicDirectoryCommunitySql());
    expect(sql).toBe(
      '("app"."community"."isListedInDirectory" = $1 or "app"."community"."slug" = $2)',
    );
    expect(params).toEqual([true, "ait"]);
  });

  it("makes content public on the Hub or a public community", () => {
    const { sql, params } = render(contentPublicCommunitySql());
    expect(sql).toBe(
      '("app"."community"."slug" = $1 or ("app"."community"."isListedInDirectory" = $2 and "app"."community"."joinPolicy" = $3))',
    );
    expect(params).toEqual(["ait", true, "open"]);
  });

  it("hides content everywhere else, as the exact negation", () => {
    const { sql, params } = render(contentPrivateCommunitySql());
    expect(sql).toBe(
      'not ("app"."community"."slug" = $1 or ("app"."community"."isListedInDirectory" = $2 and "app"."community"."joinPolicy" = $3))',
    );
    expect(params).toEqual(["ait", true, "open"]);
  });
});

describe("content and roster reads", () => {
  const PRIVATE_LISTED = {
    id: "c1",
    slug: "connect-inspire",
    isListedInDirectory: true,
    joinPolicy: "invite_only" as const,
  };
  const PUBLIC_LISTED = { ...PRIVATE_LISTED, joinPolicy: "open" as const };

  function membershipDb(
    role: string | null,
    community: typeof PRIVATE_LISTED | null = PRIVATE_LISTED,
  ) {
    const membership = vi
      .fn()
      .mockResolvedValue(role === null ? undefined : { role });
    const communityRow = vi.fn().mockResolvedValue(community ?? undefined);
    return {
      db: {
        query: {
          communityMemberships: { findFirst: membership },
          communities: { findFirst: communityRow },
        },
      } as never,
      membership,
      communityRow,
    };
  }

  it("refuses a private listed community's content to an outsider", async () => {
    const { db } = membershipDb(null);
    await expect(viewerCanReadContent(db, PRIVATE_LISTED, "u1")).resolves.toBe(
      false,
    );
    await expect(viewerCanReadContent(db, PRIVATE_LISTED, null)).resolves.toBe(
      false,
    );
  });

  it("serves a private listed community's content to an active member", async () => {
    const { db } = membershipDb("member");
    await expect(viewerCanReadContent(db, PRIVATE_LISTED, "u1")).resolves.toBe(
      true,
    );
  });

  it("serves a public community without a membership lookup", async () => {
    const { db, membership } = membershipDb(null);
    await expect(viewerCanReadContent(db, PUBLIC_LISTED, null)).resolves.toBe(
      true,
    );
    expect(membership).not.toHaveBeenCalled();
  });

  it("keeps a private listed roster members-only", async () => {
    await expect(
      viewerCanReadRoster(membershipDb(null).db, PRIVATE_LISTED, "u1"),
    ).resolves.toBe(false);
    await expect(
      viewerCanReadRoster(membershipDb("member").db, PRIVATE_LISTED, "u1"),
    ).resolves.toBe(true);
  });

  it("answers content and roster together with at most one membership lookup", async () => {
    const outsider = membershipDb(null);
    await expect(
      viewerCommunityAccess(outsider.db, PRIVATE_LISTED, "u1"),
    ).resolves.toEqual({ content: false, roster: false });
    expect(outsider.membership).toHaveBeenCalledTimes(1);

    const member = membershipDb("member");
    await expect(
      viewerCommunityAccess(member.db, PRIVATE_LISTED, "u1"),
    ).resolves.toEqual({ content: true, roster: true });

    const guest = membershipDb(null);
    await expect(
      viewerCommunityAccess(guest.db, PUBLIC_LISTED, null),
    ).resolves.toEqual({ content: true, roster: true });
    expect(guest.membership).not.toHaveBeenCalled();
  });

  it("gives the Hub's outsiders its content but not its roster", async () => {
    const hub = {
      id: "hub",
      slug: "ait",
      isListedInDirectory: false,
      joinPolicy: "open" as const,
    };
    await expect(
      viewerCommunityAccess(membershipDb(null).db, hub, null),
    ).resolves.toEqual({ content: true, roster: false });
  });

  it("refuses both before paid admission", async () => {
    payments.canReadPaidCommunity.mockResolvedValue(false);
    const { db, membership } = membershipDb("member");
    await expect(
      viewerCommunityAccess(db, PUBLIC_LISTED, "u1"),
    ).resolves.toEqual({ content: false, roster: false });
    expect(membership).not.toHaveBeenCalled();
  });

  it("reads the join policy when it looks a community up", async () => {
    const bySlug = membershipDb(null);
    await expect(
      findReadableCommunityBySlug(bySlug.db, PRIVATE_LISTED.slug, null),
    ).resolves.toBeNull();
    expect(bySlug.communityRow).toHaveBeenCalledWith(
      expect.objectContaining({ columns: COMMUNITY_VISIBILITY_COLUMNS }),
    );

    const byId = membershipDb(null);
    await expect(viewerCanReadContentOf(byId.db, "c1", null)).resolves.toBe(
      false,
    );
    expect(byId.communityRow).toHaveBeenCalledWith(
      expect.objectContaining({ columns: COMMUNITY_VISIBILITY_COLUMNS }),
    );
    expect(COMMUNITY_VISIBILITY_COLUMNS).toMatchObject({ joinPolicy: true });
  });
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

describe("communityStanding", () => {
  function standingDb(row: { role: string; status: string } | null) {
    const findFirst = vi.fn().mockResolvedValue(row ?? undefined);
    return {
      db: { query: { communityMemberships: { findFirst } } } as never,
      findFirst,
    };
  }

  it("is nothing for a signed-out visitor, without a lookup", async () => {
    const { db, findFirst } = standingDb({ role: "member", status: "active" });
    await expect(communityStanding(db, "c1", null)).resolves.toEqual({
      status: null,
      activeRole: null,
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("is nothing without a membership row", async () => {
    const { db } = standingDb(null);
    await expect(communityStanding(db, "c1", "u1")).resolves.toEqual({
      status: null,
      activeRole: null,
    });
  });

  it("gives an active member's role and status in one read", async () => {
    const { db, findFirst } = standingDb({ role: "admin", status: "active" });
    await expect(communityStanding(db, "c1", "u1")).resolves.toEqual({
      status: "active",
      activeRole: "admin",
    });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("keeps the status but no role for a member whose paid membership lapsed", async () => {
    payments.membershipPaymentAllowed.mockResolvedValue(false);
    const { db } = standingDb({ role: "member", status: "active" });
    await expect(communityStanding(db, "c1", "u1")).resolves.toEqual({
      status: "active",
      activeRole: null,
    });
  });

  it.each(["pending_approval", "invited", "banned"])(
    "gives a %s row its status and no role",
    async (status) => {
      const { db } = standingDb({ role: "member", status });
      await expect(communityStanding(db, "c1", "u1")).resolves.toEqual({
        status,
        activeRole: null,
      });
      expect(payments.membershipPaymentAllowed).not.toHaveBeenCalled();
    },
  );
});
