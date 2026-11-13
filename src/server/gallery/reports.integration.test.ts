// @vitest-environment node
/**
 * DB-INTEGRATION test for gallery item reports (spec 2026-11-13, Reports and
 * moderation), against a REAL local DB + Payload: the guarded hide really is
 * one guarded write, so two first reports landing together notify the
 * moderators once (Review Focus 2); a moderator's Remove of the last ready
 * item of a caption-less batch removes its feed post, and the item's
 * reports go with it through the foreign key (Review Focus 3). Object
 * storage is a fake; notifications are the real inserts.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/gallery/reports.integration.test.ts
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { and as And, eq as Eq, inArray as InArray } from "drizzle-orm";
import type { db as Db } from "@/server/db";
import type * as Schema from "@/server/db/schema";
import type { getPayloadClient as GetPayloadClient } from "@/server/payload";

import type * as Access from "./access";
import type * as Notifications from "./notifications";
import type * as Reports from "./reports";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("gallery item reports [DB integration]", () => {
  type Mods = {
    db: typeof Db;
    schema: typeof Schema;
    getPayloadClient: typeof GetPayloadClient;
    access: typeof Access;
    notifications: typeof Notifications;
    reports: typeof Reports;
    and: typeof And;
    eq: typeof Eq;
    inArray: typeof InArray;
  };
  let m: Mods;
  let fx: {
    uploaderId: string;
    ownerId: string;
    moderatorId: string;
    reporterIds: [string, string];
    communityId: string;
    slug: string;
  };
  const users = () => [
    fx.uploaderId,
    fx.ownerId,
    fx.moderatorId,
    ...fx.reporterIds,
  ];

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [
      { db },
      schema,
      { getPayloadClient },
      access,
      notifications,
      reports,
      drizzle,
    ] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("@/server/payload"),
      import("./access"),
      import("./notifications"),
      import("./reports"),
      import("drizzle-orm"),
    ]);
    m = {
      db,
      schema,
      getPayloadClient,
      access,
      notifications,
      reports,
      and: drizzle.and,
      eq: drizzle.eq,
      inArray: drizzle.inArray,
    };
  });

  beforeEach(async () => {
    vi.stubEnv("COMMUNITY_PAYMENTS_ENABLED", "false");
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    fx = {
      uploaderId: `it-grep-up-${suffix}`,
      ownerId: `it-grep-own-${suffix}`,
      moderatorId: `it-grep-mod-${suffix}`,
      reporterIds: [`it-grep-r1-${suffix}`, `it-grep-r2-${suffix}`],
      communityId: "",
      slug: `grep-${suffix}`,
    };
    await m.db
      .insert(m.schema.user)
      .values(
        users().map((id) => ({ id, email: `${id}@example.test`, name: id })),
      );
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({
        name: `Gallery reports ${suffix}`,
        slug: fx.slug,
        createdBy: fx.ownerId,
      })
      .returning({ id: m.schema.communities.id });
    fx.communityId = community!.id;
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: fx.communityId, userId: fx.ownerId, role: "owner" },
      {
        communityId: fx.communityId,
        userId: fx.moderatorId,
        role: "moderator",
      },
      { communityId: fx.communityId, userId: fx.uploaderId, role: "member" },
      ...fx.reporterIds.map((userId) => ({
        communityId: fx.communityId,
        userId,
        role: "member" as const,
      })),
    ]);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const payload = await m.getPayloadClient();
    // Items first: their reports go with them.
    await payload.delete({
      collection: "feed-posts",
      where: { communityId: { equals: fx.communityId } },
    });
    await payload.delete({
      collection: "gallery-items",
      where: { communityId: { equals: fx.communityId } },
    });
    await payload.delete({
      collection: "gallery-batches",
      where: { communityId: { equals: fx.communityId } },
    });
    await m.db
      .delete(m.schema.notifications)
      .where(m.inArray(m.schema.notifications.userId, users()));
    await m.db
      .delete(m.schema.communityMemberships)
      .where(m.eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(m.eq(m.schema.communities.id, fx.communityId));
    await m.db
      .delete(m.schema.user)
      .where(m.inArray(m.schema.user.id, users()));
  });

  function fakeStorage() {
    return {
      presignUpload: vi.fn(),
      inspect: vi.fn(),
      signedGetUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
      publicUrl: vi.fn((key: string) => `https://public.test/${key}`),
      list: vi.fn(),
      remove: vi.fn(async () => undefined),
    };
  }

  async function depsWith(storage = fakeStorage()) {
    const payload = await m.getPayloadClient();
    return {
      payload,
      db: m.db,
      storage: () => storage as never,
      notify: m.notifications.galleryReportNotices(m.db),
    };
  }

  function viewerOf(userId: string) {
    return m.access.loadGalleryViewer({ db: m.db }, { slug: fx.slug, userId });
  }

  /**
   * A finished batch of the uploader's with `ready` ready photos, announced
   * by a post with no words.
   */
  async function galleryPost(ready: number) {
    const payload = await m.getPayloadClient();
    const batch = await payload.create({
      collection: "gallery-batches",
      data: {
        communityId: fx.communityId,
        uploaderId: fx.uploaderId,
        visibility: "community",
        magazineConsent: false,
        plannedFiles: ready,
        plannedVideos: 0,
        status: "finished",
      },
    });
    const itemIds: number[] = [];
    for (let n = 1; n <= ready; n++) {
      const uploadId = `it-${fx.slug}-${batch.id}-${n}`;
      const item = await payload.create({
        collection: "gallery-items",
        data: {
          communityId: fx.communityId,
          mediaType: "photo",
          status: "ready",
          storage: "private",
          visibility: "community",
          fileKey: `private/gallery/${fx.communityId}/${uploadId}.jpg`,
          thumbnailKey: `private/gallery/${fx.communityId}/${uploadId}-thumb.jpg`,
          width: 800,
          height: 600,
          bytes: 100_000,
          uploaderId: fx.uploaderId,
          batch: batch.id,
          uploadId,
        },
      });
      itemIds.push(item.id);
    }
    const post = await payload.create({
      collection: "feed-posts",
      data: {
        content: "",
        authorId: fx.uploaderId,
        authorName: "Uploader",
        communityId: fx.communityId,
        likeCount: 0,
        commentCount: 0,
        topicSlug: "general",
        visibility: "community",
        galleryBatch: batch.id,
      },
    });
    await payload.update({
      collection: "gallery-batches",
      id: batch.id,
      data: { feedPostId: post.id },
    });
    return { batchId: batch.id, postId: post.id, itemIds };
  }

  async function savedItem(itemId: number) {
    const payload = await m.getPayloadClient();
    return payload.findByID({
      collection: "gallery-items",
      id: itemId,
      depth: 0,
      disableErrors: true,
    });
  }

  async function reportRows(itemId: number) {
    const payload = await m.getPayloadClient();
    const { docs } = await payload.find({
      collection: "gallery-reports",
      where: { item: { equals: itemId } },
      pagination: false,
      depth: 0,
    });
    return docs;
  }

  async function noticesOf(type: string) {
    return m.db
      .select({
        userId: m.schema.notifications.userId,
        metadata: m.schema.notifications.metadata,
      })
      .from(m.schema.notifications)
      .where(
        m.and(
          m.inArray(m.schema.notifications.userId, users()),
          m.eq(m.schema.notifications.type, type),
        ),
      );
  }

  it("Review Focus 2: two first reports at once hide the item and notify each moderator once", async () => {
    const deps = await depsWith();
    const { itemIds } = await galleryPost(1);
    const itemId = itemIds[0]!;
    const [first, second] = await Promise.all([
      viewerOf(fx.reporterIds[0]),
      viewerOf(fx.reporterIds[1]),
    ]);

    await Promise.all([
      m.reports.reportItem(deps, { viewer: first, itemId, reason: "spam" }),
      m.reports.reportItem(deps, {
        viewer: second,
        itemId,
        reason: "inappropriate",
      }),
    ]);

    expect((await savedItem(itemId))!.hiddenAt).toBeTruthy();
    expect(await reportRows(itemId)).toHaveLength(2);
    const notices = await noticesOf("gallery_item_reported");
    expect(notices.map((row) => row.userId).sort()).toEqual(
      [fx.ownerId, fx.moderatorId].sort(),
    );
    expect(notices[0]!.metadata).toEqual({
      itemId,
      reviewPath: `/communities/${fx.slug}/gallery?item=${itemId}`,
      linkLabel: "Review it",
    });
    // The count is written after both hides raced; a later report
    // recounts from storage.
    expect(Number((await savedItem(itemId))!.reportCount)).toBeGreaterThan(0);
  });

  it("refuses the same reporter twice, through the unique index too", async () => {
    const deps = await depsWith();
    const { itemIds } = await galleryPost(1);
    const itemId = itemIds[0]!;
    const reporter = await viewerOf(fx.reporterIds[0]);

    const results = await Promise.allSettled([
      m.reports.reportItem(deps, { viewer: reporter, itemId, reason: "spam" }),
      m.reports.reportItem(deps, { viewer: reporter, itemId, reason: "spam" }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const refused = results.find((r) => r.status === "rejected");
    expect(refused!.reason).toMatchObject({
      code: "CONFLICT",
      message: "ALREADY_REPORTED",
    });
    expect(await reportRows(itemId)).toHaveLength(1);
  });

  it("this is me tells the uploader, and restore shows the item again and notifies on the next hide", async () => {
    const deps = await depsWith();
    const { itemIds } = await galleryPost(1);
    const itemId = itemIds[0]!;
    const [first, second] = await Promise.all([
      viewerOf(fx.reporterIds[0]),
      viewerOf(fx.reporterIds[1]),
    ]);
    const moderator = await viewerOf(fx.moderatorId);

    await m.reports.reportItem(deps, {
      viewer: first,
      itemId,
      reason: "this_is_me",
      note: "I'm on the left",
    });
    expect(
      (await noticesOf("gallery_item_this_is_me")).map((row) => row.userId),
    ).toEqual([fx.uploaderId]);
    const read = await m.reports.listItemReports(deps, {
      viewer: moderator,
      itemId,
    });
    expect(read).toEqual({
      asOf: expect.any(String),
      reports: [
        {
          reason: "this_is_me",
          note: "I'm on the left",
          createdAt: expect.any(String),
        },
      ],
    });

    await m.reports.reviewItemReports(deps, {
      viewer: moderator,
      itemId,
      action: "restore",
      reviewedUpTo: read.asOf,
    });
    expect(await savedItem(itemId)).toMatchObject({ hiddenAt: null });
    expect(Number((await savedItem(itemId))!.reportCount)).toBe(0);
    expect((await reportRows(itemId))[0]!.dismissedAt).toBeTruthy();

    await m.reports.reportItem(deps, {
      viewer: second,
      itemId,
      reason: "spam",
    });
    expect((await savedItem(itemId))!.hiddenAt).toBeTruthy();
    expect(Number((await savedItem(itemId))!.reportCount)).toBe(1);
    expect(await noticesOf("gallery_item_reported")).toHaveLength(4);
  });

  it("restore keeps a report newer than what the moderator read open, and hides the item again with one notice", async () => {
    const deps = await depsWith();
    const { itemIds } = await galleryPost(1);
    const itemId = itemIds[0]!;
    const moderator = await viewerOf(fx.moderatorId);
    await m.reports.reportItem(deps, {
      viewer: await viewerOf(fx.reporterIds[0]),
      itemId,
      reason: "spam",
    });
    const { asOf } = await m.reports.listItemReports(deps, {
      viewer: moderator,
      itemId,
    });
    // A later millisecond, so the next report is newer than the read.
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Hidden: only moderators can still read it, and report it.
    await m.reports.reportItem(deps, {
      viewer: await viewerOf(fx.ownerId),
      itemId,
      reason: "other",
    });
    expect(await noticesOf("gallery_item_reported")).toHaveLength(2);

    await m.reports.reviewItemReports(deps, {
      viewer: moderator,
      itemId,
      action: "restore",
      reviewedUpTo: asOf,
    });

    const rows = await reportRows(itemId);
    expect(rows.filter((row) => !row.dismissedAt)).toHaveLength(1);
    expect(rows.find((row) => !row.dismissedAt)!.reporterId).toBe(fx.ownerId);
    expect((await savedItem(itemId))!.hiddenAt).toBeTruthy();
    expect(Number((await savedItem(itemId))!.reportCount)).toBe(1);
    expect(await noticesOf("gallery_item_reported")).toHaveLength(4);
  });

  it("a report made while a restore runs ends with the item hidden and moderators told once", async () => {
    const deps = await depsWith();
    const { itemIds } = await galleryPost(1);
    const itemId = itemIds[0]!;
    const moderator = await viewerOf(fx.moderatorId);
    const owner = await viewerOf(fx.ownerId);
    await m.reports.reportItem(deps, {
      viewer: await viewerOf(fx.reporterIds[0]),
      itemId,
      reason: "spam",
    });
    const { asOf } = await m.reports.listItemReports(deps, {
      viewer: moderator,
      itemId,
    });
    // The owner's report lands after the restore dismissed the reviewed
    // reports and before it shows the item: its own hide finds it hidden.
    const racing = new Proxy(deps.payload, {
      get(target, key, receiver) {
        if (key !== "update") {
          return Reflect.get(target, key, receiver) as unknown;
        }
        return async (args: Parameters<typeof target.update>[0]) => {
          const result = await target.update(args as never);
          if (args.collection === "gallery-reports") {
            await m.reports.reportItem(deps, {
              viewer: owner,
              itemId,
              reason: "other",
            });
          }
          return result;
        };
      },
    });

    await m.reports.reviewItemReports(
      { ...deps, payload: racing },
      { viewer: moderator, itemId, action: "restore", reviewedUpTo: asOf },
    );

    expect((await savedItem(itemId))!.hiddenAt).toBeTruthy();
    expect(Number((await savedItem(itemId))!.reportCount)).toBe(1);
    // Two moderators: one notice each for the first hide, one each now.
    expect(await noticesOf("gallery_item_reported")).toHaveLength(4);
  });

  it("Review Focus 3: removing the last ready item removes the empty post, the files and the reports", async () => {
    const storage = fakeStorage();
    const deps = await depsWith(storage);
    const { itemIds, postId, batchId } = await galleryPost(1);
    const itemId = itemIds[0]!;
    const first = await viewerOf(fx.reporterIds[0]);
    const moderator = await viewerOf(fx.moderatorId);
    await m.reports.reportItem(deps, { viewer: first, itemId, reason: "spam" });
    // Hidden now: only moderators can still read it, and report it.
    await m.reports.reportItem(deps, {
      viewer: await viewerOf(fx.ownerId),
      itemId,
      reason: "other",
    });
    expect(await reportRows(itemId)).toHaveLength(2);

    await m.reports.reviewItemReports(deps, {
      viewer: moderator,
      itemId,
      action: "remove",
    });

    expect(await savedItem(itemId)).toBeNull();
    expect(await reportRows(itemId)).toEqual([]);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    const payload = await m.getPayloadClient();
    expect(
      await payload.findByID({
        collection: "feed-posts",
        id: postId,
        depth: 0,
      }),
    ).toMatchObject({ isDeleted: true, galleryBatch: null });
    const batch = await payload.findByID({
      collection: "gallery-batches",
      id: batchId,
      depth: 0,
    });
    expect(batch.feedPostId ?? null).toBeNull();
  });
});
