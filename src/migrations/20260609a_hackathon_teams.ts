// Creates the app.team table and adds nullable team_id FKs to
// challenge_enrollment and work_grid for the hackathon layer (ADR-0029). DDL is
// the canonical record of the Drizzle definitions in src/server/db/schema.ts
// (teams; challengeEnrollments.teamId; workGrids.teamId). Fully idempotent
// (CREATE TABLE / ALTER ... IF NOT EXISTS) so `payload migrate` reconciles it as
// a safe no-op against a DB that already has the changes. Column types mirror
// the Drizzle output: varchar(255) ids, snake_case columns, timestamptz.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // team must exist before the FK columns that reference it.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."team" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "challenge_id" integer NOT NULL,
      "event_id" integer NOT NULL,
      "name" varchar(100) NOT NULL,
      "captain_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "join_code" varchar(20) NOT NULL,
      "max_size" integer DEFAULT 5 NOT NULL,
      "status" varchar(20) DEFAULT 'forming' NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "team_challenge_idx" ON "app"."team" ("challenge_id");
    CREATE INDEX IF NOT EXISTS "team_captain_idx" ON "app"."team" ("captain_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "team_join_code_uidx" ON "app"."team" ("join_code");
  `);

  await db.execute(sql`
    ALTER TABLE "app"."challenge_enrollment"
      ADD COLUMN IF NOT EXISTS "team_id" varchar(255) REFERENCES "app"."team"("id");
    CREATE INDEX IF NOT EXISTS "enrollment_team_idx"
      ON "app"."challenge_enrollment" ("team_id");
  `);

  await db.execute(sql`
    ALTER TABLE "app"."work_grid"
      ADD COLUMN IF NOT EXISTS "team_id" varchar(255) REFERENCES "app"."team"("id");
    CREATE INDEX IF NOT EXISTS "work_grid_team_idx"
      ON "app"."work_grid" ("team_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Drop the FK columns (their indexes drop with them) before the referenced table.
  await db.execute(
    sql`ALTER TABLE "app"."work_grid" DROP COLUMN IF EXISTS "team_id";`,
  );
  await db.execute(
    sql`ALTER TABLE "app"."challenge_enrollment" DROP COLUMN IF EXISTS "team_id";`,
  );
  await db.execute(sql`DROP TABLE IF EXISTS "app"."team";`);
}
