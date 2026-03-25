-- Multi-tenancy: communities, memberships, invites
-- Run: npx drizzle-kit push  OR  apply this SQL manually

-- ── Communities ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app"."community" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "name" text NOT NULL UNIQUE,
  "slug" text NOT NULL UNIQUE,
  "description" text,
  "logo_url" text,
  "join_policy" varchar(30) NOT NULL DEFAULT 'open',
  "is_listed_in_directory" boolean NOT NULL DEFAULT false,
  "created_by" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "community_slug_idx" ON "app"."community" ("slug");
CREATE INDEX IF NOT EXISTS "community_listed_idx" ON "app"."community" ("is_listed_in_directory");

-- ── Community Memberships ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "app"."community_membership" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
  "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
  "role" varchar(20) NOT NULL DEFAULT 'member',
  "status" varchar(30) NOT NULL DEFAULT 'active',
  "joined_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone,
  "invited_by" varchar(255) REFERENCES "app"."user"("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "membership_community_user_uidx" ON "app"."community_membership" ("community_id", "user_id");
CREATE INDEX IF NOT EXISTS "membership_user_idx" ON "app"."community_membership" ("user_id");
CREATE INDEX IF NOT EXISTS "membership_community_status_idx" ON "app"."community_membership" ("community_id", "status");
CREATE INDEX IF NOT EXISTS "membership_community_role_idx" ON "app"."community_membership" ("community_id", "role");

-- ── Community Invites ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app"."community_invite" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
  "code" text NOT NULL UNIQUE,
  "created_by" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
  "max_uses" integer,
  "use_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "invite_community_idx" ON "app"."community_invite" ("community_id");
CREATE UNIQUE INDEX IF NOT EXISTS "invite_code_uidx" ON "app"."community_invite" ("code");

-- ── Add communityId to existing tables ──────────────────────
ALTER TABLE "app"."activity_event" ADD COLUMN IF NOT EXISTS "community_id" varchar(255);
ALTER TABLE "app"."notification" ADD COLUMN IF NOT EXISTS "community_id" varchar(255);
ALTER TABLE "app"."challenge_channel" ADD COLUMN IF NOT EXISTS "community_id" varchar(255);
ALTER TABLE "app"."benchmark_question" ADD COLUMN IF NOT EXISTS "community_id" varchar(255);
