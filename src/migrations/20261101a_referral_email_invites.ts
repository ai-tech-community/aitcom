import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."referral_invite_batch" (
      "id" uuid PRIMARY KEY, "sender_id" varchar(255) NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "request_id" uuid NOT NULL, "fingerprint" text NOT NULL, "skipped" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "referral_batch_request_uidx" ON "app"."referral_invite_batch" ("sender_id", "request_id");
    CREATE TABLE IF NOT EXISTS "app"."referral_invite_budget" (
      "sender_id" varchar(255) NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "day" date NOT NULL, "used" integer NOT NULL DEFAULT 0,
      PRIMARY KEY ("sender_id", "day"), CONSTRAINT "referral_budget_bounds" CHECK ("used" BETWEEN 0 AND 50)
    );
    CREATE TABLE IF NOT EXISTS "app"."referral_email_suppression" (
      "recipient_hash" text PRIMARY KEY, "reason" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS "app"."referral_email_invite" (
      "id" uuid PRIMARY KEY, "batch_id" uuid NOT NULL REFERENCES "app"."referral_invite_batch"("id") ON DELETE CASCADE,
      "sender_id" varchar(255) NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id") ON DELETE CASCADE,
      "invite_code" text NOT NULL, "recipient_hash" text NOT NULL, "recipient_email" varchar(255),
      "sender_name" text NOT NULL, "community_name" text NOT NULL, "locale" varchar(2) NOT NULL,
      "status" text NOT NULL DEFAULT 'queued', "phase" text NOT NULL DEFAULT 'invite', "attempts" integer NOT NULL DEFAULT 0,
      "first_attempt_at" timestamptz, "next_attempt_at" timestamptz NOT NULL DEFAULT now(), "lease_until" timestamptz,
      "sent_at" timestamptz, "reminded_at" timestamptz, "joined_at" timestamptz,
      "joined_user_id" varchar(255) REFERENCES "app"."user"("id") ON DELETE SET NULL,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "referral_email_due_idx" ON "app"."referral_email_invite" ("status", "next_attempt_at");
    CREATE INDEX IF NOT EXISTS "referral_email_sender_idx" ON "app"."referral_email_invite" ("sender_id", "community_id");
    CREATE INDEX IF NOT EXISTS "referral_email_recipient_idx" ON "app"."referral_email_invite" ("recipient_hash", "created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "referral_email_batch_recipient_uidx" ON "app"."referral_email_invite" ("batch_id", "recipient_hash");
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."referral_email_invite";
    DROP TABLE IF EXISTS "app"."referral_invite_budget";
    DROP TABLE IF EXISTS "app"."referral_invite_batch";
    DROP TABLE IF EXISTS "app"."referral_email_suppression";
  `);
}
