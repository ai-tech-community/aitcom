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

    it("refuses to drop an event gallery that still has pictures", async () => {
      await expect(
        db.transaction(async (tx) => {
          // The state before this migration: media_id still exists.
          await migration.down({ db: tx } as never);
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
          await migration.down({ db: tx } as never);
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

    it("adds the feed post link, drops media_id, and can run again", async () => {
      const rollback = new Error("rollback migration exercise");
      await expect(
        db.transaction(async (tx) => {
          await migration.down({ db: tx } as never);
          expect(await columns(tx)).toEqual([
            { table_name: "_events_v_rels", column_name: "media_id" },
            { table_name: "events_rels", column_name: "media_id" },
          ]);

          await migration.up({ db: tx } as never);
          // A failed deploy re-runs it, with media_id already gone.
          await migration.up({ db: tx } as never);
          expect(await columns(tx)).toEqual([
            { table_name: "feed_posts", column_name: "gallery_batch_id" },
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
