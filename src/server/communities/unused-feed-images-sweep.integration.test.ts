// @vitest-environment node
/**
 * DB-INTEGRATION test for the unused feed images sweep: against a REAL
 * local DB + Payload, an old feed post image no post links is deleted,
 * while a linked one, a young one and a shared upload (no purpose) stay.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/unused-feed-images-sweep.integration.test.ts
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

describe.skipIf(!RUN_DB)("sweepUnusedFeedImages [DB integration]", () => {
  let m: {
    db: typeof import("@/server/db").db;
    sql: typeof import("drizzle-orm").sql;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    sweep: typeof import("./unused-feed-images-sweep").sweepUnusedFeedImages;
  };
  const created = { media: [] as number[], posts: [] as number[] };

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
    const [{ db }, { sql }, { getPayloadClient }, { sweepUnusedFeedImages }] =
      await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("@/server/payload"),
        import("./unused-feed-images-sweep"),
      ]);
    m = { db, sql, getPayloadClient, sweep: sweepUnusedFeedImages };
  });

  afterEach(async () => {
    const payload = await m.getPayloadClient();
    for (const id of created.posts) {
      await payload.delete({ collection: "feed-posts", id }).catch(() => null);
    }
    if (created.media.length > 0) {
      await m.db.execute(
        m.sql`DELETE FROM "media" WHERE "id" IN ${created.media}`,
      );
    }
    created.media.length = 0;
    created.posts.length = 0;
  });

  async function image(purpose: string | null, createdAt: string) {
    const name = `it-sweep-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`;
    const res = await m.db.execute(m.sql`
      INSERT INTO "media" ("alt", "filename", "purpose", "uploaded_by", "updated_at", "created_at")
      VALUES ('x', ${name}, ${purpose}::"enum_media_purpose", 'it-sweeper', now(), ${createdAt}::timestamptz)
      RETURNING "id"`);
    const id = Number((res.rows[0] as { id: number }).id);
    created.media.push(id);
    return id;
  }

  async function exists(id: number) {
    const res = await m.db.execute(
      m.sql`SELECT 1 FROM "media" WHERE "id" = ${id}`,
    );
    return res.rows.length > 0;
  }

  it("deletes only old, unlinked feed post images", async () => {
    const old = "2020-01-01T00:00:00Z";
    const unused = await image("feed-post", old);
    const linked = await image("feed-post", old);
    const young = await image("feed-post", new Date().toISOString());
    const shared = await image(null, old);
    const payload = await m.getPayloadClient();
    const post = await payload.create({
      collection: "feed-posts",
      data: {
        content: "linked",
        authorId: "it-sweeper",
        communityId: "it-sweep",
        topicSlug: "general",
        likeCount: 0,
        commentCount: 0,
        visibility: "community",
        image: linked,
      },
    });
    created.posts.push(post.id);

    // Deleting a media document also tries to delete its stored files,
    // which fails without S3 here; the document itself is still removed.
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let result: Awaited<ReturnType<typeof m.sweep>>;
    try {
      result = await m.sweep({ payload });
    } finally {
      error.mockRestore();
    }

    expect(await exists(unused)).toBe(false);
    expect(await exists(linked)).toBe(true);
    expect(await exists(young)).toBe(true);
    expect(await exists(shared)).toBe(true);
    expect(result.removed + result.failed).toBeGreaterThanOrEqual(1);
  });

  it("clears a post's picture when its image is deleted some other way", async () => {
    const linked = await image("feed-post", new Date().toISOString());
    const payload = await m.getPayloadClient();
    const post = await payload.create({
      collection: "feed-posts",
      data: {
        content: "linked",
        authorId: "it-sweeper",
        communityId: "it-sweep",
        topicSlug: "general",
        likeCount: 0,
        commentCount: 0,
        visibility: "community",
        image: linked,
      },
    });
    created.posts.push(post.id);
    expect(post.imageUrl).toBeTruthy();

    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await payload.delete({ collection: "media", id: linked });
    } finally {
      error.mockRestore();
    }

    const saved = await payload.findByID({
      collection: "feed-posts",
      id: post.id,
      depth: 0,
    });
    expect(saved.image ?? null).toBeNull();
    expect(saved.imageUrl ?? null).toBeNull();
  });
});
