// Creates app.hackathon_certificate: winner/participant certificates issued
// when an organizer finalizes a hackathon (#163). DDL is the canonical record
// of the Drizzle definition in src/server/db/schema.ts (hackathonCertificates).
// The unique (challenge_id, user_id) index is what makes finalize re-runs
// structurally idempotent (insert ... ON CONFLICT DO NOTHING). Fully idempotent
// DDL (IF NOT EXISTS) so `payload migrate` reconciles as a safe no-op against a
// DB that already has the table. Column types mirror the Drizzle output:
// varchar(255) ids, snake_case columns, timestamptz.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."hackathon_certificate" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "challenge_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "kind" varchar(20) NOT NULL,
      "issued_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "hackathon_certificate_user_idx"
      ON "app"."hackathon_certificate" ("user_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "hackathon_certificate_unique"
      ON "app"."hackathon_certificate" ("challenge_id", "user_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."hackathon_certificate";`);
}
