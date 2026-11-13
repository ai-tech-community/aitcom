import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GALLERY_CAPTION_MAX, GALLERY_PAGE_SIZE } from "@/lib/gallery-rules";

import {
  loadGalleryViewer,
  type GalleryCommunity,
  type GalleryViewer,
} from "./access";
import {
  deleteItem,
  getItem,
  galleryReadableWhere,
  listFacets,
  listItems,
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

/**
 * Just enough of Payload's `where` to run the gallery's queries in memory,
 * so the tests check which rows a viewer's query really matches rather than
 * the query's shape.
 */
function matches(doc: Doc, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "and") {
      return (condition as Where[]).every((w) => matches(doc, w));
    }
    if (key === "or")
      return (condition as Where[]).some((w) => matches(doc, w));
    const value = doc[key];
    return Object.entries(condition as Record<string, unknown>).every(
      ([op, operand]) => {
        switch (op) {
          case "equals":
            return value === operand;
          case "in":
            return (operand as unknown[]).includes(value);
          case "exists":
            return (value !== null && value !== undefined) === operand;
          case "less_than":
            return (value as number | string) < (operand as number | string);
          case "less_than_equal":
            return (value as number | string) <= (operand as number | string);
          default:
            throw new Error(`fake payload: unsupported operator ${op}`);
        }
      },
    );
  });
}

function sortDocs(docs: Doc[], sort: string | undefined): Doc[] {
  if (!sort) return docs;
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  return [...docs].sort((a, b) => {
    const x = a[field] as number | string;
    const y = b[field] as number | string;
    const order = x < y ? -1 : x > y ? 1 : 0;
    return desc ? -order : order;
  });
}

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
  seed: { items?: Doc[]; events?: Doc[]; topics?: string[] } = {},
) {
  const store: Record<string, Doc[]> = {
    "gallery-items": seed.items ?? [],
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
      }) => {
        const found = sortDocs(
          rows(args.collection).filter((doc) => matches(doc, args.where)),
          args.sort,
        );
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
              .filter((doc) => matches(doc, args.where))
              .map((doc) => doc[args.field] ?? null),
          ),
        ];
        return { values: values.map((value) => ({ [args.field]: value })) };
      },
    ),
    count: vi.fn(async ({ where }: { where: Where }) => {
      const slug = (
        (where.and as Where[]).find((w) => "slug" in w) as {
          slug: { equals: string };
        }
      ).slug.equals;
      return { totalDocs: topics.includes(slug) ? 1 : 0 };
    }),
    update: vi.fn(
      async (args: { collection: string; where: Where; data: Doc }) => {
        const list = rows(args.collection);
        const docs: Doc[] = [];
        list.forEach((doc, index) => {
          if (!matches(doc, args.where)) return;
          list[index] = { ...doc, ...args.data };
          docs.push(list[index]);
        });
        return { docs, errors: [] as unknown[] };
      },
    ),
    delete: vi.fn(async (args: { collection: string; where: Where }) => {
      const gone = rows(args.collection).filter((doc) =>
        matches(doc, args.where),
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
        })),
      },
      communityMemberships: {
        findFirst: vi.fn(async () =>
          input.role ? { role: input.role } : undefined,
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
    });
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
    expect(page.items.find((i) => i.uploader.id === "u2")?.uploader).toEqual({
      id: "u2",
      name: "Ruben",
      image: null,
    });
  });

  it("names an uploader without an account record plainly", async () => {
    const { deps } = fakes({ items: [item(1, { uploaderId: "gone" })] });
    const [view] = (await listItems(deps, { viewer: await member() })).items;
    expect(view!.uploader).toEqual({ id: "gone", name: "Member", image: null });
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
