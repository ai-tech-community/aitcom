// @vitest-environment node
// DB integration for migration 20261113b, called exactly like the deploy
// runner (`{ db }` only). Every case runs inside a transaction that is
// rolled back, so other suites' rows and the schema are left as found.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type * as Migration from "./20261113b_gallery_feed_posts";

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

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261113b gallery feed posts [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let migration: typeof Migration;

    beforeAll(async () => {
      const [dbMod, drizzle, mod] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261113b_gallery_feed_posts"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      migration = mod;
    }, 120_000);

    async function insertEvent(tx: Tx): Promise<number> {
      const res = await tx.execute(sql`
        INSERT INTO "events" ("slug")
        VALUES (${`it-gallery-${Date.now()}-${Math.random()}`})
        RETURNING "id"`);
      return Number((res.rows[0] as { id: number }).id);
    }

    async function columns(tx: Tx) {
      const res = await tx.execute(sql`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND ((table_name IN ('events_rels', '_events_v_rels') AND column_name = 'media_id')
            OR (table_name = 'feed_posts' AND column_name = 'gallery_batch_id'))
        ORDER BY table_name`);
      return res.rows;
    }

    /**
     * The schema production has before this migration: no feed post link,
     * and `media_id` (with its index and foreign key) on both events rels
     * tables. `down` no longer touches `media_id`, and a test database that
     * ran an earlier draft of this migration may lack it, so put it back.
     */
    async function beforeMigration(tx: Tx) {
      await migration.down({ db: tx } as never);
      await tx.execute(sql`
        ALTER TABLE "events_rels" ADD COLUMN IF NOT EXISTS "media_id" integer;
        CREATE INDEX IF NOT EXISTS "events_rels_media_id_idx" ON "events_rels" USING btree ("media_id");
        DO $$ BEGIN
          ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_media_fk"
            FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
        ALTER TABLE "_events_v_rels" ADD COLUMN IF NOT EXISTS "media_id" integer;
        CREATE INDEX IF NOT EXISTS "_events_v_rels_media_id_idx" ON "_events_v_rels" USING btree ("media_id");
        DO $$ BEGIN
          ALTER TABLE "_events_v_rels" ADD CONSTRAINT "_events_v_rels_media_fk"
            FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
    }

    it("refuses to drop an event gallery that still has pictures", async () => {
      await expect(
        db.transaction(async (tx) => {
          await beforeMigration(tx);
          const eventId = await insertEvent(tx);
          await tx.execute(sql`
            INSERT INTO "events_rels" ("order", "parent_id", "path")
            VALUES (1, ${eventId}, 'gallery')`);
          await migration.up({ db: tx } as never);
        }),
      ).rejects.toThrow(/events gallery not empty: events_rels/);
      // Rolled back: the refused run changed nothing it could not undo.
      const leftover = await db.execute(sql`
        SELECT 1 FROM "events_rels" WHERE "path" = 'gallery'`);
      expect(leftover.rows).toEqual([]);
    });

    it("refuses when only a saved version still has pictures", async () => {
      await expect(
        db.transaction(async (tx) => {
          await beforeMigration(tx);
          const eventId = await insertEvent(tx);
          const version = await tx.execute(sql`
            INSERT INTO "_events_v" ("parent_id") VALUES (${eventId})
            RETURNING "id"`);
          const versionId = Number((version.rows[0] as { id: number }).id);
          await tx.execute(sql`
            INSERT INTO "_events_v_rels" ("order", "parent_id", "path")
            VALUES (1, ${versionId}, 'version.gallery')`);
          await migration.up({ db: tx } as never);
        }),
      ).rejects.toThrow(/events gallery not empty: _events_v_rels/);
    });

    it("adds the feed post link, keeps media_id for the old deploy, and can run again", async () => {
      const rollback = new Error("rollback migration exercise");
      await expect(
        db.transaction(async (tx) => {
          await beforeMigration(tx);
          expect(await columns(tx)).toEqual([
            { table_name: "_events_v_rels", column_name: "media_id" },
            { table_name: "events_rels", column_name: "media_id" },
          ]);

          await migration.up({ db: tx } as never);
          // A failed deploy re-runs it.
          await migration.up({ db: tx } as never);
          // The old deployment still serves during the build and reads
          // media_id: this deploy only adds. A follow-up drops it.
          expect(await columns(tx)).toEqual([
            { table_name: "_events_v_rels", column_name: "media_id" },
            { table_name: "events_rels", column_name: "media_id" },
            { table_name: "feed_posts", column_name: "gallery_batch_id" },
          ]);
          const mediaFks = await tx.execute(sql`
            SELECT conname FROM pg_constraint
            WHERE conname IN ('events_rels_media_fk', '_events_v_rels_media_fk')
            ORDER BY conname`);
          expect(mediaFks.rows).toEqual([
            { conname: "_events_v_rels_media_fk" },
            { conname: "events_rels_media_fk" },
          ]);

          const indexes = await tx.execute(sql`
            SELECT indexdef FROM pg_indexes
            WHERE schemaname = 'public' AND indexname = 'feed_posts_gallery_batch_idx'`);
          expect(indexes.rows).toEqual([
            {
              indexdef: expect.stringMatching(
                /CREATE UNIQUE INDEX .* \(gallery_batch_id\)/,
              ),
            },
          ]);
          const fk = await tx.execute(sql`
            SELECT confdeltype FROM pg_constraint
            WHERE conname = 'feed_posts_gallery_batch_id_gallery_batches_id_fk'`);
          expect(fk.rows).toEqual([{ confdeltype: "n" }]);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });
  },
);
