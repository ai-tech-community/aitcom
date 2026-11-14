import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GALLERY_MAX_OPEN_BATCHES,
  GALLERY_PHOTO_MAX_BYTES,
  GALLERY_THUMB_MAX_BYTES,
} from "@/lib/gallery-rules";
import {
  FINISH_WINDOW_HOURS,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
} from "@/lib/video-rules";

import type * as PaymentsAccess from "@/server/payments/access";

import type * as FeedPostLink from "./feed-post-link";

const payments = vi.hoisted(() => ({
  membershipPaymentAllowed: vi.fn(),
}));
vi.mock("@/server/payments/access", async (importOriginal) => ({
  ...(await importOriginal<typeof PaymentsAccess>()),
  membershipPaymentAllowed: payments.membershipPaymentAllowed,
}));

const transition = vi.hoisted(() => vi.fn());
vi.mock("@/server/payload-status-transition", () => ({
  transitionStatus: transition,
}));

const feedPostLink = vi.hoisted(() => ({
  releaseEmptyGalleryPost: vi.fn(),
}));
vi.mock("./feed-post-link", async (importOriginal) => ({
  ...(await importOriginal<typeof FeedPostLink>()),
  releaseEmptyGalleryPost: feedPostLink.releaseEmptyGalleryPost,
}));

import {
  discardItem,
  finishBatch,
  finishItem,
  startBatch,
  startItem,
} from "./uploads";

beforeEach(() => {
  payments.membershipPaymentAllowed.mockReset().mockResolvedValue(true);
  feedPostLink.releaseEmptyGalleryPost.mockReset().mockResolvedValue(false);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const NOW = new Date("2026-11-13T12:00:00.000Z");
const GB5 = 5 * 1024 ** 3;
const FILE_KEY = `private/gallery/c1/${UPLOAD}.jpg`;
const THUMB_KEY = `private/gallery/c1/${UPLOAD}-thumb.jpg`;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 60 * 60 * 1000;

/** Started at 11:00 Amsterdam (10:00Z) on the day NOW falls in. */
const EVENT = {
  id: 5,
  communityId: "c1",
  status: "published",
  date: "2026-11-13T00:00:00.000Z",
  startTime: "11:00",
  timezone: "Europe/Amsterdam",
};

function batch(over: Record<string, unknown> = {}) {
  return {
    id: 3,
    communityId: "c1",
    uploaderId: "u1",
    event: 5,
    topicSlug: "photos",
    visibility: "community",
    magazineConsent: true,
    magazineConsentAt: ago(HOUR),
    caption: null,
    plannedFiles: 3,
    plannedVideos: 1,
    status: "open",
    feedPostId: null,
    createdAt: ago(HOUR),
    updatedAt: ago(HOUR),
    ...over,
  };
}

function item(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    communityId: "c1",
    event: 5,
    topicSlug: "photos",
    mediaType: "photo",
    status: "uploading",
    failureReason: null,
    storage: "private",
    visibility: "community",
    fileKey: FILE_KEY,
    thumbnailKey: THUMB_KEY,
    width: 2048,
    height: 1536,
    bytes: 1_050_000,
    durationSeconds: null,
    uploaderId: "u1",
    batch: 3,
    uploadId: UPLOAD,
    magazineConsent: true,
    magazineConsentAt: ago(HOUR),
    createdAt: ago(10 * 60 * 1000),
    updatedAt: ago(10 * 60 * 1000),
    ...over,
  };
}

const GOOD_FILE = { contentType: "image/jpeg", bytes: 1_000_000 };
const GOOD_THUMB = { contentType: "image/jpeg", bytes: 50_000 };

type Over = {
  community?: boolean;
  /** Whether the community is listed, so outsiders may read its content. */
  listed?: boolean;
  /** The uploader's batches still open in their finish window, anywhere. */
  openBatches?: number;
  role?: string | null;
  event?: unknown;
  topics?: number;
  /** Gallery items the uploader created in the last 24 h, by media type. */
  today?: { photo?: number; video?: number };
  batch?: unknown;
  item?: unknown;
  /** The batch's uploading and ready items, for its plan. */
  inBatch?: { mediaType: string }[];
  /** The batch's ready items, for finishing it. */
  ready?: unknown[];
  /** Bytes the community already stores in gallery items. */
  usage?: number;
  stored?: { file?: unknown; thumb?: unknown };
  presignFails?: boolean;
  removeFails?: boolean;
  /** A concurrent request changed the record first: the conditional write
   * matches nothing, and a re-read finds the record in this state. */
  lostRace?: unknown;
};

type Where = { and?: Record<string, { equals?: unknown }>[] };

function mediaTypeOf(where: Where): string | undefined {
  return where.and?.find((clause) => "mediaType" in clause)?.mediaType
    ?.equals as string | undefined;
}

function fakes(over: Over = {}) {
  const records: Record<string, unknown> = {
    events: "event" in over ? over.event : EVENT,
    "gallery-batches": "batch" in over ? over.batch : batch(),
    "gallery-items": "item" in over ? over.item : item(),
  };
  const reads: Record<string, number> = {};
  // The compare-and-set: it wins and moves the record, unless a concurrent
  // request is set up to have changed the record first.
  transition
    .mockReset()
    .mockImplementation(
      (
        _payload: unknown,
        t: { collection: string; to: string; set?: object },
      ) => {
        if ("lostRace" in over) return Promise.resolve(false);
        records[t.collection] = {
          ...(records[t.collection] as object),
          status: t.to,
          ...t.set,
        };
        return Promise.resolve(true);
      },
    );
  const payload = {
    findByID: vi.fn(({ collection }: { collection: string }) => {
      reads[collection] = (reads[collection] ?? 0) + 1;
      if (reads[collection] > 1 && "lostRace" in over) {
        return Promise.resolve(over.lostRace ?? null);
      }
      return Promise.resolve(records[collection] ?? null);
    }),
    count: vi.fn(
      ({ collection, where }: { collection: string; where: Where }) => {
        if (collection === "community-topics") {
          return Promise.resolve({ totalDocs: over.topics ?? 1 });
        }
        if (collection === "gallery-batches") {
          return Promise.resolve({ totalDocs: over.openBatches ?? 0 });
        }
        const type = mediaTypeOf(where) as "photo" | "video";
        return Promise.resolve({ totalDocs: over.today?.[type] ?? 0 });
      },
    ),
    find: vi.fn(
      ({
        collection,
        select,
      }: {
        collection: string;
        select?: Record<string, boolean>;
      }) => {
        if (collection !== "gallery-items")
          return Promise.resolve({ docs: [] });
        if (select?.mediaType) {
          return Promise.resolve({ docs: over.inBatch ?? [] });
        }
        return Promise.resolve({ docs: over.ready ?? [] });
      },
    ),
    create: vi.fn(
      ({ collection, data }: { collection: string; data: object }) =>
        Promise.resolve({
          id: collection === "gallery-batches" ? 3 : 7,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
          ...data,
        }),
    ),
    update: vi.fn(
      ({ collection, data }: { collection: string; data: object }) =>
        Promise.resolve({ ...(records[collection] as object), ...data }),
    ),
    // The allowance's usage query: the database sums the stored bytes.
    db: {
      drizzle: {
        execute: vi.fn(async () => ({
          rows: [{ bytes: String(over.usage ?? 0) }],
        })),
      },
    },
  };
  const db = {
    query: {
      communities: {
        findFirst: vi.fn().mockResolvedValue(
          over.community === false
            ? undefined
            : {
                id: "c1",
                slug: "town",
                isListedInDirectory: over.listed ?? false,
              },
        ),
      },
      communityMemberships: {
        findFirst: vi.fn().mockResolvedValue(
          over.role === null
            ? undefined
            : {
                communityId: "c1",
                role: over.role ?? "member",
                status: "active",
              },
        ),
      },
    },
  };
  const stored = {
    file: over.stored && "file" in over.stored ? over.stored.file : GOOD_FILE,
    thumb:
      over.stored && "thumb" in over.stored ? over.stored.thumb : GOOD_THUMB,
  };
  const storage = {
    presignUpload: over.presignFails
      ? vi.fn().mockRejectedValue(new Error("no credentials"))
      : vi.fn(({ key }: { key: string }) =>
          Promise.resolve({ url: "https://s3.test/", fields: { key } }),
        ),
    inspect: vi.fn((key: string) =>
      Promise.resolve(key.endsWith("-thumb.jpg") ? stored.thumb : stored.file),
    ),
    signedGetUrl: vi.fn(),
    publicUrl: vi.fn(),
    list: vi.fn(),
    remove: over.removeFails
      ? vi.fn().mockRejectedValue(new Error("s3 down"))
      : vi.fn().mockResolvedValue(undefined),
  };
  const log = vi.fn();
  return {
    payload,
    db,
    storage,
    log,
    deps: {
      payload: payload as never,
      db: db as never,
      storage: (() => storage) as never,
      now: () => NOW,
      newUploadId: () => UPLOAD,
      log,
    },
  };
}

const BATCH = {
  userId: "u1",
  slug: "town",
  eventId: 5,
  topicSlug: "photos",
  visibility: "community" as const,
  magazineConsent: true,
  caption: "  Summer meetup  ",
  plannedFiles: 3,
  plannedVideos: 1,
};

describe("startBatch", () => {
  it("opens a batch with the dialog's settings and stamps magazine consent", async () => {
    const { deps, payload } = fakes();
    await expect(startBatch(deps, BATCH)).resolves.toEqual({ batchId: 3 });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "gallery-batches",
      data: {
        communityId: "c1",
        uploaderId: "u1",
        event: 5,
        topicSlug: "photos",
        visibility: "community",
        magazineConsent: true,
        magazineConsentAt: NOW.toISOString(),
        caption: "Summer meetup",
        plannedFiles: 3,
        plannedVideos: 1,
        status: "open",
      },
    });
  });

  it("counts today's gallery uploads of each type, whatever their status", async () => {
    const { deps, payload } = fakes();
    await startBatch(deps, BATCH);
    for (const mediaType of ["photo", "video"]) {
      expect(payload.count).toHaveBeenCalledWith({
        collection: "gallery-items",
        where: {
          and: [
            { uploaderId: { equals: "u1" } },
            { mediaType: { equals: mediaType } },
            { createdAt: { greater_than: ago(24 * HOUR) } },
          ],
        },
      });
    }
  });

  it("leaves out consent time, event, topic and an empty caption when none are given", async () => {
    const { deps, payload } = fakes();
    await startBatch(deps, {
      ...BATCH,
      eventId: undefined,
      topicSlug: undefined,
      magazineConsent: false,
      caption: "   ",
    });
    expect(payload.findByID).not.toHaveBeenCalled();
    expect(payload.create).toHaveBeenCalledWith({
      collection: "gallery-batches",
      data: expect.objectContaining({
        event: null,
        topicSlug: null,
        magazineConsent: false,
        magazineConsentAt: null,
        caption: null,
      }),
    });
  });

  it("cuts a caption to the batch text limit", async () => {
    const { deps, payload } = fakes();
    await startBatch(deps, { ...BATCH, caption: "a".repeat(600) });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "gallery-batches",
      data: expect.objectContaining({ caption: "a".repeat(500) }),
    });
  });

  it("refuses someone who is not an active member", async () => {
    const { deps, payload } = fakes({ role: null });
    await expect(startBatch(deps, BATCH)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "NOT_A_MEMBER",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses a member whose paid membership lapsed", async () => {
    payments.membershipPaymentAllowed.mockResolvedValue(false);
    const { deps } = fakes();
    await expect(startBatch(deps, BATCH)).rejects.toMatchObject({
      message: "NOT_A_MEMBER",
    });
  });

  it("answers NOT_FOUND for an unknown community", async () => {
    const { deps } = fakes({ community: false });
    await expect(startBatch(deps, BATCH)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it.each([
    ["another community's", { ...EVENT, communityId: "c2" }],
    ["a Hub", { ...EVENT, communityId: null }],
    ["a future", { ...EVENT, date: "2026-11-20T00:00:00.000Z" }],
    ["a draft", { ...EVENT, status: "draft" }],
  ])("refuses %s event with EVENT_NOT_ALLOWED", async (_label, event) => {
    const { deps, payload } = fakes({ event });
    await expect(startBatch(deps, BATCH)).rejects.toMatchObject({
      message: "EVENT_NOT_ALLOWED",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses a topic the community does not have", async () => {
    const { deps, payload } = fakes({ topics: 0 });
    await expect(startBatch(deps, BATCH)).rejects.toMatchObject({
      message: "TOPIC_NOT_FOUND",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("accepts the largest batch: 30 files, 10 of them videos", async () => {
    const { deps } = fakes();
    await expect(
      startBatch(deps, { ...BATCH, plannedFiles: 30, plannedVideos: 10 }),
    ).resolves.toEqual({ batchId: 3 });
  });

  it.each([
    ["no files", 0, 0],
    ["31 files", 31, 0],
    ["11 videos", 30, 11],
    ["more videos than files", 3, 4],
    ["a negative video count", 3, -1],
    ["a fractional file count", 2.5, 0],
  ])(
    "refuses a batch planning %s with BATCH_TOO_LARGE",
    async (_l, files, videos) => {
      const { deps, payload } = fakes();
      await expect(
        startBatch(deps, {
          ...BATCH,
          plannedFiles: files,
          plannedVideos: videos,
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "BATCH_TOO_LARGE",
      });
      expect(payload.create).not.toHaveBeenCalled();
    },
  );

  it("refuses 11 more photos from someone who uploaded 140 today", async () => {
    const { deps, payload } = fakes({ today: { photo: 140 } });
    await expect(
      startBatch(deps, { ...BATCH, plannedFiles: 11, plannedVideos: 0 }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "UPLOAD_LIMIT",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("accepts 10 more photos from someone who uploaded 140 today", async () => {
    const { deps } = fakes({ today: { photo: 140 } });
    await expect(
      startBatch(deps, { ...BATCH, plannedFiles: 10, plannedVideos: 0 }),
    ).resolves.toEqual({ batchId: 3 });
  });

  it("refuses videos past the daily video limit", async () => {
    const { deps } = fakes({ today: { video: 18 } });
    await expect(
      startBatch(deps, { ...BATCH, plannedFiles: 3, plannedVideos: 3 }),
    ).rejects.toMatchObject({ message: "UPLOAD_LIMIT" });
  });

  it("shares with everyone where outsiders may read the community", async () => {
    const { deps, payload } = fakes({ listed: true });
    await startBatch(deps, { ...BATCH, visibility: "public" });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "gallery-batches",
      data: expect.objectContaining({ visibility: "public" }),
    });
  });

  it("refuses everyone in a members-only community, never quietly keeping it to members", async () => {
    const { deps, payload } = fakes({ listed: false });
    await expect(
      startBatch(deps, { ...BATCH, visibility: "public" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "PUBLIC_NOT_AVAILABLE",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses everyone in a paid community", async () => {
    vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "true");
    const { deps, db, payload } = fakes({ listed: true });
    // A paid entry policy: signed-out visitors may not read it.
    Object.assign(db, {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ paidEntryAt: NOW }] }),
        }),
      }),
    });
    await expect(
      startBatch(deps, { ...BATCH, visibility: "public" }),
    ).rejects.toMatchObject({ message: "PUBLIC_NOT_AVAILABLE" });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("does not ask who outsiders are for a members-only batch", async () => {
    const { deps } = fakes({ listed: false });
    await expect(startBatch(deps, BATCH)).resolves.toEqual({ batchId: 3 });
  });

  it("refuses a fourth open batch, counting the member's open batches in every community", async () => {
    const { deps, payload } = fakes({ openBatches: GALLERY_MAX_OPEN_BATCHES });
    await expect(startBatch(deps, BATCH)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "UPLOAD_LIMIT",
    });
    expect(payload.count).toHaveBeenCalledWith({
      collection: "gallery-batches",
      where: {
        and: [
          { uploaderId: { equals: "u1" } },
          { status: { equals: "open" } },
          { createdAt: { greater_than: ago(FINISH_WINDOW_HOURS * HOUR) } },
        ],
      },
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("accepts a batch while fewer than the most batches are open", async () => {
    const { deps } = fakes({ openBatches: GALLERY_MAX_OPEN_BATCHES - 1 });
    await expect(startBatch(deps, BATCH)).resolves.toEqual({ batchId: 3 });
  });
});

const PHOTO = {
  userId: "u1",
  batchId: 3,
  mediaType: "photo" as const,
  contentType: "image/jpeg",
  bytes: 1_000_000,
  thumbnailBytes: 50_000,
  width: 2048,
  height: 1536,
};
const VIDEO = {
  ...PHOTO,
  mediaType: "video" as const,
  contentType: "video/mp4",
  bytes: 20_000_000,
  width: 1280,
  height: 720,
  durationSeconds: 42,
};

describe("startItem", () => {
  it("grants the file and its thumbnail at their declared sizes before recording the item", async () => {
    const { deps, payload, storage } = fakes();
    await expect(startItem(deps, PHOTO)).resolves.toEqual({
      itemId: 7,
      file: { url: "https://s3.test/", fields: { key: FILE_KEY } },
      thumbnail: { url: "https://s3.test/", fields: { key: THUMB_KEY } },
    });
    expect(storage.presignUpload).toHaveBeenCalledWith({
      key: FILE_KEY,
      contentType: "image/jpeg",
      maxBytes: 1_000_000,
    });
    expect(storage.presignUpload).toHaveBeenCalledWith({
      key: THUMB_KEY,
      contentType: "image/jpeg",
      maxBytes: 50_000,
    });
    const lastPresign = Math.max(
      ...storage.presignUpload.mock.invocationCallOrder,
    );
    expect(payload.create.mock.invocationCallOrder[0]).toBeGreaterThan(
      lastPresign,
    );
    expect(payload.create).toHaveBeenCalledWith({
      collection: "gallery-items",
      data: {
        communityId: "c1",
        event: 5,
        topicSlug: "photos",
        mediaType: "photo",
        status: "uploading",
        storage: "private",
        visibility: "community",
        fileKey: FILE_KEY,
        thumbnailKey: THUMB_KEY,
        width: 2048,
        height: 1536,
        bytes: 1_050_000,
        durationSeconds: null,
        uploaderId: "u1",
        batch: 3,
        uploadId: UPLOAD,
        magazineConsent: true,
        magazineConsentAt: ago(HOUR),
      },
    });
  });

  it("keeps a public batch's files in public storage", async () => {
    const { deps, payload } = fakes({
      batch: batch({ visibility: "public" }),
    });
    await startItem(deps, PHOTO);
    expect(payload.create).toHaveBeenCalledWith({
      collection: "gallery-items",
      data: expect.objectContaining({
        storage: "public",
        visibility: "public",
        fileKey: `media/gallery/public/c1/${UPLOAD}.jpg`,
        thumbnailKey: `media/gallery/public/c1/${UPLOAD}-thumb.jpg`,
      }),
    });
  });

  it("records a video with its duration under an mp4 key", async () => {
    const { deps, payload, storage } = fakes();
    await startItem(deps, VIDEO);
    expect(storage.presignUpload).toHaveBeenCalledWith({
      key: `private/gallery/c1/${UPLOAD}.mp4`,
      contentType: "video/mp4",
      maxBytes: 20_000_000,
    });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "gallery-items",
      data: expect.objectContaining({
        mediaType: "video",
        durationSeconds: 42,
        bytes: 20_050_000,
      }),
    });
  });

  it.each([
    ["is missing", null],
    ["is someone else's", batch({ uploaderId: "u2" })],
    ["is finished", batch({ status: "finished" })],
    [
      "is past the finish window",
      batch({ createdAt: ago(FINISH_WINDOW_HOURS * HOUR + 1) }),
    ],
  ])("refuses a batch that %s with UPLOAD_EXPIRED", async (_label, found) => {
    const { deps, payload, storage } = fakes({ batch: found });
    await expect(startItem(deps, PHOTO)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "UPLOAD_EXPIRED",
    });
    expect(storage.presignUpload).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses an uploader who is no longer a member", async () => {
    const { deps, payload } = fakes({ role: null });
    await expect(startItem(deps, PHOTO)).rejects.toMatchObject({
      message: "NOT_A_MEMBER",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses a batch whose community was deleted with UPLOAD_EXPIRED", async () => {
    const { deps, payload, storage } = fakes({ community: false });
    await expect(startItem(deps, PHOTO)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "UPLOAD_EXPIRED",
    });
    expect(storage.presignUpload).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("counts only the batch's uploading and ready items against its plan", async () => {
    const { deps, payload } = fakes();
    await startItem(deps, PHOTO);
    expect(payload.find).toHaveBeenCalledWith({
      collection: "gallery-items",
      where: {
        and: [
          { batch: { equals: 3 } },
          { status: { in: ["uploading", "ready"] } },
        ],
      },
      select: { mediaType: true },
      pagination: false,
      depth: 0,
    });
  });

  it.each([
    [
      "a file past the planned count",
      PHOTO,
      [{ mediaType: "photo" }, { mediaType: "photo" }, { mediaType: "video" }],
    ],
    ["a video past the planned videos", VIDEO, [{ mediaType: "video" }]],
    [
      "a photo past the planned photos",
      PHOTO,
      [{ mediaType: "photo" }, { mediaType: "photo" }],
    ],
  ])("refuses %s with BATCH_TOO_LARGE", async (_label, input, inBatch) => {
    const { deps, storage } = fakes({ inBatch });
    await expect(startItem(deps, input)).rejects.toMatchObject({
      message: "BATCH_TOO_LARGE",
    });
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it("refuses a file once today's quota is used up by other batches", async () => {
    const { deps, payload } = fakes({ today: { photo: 150 } });
    await expect(startItem(deps, PHOTO)).rejects.toMatchObject({
      message: "UPLOAD_LIMIT",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it("refuses a video once today's video quota is used up by other batches", async () => {
    const { deps, payload } = fakes({ today: { video: 20 } });
    await expect(startItem(deps, VIDEO)).rejects.toMatchObject({
      message: "UPLOAD_LIMIT",
    });
    expect(payload.create).not.toHaveBeenCalled();
  });

  it.each([
    ["a PNG photo", { ...PHOTO, contentType: "image/png" }],
    ["a photo sent as a video", { ...PHOTO, contentType: "video/mp4" }],
    ["a QuickTime video", { ...VIDEO, contentType: "video/quicktime" }],
  ])("refuses %s with FILE_TYPE_NOT_ALLOWED", async (_label, input) => {
    const { deps, storage } = fakes();
    await expect(startItem(deps, input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "FILE_TYPE_NOT_ALLOWED",
    });
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it("accepts a photo of exactly the maximum size", async () => {
    const { deps } = fakes();
    await expect(
      startItem(deps, { ...PHOTO, bytes: GALLERY_PHOTO_MAX_BYTES }),
    ).resolves.toMatchObject({ itemId: 7 });
  });

  it.each([
    ["a photo over 4 MB", { ...PHOTO, bytes: GALLERY_PHOTO_MAX_BYTES + 1 }],
    ["a video over the size limit", { ...VIDEO, bytes: MAX_VIDEO_BYTES + 1 }],
    [
      "a video over the length limit",
      { ...VIDEO, durationSeconds: MAX_VIDEO_SECONDS + 1 },
    ],
    [
      "a thumbnail over 512 KB",
      { ...PHOTO, thumbnailBytes: GALLERY_THUMB_MAX_BYTES + 1 },
    ],
  ])("refuses %s with FILE_TOO_LARGE", async (_label, input) => {
    const { deps, storage } = fakes();
    await expect(startItem(deps, input)).rejects.toMatchObject({
      message: "FILE_TOO_LARGE",
    });
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty file", { ...PHOTO, bytes: 0 }],
    ["an empty thumbnail", { ...PHOTO, thumbnailBytes: 0 }],
    ["no width", { ...PHOTO, width: 0 }],
    ["a fractional height", { ...PHOTO, height: 10.5 }],
    ["a video without a duration", { ...VIDEO, durationSeconds: undefined }],
  ])("refuses %s with UPLOAD_FAILED", async (_label, input) => {
    const { deps, storage } = fakes();
    await expect(startItem(deps, input)).rejects.toMatchObject({
      message: "UPLOAD_FAILED",
    });
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it("checks the allowance with the file and thumbnail together", async () => {
    const full = fakes({ usage: GB5 - 1_050_000 + 1 });
    await expect(startItem(full.deps, PHOTO)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "STORAGE_FULL",
    });
    expect(full.storage.presignUpload).not.toHaveBeenCalled();
    const fits = fakes({ usage: GB5 - 1_050_000 });
    await expect(startItem(fits.deps, PHOTO)).resolves.toMatchObject({
      itemId: 7,
    });
  });

  it("records nothing when a grant cannot be made", async () => {
    const { deps, payload } = fakes({ presignFails: true });
    await expect(startItem(deps, PHOTO)).rejects.toThrow("no credentials");
    expect(payload.create).not.toHaveBeenCalled();
  });
});

/** The compare-and-set finish and discard use: only while still uploading. */
function whileUploading(to: "ready" | "failed", failureReason?: string) {
  return {
    collection: "gallery-items",
    id: 7,
    from: "uploading",
    to,
    ...(failureReason && { set: { failureReason } }),
  };
}

describe("finishItem", () => {
  it("checks both stored objects, then marks the item ready", async () => {
    const { deps, payload, storage } = fakes();
    await expect(
      finishItem(deps, { userId: "u1", itemId: 7 }),
    ).resolves.toEqual({
      id: 7,
      status: "ready",
      mediaType: "photo",
      width: 2048,
      height: 1536,
    });
    expect(storage.inspect).toHaveBeenCalledWith(FILE_KEY);
    expect(storage.inspect).toHaveBeenCalledWith(THUMB_KEY);
    expect(transition).toHaveBeenCalledWith(payload, whileUploading("ready"));
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("returns a ready item again on a second finish, without checking storage", async () => {
    const { deps, storage } = fakes({
      item: item({ status: "ready" }),
    });
    await expect(
      finishItem(deps, { userId: "u1", itemId: 7 }),
    ).resolves.toMatchObject({ id: 7, status: "ready" });
    expect(storage.inspect).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it("makes an item ready even when its batch was already finished", async () => {
    const { deps, payload } = fakes({
      batch: batch({ status: "finished" }),
    });
    await expect(
      finishItem(deps, { userId: "u1", itemId: 7 }),
    ).resolves.toMatchObject({ id: 7, status: "ready" });
    expect(payload.findByID).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: "gallery-batches" }),
    );
  });

  it.each([
    ["missing", null],
    ["someone else's", item({ uploaderId: "u2" })],
  ])("refuses an item that is %s with UPLOAD_EXPIRED", async (_l, found) => {
    const { deps, storage } = fakes({ item: found });
    await expect(
      finishItem(deps, { userId: "u1", itemId: 7 }),
    ).rejects.toMatchObject({ message: "UPLOAD_EXPIRED" });
    expect(storage.inspect).not.toHaveBeenCalled();
  });

  it("touches nothing past the finish window", async () => {
    const { deps, storage } = fakes({
      item: item({ createdAt: ago(FINISH_WINDOW_HOURS * HOUR + 1) }),
    });
    await expect(
      finishItem(deps, { userId: "u1", itemId: 7 }),
    ).rejects.toMatchObject({ message: "UPLOAD_EXPIRED" });
    expect(storage.inspect).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
  });

  it("refuses an item that already failed", async () => {
    const { deps } = fakes({
      item: item({ status: "failed", failureReason: "cancelled" }),
    });
    await expect(
      finishItem(deps, { userId: "u1", itemId: 7 }),
    ).rejects.toMatchObject({ message: "UPLOAD_FAILED" });
  });

  it.each([
    ["the file is missing", { file: null }],
    ["the thumbnail is missing", { thumb: null }],
    ["the file is empty", { file: { ...GOOD_FILE, bytes: 0 } }],
    [
      "the file has another type",
      { file: { ...GOOD_FILE, contentType: "image/png" } },
    ],
    [
      "the thumbnail has another type",
      { thumb: { ...GOOD_THUMB, contentType: "image/webp" } },
    ],
    [
      "both together are larger than declared",
      { file: { ...GOOD_FILE, bytes: 1_000_001 } },
    ],
  ])(
    "fails the item and removes both objects when %s",
    async (_label, stored) => {
      const { deps, payload, storage } = fakes({ stored });
      await expect(
        finishItem(deps, { userId: "u1", itemId: 7 }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "UPLOAD_FAILED",
      });
      expect(transition).toHaveBeenCalledWith(
        payload,
        whileUploading("failed", "UPLOAD_MISMATCH"),
      );
      expect(storage.remove).toHaveBeenCalledWith([FILE_KEY, THUMB_KEY]);
    },
  );

  it("still fails a bad upload when removing its objects fails, and logs it", async () => {
    const { deps, log } = fakes({ stored: { thumb: null }, removeFails: true });
    await expect(
      finishItem(deps, { userId: "u1", itemId: 7 }),
    ).rejects.toMatchObject({ message: "UPLOAD_FAILED" });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("finishItem"),
      expect.objectContaining({ itemId: 7 }),
    );
  });

  it("lets a discard that settled the item first stand", async () => {
    const { deps, storage } = fakes({
      lostRace: item({ status: "failed", failureReason: "cancelled" }),
    });
    await expect(
      finishItem(deps, { userId: "u1", itemId: 7 }),
    ).rejects.toMatchObject({ message: "UPLOAD_FAILED" });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("returns the item a concurrent finish made ready", async () => {
    const { deps } = fakes({ lostRace: item({ status: "ready" }) });
    await expect(
      finishItem(deps, { userId: "u1", itemId: 7 }),
    ).resolves.toMatchObject({ id: 7, status: "ready" });
  });
});

describe("discardItem", () => {
  it("marks an uploading item cancelled and removes both objects", async () => {
    const { deps, payload, storage } = fakes();
    await expect(
      discardItem(deps, { userId: "u1", itemId: 7 }),
    ).resolves.toBeUndefined();
    expect(transition).toHaveBeenCalledWith(
      payload,
      whileUploading("failed", "cancelled"),
    );
    expect(storage.remove).toHaveBeenCalledWith([FILE_KEY, THUMB_KEY]);
  });

  it.each([
    ["ready", item({ status: "ready" })],
    ["failed", item({ status: "failed", failureReason: "UPLOAD_MISMATCH" })],
  ])("leaves a %s item as it is", async (_label, found) => {
    const { deps, storage } = fakes({ item: found });
    await expect(
      discardItem(deps, { userId: "u1", itemId: 7 }),
    ).resolves.toBeUndefined();
    expect(transition).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("keeps the objects of an item a concurrent finish made ready", async () => {
    const { deps, storage } = fakes({ lostRace: item({ status: "ready" }) });
    await expect(
      discardItem(deps, { userId: "u1", itemId: 7 }),
    ).resolves.toBeUndefined();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("refuses someone else's item with UPLOAD_EXPIRED", async () => {
    const { deps } = fakes({ item: item({ uploaderId: "u2" }) });
    await expect(
      discardItem(deps, { userId: "u1", itemId: 7 }),
    ).rejects.toMatchObject({ message: "UPLOAD_EXPIRED" });
    expect(transition).not.toHaveBeenCalled();
  });

  it("touches nothing past the finish window", async () => {
    const { deps, storage } = fakes({
      item: item({ createdAt: ago(FINISH_WINDOW_HOURS * HOUR + 1) }),
    });
    await expect(
      discardItem(deps, { userId: "u1", itemId: 7 }),
    ).rejects.toMatchObject({ message: "UPLOAD_EXPIRED" });
    expect(transition).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("logs, and still succeeds, when removing the objects fails", async () => {
    const { deps, log } = fakes({ removeFails: true });
    await expect(
      discardItem(deps, { userId: "u1", itemId: 7 }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("discardItem"),
      expect.objectContaining({ itemId: 7 }),
    );
  });
});

/** The compare-and-set that finishes a batch: only while still open. */
const WHILE_OPEN = {
  collection: "gallery-batches",
  id: 3,
  from: "open",
  to: "finished",
};
const READY = [item({ status: "ready" }), item({ id: 8, status: "ready" })];

describe("finishBatch", () => {
  it("finishes an open batch and counts its ready items", async () => {
    const { deps, payload } = fakes({ ready: READY });
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }),
    ).resolves.toEqual({ readyCount: 2, feedPostId: null });
    expect(transition).toHaveBeenCalledWith(payload, WHILE_OPEN);
    expect(payload.find).toHaveBeenCalledWith({
      collection: "gallery-items",
      where: {
        and: [{ batch: { equals: 3 } }, { status: { equals: "ready" } }],
      },
      sort: "id",
      pagination: false,
      depth: 0,
    });
  });

  it("reads the ready items only after it has finished the batch", async () => {
    const { deps, payload } = fakes({ ready: READY });
    await finishBatch(deps, { userId: "u1", batchId: 3 });
    expect(payload.find.mock.invocationCallOrder[0]).toBeGreaterThan(
      transition.mock.invocationCallOrder[0]!,
    );
  });

  it("announces the batch it finished and stores the announcement's post", async () => {
    const { deps, payload } = fakes({ ready: READY });
    const announce = vi.fn().mockResolvedValue(91);
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }, announce),
    ).resolves.toEqual({ readyCount: 2, feedPostId: 91 });
    expect(announce).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, status: "finished" }),
      READY,
    );
    expect(payload.update).toHaveBeenCalledWith({
      collection: "gallery-batches",
      id: 3,
      data: { feedPostId: 91 },
    });
  });

  it("removes the new post when the batch's last item went while it was made", async () => {
    // closeBatch saw ready items, but the last one was deleted before the
    // post existed, so the delete had no post to remove yet.
    const { deps, payload } = fakes({ ready: READY });
    feedPostLink.releaseEmptyGalleryPost.mockResolvedValue(true);
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }, async () => 91),
    ).resolves.toEqual({ readyCount: 2, feedPostId: null });
    expect(feedPostLink.releaseEmptyGalleryPost).toHaveBeenCalledWith(deps, 3);
    // After the batch names its post, so the release clears that link.
    expect(
      feedPostLink.releaseEmptyGalleryPost.mock.invocationCallOrder[0],
    ).toBeGreaterThan(payload.update.mock.invocationCallOrder[0]!);
  });

  it("keeps the post, and its id, when the release finds it still shows something", async () => {
    const { deps } = fakes({ ready: READY });
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }, async () => 91),
    ).resolves.toEqual({ readyCount: 2, feedPostId: 91 });
    expect(feedPostLink.releaseEmptyGalleryPost).toHaveBeenCalledWith(deps, 3);
  });

  it("keeps the post, and logs, when the release fails", async () => {
    const { deps, log } = fakes({ ready: READY });
    const error = new Error("db down");
    feedPostLink.releaseEmptyGalleryPost.mockRejectedValue(error);
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }, async () => 91),
    ).resolves.toEqual({ readyCount: 2, feedPostId: 91 });
    expect(log).toHaveBeenCalledWith(
      "[gallery.finishBatch] removing an empty gallery post failed",
      { batchId: 3, feedPostId: 91, error },
    );
  });

  it("releases nothing when the announcement makes no post", async () => {
    const { deps } = fakes({ ready: READY });
    await finishBatch(deps, { userId: "u1", batchId: 3 }, async () => null);
    expect(feedPostLink.releaseEmptyGalleryPost).not.toHaveBeenCalled();
  });

  it("does not announce a batch with nothing ready", async () => {
    const { deps } = fakes({ ready: [] });
    const announce = vi.fn();
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }, announce),
    ).resolves.toEqual({ readyCount: 0, feedPostId: null });
    expect(announce).not.toHaveBeenCalled();
  });

  it("stores nothing when the announcement makes no post", async () => {
    const { deps, payload } = fakes({ ready: READY });
    await finishBatch(deps, { userId: "u1", batchId: 3 }, async () => null);
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("keeps the batch finished, and logs, when the announcement fails", async () => {
    const { deps, log } = fakes({ ready: READY });
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }, async () => {
        throw new Error("feed down");
      }),
    ).resolves.toEqual({ readyCount: 2, feedPostId: null });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("finishBatch"),
      expect.objectContaining({ batchId: 3 }),
    );
  });

  it("keeps the post, and logs, when storing it on the batch fails", async () => {
    const { deps, payload, log } = fakes({ ready: READY });
    const error = new Error("db down");
    payload.update.mockRejectedValueOnce(error);
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }, async () => 91),
    ).resolves.toEqual({ readyCount: 2, feedPostId: 91 });
    expect(log).toHaveBeenCalledWith(
      "[gallery.finishBatch] storing a finished batch's feed post failed",
      { batchId: 3, feedPostId: 91, error },
    );
  });

  it("returns the stored result on a second finish, without announcing again", async () => {
    const { deps, payload } = fakes({
      batch: batch({ status: "finished", feedPostId: 91 }),
      ready: READY,
    });
    const announce = vi.fn();
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }, announce),
    ).resolves.toEqual({ readyCount: 2, feedPostId: 91 });
    expect(announce).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("lets a concurrent finish that moved the batch first do the announcing", async () => {
    const { deps } = fakes({
      ready: READY,
      lostRace: batch({ status: "finished", feedPostId: 91 }),
    });
    const announce = vi.fn();
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }, announce),
    ).resolves.toEqual({ readyCount: 2, feedPostId: 91 });
    expect(announce).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["someone else's", batch({ uploaderId: "u2" })],
  ])("refuses a batch that is %s with UPLOAD_EXPIRED", async (_l, found) => {
    const { deps } = fakes({ batch: found });
    await expect(
      finishBatch(deps, { userId: "u1", batchId: 3 }),
    ).rejects.toMatchObject({ message: "UPLOAD_EXPIRED" });
    expect(transition).not.toHaveBeenCalled();
  });
});
