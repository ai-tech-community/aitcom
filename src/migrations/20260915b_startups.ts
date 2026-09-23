// Creates app.startup for the Startups investigation directory.
// Schema only — live rows arrive through the staff insert API, not this file.
// Idempotent so `payload migrate` is a safe no-op when the table exists.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."startup" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "homepage" text NOT NULL,
      "category" varchar(32) NOT NULL,
      "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "region" text,
      "lat" double precision,
      "lng" double precision,
      "stage" text,
      "logo_url" text,
      "status" varchar(16) NOT NULL DEFAULT 'approved',
      "source" varchar(16) NOT NULL DEFAULT 'staff',
      "listed_on" date NOT NULL,
      "submitted_by_user_id" varchar(255) REFERENCES "app"."user"("id"),
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "startup_homepage_idx"
      ON "app"."startup" ("homepage");
    CREATE INDEX IF NOT EXISTS "startup_status_idx"
      ON "app"."startup" ("status");
    CREATE INDEX IF NOT EXISTS "startup_category_idx"
      ON "app"."startup" ("category");
    CREATE INDEX IF NOT EXISTS "startup_listed_on_idx"
      ON "app"."startup" ("listed_on");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."startup";
  `);
}
