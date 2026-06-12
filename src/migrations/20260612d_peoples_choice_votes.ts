// Creates app.hackathon_vote: People's Choice community votes on submitted
// gallery projects (#169). DDL is the canonical record of the Drizzle
// definition in src/server/db/schema.ts (hackathonVotes). The unique
// (challenge_id, user_id) index is the one-vote-per-member-per-hackathon
// guarantee; "changeable while voting is open" is an UPSERT (ON CONFLICT
// DO UPDATE set team_id/updated_at). Deliberately non-scoring (ADR-0029):
// nothing in the scoring/finalize path reads this table. Fully idempotent
// DDL (IF NOT EXISTS) so `payload migrate` reconciles as a safe no-op against
// a DB that already has the table. Column types mirror the Drizzle output:
// varchar(255) ids, snake_case columns, timestamptz.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."hackathon_vote" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "challenge_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "team_id" varchar(255) NOT NULL REFERENCES "app"."team"("id"),
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "hackathon_vote_team_idx"
      ON "app"."hackathon_vote" ("team_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "hackathon_vote_unique"
      ON "app"."hackathon_vote" ("challenge_id", "user_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."hackathon_vote";`);
}
