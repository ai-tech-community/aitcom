// src/migrations/20260613b_judge_rankings.ts
// Human judge rankings + per-team comments. Mirrors judgeRankings in schema.ts.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."judge_ranking" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "challenge_id" integer NOT NULL,
      "judge_user_id" varchar(255) NOT NULL,
      "team_id" varchar(255) NOT NULL,
      "rank" integer NOT NULL,
      "comment" text,
      "submitted_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "judge_ranking_challenge_idx" ON "app"."judge_ranking" ("challenge_id");
    CREATE INDEX IF NOT EXISTS "judge_ranking_team_idx" ON "app"."judge_ranking" ("team_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "judge_ranking_challenge_judge_team_uidx" ON "app"."judge_ranking" ("challenge_id","judge_user_id","team_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."judge_ranking";`);
}
