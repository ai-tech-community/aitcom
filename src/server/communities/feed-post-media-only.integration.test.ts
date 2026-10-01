// @vitest-environment node
/**
 * DB-INTEGRATION test for posts without words: a post that carries a
 * picture, GIF or video may have no text; any other post (and a poll)
 * needs some. Against a REAL local DB + Payload.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/communities/feed-post-media-only.integration.test.ts
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

describe.skipIf(!RUN_DB)("posts without words [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    getPayloadClient: typeof import("@/server/payload").getPayloadClient;
    eq: typeof import("drizzle-orm").eq;
    sql: typeof import("drizzle-orm").sql;
  };
  let m: Mods;
  let fx: { userId: string; communityId: string; slug: string };
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
    const userId = `it-mo-${suffix}`;
    await m.db
      .insert(m.schema.user)
      .values({ id: userId, email: `${userId}@example.test`, name: userId });
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({ name: `MO ${suffix}`, slug: `mo-${suffix}`, createdBy: userId })
      .returning({ id: m.schema.communities.id });
    await m.db.insert(m.schema.communityMemberships).values({
      communityId: community!.id,
      userId,
      role: "owner",
    });
    fx = { userId, communityId: community!.id, slug: `mo-${suffix}` };
  });

  afterEach(async () => {
    const payload = await m.getPayloadClient();
    // A picture's stored file cannot be removed without S3 here.
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const id of posts) {
        await payload
          .delete({ collection: "feed-posts", id })
          .catch(() => null);
      }
    } finally {
      log.mockRestore();
    }
    posts.length = 0;
    await m.db.execute(
      m.sql`DELETE FROM "media" WHERE "uploaded_by" = ${fx.userId}`,
    );
    await m.db
      .delete(m.schema.communityMemberships)
      .where(m.eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(m.eq(m.schema.communities.id, fx.communityId));
    await m.db.delete(m.schema.user).where(m.eq(m.schema.user.id, fx.userId));
  });

  function author() {
    return m.createCaller({
      db: m.db,
      session: { user: { id: fx.userId, name: "Tester" } } as never,
      headers: new Headers(),
    });
  }

  async function picture() {
    const res = await m.db.execute(m.sql`
      INSERT INTO "media" ("alt", "filename", "mime_type", "uploaded_by", "purpose", "updated_at", "created_at")
      VALUES ('', ${`it-mo-${Date.now()}-${Math.random()}.png`}, 'image/png', ${fx.userId}, 'feed-post', now(), now())
      RETURNING "id"`);
    return Number((res.rows[0] as { id: number }).id);
  }

  async function saved(id: number) {
    const payload = await m.getPayloadClient();
    return payload.findByID({ collection: "feed-posts", id, depth: 0 });
  }

  it("posts a picture without words, and keeps it wordless through an edit", async () => {
    const post = await author().feed.createPost({
      communitySlug: fx.slug,
      content: "",
      images: [{ id: await picture(), alt: "Our team" }],
    });
    posts.push(post.id);
    expect((await saved(post.id)).content).toBe("");

    await author().feed.editPost({
      postId: post.id,
      communitySlug: fx.slug,
      content: "Now with words",
    });
    await author().feed.editPost({
      postId: post.id,
      communitySlug: fx.slug,
      content: "",
    });
    expect((await saved(post.id)).content).toBe("");
  });

  it("refuses a post with neither words nor media, and a poll without its question", async () => {
    await expect(
      author().feed.createPost({ communitySlug: fx.slug, content: "  " }),
    ).rejects.toThrow(/Write something/);
    await expect(
      author().feed.createPost({
        communitySlug: fx.slug,
        content: "",
        poll: { options: ["Yes", "No"], days: 1 },
      }),
    ).rejects.toThrow(/Write something/);

    const text = await author().feed.createPost({
      communitySlug: fx.slug,
      content: "Just words",
    });
    posts.push(text.id);
    await expect(
      author().feed.editPost({
        postId: text.id,
        communitySlug: fx.slug,
        content: "",
      }),
    ).rejects.toThrow(/Write something/);

    // A picture without a description says nothing to a screen reader.
    await expect(
      author().feed.createPost({
        communitySlug: fx.slug,
        content: "",
        images: [{ id: await picture(), alt: "  " }],
      }),
    ).rejects.toThrow(/Write something/);

    // Taking the only picture off a wordless post is refused too.
    const pic = await author().feed.createPost({
      communitySlug: fx.slug,
      content: "",
      images: [{ id: await picture(), alt: "Desk" }],
    });
    posts.push(pic.id);
    await expect(
      author().feed.editPost({
        postId: pic.id,
        communitySlug: fx.slug,
        content: "",
        media: { kind: "none" },
      }),
    ).rejects.toThrow(/Write something/);

    // The collection's own rule holds for every other writer too.
    const payload = await m.getPayloadClient();
    await expect(
      payload.update({
        collection: "feed-posts",
        id: text.id,
        data: { content: "" },
      }),
    ).rejects.toThrow(/Content/);
  });

  it("removes a wordless post when an admin deletes its only picture", async () => {
    const mediaId = await picture();
    const post = await author().feed.createPost({
      communitySlug: fx.slug,
      content: "",
      images: [{ id: mediaId, alt: "Our team" }],
    });
    posts.push(post.id);
    const payload = await m.getPayloadClient();
    // The stored file cannot be removed without S3 here.
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await payload.delete({ collection: "media", id: mediaId });
    } finally {
      log.mockRestore();
    }
    const after = await saved(post.id);
    expect(after.isDeleted).toBe(true);
    expect(after.images).toEqual([]);
  });
});
