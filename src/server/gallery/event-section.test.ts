import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isModeratorRole } from "@/lib/communities/moderator-roles";
import type {
  JoinPolicy,
  MembershipStatus,
} from "@/server/communities/invite-policy";
import {
  matchesWhere,
  selectFields,
  sortDocs,
} from "@/test/fake-payload-query";

import type * as Access from "./access";
import type { LoadedGalleryViewer } from "./access";
import { loadEventGallerySection } from "./event-section";

/**
 * Who each user is in each community, and whether outsiders may read it.
 * The viewer is built from these like `loadGalleryViewerById` builds it; the
 * read rule applied to the items is the real one.
 */
const ROLES: Record<string, Record<string, string>> = {
  c1: { u1: "member", u2: "member", u3: "moderator" },
  c2: { u1: "member" },
};
const OPEN_TO_OUTSIDERS: Record<string, boolean> = { c1: true, c2: false };
const SLUGS: Record<string, string> = { c1: "runners", c2: "quiet-club" };
/** The community's join policy and the viewer's membership row, per test. */
const standing: {
  joinPolicy: JoinPolicy;
  membershipStatus: MembershipStatus | null;
} = { joinPolicy: "open", membershipStatus: null };

const loadViewer = vi.hoisted(() => vi.fn());
vi.mock("./access", async (importOriginal) => ({
  ...(await importOriginal<typeof Access>()),
  loadGalleryViewerById: loadViewer,
}));

const NOW = new Date("2026-11-13T12:00:00.000Z");

beforeEach(() => {
  standing.joinPolicy = "open";
  standing.membershipStatus = null;
  loadViewer.mockImplementation(
    async (
      _deps: unknown,
      input: { communityId: string; userId: string | null },
    ): Promise<LoadedGalleryViewer | null> => {
      const roles = ROLES[input.communityId];
      if (!roles) return null; // deleted community
      const role = input.userId ? (roles[input.userId] ?? null) : null;
      return {
        userId: input.userId,
        communityId: input.communityId,
        isMember: role !== null,
        isModerator: isModeratorRole(role),
        canSeePublic:
          role !== null || OPEN_TO_OUTSIDERS[input.communityId] === true,
        community: {
          id: input.communityId,
          slug: SLUGS[input.communityId]!,
          isListedInDirectory: OPEN_TO_OUTSIDERS[input.communityId] === true,
          joinPolicy: standing.joinPolicy,
        },
        membershipStatus: role !== null ? "active" : standing.membershipStatus,
      };
    },
  );
});
afterEach(() => {
  vi.clearAllMocks();
});

type Doc = Record<string, unknown>;
type Where = Record<string, unknown>;

const HIDDEN = "2026-11-13T10:00:00.000Z";

function item(id: number, over: Doc = {}): Doc {
  const communityId = (over.communityId as string | undefined) ?? "c1";
  const isPublic = over.visibility === "public";
  const stem = isPublic
    ? `media/gallery/public/${communityId}/u${id}`
    : `private/gallery/${communityId}/u${id}`;
  return {
    id,
    communityId,
    event: 50,
    topicSlug: null,
    mediaType: "photo",
    status: "ready",
    storage: isPublic ? "public" : "private",
    visibility: "community",
    fileKey: `${stem}.jpg`,
    thumbnailKey: `${stem}-thumb.jpg`,
    width: 800,
    height: 600,
    durationSeconds: null,
    caption: null,
    alt: null,
    uploaderId: "u1",
    batch: 7,
    hiddenAt: null,
    magazineConsent: false,
    createdAt: "2026-11-13T09:00:00.000Z",
    ...over,
  };
}

/** The event as the event page loaded it: started, published, community c1. */
function event(over: Doc = {}) {
  return {
    id: 50,
    communityId: "c1",
    status: "published",
    date: "2026-11-12T00:00:00.000Z",
    startTime: "19:00",
    timezone: "Europe/Amsterdam",
    ...over,
  } as Parameters<typeof loadEventGallerySection>[1]["event"];
}

function fakes(seed: { items?: Doc[] }) {
  const store: Record<string, Doc[]> = {
    "gallery-items": seed.items ?? [],
    events: [{ id: 50, title: "Sunday run", slug: "sunday-run" }],
  };
  const matching = (collection: string, where?: Where) =>
    (store[collection] ?? []).filter((doc) => matchesWhere(doc, where));
  const payload = {
    find: vi.fn(
      async (args: {
        collection: string;
        where?: Where;
        sort?: string;
        limit?: number;
        select?: Doc;
      }) => {
        const found = sortDocs(
          matching(args.collection, args.where),
          args.sort,
        ).map((doc) => selectFields(doc, args.select));
        return { docs: args.limit ? found.slice(0, args.limit) : found };
      },
    ),
    count: vi.fn(async (args: { collection: string; where?: Where }) => ({
      totalDocs: matching(args.collection, args.where).length,
    })),
  };
  const storage = {
    signedGetUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
    publicUrl: vi.fn((key: string) => `https://public.test/${key}`),
  };
  const storageSource = vi.fn(() => storage);
  const db = {
    select: vi.fn(() => ({
      from: () => ({
        where: async () => [{ id: "u1", name: "Dana", image: null }],
      }),
    })),
    // Who the viewer is comes with the viewer load: nothing is read again.
    query: new Proxy(
      {},
      {
        get: () => {
          throw new Error("the community or membership was read again");
        },
      },
    ),
  };
  const deps = {
    payload: payload as never,
    db: db as never,
    storage: storageSource as never,
    now: () => NOW,
  };
  return { deps, payload, db, storage, storageSource };
}

const ids = (section: { items: { id: number }[] } | null) =>
  section?.items.map((each) => each.id);

describe("loadEventGallerySection", () => {
  it("shows a member the six newest items of the event and how many there are", async () => {
    const { deps } = fakes({
      items: [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((id) => item(id)),
        // Another event's photo and an unlinked one stay out.
        item(9, { event: 51 }),
        item(10, { event: null }),
      ],
    });

    const section = await loadEventGallerySection(deps, {
      event: event(),
      userId: "u2",
    });

    expect(section).toMatchObject({
      communitySlug: "runners",
      eventId: 50,
      total: 8,
      viewer: { kind: "member", canModerate: false },
    });
    expect(ids(section)).toEqual([8, 7, 6, 5, 4, 3]);
    expect(section!.items[0]).toMatchObject({
      url: "https://signed.test/private/gallery/c1/u8.jpg",
      event: { id: 50, title: "Sunday run", slug: "sunday-run" },
    });
  });

  it("lets a moderator remove items from the event page", async () => {
    const { deps } = fakes({ items: [item(1)] });
    const section = await loadEventGallerySection(deps, {
      event: event(),
      userId: "u3",
    });
    expect(section?.viewer).toEqual({ kind: "member", canModerate: true });
  });

  it("gives a member the empty section, to add the first photos", async () => {
    const { deps, storageSource } = fakes({ items: [] });
    const section = await loadEventGallerySection(deps, {
      event: event(),
      userId: "u2",
    });
    expect(section).toMatchObject({ items: [], total: 0 });
    expect(section?.viewer.kind).toBe("member");
    expect(storageSource).not.toHaveBeenCalled();
  });

  it("never counts fewer items than it shows", async () => {
    const { deps, payload } = fakes({ items: [item(1), item(2)] });
    // An item hidden between the list and the count.
    payload.count.mockResolvedValueOnce({ totalDocs: 1 });
    const section = await loadEventGallerySection(deps, {
      event: event(),
      userId: "u2",
    });
    expect(section?.total).toBe(2);
  });

  describe("Review Focus 1: the event page never shows an item the viewer may not see", () => {
    const seed = () => [
      item(1),
      item(2, { visibility: "public" }),
      item(3, { visibility: "public", hiddenAt: HIDDEN }),
      item(4, { hiddenAt: HIDDEN, uploaderId: "u1" }),
      item(5, { status: "uploading", visibility: "public" }),
      item(6, { communityId: "c2", visibility: "public" }),
      item(7, { hiddenAt: HIDDEN, uploaderId: "u2" }),
    ];

    it.each([
      ["a signed-in non-member", "u9"],
      ["a signed-out visitor", null],
    ])(
      "shows %s only the public, unhidden items, and counts only those",
      async (_label, userId) => {
        const { deps, storage } = fakes({ items: seed() });

        const section = await loadEventGallerySection(deps, {
          event: event(),
          userId,
        });

        expect(ids(section)).toEqual([2]);
        expect(section!.total).toBe(1);
        expect(storage.signedGetUrl).not.toHaveBeenCalled();
      },
    );

    it("shows a member everything not hidden, plus their own hidden item only", async () => {
      const { deps } = fakes({ items: seed() });
      const section = await loadEventGallerySection(deps, {
        event: event(),
        userId: "u2",
      });
      expect(ids(section)).toEqual([7, 2, 1]);
      expect(section!.total).toBe(3);
    });

    it("shows nothing of a members-only community to someone outside it", async () => {
      const { deps, storageSource } = fakes({
        items: [item(1, { communityId: "c2", visibility: "public" })],
      });
      const section = await loadEventGallerySection(deps, {
        event: event({ communityId: "c2" }),
        userId: "u2",
      });
      expect(section).toBeNull();
      expect(storageSource).not.toHaveBeenCalled();
    });
  });

  describe("who may add, and how", () => {
    it.each([
      ["an open community", "open", true],
      ["a community that asks to approve", "approval_required", true],
      ["an invite-only community", "invite_only", false],
    ] as const)(
      "asks a signed-out visitor to sign in, to add, for %s: %s",
      async (_label, joinPolicy, canJoin) => {
        standing.joinPolicy = joinPolicy;
        const { deps } = fakes({
          items: [item(1, { visibility: "public" })],
        });
        const section = await loadEventGallerySection(deps, {
          event: event(),
          userId: null,
        });
        expect(section?.viewer).toEqual({ kind: "guest", canJoin });
      },
    );

    it.each([
      ["an open community", "open", null, true],
      ["a community that asks to approve", "approval_required", null, true],
      ["an invitation to accept", "invite_only", "invited", true],
      ["an invite-only community", "invite_only", null, false],
      ["a pending request", "approval_required", "pending_approval", false],
      ["a ban", "open", "banned", false],
    ] as const)(
      "offers a non-member joining for %s: %s",
      async (_label, joinPolicy, membershipStatus, canJoin) => {
        standing.joinPolicy = joinPolicy;
        standing.membershipStatus = membershipStatus;
        const { deps } = fakes({
          items: [item(1, { visibility: "public" })],
        });
        const section = await loadEventGallerySection(deps, {
          event: event(),
          userId: "u9",
        });
        expect(section?.viewer).toEqual({ kind: "outsider", canJoin });
      },
    );
  });

  describe("no section", () => {
    it.each([
      ["a Hub event (no community)", { communityId: null }],
      ["a cancelled event", { status: "cancelled" }],
      ["a draft event", { status: "draft" }],
      [
        "an event that has not started",
        { date: "2026-11-13T00:00:00.000Z", startTime: "19:00" },
      ],
    ])("for %s", async (_label, over) => {
      const { deps, payload } = fakes({ items: [item(1)] });
      await expect(
        loadEventGallerySection(deps, { event: event(over), userId: "u2" }),
      ).resolves.toBeNull();
      expect(loadViewer).not.toHaveBeenCalled();
      expect(payload.find).not.toHaveBeenCalled();
    });

    it("for an event of a deleted community", async () => {
      const { deps } = fakes({ items: [item(1)] });
      await expect(
        loadEventGallerySection(deps, {
          event: event({ communityId: "gone" }),
          userId: "u2",
        }),
      ).resolves.toBeNull();
    });

    it.each([
      ["a signed-in non-member", "u9"],
      ["a signed-out visitor", null],
    ])("for %s when there is nothing they may see", async (_label, userId) => {
      const { deps } = fakes({ items: [item(1)] });
      await expect(
        loadEventGallerySection(deps, { event: event(), userId }),
      ).resolves.toBeNull();
    });
  });
});
