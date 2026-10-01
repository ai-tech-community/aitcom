// @vitest-environment node
/**
 * DB-INTEGRATION test for migration 20261001c: it creates the picture list
 * (`feed_posts_rels`), copies each post's single picture into it, keeps
 * the old column for the deploy window, and lets a picture belong to one
 * post only.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/migrations/feed-post-pictures.integration.test.ts
 */
import type { sql as Sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20261001c_feed_post_pictures";

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
  "migration 20261001c feed post pictures [DB integration]",
  () => {
    let m: { db: typeof Db; sql: typeof Sql; up: typeof Up };
    const created = { posts: [] as number[], media: [] as number[] };

    beforeAll(async () => {
      const [{ db }, { sql }, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261001c_feed_post_pictures"),
      ]);
      m = { db, sql, up: migration.up };
      await m.up({ db } as unknown as Parameters<typeof Up>[0]);
    }, 120_000);

    afterEach(async () => {
      if (created.posts.length > 0) {
        await m.db.execute(
          m.sql`DELETE FROM "feed_posts" WHERE "id" IN ${created.posts}`,
        );
      }
      if (created.media.length > 0) {
        await m.db.execute(
          m.sql`DELETE FROM "media" WHERE "id" IN ${created.media}`,
        );
      }
      created.posts.length = 0;
      created.media.length = 0;
    });

    async function insertMedia() {
      const res = await m.db.execute(m.sql`
        INSERT INTO "media" ("alt", "filename", "purpose", "updated_at", "created_at")
        VALUES ('feed post image', ${`it-pics-${Date.now()}-${Math.random()}.png`}, 'feed-post', now(), now())
        RETURNING "id"`);
      const id = Number((res.rows[0] as { id: number }).id);
      created.media.push(id);
      return id;
    }

    async function insertPost(imageId: number | null) {
      const res = await m.db.execute(m.sql`
        INSERT INTO "feed_posts" ("content", "author_id", "image_id", "updated_at", "created_at")
        VALUES ('pictures', 'it-author', ${imageId}, now(), now())
        RETURNING "id"`);
      const id = Number((res.rows[0] as { id: number }).id);
      created.posts.push(id);
      return id;
    }

    async function listOf(postId: number) {
      const res = await m.db.execute(m.sql`
        SELECT "media_id", "order", "path" FROM "feed_posts_rels"
        WHERE "parent_id" = ${postId} ORDER BY "order"`);
      return res.rows;
    }

    it("copies a post's single picture into its list, once", async () => {
      const mediaId = await insertMedia();
      const postId = await insertPost(mediaId);
      await m.up({ db: m.db } as unknown as Parameters<typeof Up>[0]);
      await m.up({ db: m.db } as unknown as Parameters<typeof Up>[0]);
      expect(await listOf(postId)).toEqual([
        { media_id: mediaId, order: 1, path: "images" },
      ]);
      // The old column stays for the version still serving during deploy.
      const old = await m.db.execute(
        m.sql`SELECT "image_id" FROM "feed_posts" WHERE "id" = ${postId}`,
      );
      expect((old.rows[0] as { image_id: number }).image_id).toBe(mediaId);
    });

    it("lets a picture belong to one post only", async () => {
      const mediaId = await insertMedia();
      const first = await insertPost(null);
      const second = await insertPost(null);
      await m.db.execute(m.sql`
        INSERT INTO "feed_posts_rels" ("order", "parent_id", "path", "media_id")
        VALUES (1, ${first}, 'images', ${mediaId})`);
      await expect(
        m.db.execute(m.sql`
          INSERT INTO "feed_posts_rels" ("order", "parent_id", "path", "media_id")
          VALUES (1, ${second}, 'images', ${mediaId})`),
      ).rejects.toThrow();
    });

    it("clears the uploader's placeholder text from feed pictures only", async () => {
      const placeholder = await insertMedia();
      await m.db.execute(
        m.sql`UPDATE "media" SET "alt" = 'feed post image' WHERE "id" = ${placeholder}`,
      );
      const cover = await m.db.execute(m.sql`
        INSERT INTO "media" ("alt", "filename", "updated_at", "created_at")
        VALUES ('feed post image', ${`it-cover-${Date.now()}.png`}, now(), now())
        RETURNING "id"`);
      const coverId = Number((cover.rows[0] as { id: number }).id);
      created.media.push(coverId);
      await m.up({ db: m.db } as unknown as Parameters<typeof Up>[0]);
      const rows = await m.db.execute(m.sql`
        SELECT "id", "alt" FROM "media" WHERE "id" IN ${[placeholder, coverId]}
        ORDER BY "id"`);
      expect(rows.rows).toEqual([
        { id: placeholder, alt: "" },
        { id: coverId, alt: "feed post image" },
      ]);
    });
  },
);
