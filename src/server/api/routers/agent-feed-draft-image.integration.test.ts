// @vitest-environment node
/**
 * DB-INTEGRATION test for publishing an agent's feed post draft with a
 * picture (#388). The picture is copied into our storage before the draft
 * is claimed: a picture that cannot be loaded leaves the draft pending, and
 * a published post links the copy (its URL written by the collection hook).
 * The download itself is faked; feed-images.test.ts covers it.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/server/api/routers/agent-feed-draft-image.integration.test.ts
 */
import { TRPCError } from "@trpc/server";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const importFeedImage = vi.hoisted(() => vi.fn());
vi.mock("@/server/communities/feed-images", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/communities/feed-images")
  >()),
  importFeedImage,
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

describe.skipIf(!RUN_DB)(
  "agent feed draft with a picture [DB integration]",
  () => {
    type Mods = {
      db: typeof import("@/server/db").db;
      schema: typeof import("@/server/db/schema");
      createCaller: typeof import("@/server/api/root").createCaller;
      getPayloadClient: typeof import("@/server/payload").getPayloadClient;
      eq: typeof import("drizzle-orm").eq;
      sql: typeof import("drizzle-orm").sql;
    };
    let m: Mods;
    let fx: {
      userId: string;
      agentId: string;
      draftId: string;
      community: string;
    };
    const cleanup = { posts: [] as number[], media: [] as number[] };

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
      const { db, schema } = m;
      const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
      const userId = `it-draft-${suffix}`;
      await db
        .insert(schema.user)
        .values({ id: userId, email: `${userId}@example.test`, name: "Owner" });
      const [agent] = await db
        .insert(schema.agentProfiles)
        .values({ ownerId: userId, name: `Agent ${suffix}` })
        .returning({ id: schema.agentProfiles.id });
      const community = `c-${suffix}`;
      const [draft] = await db
        .insert(schema.agentDrafts)
        .values({
          agentId: agent!.id,
          ownerId: userId,
          type: "feed_post",
          targetType: "community",
          targetId: community,
          content: "Look at this",
          metadata: { imageUrl: "https://cdn.example/p.png" },
        })
        .returning({ id: schema.agentDrafts.id });
      fx = { userId, agentId: agent!.id, draftId: draft!.id, community };
    });

    afterEach(async () => {
      const { db, schema, eq, sql } = m;
      const payload = await m.getPayloadClient();
      for (const id of cleanup.posts) {
        await payload
          .delete({ collection: "feed-posts", id })
          .catch(() => null);
      }
      if (cleanup.media.length > 0) {
        await db.execute(
          sql`DELETE FROM "media" WHERE "id" IN ${cleanup.media}`,
        );
      }
      cleanup.posts.length = 0;
      cleanup.media.length = 0;
      await db
        .delete(schema.agentDrafts)
        .where(eq(schema.agentDrafts.id, fx.draftId));
      await db
        .delete(schema.agentProfiles)
        .where(eq(schema.agentProfiles.id, fx.agentId));
      await db.delete(schema.user).where(eq(schema.user.id, fx.userId));
      importFeedImage.mockReset();
    });

    function owner() {
      return m.createCaller({
        db: m.db,
        session: { user: { id: fx.userId, name: "Owner" } } as never,
        headers: new Headers(),
      });
    }

    async function draftStatus() {
      const [row] = await m.db
        .select({ status: m.schema.agentDrafts.status })
        .from(m.schema.agentDrafts)
        .where(m.eq(m.schema.agentDrafts.id, fx.draftId));
      return row?.status;
    }

    it("publishes the post with the copied picture", async () => {
      const name = `it-draft-${Date.now()}.png`;
      const res = await m.db.execute(m.sql`
      INSERT INTO "media" ("alt", "filename", "url", "uploaded_by", "purpose", "updated_at", "created_at")
      VALUES ('Feed post image', ${name}, ${`https://ours.test/${name}`}, ${fx.userId}, 'feed-post', now(), now())
      RETURNING "id"`);
      const mediaId = Number((res.rows[0] as { id: number }).id);
      cleanup.media.push(mediaId);
      importFeedImage.mockResolvedValue({
        id: mediaId,
        url: `https://ours.test/${name}`,
      });

      await owner().agentManagement.reviewDraft({
        draftId: fx.draftId,
        action: "approved",
      });

      expect(importFeedImage).toHaveBeenCalledWith(expect.anything(), {
        url: "https://cdn.example/p.png",
        userId: fx.userId,
      });
      const payload = await m.getPayloadClient();
      const { docs } = await payload.find({
        collection: "feed-posts",
        where: { communityId: { equals: fx.community } },
        depth: 0,
      });
      cleanup.posts.push(...docs.map((d) => d.id));
      expect(docs).toHaveLength(1);
      expect(docs[0]!.image).toBe(mediaId);
      expect(docs[0]!.imageUrl).toMatch(new RegExp(`${name}$`));
      expect(await draftStatus()).toBe("approved");
    });

    it("leaves the draft pending when the picture cannot be loaded", async () => {
      importFeedImage.mockRejectedValue(
        new TRPCError({
          code: "BAD_REQUEST",
          message: "We couldn't load the picture",
        }),
      );
      await expect(
        owner().agentManagement.reviewDraft({
          draftId: fx.draftId,
          action: "approved",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await draftStatus()).toBe("pending");
      const payload = await m.getPayloadClient();
      const { totalDocs } = await payload.count({
        collection: "feed-posts",
        where: { communityId: { equals: fx.community } },
      });
      expect(totalDocs).toBe(0);
    });
  },
);
