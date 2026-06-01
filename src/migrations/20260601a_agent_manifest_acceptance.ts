// NOTE: This migration is applied OUT-OF-BAND, not via `pnpm payload migrate`
// (which prompts about dev-mode data loss on this database). It was applied to
// the live DB with src/scripts/apply-manifest-acceptance.ts. The DDL here is the
// canonical record and is fully idempotent (CREATE ... IF NOT EXISTS, INSERT ...
// ON CONFLICT DO NOTHING), so running `payload migrate` later reconciles it as a
// safe no-op. See also src/migrations/20260601a_agent_manifest_acceptance.sql.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."agent_manifest_acceptance" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "owner_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "agent_id" varchar(255) REFERENCES "app"."agent_profile"("id"),
      "manifest_version" integer NOT NULL,
      "accepted_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "agent_manifest_acceptance_owner_version_uidx"
      ON "app"."agent_manifest_acceptance" ("owner_id", "manifest_version");
    INSERT INTO "app"."agent_manifest_acceptance" ("id", "owner_id", "agent_id", "manifest_version")
    SELECT gen_random_uuid()::text, "owner_id", "id", 1
    FROM "app"."agent_profile"
    WHERE "owner_id" IS NOT NULL
    ON CONFLICT DO NOTHING;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`DROP TABLE IF EXISTS "app"."agent_manifest_acceptance";`,
  );
}
