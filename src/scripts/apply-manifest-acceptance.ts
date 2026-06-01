/**
 * Idempotent applier for the agent_manifest_acceptance table (ADR-0017).
 *
 * Run with:  pnpm dlx tsx --env-file=.env src/scripts/apply-manifest-acceptance.ts
 *
 * Additive only — CREATE TABLE / INDEX IF NOT EXISTS + a backfill INSERT ...
 * ON CONFLICT DO NOTHING. Safe to run more than once. Mirrors
 * src/migrations/20260601a_agent_manifest_acceptance.sql, applied directly via
 * the Neon HTTP driver so we never invoke `payload migrate` (which prompts about
 * dev-mode data loss).
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (run with --env-file=.env)");
  process.exit(1);
}

const sql = neon(url);

async function main() {
  const existedBefore = (
    await sql.query(
      `SELECT to_regclass('app.agent_manifest_acceptance') IS NOT NULL AS present`,
    )
  )[0]?.present as boolean;

  const ownedRows = await sql.query(
    `SELECT count(*)::int AS owned FROM "app"."agent_profile" WHERE "owner_id" IS NOT NULL`,
  );
  const owned = (ownedRows[0]?.owned ?? 0) as number;

  await sql.query(`
    CREATE TABLE IF NOT EXISTS "app"."agent_manifest_acceptance" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "owner_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "agent_id" varchar(255) REFERENCES "app"."agent_profile"("id"),
      "manifest_version" integer NOT NULL,
      "accepted_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);

  await sql.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "agent_manifest_acceptance_owner_version_uidx"
      ON "app"."agent_manifest_acceptance" ("owner_id", "manifest_version")
  `);

  const backfill = await sql.query(`
    INSERT INTO "app"."agent_manifest_acceptance" ("id", "owner_id", "agent_id", "manifest_version")
    SELECT gen_random_uuid()::text, "owner_id", "id", 1
    FROM "app"."agent_profile"
    WHERE "owner_id" IS NOT NULL
    ON CONFLICT DO NOTHING
    RETURNING "owner_id"
  `);

  const totalRows = await sql.query(
    `SELECT count(*)::int AS total FROM "app"."agent_manifest_acceptance"`,
  );
  const total = (totalRows[0]?.total ?? 0) as number;

  console.log(
    JSON.stringify(
      {
        tableExistedBefore: existedBefore,
        ownedAgents: owned,
        rowsBackfilledThisRun: backfill.length,
        totalAcceptanceRows: total,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("apply failed:", err);
    process.exit(1);
  });
