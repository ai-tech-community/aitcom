// @vitest-environment node
// Exercises the deploy runner's { db } contract on aitcom_test only.
import type { SQL, sql as Sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type * as Migration from "./20261027b_magazine_subscriptions";

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
  "app.magazine_subscription.id",
  "app.magazine_subscription.magazine_id",
  "app.magazine_subscription.user_id",
  "app.magazine_subscription.email",
  "app.magazine_subscription.locale",
  "app.magazine_subscription.confirm_token_hash",
  "app.magazine_subscription.confirm_sent_at",
  "app.magazine_subscription.confirm_send_count",
  "app.magazine_subscription.confirmed_at",
  "app.magazine_subscription.created_at",
  "app.magazine_issue_announcement.issue_id",
  "app.magazine_issue_announcement.magazine_id",
  "app.magazine_issue_announcement.published_at",
  "app.magazine_issue_announcement.completed_at",
  "app.magazine_issue_announcement.last_attempted_at",
  "app.magazine_issue_announcement.created_at",
  "app.magazine_issue_delivery.issue_id",
  "app.magazine_issue_delivery.subscription_id",
  "app.magazine_issue_delivery.channel",
  "app.magazine_issue_delivery.delivered_at",
  "public.magazine_issues.scheduled_for",
  "public.magazine_issues.scheduled_by",
  "public.magazine_issues.published_via",
];

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261027b magazine subscriptions [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let migration: typeof Migration;
    let suffix: string;
    let userId: string;
    let magazineId: number;
    let magazineIds: number[];
    let issueId: number;

    async function presentColumns(on: Pick<typeof Db, "execute"> = db) {
      const { rows } = await on.execute<{ key: string }>(sql`
        SELECT table_schema || '.' || table_name || '.' || column_name AS key
        FROM information_schema.columns
        WHERE (table_schema = 'app' AND table_name IN (
          'magazine_subscription', 'magazine_issue_announcement', 'magazine_issue_delivery'
        )) OR (table_schema = 'public' AND table_name = 'magazine_issues')
      `);
      const have = new Set(rows.map((row) => row.key));
      return EXPECTED_COLUMNS.filter((key) => have.has(key));
    }

    async function insertMagazine(label = "first") {
      const { rows } = await db.execute<{ id: number }>(sql`
        INSERT INTO "public"."magazines" ("name", "slug", "community_id", "created_by")
        VALUES ('Subscription test', ${`subs-${label}-${suffix}`}, ${`subs-${label}-${suffix}`}, ${userId})
        RETURNING "id"
      `);
      const id = Number(rows[0]!.id);
      magazineIds.push(id);
      return id;
    }

    function subscription({
      id = crypto.randomUUID(),
      magazine = magazineId,
      account = null,
      email = null,
      locale = "en",
      tokenHash = null,
    }: {
      id?: string;
      magazine?: number;
      account?: string | null;
      email?: string | null;
      locale?: string;
      tokenHash?: string | null;
    } = {}) {
      return sql`
        INSERT INTO "app"."magazine_subscription"
          ("id", "magazine_id", "user_id", "email", "locale", "confirm_token_hash")
        VALUES (${id}, ${magazine}, ${account}, ${email}, ${locale}, ${tokenHash})
      `;
    }

    function delivery(subscriptionId: string, channel = "inbox") {
      return sql`
        INSERT INTO "app"."magazine_issue_delivery" ("issue_id", "subscription_id", "channel")
        VALUES (${issueId}, ${subscriptionId}, ${channel})
      `;
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
      const [database, drizzle, subscriptionsMigration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261027b_magazine_subscriptions"),
      ]);
      db = database.db;
      sql = drizzle.sql;
      migration = subscriptionsMigration;
      const { rows } = await db.execute<{ name: string }>(
        sql`SELECT current_database() AS name`,
      );
      if (rows[0]?.name !== "aitcom_test") {
        throw new Error(
          `Refusing to migrate "${rows[0]?.name}"; use aitcom_test.`,
        );
      }
      await migration.up({ db } as never);
    }, 120_000);

    beforeEach(async () => {
      suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      userId = `mag-subscriber-${suffix}`;
      magazineIds = [];
      // A bare user lets the test exercise this migration's own cascades.
      await db.execute(sql`
        INSERT INTO "app"."user" ("id", "email", "name")
        VALUES (${userId}, ${`${userId}@example.test`}, 'Subscriber')
      `);
      magazineId = await insertMagazine();
      const { rows } = await db.execute<{ id: number }>(sql`
        INSERT INTO "public"."magazine_issues" ("magazine_id", "community_id", "number", "slug")
        VALUES (${magazineId}, ${`subs-first-${suffix}`}, 1, 'first-issue')
        RETURNING "id"
      `);
      issueId = Number(rows[0]!.id);
    });

    afterEach(async () => {
      if (magazineIds.length) {
        // Payload's existing issue relation sets null on magazine deletion;
        // remove fixture issues first because magazine_id is required.
        await db.execute(sql`
          DELETE FROM "public"."magazine_issues"
          WHERE "magazine_id" IN (${sql.join(
            magazineIds.map((id) => sql`${id}`),
            sql`, `,
          )})
        `);
        await db.execute(sql`
          DELETE FROM "public"."magazines"
          WHERE "id" IN (${sql.join(
            magazineIds.map((id) => sql`${id}`),
            sql`, `,
          )})
        `);
      }
      await db.execute(sql`DELETE FROM "app"."user" WHERE "id" = ${userId}`);
    });

    it("adds the scheduled status and the schedule columns, and can run twice", async () => {
      await migration.up({ db } as never);
      await migration.up({ db } as never);
      const { rows } = await db.execute<{ status: string }>(sql`
        SELECT unnest(enum_range(NULL::"public"."enum_magazine_issues_status"))::text AS status
      `);
      expect(rows.map((row) => row.status)).toContain("scheduled");
      expect(await presentColumns()).toEqual(EXPECTED_COLUMNS);
      const indexes = await db.execute<{ name: string }>(sql`
        SELECT indexname AS name FROM pg_indexes
        WHERE (schemaname = 'app' AND tablename IN (
          'magazine_subscription', 'magazine_issue_announcement'
        )) OR (schemaname = 'public' AND tablename = 'magazine_issues')
      `);
      expect(indexes.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          "magazine_subscription_user_idx",
          "magazine_subscription_magazine_idx",
          "magazine_subscription_magazine_user_idx",
          "magazine_subscription_magazine_email_idx",
          "magazine_subscription_confirm_token_idx",
          "magazine_issue_announcement_open_idx",
          "magazine_issues_scheduled_for_idx",
        ]),
      );
    });

    it("keeps one subscriber per row and one row per subscriber", async () => {
      const email = `subscriber-${suffix}@example.test`;
      const tokenHash = crypto.randomUUID().replaceAll("-", "").repeat(2);
      await expectViolation(subscription({ account: userId, email }), "23514");
      await expectViolation(subscription(), "23514");
      await db.execute(subscription({ account: userId }));
      await expectViolation(subscription({ account: userId }), "23505");
      await db.execute(subscription({ email, tokenHash }));
      await expectViolation(subscription({ email }), "23505");
      const secondMagazine = await insertMagazine("second");
      await db.execute(
        subscription({ magazine: secondMagazine, email, locale: "nl" }),
      );
      await expectViolation(
        subscription({ email: `other-${email}`, locale: "de" }),
        "23514",
      );
      await expectViolation(
        subscription({ email: `other-${email}`, tokenHash }),
        "23505",
      );
    });

    it("claims each delivery once and cleans up with its parents", async () => {
      const accountId = crypto.randomUUID();
      const emailId = crypto.randomUUID();
      await db.execute(subscription({ id: accountId, account: userId }));
      await db.execute(
        subscription({ id: emailId, email: `${suffix}@example.test` }),
      );
      await db.execute(delivery(accountId));
      await expectViolation(delivery(accountId), "23505");
      await expectViolation(delivery(emailId, "sms"), "23514");
      await db.execute(
        sql`DELETE FROM "app"."magazine_subscription" WHERE "id" = ${accountId}`,
      );
      expect(
        (
          await db.execute(sql`
        SELECT * FROM "app"."magazine_issue_delivery" WHERE "issue_id" = ${issueId}
      `)
        ).rows,
      ).toEqual([]);

      await db.execute(sql`
        INSERT INTO "app"."magazine_issue_announcement" ("issue_id", "magazine_id", "published_at")
        VALUES (${issueId}, ${magazineId}, CURRENT_TIMESTAMP)
      `);
      await db.execute(delivery(emailId, "email"));
      await db.execute(
        sql`DELETE FROM "public"."magazine_issues" WHERE "id" = ${issueId}`,
      );
      expect(
        (
          await db.execute(sql`
        SELECT * FROM "app"."magazine_issue_announcement" WHERE "issue_id" = ${issueId}
      `)
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.execute(sql`
        SELECT * FROM "app"."magazine_issue_delivery" WHERE "issue_id" = ${issueId}
      `)
        ).rows,
      ).toEqual([]);

      await db.execute(subscription({ account: userId }));
      await db.execute(sql`DELETE FROM "app"."user" WHERE "id" = ${userId}`);
      expect(
        (
          await db.execute(sql`
        SELECT * FROM "app"."magazine_subscription" WHERE "user_id" = ${userId}
      `)
        ).rows,
      ).toEqual([]);
      await db.execute(
        sql`DELETE FROM "public"."magazines" WHERE "id" = ${magazineId}`,
      );
      expect(
        (
          await db.execute(sql`
        SELECT * FROM "app"."magazine_subscription" WHERE "magazine_id" = ${magazineId}
      `)
        ).rows,
      ).toEqual([]);
    });

    it("down removes the tables and columns, up restores them", async () => {
      await db.execute(sql`
        UPDATE "public"."magazine_issues" SET "status" = 'scheduled' WHERE "id" = ${issueId}
      `);
      const rollback = new Error("rollback migration exercise");
      await expect(
        db.transaction(async (tx) => {
          await migration.down({ db: tx } as never);
          expect(await presentColumns(tx)).toEqual([]);
          const { rows } = await tx.execute<{ status: string }>(sql`
          SELECT "status" FROM "public"."magazine_issues" WHERE "id" = ${issueId}
        `);
          expect(rows[0]?.status).toBe("draft");
          await migration.up({ db: tx } as never);
          expect(await presentColumns(tx)).toEqual(EXPECTED_COLUMNS);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await presentColumns()).toEqual(EXPECTED_COLUMNS);
    });
  },
);
