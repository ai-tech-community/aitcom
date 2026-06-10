// Plan 4 (participant workspace): humans become peers to agents on a competitive
// work grid. Adds claimed_by_user_id + assigned_to_user_id (and an index) to
// work_cell; adds user_id to work_cell_result and makes agent_id nullable; swaps
// the (cell_id, agent_id) result uniqueness for one-result-per-cell; and creates
// the team_activity_event + team_presence tables. DDL mirrors the Drizzle defs in
// src/server/db/schema.ts. Idempotent (IF [NOT] EXISTS) so payload migrate
// reconciles it as a safe no-op against an already-migrated DB.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // work_cell: human claim + soft assignment columns + claim index.
  await db.execute(sql`
    ALTER TABLE "app"."work_cell"
      ADD COLUMN IF NOT EXISTS "claimed_by_user_id" varchar(255) REFERENCES "app"."user"("id"),
      ADD COLUMN IF NOT EXISTS "assigned_to_user_id" varchar(255) REFERENCES "app"."user"("id");
    CREATE INDEX IF NOT EXISTS "work_cell_claimed_by_user_idx"
      ON "app"."work_cell" ("claimed_by_user_id");
  `);

  // work_cell_result: human-authored results. agent_id becomes nullable; add
  // user_id; replace the per-agent uniqueness with one result per cell.
  await db.execute(sql`
    ALTER TABLE "app"."work_cell_result"
      ALTER COLUMN "agent_id" DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS "user_id" varchar(255) REFERENCES "app"."user"("id");
    DROP INDEX IF EXISTS "app"."work_cell_result_cell_agent_uidx";
    CREATE UNIQUE INDEX IF NOT EXISTS "work_cell_result_cell_uidx"
      ON "app"."work_cell_result" ("cell_id");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."team_activity_event" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "team_id" varchar(255) NOT NULL REFERENCES "app"."team"("id"),
      "cell_id" varchar(255) REFERENCES "app"."work_cell"("id"),
      "actor_user_id" varchar(255) REFERENCES "app"."user"("id"),
      "actor_agent_id" varchar(255) REFERENCES "app"."agent_profile"("id"),
      "type" varchar(20) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "team_activity_team_idx" ON "app"."team_activity_event" ("team_id");
    CREATE INDEX IF NOT EXISTS "team_activity_created_idx" ON "app"."team_activity_event" ("created_at");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."team_presence" (
      "team_id" varchar(255) NOT NULL REFERENCES "app"."team"("id"),
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "last_seen_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY ("team_id", "user_id")
    );
    CREATE INDEX IF NOT EXISTS "team_presence_team_idx" ON "app"."team_presence" ("team_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."team_presence";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."team_activity_event";`);
  // NOTE: SET NOT NULL will fail if human-authored result rows (null agent_id) exist — expected for rollback to pre-feature state.
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."work_cell_result_cell_uidx";
    ALTER TABLE "app"."work_cell_result" DROP COLUMN IF EXISTS "user_id";
    CREATE UNIQUE INDEX IF NOT EXISTS "work_cell_result_cell_agent_uidx"
      ON "app"."work_cell_result" ("cell_id", "agent_id");
    ALTER TABLE "app"."work_cell_result" ALTER COLUMN "agent_id" SET NOT NULL;
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."work_cell_claimed_by_user_idx";
    ALTER TABLE "app"."work_cell"
      DROP COLUMN IF EXISTS "assigned_to_user_id",
      DROP COLUMN IF EXISTS "claimed_by_user_id";
  `);
}
