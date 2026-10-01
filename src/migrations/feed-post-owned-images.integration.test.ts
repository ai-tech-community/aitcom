// @vitest-environment node
/**
 * DB-INTEGRATION test for migration 20261001a: it adds the owned-image
 * columns and links each post whose `image_url` is one of our uploads to
 * that upload, making it the author's feed post image. Other URLs stay.
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false \
 *     NEON_LOCAL_PROXY=127.0.0.1:5433 \
 *     DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test \
 *     pnpm exec vitest run src/migrations/feed-post-owned-images.integration.test.ts
 */
import type { sql as Sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20261001a_feed_post_owned_images";

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
  "migration 20261001a feed post owned images [DB integration]",
  () => {
    let m: { db: typeof Db; sql: typeof Sql; up: typeof Up };
    const created = { posts: [] as number[], media: [] as number[] };

    beforeAll(async () => {
      const [{ db }, { sql }, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261001a_feed_post_owned_images"),
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

    async function insertMedia(filename: string, alt = "feed post image") {
      const res = await m.db.execute(m.sql`
        INSERT INTO "media" ("alt", "filename", "updated_at", "created_at")
        VALUES (${alt}, ${filename}, now(), now()) RETURNING "id"`);
      const id = Number((res.rows[0] as { id: number }).id);
      created.media.push(id);
      return id;
    }

    async function insertPost(imageUrl: string) {
      const res = await m.db.execute(m.sql`
        INSERT INTO "feed_posts" ("content", "author_id", "image_url", "updated_at", "created_at")
        VALUES ('with a picture', 'it-author', ${imageUrl}, now(), now())
        RETURNING "id"`);
      const id = Number((res.rows[0] as { id: number }).id);
      created.posts.push(id);
      return id;
    }

    it("links a post to its upload and gives the upload to the author", async () => {
      const name = `it-${Date.now()}.png`;
      const mediaId = await insertMedia(name);
      const ours = await insertPost(
        `https://bucket.s3.eu-central-1.amazonaws.com/${name}`,
      );
      const outside = await insertPost("https://example.com/pixel.png");

      await m.up({ db: m.db } as unknown as Parameters<typeof Up>[0]);

      const posts = await m.db.execute(m.sql`
        SELECT "id", "image_id", "image_url" FROM "feed_posts"
        WHERE "id" IN ${[ours, outside]} ORDER BY "id"`);
      expect(posts.rows).toEqual([
        {
          id: ours,
          image_id: mediaId,
          image_url: `https://bucket.s3.eu-central-1.amazonaws.com/${name}`,
        },
        {
          id: outside,
          image_id: null,
          image_url: "https://example.com/pixel.png",
        },
      ]);
      const media = await m.db.execute(m.sql`
        SELECT "purpose", "uploaded_by" FROM "media" WHERE "id" = ${mediaId}`);
      expect(media.rows[0]).toEqual({
        purpose: "feed-post",
        uploaded_by: "it-author",
      });
    });

    it("leaves shared pictures alone: other uploads, a URL two posts show, a linked cover", async () => {
      const url = (name: string) =>
        `https://bucket.s3.eu-central-1.amazonaws.com/${name}`;
      const stamp = Date.now();
      const cover = await insertMedia(`it-cover-${stamp}.png`, "Event cover");
      const coverPost = await insertPost(url(`it-cover-${stamp}.png`));
      const twice = await insertMedia(`it-twice-${stamp}.png`);
      const first = await insertPost(url(`it-twice-${stamp}.png`));
      const second = await insertPost(url(`it-twice-${stamp}.png`));
      const speakerPhoto = await insertMedia(`it-photo-${stamp}.png`);
      const photoPost = await insertPost(url(`it-photo-${stamp}.png`));
      const speaker = await m.db.execute(m.sql`
        INSERT INTO "speakers" ("name", "photo_id", "updated_at", "created_at")
        VALUES ('it speaker', ${speakerPhoto}, now(), now()) RETURNING "id"`);
      const speakerId = Number((speaker.rows[0] as { id: number }).id);
      try {
        await m.up({ db: m.db } as unknown as Parameters<typeof Up>[0]);
        const posts = await m.db.execute(m.sql`
          SELECT "image_id" FROM "feed_posts"
          WHERE "id" IN ${[coverPost, first, second, photoPost]}`);
        expect(
          posts.rows.map((r) => (r as { image_id: unknown }).image_id),
        ).toEqual([null, null, null, null]);
        const media = await m.db.execute(m.sql`
          SELECT "purpose" FROM "media" WHERE "id" IN ${[cover, twice, speakerPhoto]}`);
        expect(
          media.rows.map((r) => (r as { purpose: unknown }).purpose),
        ).toEqual([null, null, null]);
      } finally {
        await m.db.execute(
          m.sql`DELETE FROM "speakers" WHERE "id" = ${speakerId}`,
        );
      }
    });

    it("is safe to run again", async () => {
      await m.up({ db: m.db } as unknown as Parameters<typeof Up>[0]);
      await m.up({ db: m.db } as unknown as Parameters<typeof Up>[0]);
    });
  },
);
