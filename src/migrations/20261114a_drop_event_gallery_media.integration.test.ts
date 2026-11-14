// @vitest-environment node
// DB integration for migration 20261114a, called exactly like the deploy
// runner (`{ db }` only). Every case runs inside a transaction that is
// rolled back, so other suites' rows and the schema are left as found.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type * as Migration from "./20261114a_drop_event_gallery_media";

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
  "migration 20261114a drop event gallery media [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let migration: typeof Migration;

    beforeAll(async () => {
      const [dbMod, drizzle, mod] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261114a_drop_event_gallery_media"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      migration = mod;
    }, 120_000);

    async function insertEvent(tx: Tx): Promise<number> {
      const res = await tx.execute(sql`
        INSERT INTO "events" ("slug")
        VALUES (${`it-drop-gallery-${Date.now()}-${Math.random()}`})
        RETURNING "id"`);
      return Number((res.rows[0] as { id: number }).id);
    }

    /** media_id with its index and foreign key, on both rels tables. */
    async function mediaShape(tx: Tx) {
      const cols = await tx.execute(sql`
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('events_rels', '_events_v_rels')
          AND column_name = 'media_id'
        ORDER BY table_name`);
      const idx = await tx.execute(sql`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN ('events_rels_media_id_idx', '_events_v_rels_media_id_idx')
        ORDER BY indexname`);
      const fks = await tx.execute(sql`
        SELECT conname, confdeltype FROM pg_constraint
        WHERE conname IN ('events_rels_media_fk', '_events_v_rels_media_fk')
        ORDER BY conname`);
      return { columns: cols.rows, indexes: idx.rows, fks: fks.rows };
    }

    /** The schema production has before this migration (via its own `down`). */
    async function beforeMigration(tx: Tx) {
      await migration.down({ db: tx } as never);
    }

    it("refuses while the live table still links event pictures", async () => {
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
    });

    it("refuses while only a saved version still links event pictures", async () => {
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

    it("drops media_id, its index and foreign key, can run again, and down restores them", async () => {
      const rollback = new Error("rollback migration exercise");
      await expect(
        db.transaction(async (tx) => {
          await beforeMigration(tx);
          expect(await mediaShape(tx)).toEqual({
            columns: [
              { table_name: "_events_v_rels" },
              { table_name: "events_rels" },
            ],
            indexes: [
              { indexname: "_events_v_rels_media_id_idx" },
              { indexname: "events_rels_media_id_idx" },
            ],
            fks: [
              { conname: "_events_v_rels_media_fk", confdeltype: "c" },
              { conname: "events_rels_media_fk", confdeltype: "c" },
            ],
          });

          await migration.up({ db: tx } as never);
          // A failed deploy re-runs it.
          await migration.up({ db: tx } as never);
          expect(await mediaShape(tx)).toEqual({
            columns: [],
            indexes: [],
            fks: [],
          });

          await migration.down({ db: tx } as never);
          expect((await mediaShape(tx)).fks).toEqual([
            { conname: "_events_v_rels_media_fk", confdeltype: "c" },
            { conname: "events_rels_media_fk", confdeltype: "c" },
          ]);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });
  },
);
