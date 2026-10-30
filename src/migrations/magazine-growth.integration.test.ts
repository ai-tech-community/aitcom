// @vitest-environment node
// Exercises the deploy runner's { db } contract on aitcom_test only.
import type { SQL, sql as Sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type * as Migration from "./20261028a_magazine_growth";

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

const COLUMNS = [
  "listing_hidden",
  "listing_hidden_at",
  "listing_hidden_by",
  "source_issue_id",
];

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261028a magazine growth [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let migration: typeof Migration;
    let magazineId: number;
    let issueId: number;
    let articleIds: number[];

    async function presentColumns(on: Pick<typeof Db, "execute"> = db) {
      const { rows } = await on.execute<{ name: string }>(sql`
      SELECT column_name AS name FROM information_schema.columns
      WHERE (table_schema = 'public' AND table_name = 'magazines' AND column_name IN ('listing_hidden', 'listing_hidden_at', 'listing_hidden_by'))
         OR (table_schema = 'app' AND table_name = 'magazine_subscription' AND column_name = 'source_issue_id')
      ORDER BY column_name
    `);
      return rows.map((row) => row.name);
    }

    async function hasReadTable(on: Pick<typeof Db, "execute"> = db) {
      const { rows } = await on.execute(sql`
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'app' AND table_name = 'magazine_read'
    `);
      return rows.length === 1;
    }

    async function expectViolation(statement: SQL, expectedCode: string) {
      let caught: unknown;
      try {
        await db.transaction(async (tx) => {
          await tx.execute(statement);
        });
      } catch (error) {
        caught = error;
      }
      const error = caught as
        | { code?: string; cause?: { code?: string } }
        | undefined;
      expect(error?.code ?? error?.cause?.code).toBe(expectedCode);
    }

    beforeAll(async () => {
      const [database, drizzle, growth] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261028a_magazine_growth"),
      ]);
      db = database.db;
      sql = drizzle.sql;
      migration = growth;
      const { rows } = await db.execute<{ name: string }>(
        sql`SELECT current_database() AS name`,
      );
      if (rows[0]?.name !== "aitcom_test")
        throw new Error(
          `Refusing to migrate "${rows[0]?.name}"; use aitcom_test.`,
        );
      await migration.up({ db } as never);
    }, 120_000);

    beforeEach(async () => {
      const suffix = `growth-${Date.now()}-${crypto.randomUUID()}`;
      const magazine = await db.execute<{ id: number }>(sql`
      INSERT INTO public.magazines (name, slug, community_id, created_by)
      VALUES ('Growth test', ${suffix}, ${suffix}, ${suffix}) RETURNING id
    `);
      magazineId = Number(magazine.rows[0]!.id);
      const issue = await db.execute<{ id: number }>(sql`
      INSERT INTO public.magazine_issues (magazine_id, community_id, number, slug)
      VALUES (${magazineId}, ${suffix}, 1, 'first-issue') RETURNING id
    `);
      issueId = Number(issue.rows[0]!.id);
      articleIds = [];
      for (const n of [1, 2]) {
        const article = await db.execute<{ id: number }>(sql`
        INSERT INTO public.articles (slug, magazine_id, magazine_issue_id)
        VALUES (${`${suffix}-${n}`}, ${magazineId}, ${issueId}) RETURNING id
      `);
        articleIds.push(Number(article.rows[0]!.id));
      }
    });

    afterEach(async () => {
      await db.execute(
        sql`DELETE FROM app.magazine_read WHERE magazine_id = ${magazineId}`,
      );
      await db.execute(
        sql`DELETE FROM app.magazine_subscription WHERE magazine_id = ${magazineId}`,
      );
      await db.execute(
        sql`DELETE FROM public.articles WHERE magazine_id = ${magazineId}`,
      );
      await db.execute(
        sql`DELETE FROM public.magazine_issues WHERE magazine_id = ${magazineId}`,
      );
      await db.execute(
        sql`DELETE FROM public.magazines WHERE id = ${magazineId}`,
      );
    });

    it("adds the values, columns and table and can run twice", async () => {
      await migration.up({ db } as never);
      await migration.up({ db } as never);
      for (const name of [
        "enum_magazines_default_visibility",
        "enum_magazine_issues_visibility",
        "enum_magazine_issues_layout",
      ]) {
        const { rows } = await db.execute<{ value: string }>(sql`
        SELECT unnest(enum_range(NULL::${sql.identifier("public")}.${sql.identifier(name)}))::text AS value
      `);
        expect(rows.map((row) => row.value)).toEqual(
          expect.arrayContaining(
            name.endsWith("layout") ? ["long-read", "digest"] : ["teaser"],
          ),
        );
        if (!name.endsWith("layout"))
          expect(rows.findIndex((row) => row.value === "teaser")).toBeLessThan(
            rows.findIndex((row) => row.value === "public"),
          );
      }
      expect(await presentColumns()).toEqual(COLUMNS);
      expect(await hasReadTable()).toBe(true);
      const { rows } = await db.execute<{ name: string }>(sql`
      SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'app' AND tablename IN ('magazine_read', 'magazine_subscription')
    `);
      expect(rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          "magazine_subscription_source_issue_idx",
          "magazine_read_issue_reader_idx",
          "magazine_read_article_reader_idx",
          "magazine_read_magazine_idx",
        ]),
      );
    });

    it("auto-draft settings accept the new layouts and preview, and still refuse unknown values", async () => {
      for (const layout of ["long-read", "digest"]) {
        await db.execute(sql`
        INSERT INTO app.magazine_auto_draft_settings (magazine_id, layout, visibility)
        VALUES (${magazineId}, ${layout}, 'teaser')
        ON CONFLICT (magazine_id) DO UPDATE SET layout = EXCLUDED.layout, visibility = EXCLUDED.visibility
      `);
      }
      await expectViolation(
        sql`UPDATE app.magazine_auto_draft_settings SET visibility = 'everyone' WHERE magazine_id = ${magazineId}`,
        "23514",
      );
      await expectViolation(
        sql`UPDATE app.magazine_auto_draft_settings SET layout = 'grid' WHERE magazine_id = ${magazineId}`,
        "23514",
      );
    });

    it("keeps one read row per reader and target", async () => {
      const read = (articleId: number | null) => sql`
      INSERT INTO app.magazine_read (id, magazine_id, issue_id, article_id, reader_key, first_seen_at, last_seen_at)
      VALUES (${crypto.randomUUID()}, ${magazineId}, ${issueId}, ${articleId}, 'reader-key', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
      await db.execute(read(null));
      await expectViolation(read(null), "23505");
      await db.execute(read(articleIds[0]!));
      await expectViolation(read(articleIds[0]!), "23505");
      await db.execute(read(articleIds[1]!));
      const { rows } = await db.execute<{
        views: number;
        read_to_end_at: unknown;
      }>(
        sql`SELECT views, read_to_end_at FROM app.magazine_read WHERE magazine_id = ${magazineId}`,
      );
      expect(rows).toEqual(
        Array.from({ length: 3 }, () => ({ views: 0, read_to_end_at: null })),
      );
      await db.execute(
        sql`DELETE FROM public.articles WHERE id = ${articleIds[0]}`,
      );
      expect(
        (
          await db.execute(
            sql`SELECT 1 FROM app.magazine_read WHERE article_id = ${articleIds[0]}`,
          )
        ).rows,
      ).toHaveLength(0);
      await db.execute(
        sql`DELETE FROM public.magazine_issues WHERE id = ${issueId}`,
      );
      expect(
        (
          await db.execute(
            sql`SELECT 1 FROM app.magazine_read WHERE magazine_id = ${magazineId}`,
          )
        ).rows,
      ).toHaveLength(0);
    });

    it("clears a subscription's source when its issue is deleted", async () => {
      const id = crypto.randomUUID();
      await db.execute(sql`
      INSERT INTO app.magazine_subscription (id, magazine_id, email, source_issue_id)
      VALUES (${id}, ${magazineId}, ${`${id}@example.test`}, ${issueId})
    `);
      await db.execute(
        sql`DELETE FROM public.magazine_issues WHERE id = ${issueId}`,
      );
      const { rows } = await db.execute<{ source_issue_id: number | null }>(
        sql`SELECT source_issue_id FROM app.magazine_subscription WHERE id = ${id}`,
      );
      expect(rows).toEqual([{ source_issue_id: null }]);
    });

    it("down removes the table and columns, up restores them", async () => {
      const rollback = new Error("rollback migration exercise");
      await expect(
        db.transaction(async (tx) => {
          await migration.down({ db: tx } as never);
          expect(await presentColumns(tx)).toEqual([]);
          expect(await hasReadTable(tx)).toBe(false);
          await tx.execute(
            sql`INSERT INTO app.magazine_auto_draft_settings (magazine_id, layout, visibility) VALUES (${magazineId}, 'digest', 'teaser')`,
          );
          await migration.up({ db: tx } as never);
          expect(await presentColumns(tx)).toEqual(COLUMNS);
          expect(await hasReadTable(tx)).toBe(true);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await presentColumns()).toEqual(COLUMNS);
      expect(await hasReadTable()).toBe(true);
    });
  },
);
