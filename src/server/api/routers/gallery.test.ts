import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { db as Database } from "@/server/db";

const services = vi.hoisted(() => ({
  startBatch: vi.fn(),
  startItem: vi.fn(),
  finishItem: vi.fn(),
  discardItem: vi.fn(),
  finishBatch: vi.fn(),
  listItems: vi.fn(),
  listFacets: vi.fn(),
  getItem: vi.fn(),
  uploadChoices: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  loadGalleryViewer: vi.fn(),
  getPayloadClient: vi.fn(),
  getObjectStorage: vi.fn(),
  galleryAnnouncer: vi.fn(),
  reportItem: vi.fn(),
  listItemReports: vi.fn(),
  reviewItemReports: vi.fn(),
  galleryReportNotices: vi.fn(),
}));

// The real tRPC setup pulls in auth and server env; a minimal stand-in with
// the same public/protected split is enough for a thin router.
vi.mock("@/server/api/trpc", async () => {
  const { initTRPC, TRPCError } = await import("@trpc/server");
  const t = initTRPC
    .context<{
      db: typeof Database;
      session: { user: { id: string } } | null;
    }>()
    .create();
  return {
    createTRPCRouter: t.router,
    publicProcedure: t.procedure,
    protectedProcedure: t.procedure.use(({ ctx, next }) => {
      if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return next({ ctx: { session: ctx.session } });
    }),
  };
});
vi.mock("@/server/gallery/uploads", () => ({
  startBatch: services.startBatch,
  startItem: services.startItem,
  finishItem: services.finishItem,
  discardItem: services.discardItem,
  finishBatch: services.finishBatch,
}));
vi.mock("@/server/gallery/items", () => ({
  listItems: services.listItems,
  listFacets: services.listFacets,
  getItem: services.getItem,
  uploadChoices: services.uploadChoices,
  updateItem: services.updateItem,
  deleteItem: services.deleteItem,
}));
vi.mock("@/server/gallery/access", () => ({
  loadGalleryViewer: services.loadGalleryViewer,
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: services.getPayloadClient,
}));
vi.mock("@/server/media/object-storage", () => ({
  getObjectStorage: services.getObjectStorage,
}));
vi.mock("@/server/gallery/announce", () => ({
  galleryAnnouncer: services.galleryAnnouncer,
}));
vi.mock("@/server/gallery/reports", () => ({
  reportItem: services.reportItem,
  listItemReports: services.listItemReports,
  reviewItemReports: services.reviewItemReports,
}));
vi.mock("@/server/gallery/notifications", () => ({
  galleryReportNotices: services.galleryReportNotices,
}));

import { galleryRouter } from "./gallery";

const DB = { tag: "db" } as unknown as typeof Database;
const PAYLOAD = { tag: "payload" };

function caller(userId: string | null = "user-1") {
  return galleryRouter.createCaller({
    db: DB,
    session: userId ? { user: { id: userId } } : null,
  } as never);
}

function viewerFor(userId: string | null, isMember = true) {
  return {
    userId,
    communityId: "community-A",
    isMember,
    isModerator: false,
    canSeePublic: true,
    community: { id: "community-A", slug: "alpha" },
  };
}

const START_BATCH = {
  slug: "alpha",
  visibility: "community" as const,
  magazineConsent: false,
  plannedFiles: 3,
  plannedVideos: 1,
};
const START_ITEM = {
  batchId: 7,
  mediaType: "photo" as const,
  contentType: "image/jpeg",
  bytes: 1000,
  thumbnailBytes: 100,
  width: 2048,
  height: 1536,
};

/** When a report was made, as the reports list shows it. */
const CREATED_AT = "2026-11-13T12:00:00.000Z";

/** One valid call per procedure, for the flag-off sweep. */
const EVERY_PROCEDURE = {
  list: (c: ReturnType<typeof caller>) => c.list({ slug: "alpha" }),
  facets: (c: ReturnType<typeof caller>) => c.facets({ slug: "alpha" }),
  item: (c: ReturnType<typeof caller>) => c.item({ slug: "alpha", itemId: 1 }),
  uploadChoices: (c: ReturnType<typeof caller>) =>
    c.uploadChoices({ slug: "alpha" }),
  startBatch: (c: ReturnType<typeof caller>) => c.startBatch(START_BATCH),
  startItem: (c: ReturnType<typeof caller>) => c.startItem(START_ITEM),
  finishItem: (c: ReturnType<typeof caller>) => c.finishItem({ itemId: 1 }),
  discardItem: (c: ReturnType<typeof caller>) => c.discardItem({ itemId: 1 }),
  finishBatch: (c: ReturnType<typeof caller>) => c.finishBatch({ batchId: 7 }),
  updateItem: (c: ReturnType<typeof caller>) =>
    c.updateItem({ slug: "alpha", itemId: 1, caption: "Hi" }),
  deleteItem: (c: ReturnType<typeof caller>) =>
    c.deleteItem({ slug: "alpha", itemId: 1 }),
  reportItem: (c: ReturnType<typeof caller>) =>
    c.reportItem({ slug: "alpha", itemId: 1, reason: "spam" }),
  itemReports: (c: ReturnType<typeof caller>) =>
    c.itemReports({ slug: "alpha", itemId: 1 }),
  reviewItemReports: (c: ReturnType<typeof caller>) =>
    c.reviewItemReports({
      slug: "alpha",
      itemId: 1,
      action: "restore",
      reviewedReportIds: [3],
    }),
} as const;

const PUBLIC_PROCEDURES = ["list", "facets", "item"] as const;

function expectNothingTouched() {
  for (const fn of Object.values(services)) expect(fn).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "true");
  services.getPayloadClient.mockResolvedValue(PAYLOAD);
  services.loadGalleryViewer.mockImplementation(
    async (_deps: unknown, input: { userId: string | null }) =>
      viewerFor(input.userId),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("gallery router — flag off", () => {
  it.each(Object.keys(EVERY_PROCEDURE) as (keyof typeof EVERY_PROCEDURE)[])(
    "%s refuses GALLERY_DISABLED before touching anything",
    async (name) => {
      vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "false");
      await expect(EVERY_PROCEDURE[name](caller())).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "GALLERY_DISABLED",
      });
      expectNothingTouched();
    },
  );

  it.each(PUBLIC_PROCEDURES)(
    "%s refuses a signed-out visitor GALLERY_DISABLED too",
    async (name) => {
      vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "");
      await expect(EVERY_PROCEDURE[name](caller(null))).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "GALLERY_DISABLED",
      });
      expectNothingTouched();
    },
  );

  it("refuses before validating input, so a bad call says nothing more", async () => {
    vi.stubEnv("COMMUNITY_GALLERY_ENABLED", "false");
    await expect(
      caller().startBatch({ ...START_BATCH, plannedFiles: 31 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "GALLERY_DISABLED" });
    expectNothingTouched();
  });
});

describe("gallery router — input validation", () => {
  it("rejects plannedFiles: 31 before the service runs", async () => {
    await expect(
      caller().startBatch({ ...START_BATCH, plannedFiles: 31 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNothingTouched();
  });

  const invalidCalls: [string, (c: ReturnType<typeof caller>) => unknown][] = [
    [
      "plannedFiles 0",
      (c) => c.startBatch({ ...START_BATCH, plannedFiles: 0 }),
    ],
    [
      "plannedFiles 2.5",
      (c) => c.startBatch({ ...START_BATCH, plannedFiles: 2.5 }),
    ],
    [
      "plannedVideos 11",
      (c) =>
        c.startBatch({ ...START_BATCH, plannedFiles: 30, plannedVideos: 11 }),
    ],
    [
      "plannedVideos -1",
      (c) => c.startBatch({ ...START_BATCH, plannedVideos: -1 }),
    ],
    [
      "a batch text over 500",
      (c) => c.startBatch({ ...START_BATCH, caption: "x".repeat(501) }),
    ],
    [
      "an unknown visibility",
      (c) =>
        c.startBatch({ ...START_BATCH, visibility: "everyone" as "public" }),
    ],
    ["eventId 0", (c) => c.startBatch({ ...START_BATCH, eventId: 0 })],
    ["bytes 1.5", (c) => c.startItem({ ...START_ITEM, bytes: 1.5 })],
    ["bytes 0", (c) => c.startItem({ ...START_ITEM, bytes: 0 })],
    [
      "thumbnailBytes -1",
      (c) => c.startItem({ ...START_ITEM, thumbnailBytes: -1 }),
    ],
    ["width 0", (c) => c.startItem({ ...START_ITEM, width: 0 })],
    ["height 10.5", (c) => c.startItem({ ...START_ITEM, height: 10.5 })],
    [
      "durationSeconds 0",
      (c) =>
        c.startItem({
          ...START_ITEM,
          mediaType: "video",
          contentType: "video/mp4",
          durationSeconds: 0,
        }),
    ],
    [
      "an unknown mediaType",
      (c) => c.startItem({ ...START_ITEM, mediaType: "audio" as "photo" }),
    ],
    ["itemId 0", (c) => c.finishItem({ itemId: 0 })],
    ["itemId 1.5", (c) => c.discardItem({ itemId: 1.5 })],
    ["batchId -3", (c) => c.finishBatch({ batchId: -3 })],
    ["limit 41", (c) => c.list({ slug: "alpha", limit: 41 })],
    ["limit 0", (c) => c.list({ slug: "alpha", limit: 0 })],
    ["cursor 0", (c) => c.list({ slug: "alpha", cursor: 0 })],
    ["batchId 0", (c) => c.list({ slug: "alpha", batchId: 0 })],
    ["batchId 2.5", (c) => c.list({ slug: "alpha", batchId: 2.5 })],
    [
      "an event filter that is neither an id nor none",
      (c) => c.list({ slug: "alpha", eventId: "all" as "none" }),
    ],
    [
      "a caption over 280",
      (c) =>
        c.updateItem({ slug: "alpha", itemId: 1, caption: "x".repeat(281) }),
    ],
    [
      "alt text over 500",
      (c) => c.updateItem({ slug: "alpha", itemId: 1, alt: "x".repeat(501) }),
    ],
    ["an empty slug", (c) => c.list({ slug: "" })],
    [
      "a content type over 255 characters",
      (c) => c.startItem({ ...START_ITEM, contentType: "x".repeat(256) }),
    ],
    [
      "a topic over 100 characters",
      (c) => c.startBatch({ ...START_BATCH, topicSlug: "x".repeat(101) }),
    ],
    [
      "a topic filter over 100 characters",
      (c) => c.list({ slug: "alpha", topicSlug: "x".repeat(101) }),
    ],
    [
      "durationSeconds Infinity",
      (c) =>
        c.startItem({
          ...START_ITEM,
          mediaType: "video",
          contentType: "video/mp4",
          durationSeconds: Infinity,
        }),
    ],
    [
      "an unknown report reason",
      (c) =>
        c.reportItem({
          slug: "alpha",
          itemId: 1,
          reason: "rude" as "spam",
        }),
    ],
    [
      "a report note over 500",
      (c) =>
        c.reportItem({
          slug: "alpha",
          itemId: 1,
          reason: "this_is_me",
          note: "x".repeat(501),
        }),
    ],
    [
      "a report on itemId 0",
      (c) => c.reportItem({ slug: "alpha", itemId: 0, reason: "spam" }),
    ],
    [
      "an unknown review action",
      (c) =>
        c.reviewItemReports({
          slug: "alpha",
          itemId: 1,
          action: "delete" as "remove",
        }),
    ],
    [
      "a restore that names no reports",
      (c) =>
        c.reviewItemReports({
          slug: "alpha",
          itemId: 1,
          action: "restore",
        } as never),
    ],
    [
      "a restore that names report id 0",
      (c) =>
        c.reviewItemReports({
          slug: "alpha",
          itemId: 1,
          action: "restore",
          reviewedReportIds: [3, 0],
        }),
    ],
    [
      "a restore that names report id 1.5",
      (c) =>
        c.reviewItemReports({
          slug: "alpha",
          itemId: 1,
          action: "restore",
          reviewedReportIds: [1.5],
        }),
    ],
    [
      "a restore that names over 100 reports",
      (c) =>
        c.reviewItemReports({
          slug: "alpha",
          itemId: 1,
          action: "restore",
          reviewedReportIds: Array.from({ length: 101 }, (_, n) => n + 1),
        }),
    ],
    [
      "item reports for itemId 1.5",
      (c) => c.itemReports({ slug: "alpha", itemId: 1.5 }),
    ],
    [
      "durationSeconds NaN",
      (c) =>
        c.startItem({
          ...START_ITEM,
          mediaType: "video",
          contentType: "video/mp4",
          durationSeconds: NaN,
        }),
    ],
  ];

  it.each(invalidCalls)(
    "rejects %s before the service runs",
    async (_, call) => {
      await expect(call(caller())).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expectNothingTouched();
    },
  );
});

describe("gallery router — public reads", () => {
  it("lets a signed-out visitor list, as viewer userId null", async () => {
    const page = { items: [], nextCursor: null };
    services.listItems.mockResolvedValue(page);

    const result = await caller(null).list({
      slug: "alpha",
      eventId: "none",
      topicSlug: "workshops",
      mediaType: "photo",
      cursor: 99,
      limit: 20,
    });

    expect(result).toBe(page);
    expect(services.loadGalleryViewer).toHaveBeenCalledWith(
      expect.objectContaining({ db: DB }),
      { slug: "alpha", userId: null },
    );
    expect(services.listItems).toHaveBeenCalledWith(
      expect.objectContaining({ db: DB, payload: PAYLOAD }),
      {
        viewer: viewerFor(null),
        eventId: "none",
        topicSlug: "workshops",
        mediaType: "photo",
        cursor: 99,
        limit: 20,
      },
    );
  });

  it("hands storage over lazily: reading never opens it in the router", async () => {
    services.listItems.mockResolvedValue({ items: [], nextCursor: null });
    await caller(null).list({ slug: "alpha" });
    const [deps] = services.listItems.mock.calls[0]!;
    expect(deps.storage).toBe(services.getObjectStorage);
    expect(services.getObjectStorage).not.toHaveBeenCalled();
  });

  it("filters the list by an event id", async () => {
    services.listItems.mockResolvedValue({ items: [], nextCursor: null });
    await caller().list({ slug: "alpha", eventId: 12 });
    expect(services.listItems).toHaveBeenCalledWith(expect.anything(), {
      viewer: viewerFor("user-1"),
      eventId: 12,
    });
  });

  it("lists one batch's items, for a feed post's lightbox", async () => {
    services.listItems.mockResolvedValue({ items: [], nextCursor: null });
    await caller().list({ slug: "alpha", batchId: 7, cursor: 40 });
    expect(services.listItems).toHaveBeenCalledWith(expect.anything(), {
      viewer: viewerFor("user-1"),
      batchId: 7,
      cursor: 40,
    });
  });

  it("passes the signed-in viewer to facets and item", async () => {
    services.listFacets.mockResolvedValue({
      events: [],
      topics: [],
      hasUnlinked: false,
    });
    services.getItem.mockResolvedValue({ id: 5 });

    await caller().facets({ slug: "alpha" });
    await caller(null).item({ slug: "alpha", itemId: 5 });

    expect(services.listFacets).toHaveBeenCalledWith(expect.anything(), {
      viewer: viewerFor("user-1"),
    });
    expect(services.getItem).toHaveBeenCalledWith(expect.anything(), {
      viewer: viewerFor(null),
      itemId: 5,
    });
  });
});

describe("gallery router — signed-in work", () => {
  it.each(
    Object.keys(EVERY_PROCEDURE).filter(
      (name) => !(PUBLIC_PROCEDURES as readonly string[]).includes(name),
    ) as (keyof typeof EVERY_PROCEDURE)[],
  )("%s refuses a signed-out visitor", async (name) => {
    await expect(EVERY_PROCEDURE[name](caller(null))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expectNothingTouched();
  });

  it("starts a batch as the caller", async () => {
    services.startBatch.mockResolvedValue({ batchId: 7 });
    const input = {
      ...START_BATCH,
      eventId: 4,
      topicSlug: "workshops",
      caption: "Saturday meetup",
    };
    await expect(caller().startBatch(input)).resolves.toEqual({ batchId: 7 });
    expect(services.startBatch).toHaveBeenCalledWith(
      expect.objectContaining({ db: DB, payload: PAYLOAD }),
      { userId: "user-1", ...input },
    );
  });

  it("starts, finishes and discards items as the caller", async () => {
    const video = {
      ...START_ITEM,
      mediaType: "video" as const,
      contentType: "video/mp4",
      durationSeconds: 12.4,
    };
    await caller().startItem(video);
    await caller().finishItem({ itemId: 3 });
    await caller().discardItem({ itemId: 4 });
    expect(services.startItem).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      ...video,
    });
    expect(services.finishItem).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      itemId: 3,
    });
    expect(services.discardItem).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      itemId: 4,
    });
  });

  it("finishes a batch with the feed announcement", async () => {
    const announce = vi.fn();
    services.galleryAnnouncer.mockReturnValue(announce);
    services.finishBatch.mockResolvedValue({ readyCount: 2, feedPostId: 91 });
    await expect(caller().finishBatch({ batchId: 7 })).resolves.toEqual({
      readyCount: 2,
      feedPostId: 91,
    });
    expect(services.galleryAnnouncer).toHaveBeenCalledWith({
      payload: PAYLOAD,
      db: DB,
    });
    expect(services.finishBatch).toHaveBeenCalledWith(
      expect.anything(),
      { userId: "user-1", batchId: 7 },
      announce,
    );
  });

  it("gives the upload choices for the caller's viewer", async () => {
    services.uploadChoices.mockResolvedValue({
      events: [],
      publicReachesOutsiders: true,
    });
    await caller().uploadChoices({ slug: "alpha" });
    expect(services.loadGalleryViewer).toHaveBeenCalledWith(expect.anything(), {
      slug: "alpha",
      userId: "user-1",
    });
    expect(services.uploadChoices).toHaveBeenCalledWith(expect.anything(), {
      viewer: viewerFor("user-1"),
    });
  });

  it("updates an item, passing cleared fields as null", async () => {
    services.updateItem.mockResolvedValue({ id: 5 });
    await caller().updateItem({
      slug: "alpha",
      itemId: 5,
      caption: "",
      alt: "Two people at a whiteboard",
      topicSlug: null,
      eventId: null,
      magazineConsent: true,
    });
    expect(services.updateItem).toHaveBeenCalledWith(expect.anything(), {
      viewer: viewerFor("user-1"),
      itemId: 5,
      caption: "",
      alt: "Two people at a whiteboard",
      topicSlug: null,
      eventId: null,
      magazineConsent: true,
    });
  });

  it("lets an uploader who left the community still delete their item", async () => {
    const formerMember = viewerFor("user-1", false);
    services.loadGalleryViewer.mockResolvedValue(formerMember);
    services.deleteItem.mockResolvedValue(undefined);

    await expect(
      caller().deleteItem({ slug: "alpha", itemId: 5 }),
    ).resolves.toBeUndefined();

    expect(services.loadGalleryViewer).toHaveBeenCalledWith(expect.anything(), {
      slug: "alpha",
      userId: "user-1",
    });
    expect(services.deleteItem).toHaveBeenCalledWith(expect.anything(), {
      viewer: formerMember,
      itemId: 5,
    });
  });
});

describe("gallery router — reports", () => {
  it("reports an item as the caller's viewer, with the report notices", async () => {
    const notices = { itemReported: vi.fn(), uploaderThisIsMe: vi.fn() };
    services.galleryReportNotices.mockReturnValue(notices);
    services.reportItem.mockResolvedValue({ hidden: true });

    await expect(
      caller().reportItem({
        slug: "alpha",
        itemId: 5,
        reason: "this_is_me",
        note: "That's me on the left",
      }),
    ).resolves.toEqual({ hidden: true });

    expect(services.loadGalleryViewer).toHaveBeenCalledWith(expect.anything(), {
      slug: "alpha",
      userId: "user-1",
    });
    expect(services.galleryReportNotices).toHaveBeenCalledWith(DB);
    expect(services.reportItem).toHaveBeenCalledWith(
      expect.objectContaining({ db: DB, payload: PAYLOAD, notify: notices }),
      {
        viewer: viewerFor("user-1"),
        itemId: 5,
        reason: "this_is_me",
        note: "That's me on the left",
      },
    );
  });

  it("accepts a report without a note", async () => {
    services.reportItem.mockResolvedValue({ hidden: true });
    await caller().reportItem({ slug: "alpha", itemId: 5, reason: "spam" });
    expect(services.reportItem).toHaveBeenCalledWith(expect.anything(), {
      viewer: viewerFor("user-1"),
      itemId: 5,
      reason: "spam",
    });
  });

  it("lists an item's reports for the caller's viewer", async () => {
    const reports = {
      reports: [{ id: 3, reason: "spam", note: null, createdAt: CREATED_AT }],
    };
    services.listItemReports.mockResolvedValue(reports);
    await expect(
      caller().itemReports({ slug: "alpha", itemId: 5 }),
    ).resolves.toBe(reports);
    expect(services.listItemReports).toHaveBeenCalledWith(
      expect.objectContaining({ db: DB, payload: PAYLOAD }),
      { viewer: viewerFor("user-1"), itemId: 5 },
    );
  });

  it.each([
    ["restore", { action: "restore" as const, reviewedReportIds: [3, 4] }],
    // An item hidden with no open report left (deleted in the admin).
    [
      "restore with no open reports",
      { action: "restore" as const, reviewedReportIds: [] },
    ],
    ["remove", { action: "remove" as const }],
  ])(
    "reviews an item's reports: %s, with the report notices",
    async (_, review) => {
      const notices = { itemReported: vi.fn(), uploaderThisIsMe: vi.fn() };
      services.galleryReportNotices.mockReturnValue(notices);
      services.reviewItemReports.mockResolvedValue(undefined);
      await expect(
        caller().reviewItemReports({ slug: "alpha", itemId: 5, ...review }),
      ).resolves.toBeUndefined();
      expect(services.galleryReportNotices).toHaveBeenCalledWith(DB);
      expect(services.reviewItemReports).toHaveBeenCalledWith(
        expect.objectContaining({ db: DB, payload: PAYLOAD, notify: notices }),
        { viewer: viewerFor("user-1"), itemId: 5, ...review },
      );
    },
  );
});
