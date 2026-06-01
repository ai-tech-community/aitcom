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
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`DROP TABLE IF EXISTS "app"."agent_manifest_acceptance";`,
  );
}
