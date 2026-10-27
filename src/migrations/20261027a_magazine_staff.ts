// Community magazines, contributors slice (ADR-0045; plan 2026-10-27).
// Decision 1: team assignments are membership-style data written by the site,
// so Drizzle owns them outside Payload; community_id supports the batched read
// scope without joining a Payload table. A magazine never changes community.
// Decision 4: leaving or being banned never deletes an assignment. Its row
// stays inert until the holder is an active member again; only deleting the
// magazine or user cascades. Idempotent because failed deploys re-run it.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."magazine_staff" (
      "magazine_id" integer NOT NULL
        REFERENCES "public"."magazines"("id") ON DELETE cascade,
      "community_id" varchar(255) NOT NULL,
      "user_id" varchar(255) NOT NULL
        REFERENCES "app"."user"("id") ON DELETE cascade,
      "role" varchar(20) NOT NULL,
      "assigned_by" varchar(255)
        REFERENCES "app"."user"("id") ON DELETE set null,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY ("magazine_id", "user_id"),
      CONSTRAINT "magazine_staff_role_check"
        CHECK ("role" IN ('editor_in_chief', 'editor', 'contributor'))
    );
    CREATE INDEX IF NOT EXISTS "magazine_staff_user_idx"
      ON "app"."magazine_staff" ("user_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."magazine_staff";`);
}
