import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * 20260611a created the "modules" collection table but (like 20260608b before
 * it, see 20260608d) omitted the polymorphic `modules_id` column on
 * `payload_locked_documents_rels`. Payload's document-lock feature consults
 * that table on every `payload.create`/`update`/`delete`, so mutations on the
 * modules collection fail with `column "modules_id" does not exist` without
 * it. Add the column + FK + index, mirroring 20260608d. Shipped as a separate
 * migration (rather than folded into 20260611a) because 20260611a is already
 * recorded in dev databases and would not re-run there.
 */
const RELS = "payload_locked_documents_rels";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(
      `ALTER TABLE "${RELS}" ADD COLUMN IF NOT EXISTS "modules_id" integer REFERENCES "modules"("id") ON DELETE CASCADE`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "${RELS}_modules_id_idx" ON "${RELS}"("modules_id")`,
    ),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`ALTER TABLE "${RELS}" DROP COLUMN IF EXISTS "modules_id"`),
  );
}
