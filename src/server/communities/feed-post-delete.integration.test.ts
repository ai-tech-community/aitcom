// @vitest-environment node
/**
 * DB-INTEGRATION test for deleting feed posts (`feed.deletePost`) and a
 * moderator removing one (`reviewReport`), against a REAL local DB +
 * Payload. Both empty the post's text, which the collection's required
 * check used to refuse, so no post could be deleted.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/feed-post-delete.integration.test.ts
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

describe.skipIf(!RUN_DB)("deleting feed posts [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    eq: typeof import("drizzle-orm").eq;
    sql: typeof import("drizzle-orm").sql;
  };
  let m: Mods;
  let fx: { userId: string; communityId: string };
  const posts: number[] = [];

  beforeAll(async () => {
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
    }
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
      eq: drizzle.eq,
      sql: drizzle.sql,
    };
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const userId = `it-del-${suffix}`;
    await m.db
      .insert(m.schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: userId });
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({
        name: `Del ${suffix}`,
        slug: `del-${suffix}`,
        createdBy: userId,
      })
      .returning({ id: m.schema.communities.id });
    await m.db.insert(m.schema.communityMemberships).values({
      communityId: community!.id,
      userId,
      role: "owner",
    });
    fx = { userId, communityId: community!.id };
  });

  afterEach(async () => {
    const payload = await m.getPayloadClient();
    for (const id of posts) {
      await payload.delete({ collection: "feed-posts", id }).catch(() => null);
    }
    posts.length = 0;
    await m.db
      .delete(m.schema.communityMemberships)
      .where(m.eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(m.eq(m.schema.communities.id, fx.communityId));
    await m.db.delete(m.schema.user).where(m.eq(m.schema.user.id, fx.userId));
  });

  async function post(extra: Record<string, unknown> = {}) {
    const payload = await m.getPayloadClient();
    const created = await payload.create({
      collection: "feed-posts",
      data: {
        content: "To be deleted",
        authorId: fx.userId,
        authorName: "Tester",
        communityId: fx.communityId,
        topicSlug: "general",
        likeCount: 0,
        commentCount: 0,
        visibility: "community",
        ...extra,
      } as never,
    });
    posts.push(created.id);
    return created.id;
  }

  function author() {
    return m.createCaller({
      db: m.db,
      session: { user: { id: fx.userId, name: "Tester" } } as never,
      headers: new Headers(),
    });
  }

  it("deletes a post, emptying its text", async () => {
    const id = await post();
    await expect(author().feed.deletePost({ postId: id })).resolves.toEqual({
      id,
    });
    const payload = await m.getPayloadClient();
    const saved = await payload.findByID({
      collection: "feed-posts",
      id,
      depth: 0,
    });
    expect(saved.isDeleted).toBe(true);
    expect(saved.content).toBe("");
  });

  it("deletes a post with a picture, and its upload", async () => {
    const res = await m.db.execute(m.sql`
      INSERT INTO "media" ("alt", "filename", "mime_type", "uploaded_by", "purpose", "updated_at", "created_at")
      VALUES ('', ${`it-del-${Date.now()}.png`}, 'image/png', ${fx.userId}, 'feed-post', now(), now())
      RETURNING "id"`);
    const mediaId = Number((res.rows[0] as { id: number }).id);
    const id = await post({ images: [mediaId] });
    // The picture's stored file cannot be removed without S3 here.
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await author().feed.deletePost({ postId: id });
    } finally {
      log.mockRestore();
    }
    const gone = await m.db.execute(
      m.sql`SELECT 1 FROM "media" WHERE "id" = ${mediaId}`,
    );
    expect(gone.rows).toHaveLength(0);
  });

  it("still requires text on a live post", async () => {
    const id = await post();
    const payload = await m.getPayloadClient();
    await expect(
      payload.update({ collection: "feed-posts", id, data: { content: "" } }),
    ).rejects.toThrow(/Content/);
  });
});
