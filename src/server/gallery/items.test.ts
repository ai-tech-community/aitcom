import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GALLERY_CAPTION_MAX, GALLERY_PAGE_SIZE } from "@/lib/gallery-rules";
import { DELETED_AUTHOR_ID } from "@/lib/account-deletion";
import {
  matchesWhere,
  selectFields,
  sortDocs,
} from "@/test/fake-payload-query";

import {
  loadGalleryViewer,
  type GalleryCommunity,
  type GalleryViewer,
} from "./access";
import {
  countItems,
  deleteItem,
  getItem,
  galleryReadableWhere,
  listFacets,
  listItems,
  previewBatches,
  updateItem,
  uploadChoices,
} from "./items";

const NOW = new Date("2026-11-13T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

type Doc = Record<string, unknown>;
type Where = Record<string, unknown>;
type CountArgs = { collection: string; where: Where };

const COMMUNITY_FILE = (id: number) => `private/gallery/c1/u${id}.jpg`;

function item(id: number, over: Doc = {}): Doc {
  const isPublic = over.visibility === "public";
  const stem = isPublic
    ? `media/gallery/public/c1/u${id}`
    : `private/gallery/c1/u${id}`;
  return {
    id,
    communityId: "c1",
    event: 5,
    topicSlug: "talks",
    mediaType: "photo",
    status: "ready",
    storage: isPublic ? "public" : "private",
    visibility: "community",
    fileKey: `${stem}.jpg`,
    thumbnailKey: `${stem}-thumb.jpg`,
    width: 2048,
    height: 1536,
    bytes: 1_050_000,
    durationSeconds: null,
    caption: null,
    alt: null,
    uploaderId: "u1",
    batch: 3,
    uploadId: `u${id}`,
    magazineConsent: false,
    magazineConsentAt: null,
    hiddenAt: null,
    reportCount: 0,
    createdAt: ago(HOUR),
    updatedAt: ago(HOUR),
    ...over,
  };
}

/** Started at 11:00 Amsterdam (10:00Z) on the day NOW falls in. */
function event(id: number, over: Doc = {}): Doc {
  return {
    id,
    title: `Event ${id}`,
    slug: `event-${id}`,
    communityId: "c1",
    status: "published",
    date: "2026-11-13T00:00:00.000Z",
    startTime: "11:00",
    timezone: "Europe/Amsterdam",
    ...over,
  };
}

const USERS = [
  { id: "u1", name: "Dana", image: "https://img.test/dana.png" },
  { id: "u2", name: "Ruben", image: null },
  { id: "u3", name: "Priya", image: null },
];

function fakes(
  seed: {
    items?: Doc[];
    events?: Doc[];
    topics?: string[];
    posts?: Doc[];
  } = {},
) {
  const store: Record<string, Doc[]> = {
    "gallery-items": seed.items ?? [],
    "feed-posts": seed.posts ?? [],
    "gallery-batches": [{ id: 3, communityId: "c1", uploaderId: "u1" }],
    events: seed.events ?? [event(5), event(6)],
  };
  const topics = seed.topics ?? ["talks", "demos"];
  const rows = (collection: string) => store[collection] ?? [];
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
          rows(args.collection).filter((doc) => matchesWhere(doc, args.where)),
          args.sort,
        ).map((doc) => selectFields(doc, args.select));
        return {
          docs: args.limit ? found.slice(0, args.limit) : found,
        };
      },
    ),
    findByID: vi.fn(
      async ({ collection, id }: { collection: string; id: number }) =>
        rows(collection).find((doc) => doc.id === id) ?? null,
    ),
    findDistinct: vi.fn(
      async (args: { collection: string; field: string; where?: Where }) => {
        const values = [
          ...new Set(
            rows(args.collection)
              .filter((doc) => matchesWhere(doc, args.where))
              .map((doc) => doc[args.field] ?? null),
          ),
        ];
        return { values: values.map((value) => ({ [args.field]: value })) };
      },
    ),
    count: vi.fn(async ({ collection, where }: CountArgs) => {
      if (collection !== "community-topics") {
        return {
          totalDocs: rows(collection).filter((doc) => matchesWhere(doc, where))
            .length,
        };
      }
      const slug = (
        (where.and as Where[]).find((w) => "slug" in w) as {
          slug: { equals: string };
        }
      ).slug.equals;
      return { totalDocs: topics.includes(slug) ? 1 : 0 };
    }),
    update: vi.fn(
      async (args: {
        collection: string;
        id?: number;
        where?: Where;
        data: Doc;
      }) => {
        const list = rows(args.collection);
        const docs: Doc[] = [];
        list.forEach((doc, index) => {
          const hit =
            args.id === undefined
              ? matchesWhere(doc, args.where)
              : doc.id === args.id;
          if (!hit) return;
          list[index] = { ...doc, ...args.data };
          docs.push(list[index]);
        });
        return { docs, errors: [] as unknown[] };
      },
    ),
    // The empty-post claim is one SQL statement; it answers with the post
    // it claimed (none: the post changed under it).
    db: {
      drizzle: {
        execute: vi.fn(async (_claim: unknown) => ({
          rows: [{ id: 40 }] as { id: number }[],
        })),
      },
    },
    delete: vi.fn(async (args: { collection: string; where: Where }) => {
      const gone = rows(args.collection).filter((doc) =>
        matchesWhere(doc, args.where),
      );
      store[args.collection] = rows(args.collection).filter(
        (doc) => !gone.includes(doc),
      );
      return { docs: gone, errors: [] as unknown[] };
    }),
  };
  const storage = {
    presignUpload: vi.fn(),
    inspect: vi.fn(),
    signedGetUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
    publicUrl: vi.fn((key: string) => `https://public.test/${key}`),
    list: vi.fn(),
    remove: vi.fn(async () => undefined),
  };
  const storageSource = vi.fn(() => storage);
  const userQuery = vi.fn(async () => USERS);
  const db = {
    select: vi.fn(() => ({ from: () => ({ where: userQuery }) })),
  };
  const log = vi.fn();
  const deps = {
    payload: payload as never,
    db: db as never,
    storage: storageSource as never,
    now: () => NOW,
    log,
  };
  return { deps, payload, storage, storageSource, db, log, store };
}

/**
 * A viewer built by the real access rule, from a community and the user's
 * membership in it (none, or a role).
 */
async function viewerFor(input: {
  userId: string | null;
  role?: string | null;
  listed?: boolean;
}): Promise<GalleryViewer & { community: GalleryCommunity }> {
  const db = {
    query: {
      communities: {
        findFirst: vi.fn(async () => ({
          id: "c1",
          slug: "town",
          isListedInDirectory: input.listed ?? true,
          joinPolicy: "open",
        })),
      },
      communityMemberships: {
        findFirst: vi.fn(async () =>
          input.role ? { role: input.role, status: "active" } : undefined,
        ),
      },
    },
  };
  return loadGalleryViewer(
    { db: db as never },
    { slug: "town", userId: input.userId },
  );
}

const member = (userId = "u2") => viewerFor({ userId, role: "member" });
const moderator = (userId = "u3") => viewerFor({ userId, role: "moderator" });
const outsider = (userId: string | null = "u9", listed = true) =>
  viewerFor({ userId, role: null, listed });

const ids = (items: { id: number }[]) => items.map((i) => i.id);

describe("Review Focus 1: members-only items never reach outsiders", () => {
  const items = () => [
    item(1),
    item(2, { visibility: "public" }),
    item(3, { visibility: "public", hiddenAt: ago(HOUR) }),
  ];

  it.each([
    ["a signed-in non-member", "u9"],
    ["a signed-out visitor", null],
  ])(
    "gives %s only the public items, with direct links and no signed one",
    async (_label, userId) => {
      const { deps, storage } = fakes({ items: items() });
      const viewer = await outsider(userId);

      const page = await listItems(deps, { viewer });

      expect(ids(page.items)).toEqual([2]);
      expect(page.items[0]).toMatchObject({
        visibility: "public",
        url: "https://public.test/media/gallery/public/c1/u2.jpg",
        thumbnailUrl:
          "https://public.test/media/gallery/public/c1/u2-thumb.jpg",
      });
      await expect(getItem(deps, { viewer, itemId: 1 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(storage.signedGetUrl).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a signed-in non-member", "u9"],
    ["a signed-out visitor", null],
  ])(
    "shows %s nothing at all of a members-only community, not even public items",
    async (_label, userId) => {
      const { deps, storage, storageSource } = fakes({ items: items() });
      const viewer = await outsider(userId, false);

      await expect(listItems(deps, { viewer })).resolves.toEqual({
        items: [],
        nextCursor: null,
      });
      await expect(getItem(deps, { viewer, itemId: 2 })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(listFacets(deps, { viewer })).resolves.toEqual({
        events: [],
        topics: [],
        hasUnlinked: false,
      });
      expect(storageSource).not.toHaveBeenCalled();
      expect(storage.signedGetUrl).not.toHaveBeenCalled();
      expect(storage.publicUrl).not.toHaveBeenCalled();
    },
  );

  it("never offers an outsider facets that only members-only items have", async () => {
    const { deps } = fakes({
      items: [
        item(1, { event: 6, topicSlug: "demos" }),
        item(2, { visibility: "public", event: null, topicSlug: null }),
      ],
    });
    await expect(
      listFacets(deps, { viewer: await outsider() }),
    ).resolves.toEqual({ events: [], topics: [], hasUnlinked: true });
  });
});

describe("listItems", () => {
  it("shows members the members-only items through signed links", async () => {
    const { deps, storage } = fakes({
      items: [item(1), item(2, { visibility: "public" })],
    });

    const page = await listItems(deps, { viewer: await member() });

    expect(ids(page.items)).toEqual([2, 1]);
    expect(page.items[1]).toMatchObject({
      visibility: "community",
      url: `https://signed.test/${COMMUNITY_FILE(1)}`,
      thumbnailUrl: "https://signed.test/private/gallery/c1/u1-thumb.jpg",
    });
    expect(storage.signedGetUrl).toHaveBeenCalledTimes(2);
  });

  it("describes an item for the wall, never with its storage keys", async () => {
    const { deps } = fakes({
      items: [
        item(1, {
          mediaType: "video",
          durationSeconds: 42,
          caption: "Demo time",
          alt: "A laptop on stage",
          magazineConsent: true,
        }),
      ],
    });
    const viewer = await member("u1");

    const [view] = (await listItems(deps, { viewer })).items;

    expect(view).toEqual({
      id: 1,
      mediaType: "video",
      url: `https://signed.test/${COMMUNITY_FILE(1)}`,
      thumbnailUrl: "https://signed.test/private/gallery/c1/u1-thumb.jpg",
      width: 2048,
      height: 1536,
      durationSeconds: 42,
      caption: "Demo time",
      alt: "A laptop on stage",
      event: { id: 5, title: "Event 5", slug: "event-5" },
      topicSlug: "talks",
      visibility: "community",
      magazineConsent: true,
      uploader: { id: "u1", name: "Dana", image: "https://img.test/dana.png" },
      createdAt: ago(HOUR),
      isOwn: true,
      batchId: 3,
      hidden: false,
    });
  });

  it("tells the uploader and moderators that an item is hidden", async () => {
    const hidden = { hiddenAt: ago(HOUR), uploaderId: "u1" };
    const { deps } = fakes({ items: [item(1, hidden), item(2)] });

    for (const viewer of [await member("u1"), await moderator()]) {
      const page = await listItems(deps, { viewer });
      expect(
        page.items.map((view) => [view.id, view.hidden]),
        String(viewer.userId),
      ).toEqual([
        [2, false],
        [1, true],
      ]);
      await expect(getItem(deps, { viewer, itemId: 1 })).resolves.toMatchObject(
        { hidden: true },
      );
    }
  });

  it("shows a hidden item only to its uploader and to moderators", async () => {
    const hidden = { hiddenAt: ago(HOUR), uploaderId: "u1" };
    const { deps } = fakes({ items: [item(1, hidden), item(2)] });

    expect(
      ids((await listItems(deps, { viewer: await member() })).items),
    ).toEqual([2]);
    expect(
      ids((await listItems(deps, { viewer: await member("u1") })).items),
    ).toEqual([2, 1]);
    expect(
      ids((await listItems(deps, { viewer: await moderator() })).items),
    ).toEqual([2, 1]);
  });

  it("lists only ready items of this community", async () => {
    const { deps } = fakes({
      items: [
        item(1, { status: "uploading" }),
        item(2, { status: "failed" }),
        item(3, { communityId: "c2", visibility: "public" }),
        item(4),
      ],
    });
    expect(
      ids((await listItems(deps, { viewer: await moderator() })).items),
    ).toEqual([4]);
  });

  it("filters by event, by no event, by category and by type", async () => {
    const { deps } = fakes({
      items: [
        item(1, { event: 5, topicSlug: "talks" }),
        item(2, { event: 6, topicSlug: "demos", mediaType: "video" }),
        item(3, { event: null, topicSlug: "talks" }),
      ],
    });
    const viewer = await member();
    const list = async (filters: object) =>
      ids((await listItems(deps, { viewer, ...filters })).items);

    expect(await list({ eventId: 5 })).toEqual([1]);
    expect(await list({ eventId: "none" })).toEqual([3]);
    expect(await list({ topicSlug: "talks" })).toEqual([3, 1]);
    expect(await list({ mediaType: "video" })).toEqual([2]);
    expect(await list({ eventId: 6, mediaType: "photo" })).toEqual([]);
  });

  it(`pages newest first, ${GALLERY_PAGE_SIZE} at a time`, async () => {
    const { deps } = fakes({
      items: Array.from({ length: 45 }, (_, i) => item(i + 1)),
    });
    const viewer = await member();

    const first = await listItems(deps, { viewer });
    expect(first.items).toHaveLength(GALLERY_PAGE_SIZE);
    expect(first.items[0]!.id).toBe(45);
    expect(first.nextCursor).toBe(6);

    const rest = await listItems(deps, { viewer, cursor: first.nextCursor! });
    expect(ids(rest.items)).toEqual([5, 4, 3, 2, 1]);
    expect(rest.nextCursor).toBeNull();
  });

  it("answers a full last page without a next cursor", async () => {
    const { deps } = fakes({
      items: Array.from({ length: 6 }, (_, i) => item(i + 1)),
    });
    const page = await listItems(deps, { viewer: await member(), limit: 6 });
    expect(page.items).toHaveLength(6);
    expect(page.nextCursor).toBeNull();
  });

  it("loads uploaders in one query and events in one read for a whole page", async () => {
    const { deps, db, payload } = fakes({
      items: Array.from({ length: 40 }, (_, i) =>
        item(i + 1, {
          uploaderId: USERS[i % 3]!.id,
          event: i % 2 ? 5 : 6,
        }),
      ),
    });

    const page = await listItems(deps, { viewer: await member() });

    expect(page.items).toHaveLength(40);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(
      payload.find.mock.calls.filter(([a]) => a.collection === "events"),
    ).toHaveLength(1);
    expect(page.items.find((i) => i.uploader?.id === "u2")?.uploader).toEqual({
      id: "u2",
      name: "Ruben",
      image: null,
    });
  });

  it("shows no one for an item whose uploader deleted their account", async () => {
    const { deps, db } = fakes({
      items: [item(1, { uploaderId: DELETED_AUTHOR_ID })],
    });
    const [view] = (await listItems(deps, { viewer: await member() })).items;
    // No name and no photo: the UI says "Deleted member".
    expect(view!.uploader).toBeNull();
    expect(view!.isOwn).toBe(false);
    // Nobody to look up.
    expect(db.select).not.toHaveBeenCalled();
  });

  it("shows no one for an uploader whose account record is gone", async () => {
    const { deps } = fakes({ items: [item(1, { uploaderId: "gone" })] });
    const [view] = (await listItems(deps, { viewer: await member() })).items;
    expect(view!.uploader).toBeNull();
  });

  it("looks up only the uploaders who still have an account", async () => {
    const { deps, db } = fakes({
      items: [item(1), item(2, { uploaderId: DELETED_AUTHOR_ID })],
    });
    const { items } = await listItems(deps, { viewer: await member() });
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(items.map((view) => view.uploader?.name ?? null)).toEqual([
      null,
      "Dana",
    ]);
  });

  it("does not reach storage or look up anyone for an empty page", async () => {
    const { deps, db, storageSource } = fakes();
    await expect(listItems(deps, { viewer: await member() })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(storageSource).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("listItems for one batch", () => {
  it("keeps only the batch's readable items, newest first, paging like the wall", async () => {
    const { deps } = fakes({
      items: [
        item(1),
        item(2, { batch: 4 }),
        item(3),
        item(4, { hiddenAt: ago(HOUR) }),
        item(5, { status: "uploading" }),
      ],
    });
    const viewer = await member();

    const first = await listItems(deps, { viewer, batchId: 3, limit: 1 });
    expect(ids(first.items)).toEqual([3]);
    const rest = await listItems(deps, {
      viewer,
      batchId: 3,
      cursor: first.nextCursor!,
    });
    expect(ids(rest.items)).toEqual([1]);
    expect(rest.nextCursor).toBeNull();
  });
});

describe("countItems", () => {
  const items = () => [
    item(1),
    item(2, { visibility: "public" }),
    item(3, { visibility: "public", hiddenAt: ago(HOUR), uploaderId: "u5" }),
    item(4, { hiddenAt: ago(HOUR), uploaderId: "u2" }),
    item(5, { status: "uploading" }),
    item(6, { communityId: "c2", visibility: "public" }),
  ];

  it("counts only the items this viewer may read", async () => {
    const { deps } = fakes({ items: items() });
    const count = async (viewer: GalleryViewer) => countItems(deps, { viewer });

    expect(await count(await outsider())).toBe(1);
    expect(await count(await outsider(null))).toBe(1);
    expect(await count(await outsider("u9", false))).toBe(0);
    // Their own hidden item counts for its uploader, not someone else's.
    expect(await count(await member("u2"))).toBe(3);
    expect(await count(await member("u1"))).toBe(2);
    expect(await count(await moderator())).toBe(4);
  });

  it("narrows the count to an event, a batch, or both", async () => {
    const { deps } = fakes({
      items: [
        item(1, { event: 5, batch: 3 }),
        item(2, { event: 6, batch: 3 }),
        item(3, { event: 5, batch: 4 }),
        item(4, { event: 5, batch: 3, hiddenAt: ago(HOUR) }),
      ],
    });
    const viewer = await member();
    const count = (filters: object) => countItems(deps, { viewer, ...filters });

    expect(await count({ eventId: 5 })).toBe(2);
    expect(await count({ batchId: 3 })).toBe(2);
    expect(await count({ eventId: 5, batchId: 3 })).toBe(1);
  });
});

describe("previewBatches", () => {
  it("gives each batch its newest readable items and how many it has", async () => {
    const { deps } = fakes({
      items: [
        item(1),
        item(2),
        item(3),
        item(4),
        item(5, { hiddenAt: ago(HOUR) }),
        item(6, { batch: 4, visibility: "public" }),
        item(7, { batch: 4 }),
        item(8, { batch: 9, hiddenAt: ago(HOUR) }),
        item(10, { batch: 11 }),
      ],
    });

    const previews = await previewBatches(deps, {
      viewer: await member(),
      batchIds: [3, 4, 9],
      perBatch: 3,
    });

    expect([...previews.keys()].sort()).toEqual([3, 4]);
    expect(ids(previews.get(3)!.items)).toEqual([4, 3, 2]);
    expect(previews.get(3)!.total).toBe(4);
    expect(ids(previews.get(4)!.items)).toEqual([7, 6]);
    expect(previews.get(4)!.total).toBe(2);
    expect(previews.get(3)!.items[0]).toMatchObject({
      batchId: 3,
      url: "https://signed.test/private/gallery/c1/u4.jpg",
    });
  });

  it("shows an outsider only a batch's public items, and counts only those", async () => {
    const { deps, storage } = fakes({
      items: [
        item(1, { visibility: "public" }),
        item(2),
        item(3, { visibility: "public", hiddenAt: ago(HOUR) }),
      ],
    });

    const previews = await previewBatches(deps, {
      viewer: await outsider(),
      batchIds: [3],
      perBatch: 3,
    });

    expect(ids(previews.get(3)!.items)).toEqual([1]);
    expect(previews.get(3)!.total).toBe(1);
    expect(storage.signedGetUrl).not.toHaveBeenCalled();
  });

  it("leaves an item hidden between the two reads out of the items and the total", async () => {
    const { deps, payload, store } = fakes({
      items: [item(1), item(2), item(3), item(4)],
    });
    const find = payload.find.getMockImplementation()!;
    payload.find.mockImplementationOnce(async (args) => {
      const scanned = await find(args);
      store["gallery-items"]!.find((doc) => doc.id === 4)!.hiddenAt = ago(HOUR);
      return scanned;
    });

    const previews = await previewBatches(deps, {
      viewer: await member(),
      batchIds: [3],
      perBatch: 3,
    });

    expect(ids(previews.get(3)!.items)).toEqual([3, 2]);
    expect(previews.get(3)!.total).toBe(3);
  });

  it("reads any number of batches in two queries and looks people and events up once", async () => {
    const { deps, payload, db } = fakes({
      items: Array.from({ length: 40 }, (_, i) =>
        item(i + 1, {
          batch: 100 + (i % 10),
          uploaderId: USERS[i % 3]!.id,
          event: i % 2 ? 5 : 6,
        }),
      ),
    });

    const previews = await previewBatches(deps, {
      viewer: await member(),
      batchIds: Array.from({ length: 10 }, (_, i) => 100 + i),
      perBatch: 3,
    });

    expect(previews.size).toBe(10);
    const finds = (collection: string) =>
      payload.find.mock.calls.filter(([a]) => a.collection === collection);
    expect(finds("gallery-items")).toHaveLength(2);
    expect(finds("events")).toHaveLength(1);
    expect(db.select).toHaveBeenCalledTimes(1);
    // The scan reads ids and batches only; full rows only for what shows.
    expect(finds("gallery-items")[0]![0]).toMatchObject({
      select: { batch: true },
    });
  });

  it("stops after one query, without storage or lookups, when nothing is readable", async () => {
    const { deps, payload, db, storageSource } = fakes({ items: [item(1)] });

    const previews = await previewBatches(deps, {
      viewer: await outsider("u9", false),
      batchIds: [3],
      perBatch: 3,
    });

    expect(previews.size).toBe(0);
    expect(payload.find).toHaveBeenCalledTimes(1);
    expect(db.select).not.toHaveBeenCalled();
    expect(storageSource).not.toHaveBeenCalled();
  });

  it("asks nothing for no batches", async () => {
    const { deps, payload } = fakes({ items: [item(1)] });
    const previews = await previewBatches(deps, {
      viewer: await member(),
      batchIds: [],
      perBatch: 3,
    });
    expect(previews.size).toBe(0);
    expect(payload.find).not.toHaveBeenCalled();
  });
});

describe("galleryReadableWhere", () => {
  it("restricts every viewer to ready items of their community", async () => {
    for (const viewer of [
      await outsider(),
      await member(),
      await moderator(),
    ]) {
      expect(galleryReadableWhere(viewer)).toMatchObject({
        and: expect.arrayContaining([
          { communityId: { equals: "c1" } },
          { status: { equals: "ready" } },
        ]),
      });
    }
  });
});

describe("listFacets", () => {
  it("offers only the events, categories and 'no event' that readable items have", async () => {
    const { deps } = fakes({
      items: [
        item(1, { event: 5, topicSlug: "talks" }),
        item(2, { event: 6, topicSlug: null }),
        item(3, { event: null, topicSlug: "demos" }),
        item(4, { event: 7, topicSlug: "hidden", hiddenAt: ago(HOUR) }),
        item(5, { event: 8, topicSlug: "wip", status: "uploading" }),
      ],
      events: [
        event(5, { date: "2026-10-18T00:00:00.000Z" }),
        event(6, { date: "2026-11-07T00:00:00.000Z" }),
        event(7),
        event(8),
      ],
    });

    await expect(listFacets(deps, { viewer: await member() })).resolves.toEqual(
      {
        events: [
          { id: 6, title: "Event 6", day: "2026-11-07" },
          { id: 5, title: "Event 5", day: "2026-10-18" },
        ],
        topics: ["demos", "talks"],
        hasUnlinked: true,
      },
    );
  });

  it("reports no unlinked items when every item has an event", async () => {
    const { deps } = fakes({ items: [item(1)] });
    await expect(
      listFacets(deps, { viewer: await member() }),
    ).resolves.toMatchObject({ hasUnlinked: false });
  });
});

describe("getItem", () => {
  it("returns a readable item", async () => {
    const { deps } = fakes({ items: [item(1)] });
    await expect(
      getItem(deps, { viewer: await member(), itemId: 1 }),
    ).resolves.toMatchObject({ id: 1, isOwn: false });
  });

  it.each([
    ["unknown", 99],
    ["of another community", 2],
    ["still uploading", 3],
  ])("answers an item that is %s with NOT_FOUND", async (_label, itemId) => {
    const { deps, storage } = fakes({
      items: [item(2, { communityId: "c2" }), item(3, { status: "uploading" })],
    });
    await expect(
      getItem(deps, { viewer: await moderator(), itemId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.signedGetUrl).not.toHaveBeenCalled();
  });
});

describe("uploadChoices", () => {
  it("lists the community's started, published or completed events, newest first", async () => {
    const { deps } = fakes({
      events: [
        event(1, { date: "2026-10-01T00:00:00.000Z", status: "completed" }),
        event(2),
        event(3, { date: "2026-11-01T00:00:00.000Z" }),
        event(4, { startTime: "14:00" }),
        event(5, { date: "2026-12-01T00:00:00.000Z" }),
        event(6, { status: "draft" }),
        event(7, { status: "cancelled" }),
        event(8, { communityId: "c2" }),
        event(9, { communityId: null }),
      ],
    });

    const choices = await uploadChoices(deps, { viewer: await member() });

    expect(choices.events).toEqual([
      { id: 2, title: "Event 2", startsAt: "2026-11-13T10:00:00.000Z" },
      { id: 3, title: "Event 3", startsAt: "2026-11-01T10:00:00.000Z" },
      { id: 1, title: "Event 1", startsAt: "2026-10-01T09:00:00.000Z" },
    ]);
  });

  it("offers Everyone where outsiders can read the community", async () => {
    const { deps } = fakes();
    await expect(
      uploadChoices(deps, { viewer: await member() }),
    ).resolves.toMatchObject({ publicReachesOutsiders: true });
  });

  it("says Everyone reaches no outsider in a members-only community", async () => {
    const { deps } = fakes();
    const viewer = await viewerFor({
      userId: "u2",
      role: "member",
      listed: false,
    });
    await expect(uploadChoices(deps, { viewer })).resolves.toMatchObject({
      publicReachesOutsiders: false,
    });
  });

  it("refuses someone who is not a member with NOT_A_MEMBER", async () => {
    const { deps } = fakes();
    await expect(
      uploadChoices(deps, { viewer: await outsider() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "NOT_A_MEMBER" });
  });
});

describe("updateItem", () => {
  it("lets the uploader change the details and returns the item", async () => {
    const { deps, payload } = fakes({ items: [item(1, { event: null })] });

    const view = await updateItem(deps, {
      viewer: await member("u1"),
      itemId: 1,
      caption: "  Opening talk  ",
      alt: "Dana on stage",
      topicSlug: "demos",
      eventId: 6,
    });

    expect(view).toMatchObject({
      id: 1,
      caption: "Opening talk",
      alt: "Dana on stage",
      topicSlug: "demos",
      event: { id: 6, title: "Event 6", slug: "event-6" },
      isOwn: true,
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "gallery-items",
      where: { id: { equals: 1 } },
      data: {
        caption: "Opening talk",
        alt: "Dana on stage",
        topicSlug: "demos",
        event: 6,
      },
      depth: 0,
    });
  });

  it("clears the caption, category and event when asked", async () => {
    const { deps } = fakes({ items: [item(1, { caption: "Old" })] });
    await expect(
      updateItem(deps, {
        viewer: await member("u1"),
        itemId: 1,
        caption: "   ",
        topicSlug: null,
        eventId: null,
      }),
    ).resolves.toMatchObject({ caption: null, topicSlug: null, event: null });
  });

  it("cuts a caption to its limit", async () => {
    const { deps } = fakes({ items: [item(1)] });
    const view = await updateItem(deps, {
      viewer: await member("u1"),
      itemId: 1,
      caption: "x".repeat(GALLERY_CAPTION_MAX + 20),
    });
    expect(view.caption).toHaveLength(GALLERY_CAPTION_MAX);
  });

  it("stamps the magazine permission when given and clears it when taken back", async () => {
    const { deps, store } = fakes({ items: [item(1)] });
    const viewer = await member("u1");

    await updateItem(deps, { viewer, itemId: 1, magazineConsent: true });
    expect(store["gallery-items"]![0]).toMatchObject({
      magazineConsent: true,
      magazineConsentAt: NOW.toISOString(),
    });

    await updateItem(deps, { viewer, itemId: 1, magazineConsent: false });
    expect(store["gallery-items"]![0]).toMatchObject({
      magazineConsent: false,
      magazineConsentAt: null,
    });
  });

  it("keeps the first permission's time when it is given again", async () => {
    const given = { magazineConsent: true, magazineConsentAt: ago(5 * HOUR) };
    const { deps, store } = fakes({ items: [item(1, given)] });
    await updateItem(deps, {
      viewer: await member("u1"),
      itemId: 1,
      magazineConsent: true,
    });
    expect(store["gallery-items"]![0]).toMatchObject(given);
  });

  it.each([
    ["another member", () => member("u2")],
    ["a moderator", () => moderator()],
    ["the uploader after leaving the community", () => outsider("u1")],
  ])("refuses %s with NOT_ALLOWED", async (_label, who) => {
    const { deps, payload } = fakes({
      items: [item(1, { visibility: "public" })],
    });
    await expect(
      updateItem(deps, { viewer: await who(), itemId: 1, caption: "Mine" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "NOT_ALLOWED" });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("answers an outsider asking for a members-only item with NOT_FOUND", async () => {
    const { deps } = fakes({ items: [item(1)] });
    await expect(
      updateItem(deps, { viewer: await outsider(), itemId: 1, caption: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("answers NOT_FOUND when the item is deleted while being edited", async () => {
    const { deps, payload, storage } = fakes({ items: [item(1)] });
    payload.update.mockResolvedValueOnce({ docs: [], errors: [] });
    await expect(
      updateItem(deps, { viewer: await member("u1"), itemId: 1, caption: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.signedGetUrl).not.toHaveBeenCalled();
  });

  it("fails loudly when the edit could not be saved", async () => {
    const { deps, payload, log } = fakes({ items: [item(1)] });
    payload.update.mockResolvedValueOnce({
      docs: [],
      errors: [{ id: 1, message: "x" }],
    });
    await expect(
      updateItem(deps, { viewer: await member("u1"), itemId: 1, caption: "x" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(log).toHaveBeenCalledWith(
      "[gallery.updateItem] saving an item failed",
      expect.objectContaining({ itemId: 1 }),
    );
  });

  it.each([
    ["of another community", event(8, { communityId: "c2" })],
    ["of the Hub, with no community", event(8, { communityId: null })],
    ["in the future", event(8, { date: "2026-12-01T00:00:00.000Z" })],
    ["still a draft", event(8, { status: "draft" })],
  ])(
    "Review Focus 4: refuses linking an event %s with EVENT_NOT_ALLOWED",
    async (_label, foreign) => {
      const { deps, payload } = fakes({
        items: [item(1)],
        events: [event(5), foreign],
      });
      await expect(
        updateItem(deps, {
          viewer: await member("u1"),
          itemId: 1,
          eventId: 8,
        }),
      ).rejects.toMatchObject({ message: "EVENT_NOT_ALLOWED" });
      expect(payload.update).not.toHaveBeenCalled();
    },
  );

  it("does not re-check the event an item already links to", async () => {
    const { deps } = fakes({
      items: [item(1)],
      events: [event(5, { status: "cancelled" })],
    });
    await expect(
      updateItem(deps, {
        viewer: await member("u1"),
        itemId: 1,
        eventId: 5,
        caption: "Still here",
      }),
    ).resolves.toMatchObject({ caption: "Still here" });
  });

  it("refuses a category the community does not have with TOPIC_NOT_FOUND", async () => {
    const { deps } = fakes({ items: [item(1)] });
    await expect(
      updateItem(deps, {
        viewer: await member("u1"),
        itemId: 1,
        topicSlug: "elsewhere",
      }),
    ).rejects.toMatchObject({ message: "TOPIC_NOT_FOUND" });
  });
});

describe("deleteItem", () => {
  it("lets a moderator delete someone's item, then removes both files", async () => {
    const { deps, storage, store } = fakes({ items: [item(1), item(2)] });

    await deleteItem(deps, { viewer: await moderator(), itemId: 1 });

    expect(ids(store["gallery-items"] as { id: number }[])).toEqual([2]);
    expect(storage.remove).toHaveBeenCalledWith([
      COMMUNITY_FILE(1),
      "private/gallery/c1/u1-thumb.jpg",
    ]);
    // The batch stays: its lifecycle belongs to the cleanup and slice 2.
    expect(store["gallery-batches"]).toHaveLength(1);
  });

  it("lets the uploader delete their own item", async () => {
    const { deps, storage, store } = fakes({ items: [item(1)] });
    await deleteItem(deps, { viewer: await member("u1"), itemId: 1 });
    expect(store["gallery-items"]).toEqual([]);
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a members-only item, after leaving", {}, true],
    ["a hidden item, after leaving", { hiddenAt: ago(HOUR) }, true],
    [
      "an item in a members-only community, after leaving",
      { visibility: "public" },
      false,
    ],
  ])(
    "lets the uploader always delete %s, and removes its files",
    async (_label, over, listed) => {
      const { deps, storage, store } = fakes({
        items: [item(1, over), item(2)],
      });
      await deleteItem(deps, {
        viewer: await outsider("u1", listed),
        itemId: 1,
      });
      expect(ids(store["gallery-items"] as { id: number }[])).toEqual([2]);
      expect(storage.remove).toHaveBeenCalledWith([
        (item(1, over) as { fileKey: string }).fileKey,
        (item(1, over) as { thumbnailKey: string }).thumbnailKey,
      ]);
    },
  );

  it("refuses a signed-out visitor with NOT_ALLOWED", async () => {
    const { deps, storage } = fakes({
      items: [item(1, { visibility: "public" })],
    });
    await expect(
      deleteItem(deps, { viewer: await outsider(null), itemId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "NOT_ALLOWED" });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("fails loudly and keeps the files when the row could not be deleted", async () => {
    const { deps, payload, storage, log } = fakes({ items: [item(1)] });
    payload.delete.mockResolvedValueOnce({
      docs: [],
      errors: [{ id: 1, message: "x" }],
    });
    await expect(
      deleteItem(deps, { viewer: await moderator(), itemId: 1 }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "[gallery.deleteItem] deleting an item failed",
      expect.objectContaining({ itemId: 1 }),
    );
  });

  it("refuses another member with NOT_ALLOWED and keeps everything", async () => {
    const { deps, storage, store } = fakes({ items: [item(1)] });
    await expect(
      deleteItem(deps, { viewer: await member("u2"), itemId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "NOT_ALLOWED" });
    expect(store["gallery-items"]).toHaveLength(1);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("answers an outsider asking for a members-only item with NOT_FOUND", async () => {
    const { deps, storage } = fakes({ items: [item(1)] });
    await expect(
      deleteItem(deps, { viewer: await outsider(), itemId: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("keeps the deletion when removing the files fails, and logs it", async () => {
    const { deps, storage, store, log } = fakes({ items: [item(1)] });
    storage.remove.mockRejectedValueOnce(new Error("S3 down"));

    await expect(
      deleteItem(deps, { viewer: await moderator(), itemId: 1 }),
    ).resolves.toBeUndefined();

    expect(store["gallery-items"]).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      "[gallery.deleteItem] removing an item's objects failed",
      expect.objectContaining({ itemId: 1 }),
    );
  });

  it("leaves the files to the request that won when two deletes race", async () => {
    const { deps, payload, storage } = fakes({ items: [item(1)] });
    // A concurrent delete removed the row between our read and our delete.
    payload.delete.mockResolvedValueOnce({ docs: [], errors: [] });

    await expect(
      deleteItem(deps, { viewer: await moderator(), itemId: 1 }),
    ).resolves.toBeUndefined();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  describe("the batch's feed post", () => {
    const galleryPost = (over: Doc = {}): Doc => ({
      id: 40,
      content: "",
      authorName: "Dana",
      communityId: "c1",
      isDeleted: false,
      galleryBatch: 3,
      updatedAt: ago(HOUR),
      ...over,
    });

    it("removes a post with no words when its last ready item is deleted, and the batch lets go of it", async () => {
      const { deps, store } = fakes({
        items: [item(1), item(2, { status: "failed" })],
        posts: [galleryPost()],
      });
      store["gallery-batches"]![0] = {
        ...store["gallery-batches"]![0],
        feedPostId: 40,
      };

      await deleteItem(deps, { viewer: await member("u1"), itemId: 1 });

      expect(store["feed-posts"]![0]).toMatchObject({
        isDeleted: true,
        content: "",
        authorName: "",
        galleryBatch: null,
      });
      expect(store["gallery-batches"]![0]).toMatchObject({ feedPostId: null });
    });

    it("keeps the post while another item of the batch is ready", async () => {
      const { deps, store } = fakes({
        items: [item(1), item(2)],
        posts: [galleryPost()],
      });
      await deleteItem(deps, { viewer: await member("u1"), itemId: 1 });
      expect(store["feed-posts"]![0]).toMatchObject({
        isDeleted: false,
        galleryBatch: 3,
      });
    });

    it("keeps a post that has words, and the post of another batch", async () => {
      const { deps, store } = fakes({
        items: [item(1)],
        posts: [
          galleryPost({ content: "Our picnic" }),
          galleryPost({ id: 41, galleryBatch: 8 }),
        ],
      });
      await deleteItem(deps, { viewer: await moderator(), itemId: 1 });
      expect(store["feed-posts"]!.map((p) => p.isDeleted)).toEqual([
        false,
        false,
      ]);
    });

    it("keeps the item's deletion when the post could not be removed, and logs it", async () => {
      const { deps, payload, store, log } = fakes({
        items: [item(1)],
        posts: [galleryPost()],
      });
      payload.update.mockRejectedValueOnce(new Error("db down"));

      await expect(
        deleteItem(deps, { viewer: await moderator(), itemId: 1 }),
      ).resolves.toBeUndefined();

      expect(store["gallery-items"]).toEqual([]);
      expect(log).toHaveBeenCalledWith(
        "[gallery.deleteItem] removing the batch's empty feed post failed",
        expect.objectContaining({ itemId: 1, batchId: 3 }),
      );
    });

    it("leaves the post alone when the delete lost a race", async () => {
      const { deps, payload } = fakes({
        items: [item(1)],
        posts: [galleryPost()],
      });
      payload.delete.mockResolvedValueOnce({ docs: [], errors: [] });
      await deleteItem(deps, { viewer: await moderator(), itemId: 1 });
      expect(payload.update).not.toHaveBeenCalled();
    });
  });

  it("answers a second delete of the same item with NOT_FOUND", async () => {
    const { deps, storage } = fakes({ items: [item(1)] });
    const viewer = await moderator();
    await deleteItem(deps, { viewer, itemId: 1 });
    await expect(deleteItem(deps, { viewer, itemId: 1 })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });
});
