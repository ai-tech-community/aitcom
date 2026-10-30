// @vitest-environment node
// DB integration for migration 20261026a (community magazines), called like
// the deploy runner (`{ db }` only) and twice, since a failed deploy re-runs
// it; then down and up again. This is also how the local test database gets
// the tables: it refuses any database but aitcom_test, and leaves them in
// place. Auto-skips unless RUN_DB_TESTS=1 and a local database is set.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { down as Down, up as Up } from "./20261026a_magazines";
import type * as PlatformItems from "./20261026b_magazine_platform_items";
import type * as Staff from "./20261027a_magazine_staff";
import * as subscriptions from "./20261027b_magazine_subscriptions";
import * as autoDraft from "./20261027c_magazine_auto_draft";
import * as followups from "./20261027d_magazine_auto_draft_followups";
import * as growth from "./20261028a_magazine_growth";

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

const EXPECTED_COLUMNS = [
  "magazines.community_id",
  "magazine_issues.visibility",
  "articles.magazine_id",
  "articles.magazine_issue_id",
  "_articles_v.version_magazine_id",
  "_articles_v.version_magazine_issue_id",
  "payload_locked_documents_rels.magazines_id",
  "payload_locked_documents_rels.magazine_issues_id",
  "app.magazine_article_credit.article_id",
  "app.magazine_article_credit.credited_at",
];

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261026a magazines [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;
    let down: typeof Down;
    let platformItems: typeof PlatformItems;
    let staff: typeof Staff;

    /** "table.column" for each expected column the database has. */
    async function presentColumns(
      on: Pick<typeof Db, "execute"> = db,
    ): Promise<string[]> {
      const { rows } = await on.execute<{ key: string }>(sql`
        SELECT
          CASE WHEN table_schema = 'public' THEN '' ELSE table_schema || '.' END
            || table_name || '.' || column_name AS key
        FROM information_schema.columns
        WHERE (
          table_schema = 'public'
          AND table_name IN (
            'magazines', 'magazine_issues', 'articles', '_articles_v',
            'payload_locked_documents_rels'
          )
        ) OR (table_schema = 'app' AND table_name = 'magazine_article_credit')
      `);
      const have = new Set(rows.map((r) => r.key));
      return EXPECTED_COLUMNS.filter((key) => have.has(key));
    }

    /** Runs `body`, expecting a unique violation; rolls everything back. */
    async function expectUniqueViolation(
      body: (tx: Pick<typeof Db, "execute">) => Promise<void>,
    ) {
      const rollback = new Error("rollback");
      let caught: unknown;
      try {
        await db.transaction(async (tx) => {
          try {
            await body(tx);
          } catch (err) {
            caught = err;
          }
          throw rollback;
        });
      } catch (err) {
        if (err !== rollback) throw err;
      }
      const code =
        (caught as { code?: string; cause?: { code?: string } } | undefined)
          ?.code ?? (caught as { cause?: { code?: string } })?.cause?.code;
      expect(code).toBe("23505");
    }

    beforeAll(async () => {
      const [dbMod, drizzle, migration, platformMigration, staffMigration] =
        await Promise.all([
          import("@/server/db"),
          import("drizzle-orm"),
          import("./20261026a_magazines"),
          import("./20261026b_magazine_platform_items"),
          import("./20261027a_magazine_staff"),
        ]);
      db = dbMod.db;
      sql = drizzle.sql;
      up = migration.up;
      down = migration.down;
      platformItems = platformMigration;
      staff = staffMigration;
      const { rows } = await db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test") {
        throw new Error(
          `Refusing to migrate "${rows[0]?.name}"; use aitcom_test.`,
        );
      }
    }, 120_000);

    it("creates the tables and article columns and can run twice", async () => {
      await up({ db } as never);
      await up({ db } as never);

      expect(await presentColumns()).toEqual(EXPECTED_COLUMNS);
    });

    it("enforces one magazine per community and unique issue slugs per magazine", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const insertMagazine = (
        tx: Pick<typeof Db, "execute">,
        slug: string,
        communityId: string,
      ) =>
        tx.execute<{ id: number }>(sql`
          INSERT INTO "magazines" ("name", "slug", "community_id", "created_by")
          VALUES ('Test magazine', ${slug}, ${communityId}, 'user-test')
          RETURNING "id"
        `);

      await expectUniqueViolation(async (tx) => {
        await insertMagazine(tx, `mag-a-${suffix}`, `community-${suffix}`);
        await insertMagazine(tx, `mag-b-${suffix}`, `community-${suffix}`);
      });

      await expectUniqueViolation(async (tx) => {
        const { rows } = await insertMagazine(
          tx,
          `mag-c-${suffix}`,
          `community-c-${suffix}`,
        );
        const magazineId = rows[0]!.id;
        for (const number of [1, 2]) {
          await tx.execute(sql`
            INSERT INTO "magazine_issues"
              ("magazine_id", "community_id", "number", "slug")
            VALUES (${magazineId}, ${`community-c-${suffix}`}, ${number}, 'first-issue')
          `);
        }
      });

      const { rows } = await db.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM "magazines" WHERE "slug" LIKE ${`%-${suffix}`}
      `);
      expect(rows[0]?.n).toBe(0);
    });

    it("down removes the tables and columns, up restores them", async () => {
      // Roll back dependent migrations first, in reverse deployment order.
      // Roll back the exercise itself too: concurrent suites keep their rows.
      const rollback = new Error("rollback migration exercise");
      await expect(
        db.transaction(async (tx) => {
          await growth.down({ db: tx } as never);
          await autoDraft.down({ db: tx } as never);
          await subscriptions.down({ db: tx } as never);
          await staff.down({ db: tx } as never);
          await platformItems.down({ db: tx } as never);
          await down({ db: tx } as never);
          expect(await presentColumns(tx)).toEqual([]);
          const { rows } = await tx.execute<{ n: number }>(sql`
          SELECT count(*)::int AS n FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'magazine%'
        `);
          expect(rows[0]?.n).toBe(0);
          await up({ db: tx } as never);
          expect(await presentColumns(tx)).toEqual(EXPECTED_COLUMNS);
          await platformItems.up({ db: tx } as never);
          await staff.up({ db: tx } as never);
          await subscriptions.up({ db: tx } as never);
          await autoDraft.up({ db: tx } as never);
          await followups.up({ db: tx } as never);
          await growth.up({ db: tx } as never);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      // The test database keeps the tables for every other suite.
      expect(await presentColumns()).toEqual(EXPECTED_COLUMNS);
    });
  },
);
