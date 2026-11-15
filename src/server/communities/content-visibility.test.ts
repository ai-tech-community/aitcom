import { describe, expect, it } from "vitest";

import { HUB_SLUG } from "./hub";
import type { JoinPolicy } from "./invite-policy";
import {
  canReadContent,
  canReadRoster,
  communityContentReadableWhere,
  type CommunityVisibility,
  isContentPublic,
  isFeaturedStripCommunity,
  isOpenCommunity,
  isPrivateCommunity,
  isPublicCommunity,
  isPublicDirectoryCommunity,
  isRosterPublic,
} from "./content-visibility";

const POLICIES: JoinPolicy[] = ["open", "invite_only", "approval_required"];

function community(
  joinPolicy: JoinPolicy,
  listed: boolean,
  slug = "ait-community-netherlands",
): CommunityVisibility {
  return { slug, isListedInDirectory: listed, joinPolicy };
}

const HUB = community("open", false, HUB_SLUG);
const LISTED_OPEN = community("open", true);
const UNLISTED_OPEN = community("open", false, "secret-guild");

describe("private community", () => {
  it("is every community whose join policy is not open", () => {
    expect(isOpenCommunity({ joinPolicy: "open" })).toBe(true);
    expect(isPrivateCommunity({ joinPolicy: "open" })).toBe(false);
    expect(isPrivateCommunity({ joinPolicy: "invite_only" })).toBe(true);
    expect(isPrivateCommunity({ joinPolicy: "approval_required" })).toBe(true);
  });

  it("fails closed for a join policy it does not know", () => {
    expect(isPrivateCommunity({ joinPolicy: "anyone" as JoinPolicy })).toBe(
      true,
    );
  });

  it("does not depend on listing", () => {
    expect(isPrivateCommunity(community("invite_only", true))).toBe(true);
    expect(isPrivateCommunity(community("invite_only", false))).toBe(true);
  });

  it("makes a community public only when it is listed and open", () => {
    expect(isPublicCommunity(LISTED_OPEN)).toBe(true);
    expect(isPublicCommunity(UNLISTED_OPEN)).toBe(false);
    expect(isPublicCommunity(community("invite_only", true))).toBe(false);
    expect(isPublicCommunity(community("approval_required", true))).toBe(false);
  });
});

describe("content visibility", () => {
  it("is public on the Hub and on a listed open community", () => {
    expect(isContentPublic(HUB)).toBe(true);
    expect(isContentPublic(LISTED_OPEN)).toBe(true);
  });

  it("stays public on the Hub whatever its row says", () => {
    expect(isContentPublic(community("invite_only", false, HUB_SLUG))).toBe(
      true,
    );
  });

  it.each(
    POLICIES.flatMap((policy) =>
      [true, false].map((listed) => ({ policy, listed })),
    ),
  )(
    "on a $policy community (listed: $listed) is public only when listed and open; members always read",
    ({ policy, listed }) => {
      const c = community(policy, listed);
      const expected = listed && policy === "open";
      expect(isContentPublic(c)).toBe(expected);
      expect(canReadContent(c, false)).toBe(expected);
      expect(canReadContent(c, true)).toBe(true);
    },
  );

  it("is members-only on a listed invite-only community", () => {
    const c = community("invite_only", true, "connect-inspire-networking");
    expect(canReadContent(c, false)).toBe(false);
    expect(canReadContent(c, true)).toBe(true);
  });

  it("is members-only on a listed community that approves requests", () => {
    const c = community("approval_required", true);
    expect(canReadContent(c, false)).toBe(false);
    expect(canReadContent(c, true)).toBe(true);
  });

  it("is members-only on an unlisted community", () => {
    expect(isContentPublic(UNLISTED_OPEN)).toBe(false);
    expect(canReadContent(UNLISTED_OPEN, false)).toBe(false);
    expect(canReadContent(UNLISTED_OPEN, true)).toBe(true);
  });

  it("lets anyone read public content", () => {
    expect(canReadContent(HUB, false)).toBe(true);
    expect(canReadContent(LISTED_OPEN, false)).toBe(true);
  });
});

describe("roster visibility", () => {
  it.each(
    POLICIES.flatMap((policy) =>
      [true, false].map((listed) => ({ policy, listed })),
    ),
  )(
    "on a $policy community (listed: $listed) is public only when listed and open; members always read",
    ({ policy, listed }) => {
      const c = community(policy, listed);
      const expected = listed && policy === "open";
      expect(isRosterPublic(c)).toBe(expected);
      expect(canReadRoster(c, false)).toBe(expected);
      expect(canReadRoster(c, true)).toBe(true);
    },
  );

  it("keeps the Hub roster members-only", () => {
    expect(isRosterPublic(HUB)).toBe(false);
    expect(canReadRoster(HUB, false)).toBe(false);
    expect(canReadRoster(HUB, true)).toBe(true);
  });

  it("lets members read an unlisted roster", () => {
    expect(canReadRoster(UNLISTED_OPEN, false)).toBe(false);
    expect(canReadRoster(UNLISTED_OPEN, true)).toBe(true);
  });
});

describe("public directory and featured strip", () => {
  const rows = [
    { slug: "xxx-ai", isListedInDirectory: false },
    { slug: "demo-community", isListedInDirectory: false },
    { slug: "ait-community-netherlands", isListedInDirectory: true },
    { slug: HUB_SLUG, isListedInDirectory: false },
  ];

  it("includes the AIT Hub in the directory while hiding other unlisted communities", () => {
    expect(
      rows.filter(isPublicDirectoryCommunity).map((row) => row.slug),
    ).toEqual(["ait-community-netherlands", HUB_SLUG]);
  });

  it("keeps the unlisted Hub on the featured strip and drops other unlisted rooms", () => {
    expect(
      rows.filter(isFeaturedStripCommunity).map((row) => row.slug),
    ).toEqual(["ait-community-netherlands", HUB_SLUG]);
  });

  it("lists a private community: listing is about discovery, not access", () => {
    const privateListed = community("invite_only", true);
    expect(isPublicDirectoryCommunity(privateListed)).toBe(true);
    expect(isFeaturedStripCommunity(privateListed)).toBe(true);
    expect(isContentPublic(privateListed)).toBe(false);
  });
});

describe("communityContentReadableWhere", () => {
  it("adds no condition when nothing is hidden", () => {
    expect(communityContentReadableWhere([])).toBeNull();
  });

  it("hides listed ids but keeps unscoped Hub threads", () => {
    expect(communityContentReadableWhere(["a", "b"])).toEqual({
      or: [
        { communityId: { exists: false } },
        { communityId: { not_in: ["a", "b"] } },
      ],
    });
  });
});
