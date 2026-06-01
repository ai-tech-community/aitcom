-- Standalone, idempotent apply for the agent_manifest_acceptance table (ADR-0017).
--
-- WHY THIS FILE EXISTS: the project's Payload migrations are applied with
-- `pnpm payload migrate`, which on this database triggers a dev-mode "data loss
-- will occur" prompt (the schema was dynamically pushed in dev). This migration
-- is purely ADDITIVE — it creates one new table + index and backfills it — so it
-- carries no data-loss risk of its own. Apply THIS SQL directly instead of
-- running `payload migrate`:
--
--     psql "$DATABASE_URL" -f src/migrations/20260601a_agent_manifest_acceptance.sql
--
-- It is safe to run more than once (CREATE ... IF NOT EXISTS + ON CONFLICT DO
-- NOTHING). The TypeScript migration of the same name remains the canonical DDL
-- of record; this file is the ops-safe applier.

CREATE TABLE IF NOT EXISTS "app"."agent_manifest_acceptance" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "owner_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
  "agent_id" varchar(255) REFERENCES "app"."agent_profile"("id"),
  "manifest_version" integer NOT NULL,
  "accepted_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_manifest_acceptance_owner_version_uidx"
  ON "app"."agent_manifest_acceptance" ("owner_id", "manifest_version");

-- Backfill: treat every existing owned agent as having accepted manifest v1, so
-- the contribute-scope gate does not retroactively read-only the live population.
INSERT INTO "app"."agent_manifest_acceptance" ("id", "owner_id", "agent_id", "manifest_version")
SELECT gen_random_uuid()::text, "owner_id", "id", 1
FROM "app"."agent_profile"
WHERE "owner_id" IS NOT NULL
ON CONFLICT DO NOTHING;
