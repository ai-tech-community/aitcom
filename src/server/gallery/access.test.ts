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
  assertCommunityTopic,
  assertLinkableEvent,
  isLinkableEvent,
  loadGalleryViewer,
  loadGalleryViewerById,
  publicItemsReachOutsiders,
} from "./access";

const NOW = new Date("2026-11-13T12:00:00.000Z");

beforeEach(() => {
  payments.membershipPaymentAllowed.mockReset().mockResolvedValue(true);
  payments.canReadPaidCommunity.mockReset().mockResolvedValue(true);
});

function fakeDb(
  over: { community?: boolean; role?: string | null; listed?: boolean } = {},
): never {
  return {
    query: {
      communities: {
        findFirst: vi.fn().mockResolvedValue(
          over.community === false
            ? undefined
            : {
                id: "c1",
                slug: "town",
                isListedInDirectory: over.listed ?? true,
              },
        ),
      },
      communityMemberships: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            over.role === null
              ? undefined
              : { communityId: "c1", role: over.role ?? "member" },
          ),
      },
    },
  } as never;
}

describe("loadGalleryViewer", () => {
  it("refuses an unknown or deleted community with NOT_FOUND", async () => {
    await expect(
      loadGalleryViewer(
        { db: fakeDb({ community: false }) },
        { slug: "gone", userId: "u1" },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("sees a signed-out visitor as an outsider without looking up a membership", async () => {
    const db = fakeDb();
    await expect(
      loadGalleryViewer({ db }, { slug: "town", userId: null }),
    ).resolves.toEqual({
      userId: null,
      communityId: "c1",
      isMember: false,
      isModerator: false,
      canSeePublic: true,
      community: { id: "c1", slug: "town", isListedInDirectory: true },
    });
    expect(
      (db as { query: { communityMemberships: { findFirst: unknown } } }).query
        .communityMemberships.findFirst,
    ).not.toHaveBeenCalled();
  });

  it("sees an active member whose membership is paid up", async () => {
    await expect(
      loadGalleryViewer({ db: fakeDb() }, { slug: "town", userId: "u1" }),
    ).resolves.toMatchObject({
      userId: "u1",
      isMember: true,
      isModerator: false,
    });
  });

  it("does not count a member whose paid membership lapsed", async () => {
    payments.membershipPaymentAllowed.mockResolvedValue(false);
    await expect(
      loadGalleryViewer({ db: fakeDb() }, { slug: "town", userId: "u1" }),
    ).resolves.toMatchObject({ isMember: false, isModerator: false });
  });

  it.each(["owner", "admin", "moderator"])(
    "sees an active %s as a moderator",
    async (role) => {
      await expect(
        loadGalleryViewer(
          { db: fakeDb({ role }) },
          { slug: "town", userId: "u1" },
        ),
      ).resolves.toMatchObject({ isMember: true, isModerator: true });
    },
  );

  it("sees someone with no active membership as an outsider", async () => {
    await expect(
      loadGalleryViewer(
        { db: fakeDb({ role: null }) },
        { slug: "town", userId: "u1" },
      ),
    ).resolves.toMatchObject({ isMember: false, isModerator: false });
  });
});

describe("what a viewer may see", () => {
  it("lets outsiders see public items of a community whose content is public", async () => {
    await expect(
      loadGalleryViewer(
        { db: fakeDb({ role: null }) },
        { slug: "town", userId: "u1" },
      ),
    ).resolves.toMatchObject({ isMember: false, canSeePublic: true });
    expect(payments.canReadPaidCommunity).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      "u1",
    );
  });

  it.each([
    ["a signed-out visitor", null],
    ["a signed-in non-member", "u1"],
  ])(
    "shows %s nothing of a members-only community, without a payment lookup",
    async (_label, userId) => {
      await expect(
        loadGalleryViewer(
          { db: fakeDb({ role: null, listed: false }) },
          { slug: "town", userId },
        ),
      ).resolves.toMatchObject({ isMember: false, canSeePublic: false });
      expect(payments.canReadPaidCommunity).not.toHaveBeenCalled();
    },
  );

  it("shows outsiders nothing of a paid community they have not paid for", async () => {
    payments.canReadPaidCommunity.mockResolvedValue(false);
    await expect(
      loadGalleryViewer({ db: fakeDb() }, { slug: "town", userId: null }),
    ).resolves.toMatchObject({ isMember: false, canSeePublic: false });
  });

  it("lets a member of a members-only community see its public items too", async () => {
    await expect(
      loadGalleryViewer(
        { db: fakeDb({ listed: false }) },
        { slug: "town", userId: "u1" },
      ),
    ).resolves.toMatchObject({ isMember: true, canSeePublic: true });
  });

  it("decides the same way when reached through a record", async () => {
    await expect(
      loadGalleryViewerById(
        { db: fakeDb({ role: null, listed: false }) },
        { communityId: "c1", userId: "u1" },
      ),
    ).resolves.toMatchObject({ isMember: false, canSeePublic: false });
  });
});

describe("publicItemsReachOutsiders", () => {
  const community = (listed: boolean) => ({
    id: "c1",
    slug: "town",
    isListedInDirectory: listed,
  });

  it("is true where signed-out visitors may read the community", async () => {
    await expect(
      publicItemsReachOutsiders({ db: fakeDb() }, community(true)),
    ).resolves.toBe(true);
    expect(payments.canReadPaidCommunity).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      null,
    );
  });

  it("is false for a members-only community, without a payment lookup", async () => {
    await expect(
      publicItemsReachOutsiders({ db: fakeDb() }, community(false)),
    ).resolves.toBe(false);
    expect(payments.canReadPaidCommunity).not.toHaveBeenCalled();
  });

  it("is false for a paid community", async () => {
    payments.canReadPaidCommunity.mockResolvedValue(false);
    await expect(
      publicItemsReachOutsiders({ db: fakeDb() }, community(true)),
    ).resolves.toBe(false);
  });
});

describe("loadGalleryViewerById", () => {
  it("answers null for a deleted community", async () => {
    await expect(
      loadGalleryViewerById(
        { db: fakeDb({ community: false }) },
        { communityId: "c1", userId: "u1" },
      ),
    ).resolves.toBeNull();
  });

  it("reads the membership once, and names the community", async () => {
    const db = fakeDb({ role: "admin" });
    await expect(
      loadGalleryViewerById({ db }, { communityId: "c1", userId: "u1" }),
    ).resolves.toEqual({
      userId: "u1",
      communityId: "c1",
      isMember: true,
      isModerator: true,
      canSeePublic: true,
      community: { id: "c1", slug: "town", isListedInDirectory: true },
    });
    expect(
      (db as { query: { communityMemberships: { findFirst: unknown } } }).query
        .communityMemberships.findFirst,
    ).toHaveBeenCalledTimes(1);
  });
});

/** Started at 11:00 Amsterdam (10:00Z) on the day NOW falls in. */
const EVENT = {
  id: 5,
  communityId: "c1",
  status: "published" as const,
  _status: "draft",
  date: "2026-11-13T00:00:00.000Z",
  startTime: "11:00",
  timezone: "Europe/Amsterdam",
};

function fakePayload(event: unknown): {
  payload: never;
  findByID: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
} {
  const findByID = vi.fn().mockResolvedValue(event);
  const count = vi.fn().mockResolvedValue({ totalDocs: 0 });
  return { payload: { findByID, count } as never, findByID, count };
}

describe("assertLinkableEvent", () => {
  it("accepts a started, published event of the same community, read from the live table", async () => {
    const { payload, findByID } = fakePayload(EVENT);
    await expect(
      assertLinkableEvent(payload, "c1", 5, NOW),
    ).resolves.toBeUndefined();
    expect(findByID).toHaveBeenCalledWith({
      collection: "events",
      id: 5,
      depth: 0,
      draft: false,
      disableErrors: true,
    });
  });

  it("accepts a completed event", async () => {
    const { payload } = fakePayload({ ...EVENT, status: "completed" });
    await expect(
      assertLinkableEvent(payload, "c1", 5, NOW),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["is missing", null],
    ["belongs to another community", { ...EVENT, communityId: "c2" }],
    ["is a Hub event with no community", { ...EVENT, communityId: null }],
    ["is a draft", { ...EVENT, status: "draft" }],
    ["was cancelled", { ...EVENT, status: "cancelled" }],
    ["was rejected", { ...EVENT, status: "rejected" }],
    ["starts later today in its own zone", { ...EVENT, startTime: "14:00" }],
    [
      "is on a future day",
      { ...EVENT, date: "2026-11-20T00:00:00.000Z", startTime: null },
    ],
    ["has a corrupt date", { ...EVENT, date: "soon" }],
  ])(
    "refuses an event that %s with EVENT_NOT_ALLOWED",
    async (_label, event) => {
      const { payload } = fakePayload(event);
      await expect(
        assertLinkableEvent(payload, "c1", 5, NOW),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "EVENT_NOT_ALLOWED",
      });
    },
  );
});

describe("isLinkableEvent", () => {
  it("counts a date-only event as started from its local midnight", () => {
    expect(isLinkableEvent({ ...EVENT, startTime: null }, "c1", NOW)).toBe(
      true,
    );
  });
});

describe("assertCommunityTopic", () => {
  it("accepts one of the community's topics", async () => {
    const { payload, count } = fakePayload(null);
    count.mockResolvedValue({ totalDocs: 1 });
    await expect(
      assertCommunityTopic(payload, "c1", "photos"),
    ).resolves.toBeUndefined();
    expect(count).toHaveBeenCalledWith({
      collection: "community-topics",
      where: {
        and: [
          { communityId: { equals: "c1" } },
          { slug: { equals: "photos" } },
        ],
      },
    });
  });

  it("accepts the default topic every community has, without a lookup", async () => {
    const { payload, count } = fakePayload(null);
    await expect(
      assertCommunityTopic(payload, "c1", "general"),
    ).resolves.toBeUndefined();
    expect(count).not.toHaveBeenCalled();
  });

  it("refuses a topic the community does not have with TOPIC_NOT_FOUND", async () => {
    const { payload } = fakePayload(null);
    await expect(
      assertCommunityTopic(payload, "c1", "elsewhere"),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "TOPIC_NOT_FOUND",
    });
  });
});
