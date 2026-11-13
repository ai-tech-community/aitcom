import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isModeratorRole } from "@/lib/communities/moderator-roles";

import type * as Access from "./access";
import type { GalleryViewer } from "./access";
import { matchesWhere, selectFields, sortDocs } from "./fake-payload-query";
import { galleryViewsForPosts } from "./feed-view";

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

const loadViewer = vi.hoisted(() => vi.fn());
vi.mock("./access", async (importOriginal) => ({
  ...(await importOriginal<typeof Access>()),
  loadGalleryViewerById: loadViewer,
}));

beforeEach(() => {
  vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "true");
  loadViewer.mockImplementation(
    async (
      _deps: unknown,
      input: { communityId: string; userId: string | null },
    ): Promise<GalleryViewer | null> => {
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
      };
    },
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

type Doc = Record<string, unknown>;
type Where = Record<string, unknown>;

const HIDDEN = "2026-11-13T10:00:00.000Z";

function item(id: number, batch: number, over: Doc = {}): Doc {
  const communityId = (over.communityId as string | undefined) ?? "c1";
  const isPublic = over.visibility === "public";
  const stem = isPublic
    ? `media/gallery/public/${communityId}/u${id}`
    : `private/gallery/${communityId}/u${id}`;
  return {
    id,
    communityId,
    event: null,
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
    batch,
    hiddenAt: null,
    magazineConsent: false,
    createdAt: "2026-11-13T09:00:00.000Z",
    ...over,
  };
}

function batch(id: number, over: Doc = {}): Doc {
  return {
    id,
    communityId: "c1",
    uploaderId: "u1",
    event: null,
    topicSlug: null,
    ...over,
  };
}

function post(id: number, galleryBatch: number | null, communityId = "c1") {
  return { id, communityId, galleryBatch };
}

function fakes(seed: { items?: Doc[]; batches?: Doc[]; events?: Doc[] }) {
  const store: Record<string, Doc[]> = {
    "gallery-items": seed.items ?? [],
    "gallery-batches": seed.batches ?? [],
    events: seed.events ?? [],
  };
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
          (store[args.collection] ?? []).filter((doc) =>
            matchesWhere(doc, args.where),
          ),
          args.sort,
        ).map((doc) => selectFields(doc, args.select));
        return { docs: args.limit ? found.slice(0, args.limit) : found };
      },
    ),
    count: vi.fn(async () => {
      throw new Error("a per-post count is never needed");
    }),
  };
  const storage = {
    signedGetUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
    publicUrl: vi.fn((key: string) => `https://public.test/${key}`),
  };
  const storageSource = vi.fn(() => storage);
  const db = {
    select: vi.fn(() => ({
      from: () => ({
        where: async () => [
          { id: "u1", name: "Dana", image: null },
          { id: "u2", name: "Ruben", image: null },
        ],
      }),
    })),
  };
  const deps = {
    payload: payload as never,
    db: db as never,
    storage: storageSource as never,
  };
  return { deps, payload, db, storage, storageSource };
}

const itemIds = (view: { items: { id: number }[] } | null | undefined) =>
  view?.items.map((i) => i.id);

describe("galleryViewsForPosts", () => {
  it("gives posts without a batch no gallery, without asking anything", async () => {
    const { deps, payload, db } = fakes({});

    const views = await galleryViewsForPosts(
      deps,
      [post(1, null), post(2, null, "c2")],
      "u2",
    );

    expect([...views]).toEqual([
      [1, null],
      [2, null],
    ]);
    expect(loadViewer).not.toHaveBeenCalled();
    expect(payload.find).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("shows the batch's three newest items, how many there are, its event and category", async () => {
    const { deps } = fakes({
      items: [1, 2, 3, 4, 5].map((id) => item(id, 7)),
      batches: [batch(7, { event: 50, topicSlug: "meetups" })],
      events: [{ id: 50, title: "Spring meetup", slug: "spring-meetup" }],
    });

    const views = await galleryViewsForPosts(deps, [post(1, 7)], "u2");

    const view = views.get(1)!;
    expect(view).toMatchObject({
      batchId: 7,
      total: 5,
      event: { id: 50, title: "Spring meetup", slug: "spring-meetup" },
      topicSlug: "meetups",
    });
    expect(itemIds(view)).toEqual([5, 4, 3]);
    expect(view.items[0]).toMatchObject({
      url: "https://signed.test/private/gallery/c1/u5.jpg",
      uploader: { id: "u1", name: "Dana", image: null },
      isOwn: false,
    });
  });

  it("gives a batch with no event or category none", async () => {
    const { deps } = fakes({ items: [item(1, 7)], batches: [batch(7)] });
    const views = await galleryViewsForPosts(deps, [post(1, 7)], "u2");
    expect(views.get(1)).toMatchObject({ event: null, topicSlug: null });
  });

  describe("Review Focus 1: a collage never shows an item the viewer may not see", () => {
    const seed = () => ({
      items: [
        item(1, 7),
        item(2, 7, { visibility: "public" }),
        item(3, 7, { visibility: "public", hiddenAt: HIDDEN }),
        item(4, 7, { hiddenAt: HIDDEN }),
        item(5, 7, { status: "uploading", visibility: "public" }),
        item(6, 8, { communityId: "c2", visibility: "public" }),
        item(9, 9, { hiddenAt: HIDDEN }),
      ],
      batches: [batch(7), batch(8, { communityId: "c2" }), batch(9)],
    });

    it.each([
      ["a signed-in non-member", "u9"],
      ["a signed-out visitor", null],
    ])(
      "shows %s only the public, unhidden items, and counts only those",
      async (_label, userId) => {
        const { deps, storage } = fakes(seed());

        const views = await galleryViewsForPosts(deps, [post(1, 7)], userId);

        expect(itemIds(views.get(1))).toEqual([2]);
        expect(views.get(1)!.total).toBe(1);
        expect(storage.signedGetUrl).not.toHaveBeenCalled();
      },
    );

    it("shows nothing of a members-only community to someone outside it", async () => {
      const { deps, storageSource } = fakes(seed());

      const views = await galleryViewsForPosts(deps, [post(1, 8, "c2")], "u2");

      expect(views.get(1)).toBeNull();
      expect(storageSource).not.toHaveBeenCalled();
    });

    it("shows a member everything not hidden, and not someone else's hidden item", async () => {
      const { deps } = fakes(seed());

      const views = await galleryViewsForPosts(
        deps,
        [post(1, 7), post(2, 9)],
        "u2",
      );

      expect(itemIds(views.get(1))).toEqual([2, 1]);
      expect(views.get(1)!.total).toBe(2);
      // A batch whose only item is hidden from this member: text only.
      expect(views.get(2)).toBeNull();
    });

    it("shows the uploader their own hidden items, counted", async () => {
      const { deps } = fakes(seed());

      const views = await galleryViewsForPosts(deps, [post(1, 7)], "u1");

      expect(itemIds(views.get(1))).toEqual([4, 3, 2]);
      expect(views.get(1)!.total).toBe(4);
      expect(views.get(1)!.items[0]!.isOwn).toBe(true);
    });

    it("shows a moderator hidden items too", async () => {
      const { deps } = fakes(seed());

      const views = await galleryViewsForPosts(
        deps,
        [post(1, 7), post(2, 9)],
        "u3",
      );

      expect(itemIds(views.get(1))).toEqual([4, 3, 2]);
      expect(views.get(1)!.total).toBe(4);
      expect(itemIds(views.get(2))).toEqual([9]);
    });

    it("reads each post's items as a viewer of that post's community", async () => {
      const { deps } = fakes({
        items: [item(1, 7), item(6, 8, { communityId: "c2" })],
        batches: [batch(7), batch(8, { communityId: "c2" })],
      });
      const posts = [post(1, 7), post(2, 8, "c2")];

      // u1 is a member of both; u2 of c1 only.
      const forU1 = await galleryViewsForPosts(deps, posts, "u1");
      const forU2 = await galleryViewsForPosts(deps, posts, "u2");

      expect(itemIds(forU1.get(1))).toEqual([1]);
      expect(itemIds(forU1.get(2))).toEqual([6]);
      expect(itemIds(forU2.get(1))).toEqual([1]);
      expect(forU2.get(2)).toBeNull();
      expect(loadViewer).toHaveBeenCalledWith(deps, {
        communityId: "c2",
        userId: "u2",
      });
    });
  });

  it("gives no gallery for a post whose community is gone", async () => {
    const { deps } = fakes({
      items: [item(1, 7, { communityId: "gone" })],
      batches: [batch(7, { communityId: "gone" })],
    });
    const views = await galleryViewsForPosts(deps, [post(1, 7, "gone")], "u2");
    expect(views.get(1)).toBeNull();
  });

  it("shows nothing and asks nothing while the gallery is switched off", async () => {
    vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "false");
    const { deps, payload } = fakes({
      items: [item(1, 7)],
      batches: [batch(7)],
    });

    const views = await galleryViewsForPosts(deps, [post(1, 7)], "u2");

    expect(views.get(1)).toBeNull();
    expect(loadViewer).not.toHaveBeenCalled();
    expect(payload.find).not.toHaveBeenCalled();
  });

  describe("query budget", () => {
    /** `perCommunity` gallery posts in each of c1 and c2, three items each. */
    function feed(perCommunity: number) {
      const items: Doc[] = [];
      const batches: Doc[] = [];
      const posts: ReturnType<typeof post>[] = [];
      let itemId = 0;
      for (const communityId of ["c1", "c2"]) {
        for (let n = 0; n < perCommunity; n += 1) {
          const batchId = batches.length + 1;
          batches.push(batch(batchId, { communityId, event: 50 }));
          for (let k = 0; k < 4; k += 1) {
            itemId += 1;
            items.push(item(itemId, batchId, { communityId }));
          }
          posts.push(post(100 + batchId, batchId, communityId));
        }
      }
      return {
        posts,
        seed: {
          items,
          batches,
          events: [{ id: 50, title: "Meetup", slug: "meetup" }],
        },
      };
    }

    async function callsFor(perCommunity: number) {
      const { posts, seed } = feed(perCommunity);
      const { deps, payload, db } = fakes(seed);
      loadViewer.mockClear();

      // u1 is a member of both communities.
      const views = await galleryViewsForPosts(deps, posts, "u1");

      expect([...views.values()].every((view) => view?.total === 4)).toBe(true);
      const finds = (collection: string) =>
        payload.find.mock.calls.filter(([a]) => a.collection === collection)
          .length;
      return {
        viewers: loadViewer.mock.calls.length,
        items: finds("gallery-items"),
        batches: finds("gallery-batches"),
        events: finds("events"),
        all: payload.find.mock.calls.length,
        counts: payload.count.mock.calls.length,
        users: db.select.mock.calls.length,
      };
    }

    it("asks the same number of queries for 20 posts as for 2, across 2 communities", async () => {
      const few = await callsFor(1);
      const many = await callsFor(10);

      expect(many).toEqual(few);
      expect(many.viewers).toBe(2);
      // Per community: one scan of ids and batches, one read of what shows.
      expect(many.items).toBe(4);
      expect(many.counts).toBe(0);
    });
  });
});
