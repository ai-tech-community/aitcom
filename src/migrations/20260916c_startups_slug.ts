// Unique stable slug on Startups. Backfill from name with -2 collision
// suffixes. Does not invent company copy, logos, or people.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "slug" text;
  `);

  await db.execute(sql`
    WITH base AS (
      SELECT
        id,
        NULLIF(
          trim(both '-' from lower(regexp_replace(name, '[^A-Za-z0-9]+', '-', 'g'))),
          ''
        ) AS base_slug
      FROM "app"."startup"
      WHERE "slug" IS NULL OR btrim("slug") = ''
    ),
    numbered AS (
      SELECT
        id,
        COALESCE(base_slug, 'startup') AS base_slug,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(base_slug, 'startup')
          ORDER BY id
        ) AS n
      FROM base
    )
    UPDATE "app"."startup" AS s
    SET "slug" = CASE
      WHEN numbered.n = 1 AND numbered.base_slug <> 'insights'
        THEN numbered.base_slug
      WHEN numbered.base_slug = 'insights' AND numbered.n = 1
        THEN 'insights-2'
      WHEN numbered.base_slug = 'insights'
        THEN 'insights-' || (numbered.n + 1)
      ELSE numbered.base_slug || '-' || numbered.n
    END
    FROM numbered
    WHERE s.id = numbered.id;
  `);

  await db.execute(sql`
    UPDATE "app"."startup"
    SET "slug" = 'startup-' || substr(id, 1, 8)
    WHERE "slug" IS NULL OR btrim("slug") = '';
  `);

  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ALTER COLUMN "slug" SET NOT NULL;
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "startup_slug_idx"
      ON "app"."startup" ("slug");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."startup_slug_idx";
  `);
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      DROP COLUMN IF EXISTS "slug";
  `);
}
