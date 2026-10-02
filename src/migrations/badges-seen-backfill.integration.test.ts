// @vitest-environment node
// DB integration for migration 20261002c, called exactly like the deploy
// runner (`{ db }` only) and twice, since a failed deploy re-runs it.
//
// The migration updates every unseen row in the database, so the test runs
// it inside a transaction that it rolls back: other test files writing
// badge rows at the same time are never touched.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20261002c_badges_seen_backfill";

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

class Rollback extends Error {}

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261002c badges seen backfill [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const member = `bsb-member-${suffix}`;

    beforeAll(async () => {
      if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
        throw new Error("Refusing to run against a cloud Neon DATABASE_URL.");
      }
      const [dbMod, drizzle, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261002c_badges_seen_backfill"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      up = migration.up;
      await db.execute(sql`
        INSERT INTO "app"."user" (id, email, name)
        VALUES (${member}, ${`${member}@example.test`}, ${member})`);
    }, 120_000);

    afterAll(async () => {
      if (!db) return;
      await db.execute(
        sql`DELETE FROM "app"."member_badge" WHERE user_id = ${member}`,
      );
      await db.execute(
        sql`DELETE FROM "app"."member_award" WHERE user_id = ${member}`,
      );
      await db.execute(sql`DELETE FROM "app"."user" WHERE id = ${member}`);
    });

    it("marks every unseen badge and award seen at its earned date, keeps seen rows, and can run again", async () => {
      const earned = new Date("2026-03-01T10:00:00Z");
      const seenBefore = new Date("2026-04-01T10:00:00Z");
      let after: Record<string, unknown>[] = [];

      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`
            INSERT INTO "app"."member_badge" (id, user_id, badge_slug, earned_at, seen_at)
            VALUES
              (${`${member}-b1`}, ${member}, 'first_event', ${earned}, NULL),
              (${`${member}-b2`}, ${member}, 'regular', ${earned}, ${seenBefore})`);
          await tx.execute(sql`
            INSERT INTO "app"."member_award" (id, user_id, challenge_id, label, earned_at, seen_at)
            VALUES (${`${member}-a1`}, ${member}, 1, 'Winner', ${earned}, NULL)`);

          await up({ db: tx } as never);
          await up({ db: tx } as never);

          const rows = await tx.execute(sql`
            SELECT id, seen_at FROM "app"."member_badge" WHERE user_id = ${member}
            UNION ALL
            SELECT id, seen_at FROM "app"."member_award" WHERE user_id = ${member}
            ORDER BY id`);
          after = rows.rows;
          const unseen = await tx.execute(sql`
            SELECT
              (SELECT count(*)::int FROM "app"."member_badge" WHERE seen_at IS NULL) AS badges,
              (SELECT count(*)::int FROM "app"."member_award" WHERE seen_at IS NULL) AS awards`);
          expect(unseen.rows[0]).toEqual({ badges: 0, awards: 0 });
          throw new Rollback();
        }),
      ).rejects.toBeInstanceOf(Rollback);

      const at = (value: unknown) => new Date(value as string).toISOString();
      expect(after.map((row) => [row.id, at(row.seen_at)])).toEqual([
        [`${member}-a1`, earned.toISOString()],
        [`${member}-b1`, earned.toISOString()],
        [`${member}-b2`, seenBefore.toISOString()],
      ]);
    });
  },
);
