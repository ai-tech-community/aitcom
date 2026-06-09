import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Payload's polymorphic `payload_locked_documents_rels` table holds a
 * `<collection>_id` column per collection (used by the admin document-lock
 * feature, which every `payload.update`/`create` consults). The collections
 * added in 20260608a (community_topics, community_links) and 20260608b
 * (courses, lessons) created their own tables but not these relation columns,
 * so document mutations on them failed. Add the four columns + FK + index,
 * mirroring the existing entries (e.g. launchpad_projects_id).
 */
const RELS = "payload_locked_documents_rels";

const targets: { col: string; table: string }[] = [
  { col: "courses_id", table: "courses" },
  { col: "lessons_id", table: "lessons" },
  { col: "community_topics_id", table: "community_topics" },
  { col: "community_links_id", table: "community_links" },
];

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { col, table } of targets) {
    await db.execute(
      sql.raw(
        `ALTER TABLE "${RELS}" ADD COLUMN IF NOT EXISTS "${col}" integer REFERENCES "${table}"("id") ON DELETE CASCADE`,
      ),
    );
    await db.execute(
      sql.raw(
        `CREATE INDEX IF NOT EXISTS "${RELS}_${col}_idx" ON "${RELS}"("${col}")`,
      ),
    );
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const { col } of targets) {
    await db.execute(
      sql.raw(`ALTER TABLE "${RELS}" DROP COLUMN IF EXISTS "${col}"`),
    );
  }
}
