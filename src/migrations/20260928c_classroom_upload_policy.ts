// Adds app.community.classroom_upload_policy: who may upload hosted lesson
// files (spec 2026-09-27 §2.3). varchar(30) NOT NULL DEFAULT 'admins_only',
// so every existing community starts with owners and admins only. Mirrors
// the Drizzle column communities.classroomUploadPolicy. The Drizzle table is
// app.community (singular). Idempotent (ADD/DROP COLUMN IF EXISTS).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community"
      ADD COLUMN IF NOT EXISTS "classroom_upload_policy" varchar(30) DEFAULT 'admins_only' NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community"
      DROP COLUMN IF EXISTS "classroom_upload_policy";
  `);
}
