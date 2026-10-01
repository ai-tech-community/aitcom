// @vitest-environment node
/**
 * DB-INTEGRATION test for editing a feed post's media (`feed.editPost`).
 * Proves, against a REAL local DB + Payload, that removing a public post's
 * video clears its stored video fields (so the unique video key is free
 * again) and makes the post members-only, that swapping in an image keeps
 * one image and no video, and that the edit succeeds even when the old
 * files cannot be removed from storage.
 *
 * Auto-skips unless RUN_DB_TESTS=1 and a local database is configured:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/feed-post-edit.integration.test.ts
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

const gif = vi.hoisted(() => ({
  giphyId: "itgif1",
  title: "Party parrot",
  mp4Url: "https://media.giphy.com/media/itgif1/giphy.mp4",
  stillUrl: "https://media.giphy.com/media/itgif1/giphy_s.gif",
  width: 400,
  height: 300,
  preview: {
    mp4Url: "https://media.giphy.com/media/itgif1/200w.mp4",
    stillUrl: "https://media.giphy.com/media/itgif1/200w_s.gif",
    width: 200,
    height: 150,
  },
}));
vi.mock("@/server/giphy/giphy", () => ({
  getGiphyClient: () => ({
    byId: async (id: string) => (id === gif.giphyId ? gif : null),
  }),
}));

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

describe.skipIf(!RUN_DB)("feed.editPost media [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    inArray: typeof import("drizzle-orm").inArray;
    sql: typeof import("drizzle-orm").sql;
  };
  let m: Mods;
  let fx: {
    suffix: string;
    userId: string;
    communityId: string;
    slug: string;
    postId: number;
  };

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, { getPayloadClient }, drizzle] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("drizzle-orm"),
      ]);
    m = {
      db,
      schema,
      createCaller,
      getPayloadClient,
      inArray: drizzle.inArray,
      sql: drizzle.sql,
    };
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
  });

  beforeEach(async () => {
    const { db, schema } = m;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const userId = `it-edit-${suffix}`;
    await db
      .insert(schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: userId });
    const slug = `it-edit-${suffix}`;
    const [community] = await db
      .insert(schema.communities)
      .values({ name: `Edit ${suffix}`, slug, createdBy: userId })
      .returning({ id: schema.communities.id });
    await db.insert(schema.communityMemberships).values({
      communityId: community!.id,
      userId,
      role: "owner",
    });
    const payload = await m.getPayloadClient();
    const post = await payload.create({
      collection: "feed-posts",
      data: {
        content: "A clip",
        authorId: userId,
        authorName: "Tester",
        communityId: community!.id,
        topicSlug: "general",
        likeCount: 0,
        commentCount: 0,
        visibility: "public",
        video: {
          key: `media/videos/public/${community!.id}/${suffix}.mp4`,
          thumbnailKey: `media/videos/public/${community!.id}/${suffix}.jpg`,
          storage: "public",
          durationSeconds: 12,
          width: 720,
          height: 1280,
          bytes: 1000,
        },
      },
    });
    fx = { suffix, userId, communityId: community!.id, slug, postId: post.id };
  });

  afterEach(async () => {
    const { db, schema, inArray } = m;
    const payload = await m.getPayloadClient();
    try {
      await payload.delete({ collection: "feed-posts", id: fx.postId });
    } catch {
      // Best-effort teardown.
    }
    await m.db.execute(
      m.sql`DELETE FROM "media" WHERE "uploaded_by" IN (${fx.userId}, 'someone-else') AND "filename" LIKE 'it-edit-%'`,
    );
    await db
      .delete(schema.communityMemberships)
      .where(
        inArray(schema.communityMemberships.communityId, [fx.communityId]),
      );
    await db
      .delete(schema.communities)
      .where(inArray(schema.communities.id, [fx.communityId]));
    await db.delete(schema.user).where(inArray(schema.user.id, [fx.userId]));
  });

  /** A feed post image `uploadedBy` uploaded (no file: storage is not used). */
  async function ownImage(uploadedBy = fx.userId) {
    const name = `it-edit-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`;
    const res = await m.db.execute(m.sql`
      INSERT INTO "media" ("alt", "filename", "mime_type", "uploaded_by", "purpose", "updated_at", "created_at")
      VALUES ('Feed post image', ${name}, 'image/png', ${uploadedBy}, 'feed-post', now(), now())
      RETURNING "id"`);
    return { id: Number((res.rows[0] as { id: number }).id), name };
  }

  function author() {
    return m.createCaller({
      db: m.db,
      session: { user: { id: fx.userId, name: "Tester" } } as never,
      headers: new Headers(),
    });
  }

  it("removes the video, frees its key and makes the post members-only", async () => {
    // Storage is not configured in this test environment: the old files'
    // cleanup fails, and the edit must still succeed.
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        author().feed.editPost({
          postId: fx.postId,
          communitySlug: fx.slug,
          content: "Now just text",
          media: { kind: "none" },
        }),
      ).resolves.toEqual({ id: fx.postId });
    } finally {
      log.mockRestore();
    }
    const payload = await m.getPayloadClient();
    const saved = await payload.findByID({
      collection: "feed-posts",
      id: fx.postId,
      depth: 0,
    });
    expect(saved.content).toBe("Now just text");
    expect(saved.visibility).toBe("community");
    expect(saved.video?.key ?? null).toBeNull();
    expect(saved.video?.thumbnailKey ?? null).toBeNull();
    expect(saved.imageUrl ?? null).toBeNull();
    expect(saved.isEdited).toBe(true);
  });

  it("swaps the video for an image", async () => {
    const image = await ownImage();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await author().feed.editPost({
        postId: fx.postId,
        communitySlug: fx.slug,
        content: "A picture instead",
        media: { kind: "images", images: [{ id: image.id, alt: "A picture" }] },
      });
    } finally {
      log.mockRestore();
    }
    const payload = await m.getPayloadClient();
    const saved = await payload.findByID({
      collection: "feed-posts",
      id: fx.postId,
      depth: 0,
    });
    expect(saved.images).toEqual([image.id]);
    expect(saved.imageUrl).toMatch(new RegExp(`${image.name}$`));
    expect(saved.video?.key ?? null).toBeNull();
  });

  it("refuses someone else's upload", async () => {
    const image = await ownImage("someone-else");
    await expect(
      author().feed.editPost({
        postId: fx.postId,
        communitySlug: fx.slug,
        content: "Not mine",
        media: { kind: "images", images: [{ id: image.id, alt: "A picture" }] },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await m.db.execute(m.sql`DELETE FROM "media" WHERE "id" = ${image.id}`);
  });

  it("adds an image to a post that had no media", async () => {
    const payload = await m.getPayloadClient();
    const textPost = await payload.create({
      collection: "feed-posts",
      data: {
        content: "Just words",
        authorId: fx.userId,
        authorName: "Tester",
        communityId: fx.communityId,
        topicSlug: "general",
        likeCount: 0,
        commentCount: 0,
        visibility: "community",
      },
    });
    const image = await ownImage();
    try {
      await author().feed.editPost({
        postId: textPost.id,
        communitySlug: fx.slug,
        content: "Words and a picture",
        media: { kind: "images", images: [{ id: image.id, alt: "A picture" }] },
      });
      const saved = await payload.findByID({
        collection: "feed-posts",
        id: textPost.id,
        depth: 0,
      });
      expect(saved.images).toEqual([image.id]);
      expect(saved.imageUrl).toMatch(new RegExp(`${image.name}$`));
      expect(saved.content).toBe("Words and a picture");

      // Removing it again clears the link and the URL and deletes the
      // upload (its storage files fail to delete here, which is logged).
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        await author().feed.editPost({
          postId: textPost.id,
          communitySlug: fx.slug,
          content: "Words again",
          media: { kind: "none" },
        });
      } finally {
        log.mockRestore();
      }
      const cleared = await payload.findByID({
        collection: "feed-posts",
        id: textPost.id,
        depth: 0,
      });
      expect(cleared.images ?? []).toEqual([]);
      expect(cleared.imageUrl ?? null).toBeNull();
    } finally {
      await payload.delete({ collection: "feed-posts", id: textPost.id });
      await m.db.execute(m.sql`DELETE FROM "media" WHERE "id" = ${image.id}`);
    }
  });

  it("keeps a hidden post's video for the moderator", async () => {
    const payload = await m.getPayloadClient();
    await payload.update({
      collection: "feed-posts",
      id: fx.postId,
      data: { hiddenAt: new Date().toISOString() },
    });
    await expect(
      author().feed.editPost({
        postId: fx.postId,
        communitySlug: fx.slug,
        content: "Hiding the evidence",
        media: { kind: "none" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const saved = await payload.findByID({
      collection: "feed-posts",
      id: fx.postId,
      depth: 0,
    });
    expect(saved.video?.key).toBe(
      `media/videos/public/${fx.communityId}/${fx.suffix}.mp4`,
    );
    expect(saved.visibility).toBe("public");
  });

  it("refuses a write from a stale read, leaving the newer video in place", async () => {
    const { writePostMedia } = await import("@/server/communities/post-media");
    const payload = await m.getPayloadClient();
    const stale = await payload.findByID({
      collection: "feed-posts",
      id: fx.postId,
      depth: 0,
    });
    const newer = `media/videos/public/${fx.communityId}/${fx.suffix}-b.mp4`;
    await payload.update({
      collection: "feed-posts",
      id: fx.postId,
      data: { video: { ...stale.video, key: newer } },
    });
    const getStorage = vi.fn();
    await expect(
      writePostMedia(
        { payload, getStorage },
        stale,
        { content: "Too late", imageUrl: null },
        "test",
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const saved = await payload.findByID({
      collection: "feed-posts",
      id: fx.postId,
      depth: 0,
    });
    expect(saved.video?.key).toBe(newer);
    expect(saved.content).toBe("A clip");
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("puts a GIF on the post in place of its video, then a picture in place of the GIF", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const image = await ownImage();
    try {
      await author().feed.editPost({
        postId: fx.postId,
        communitySlug: fx.slug,
        content: "Party",
        media: { kind: "gif", giphyId: "itgif1" },
      });
      const payload = await m.getPayloadClient();
      const withGif = await payload.findByID({
        collection: "feed-posts",
        id: fx.postId,
        depth: 0,
      });
      expect(withGif.gif).toMatchObject({
        giphyId: "itgif1",
        mp4Url: gif.mp4Url,
        width: 400,
        height: 300,
      });
      expect(withGif.video?.key ?? null).toBeNull();
      expect(withGif.visibility).toBe("community");

      await author().feed.editPost({
        postId: fx.postId,
        communitySlug: fx.slug,
        content: "A picture",
        media: { kind: "images", images: [{ id: image.id, alt: "A picture" }] },
      });
      const withImage = await payload.findByID({
        collection: "feed-posts",
        id: fx.postId,
        depth: 0,
      });
      expect(withImage.gif?.giphyId ?? null).toBeNull();
      expect(withImage.gif?.mp4Url ?? null).toBeNull();
      expect(withImage.images).toEqual([image.id]);
    } finally {
      log.mockRestore();
    }
  });

  it("keeps several pictures in order with their descriptions, and deletes the one taken out", async () => {
    const first = await ownImage();
    const second = await ownImage();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await author().feed.editPost({
        postId: fx.postId,
        communitySlug: fx.slug,
        content: "Two pictures",
        media: {
          kind: "images",
          images: [
            { id: second.id, alt: "Second, shown first" },
            { id: first.id, alt: "" },
          ],
        },
      });
      const payload = await m.getPayloadClient();
      const saved = await payload.findByID({
        collection: "feed-posts",
        id: fx.postId,
        depth: 0,
      });
      expect(saved.images).toEqual([second.id, first.id]);
      // The deprecated single field mirrors the first picture, for the
      // previous version's cleanup during a deploy or after a rollback.
      expect(saved.image).toBe(second.id);

      // A like rewrites only the counters: the pictures stay as edited.
      const { syncFeedPostCounters } =
        await import("@/server/communities/feed-post-counters");
      await syncFeedPostCounters(payload, fx.postId);
      const liked = await payload.findByID({
        collection: "feed-posts",
        id: fx.postId,
        depth: 0,
      });
      expect(liked.images).toEqual([second.id, first.id]);
      expect(liked.likeCount).toBe(0);
      expect(saved.imageUrl).toMatch(new RegExp(`${second.name}$`));
      const described = await payload.findByID({
        collection: "media",
        id: second.id,
        depth: 0,
      });
      expect(described.alt).toBe("Second, shown first");

      await author().feed.editPost({
        postId: fx.postId,
        communitySlug: fx.slug,
        content: "One picture",
        media: { kind: "images", images: [{ id: first.id, alt: "" }] },
      });
      const after = await payload.findByID({
        collection: "feed-posts",
        id: fx.postId,
        depth: 0,
      });
      expect(after.images).toEqual([first.id]);
      expect(after.imageUrl).toMatch(new RegExp(`${first.name}$`));
      const gone = await m.db.execute(
        m.sql`SELECT 1 FROM "media" WHERE "id" = ${second.id}`,
      );
      expect(gone.rows).toHaveLength(0);
    } finally {
      log.mockRestore();
    }
  });

  it("moves a post to another topic and hides its link preview", async () => {
    const { up } =
      await import("@/migrations/20261001d_feed_post_link_preview_hidden");
    await up({ db: m.db } as never);
    const payload = await m.getPayloadClient();
    const topic = await payload.create({
      collection: "community-topics",
      data: { label: "Jobs", slug: "jobs", communityId: fx.communityId },
    });
    try {
      // The preview fetch fails here (no such host); the URL is still kept.
      await author().feed.editPost({
        postId: fx.postId,
        communitySlug: fx.slug,
        content: "Hiring, see https://jobs.invalid/role",
        topicSlug: "jobs",
      });
      await author().feed.editPost({
        postId: fx.postId,
        communitySlug: fx.slug,
        content: "Hiring, see https://jobs.invalid/role",
        linkPreviewHidden: true,
      });
      const saved = await payload.findByID({
        collection: "feed-posts",
        id: fx.postId,
        depth: 0,
      });
      expect(saved.topicSlug).toBe("jobs");
      expect(saved.linkPreview).toMatchObject({
        url: "https://jobs.invalid/role",
        hidden: true,
      });
      await expect(
        author().feed.editPost({
          postId: fx.postId,
          communitySlug: fx.slug,
          content: "Elsewhere",
          topicSlug: "not-here",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      await payload.delete({ collection: "community-topics", id: topic.id });
    }
  }, 30_000);
});
