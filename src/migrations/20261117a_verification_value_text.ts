import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Better Auth keeps the OAuth sign-in state in `verification.value` as JSON:
 * a 128-character PKCE verifier plus the callback and error URLs. That fixed
 * part alone is ~205 characters, so `varchar(255)` left ~50 characters for
 * both URLs and every social sign-in from a page with a query string failed
 * with "value too long for type character varying(255)". Better Auth's own
 * schema stores this column as `text`.
 *
 * Widening varchar to text is a catalog-only change in Postgres: no rewrite,
 * no data touched.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."verification" ALTER COLUMN "value" TYPE text;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Rows are short-lived sign-in state (minutes). Ones that no longer fit are
  // dropped rather than truncated, since a cut-off JSON value is unusable.
  await db.execute(sql`
    DELETE FROM "app"."verification" WHERE length("value") > 255;
    ALTER TABLE "app"."verification" ALTER COLUMN "value" TYPE varchar(255);
  `);
}
