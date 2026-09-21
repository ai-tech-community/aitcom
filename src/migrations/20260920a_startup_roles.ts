// Sourced startup_role rows + jobs_scanned_at. Remint reserved slug `jobs`.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "jobs_scanned_at" timestamptz;
  `);

  await db.execute(sql`
    UPDATE "app"."startup"
    SET "slug" = CASE
      WHEN "slug" = 'jobs' THEN 'jobs-2'
      ELSE "slug"
    END
    WHERE "slug" IN ('jobs', 'jobs-2')
      AND EXISTS (
        SELECT 1 FROM "app"."startup" other
        WHERE other."slug" = 'jobs' AND other.id = "app"."startup".id
      );
  `);

  await db.execute(sql`
    UPDATE "app"."startup"
    SET "slug" = 'jobs-2'
    WHERE "slug" = 'jobs';
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."startup_role" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "startup_id" varchar(255) NOT NULL REFERENCES "app"."startup"("id"),
      "slug" text NOT NULL,
      "title" text NOT NULL,
      "location" text,
      "work_type" text,
      "source_url" text NOT NULL,
      "apply_url" text,
      "description_text" text,
      "fetched_at" timestamptz NOT NULL,
      "board" varchar(16) NOT NULL,
      "external_id" text,
      "status" varchar(16) NOT NULL DEFAULT 'open',
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "startup_role_slug_idx"
      ON "app"."startup_role" ("slug");
    CREATE UNIQUE INDEX IF NOT EXISTS "startup_role_source_idx"
      ON "app"."startup_role" ("startup_id", "source_url");
    CREATE INDEX IF NOT EXISTS "startup_role_startup_idx"
      ON "app"."startup_role" ("startup_id");
    CREATE INDEX IF NOT EXISTS "startup_role_status_idx"
      ON "app"."startup_role" ("status");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."startup_role";
  `);
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      DROP COLUMN IF EXISTS "jobs_scanned_at";
  `);
}
