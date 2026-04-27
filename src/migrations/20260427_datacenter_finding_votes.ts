import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."datacenter_finding"
      ADD COLUMN IF NOT EXISTS "claim" text;
  `);

  await db.execute(sql`
    CREATE TABLE "app"."datacenter_finding_vote" (
      "finding_id" uuid NOT NULL REFERENCES "app"."datacenter_finding"("id") ON DELETE CASCADE,
      "user_id" text NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "vote" integer NOT NULL DEFAULT 1,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "dc_finding_vote_check" CHECK ("vote" IN (1, -1))
    );
    CREATE UNIQUE INDEX "dc_finding_vote_pk" ON "app"."datacenter_finding_vote"("finding_id","user_id");
    CREATE INDEX "dc_finding_vote_finding_idx" ON "app"."datacenter_finding_vote"("finding_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`DROP TABLE IF EXISTS "app"."datacenter_finding_vote" CASCADE;`,
  );
  await db.execute(
    sql`ALTER TABLE "app"."datacenter_finding" DROP COLUMN IF EXISTS "claim";`,
  );
}
