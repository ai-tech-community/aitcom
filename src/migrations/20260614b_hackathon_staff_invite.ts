// src/migrations/20260614b_hackathon_staff_invite.ts
// Pending email invites for hackathon staff. Mirrors the Drizzle def in
// src/server/db/schema.ts (hackathonStaffInvite). Idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."hackathon_staff_invite" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "challenge_id" integer NOT NULL,
      "community_id" varchar(255),
      "challenge_title" varchar(255) NOT NULL,
      "email" varchar(255) NOT NULL,
      "role" varchar(20) NOT NULL,
      "code" varchar(255) NOT NULL,
      "invited_by" varchar(255) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "expires_at" timestamptz,
      "redeemed_at" timestamptz,
      "redeemed_user_id" varchar(255),
      "revoked_at" timestamptz
    );
    CREATE INDEX IF NOT EXISTS "hackathon_staff_invite_challenge_idx" ON "app"."hackathon_staff_invite" ("challenge_id");
    CREATE INDEX IF NOT EXISTS "hackathon_staff_invite_email_idx" ON "app"."hackathon_staff_invite" ("email");
    CREATE UNIQUE INDEX IF NOT EXISTS "hackathon_staff_invite_code_uidx" ON "app"."hackathon_staff_invite" ("code");
    CREATE UNIQUE INDEX IF NOT EXISTS "hackathon_staff_invite_live_uidx" ON "app"."hackathon_staff_invite" ("challenge_id","email","role") WHERE "revoked_at" IS NULL AND "redeemed_at" IS NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."hackathon_staff_invite";`);
}
