import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Payload's document-lock check runs before every `payload.update` and
 * `payload.delete` by id. It reads `payload_locked_documents_rels`, which
 * holds one `<collection>_id` column per collection. 20260620b created the
 * `points_boosts` table but not this column, so since then every update and
 * delete by id — in any collection — failed with
 * `column ... points_boosts_id does not exist` (feed likes, post edits, pins,
 * admin edits). Same fix as 20260608d: add the column + FK + index.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "points_boosts_id" integer
      REFERENCES "points_boosts"("id") ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_points_boosts_id_idx"
      ON "payload_locked_documents_rels" ("points_boosts_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "points_boosts_id";
  `);
}
