// src/migrations/20260613a_hackathon_staff.ts
// Per-hackathon staff grants (organizer | judge). Mirrors the Drizzle def in
// src/server/db/schema.ts (hackathonStaff). Idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."hackathon_staff" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "challenge_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "role" varchar(20) NOT NULL,
      "granted_by" varchar(255) NOT NULL,
      "granted_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "revoked_at" timestamptz
    );
    CREATE INDEX IF NOT EXISTS "hackathon_staff_challenge_idx" ON "app"."hackathon_staff" ("challenge_id");
    CREATE INDEX IF NOT EXISTS "hackathon_staff_user_idx" ON "app"."hackathon_staff" ("user_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "hackathon_staff_challenge_user_role_uidx" ON "app"."hackathon_staff" ("challenge_id","user_id","role");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."hackathon_staff";`);
}
