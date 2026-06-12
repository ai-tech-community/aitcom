// Email templates (#168, tracer bullet): the Payload "email-templates"
// collection table backing organizer-editable emails. First (and so far only)
// consumer is the event registration confirmation; the send path falls back
// to the hardcoded email when no enabled template row exists. Includes the
// polymorphic `email_templates_id` column on `payload_locked_documents_rels`
// up front (see 20260608d / 20260611b for why omitting it breaks mutations).
// Idempotent (IF [NOT] EXISTS) so payload migrate reconciles it as a safe
// no-op against an already-migrated DB.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const RELS = "payload_locked_documents_rels";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "email_templates" (
      "id" serial PRIMARY KEY,
      "key" varchar NOT NULL,
      "subject" varchar NOT NULL,
      "body" varchar NOT NULL,
      "enabled" boolean DEFAULT true,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `),
  );
  await db.execute(
    sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_key_idx" ON "email_templates"("key")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "email_templates_updated_at_idx" ON "email_templates"("updated_at")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "email_templates_created_at_idx" ON "email_templates"("created_at")`,
    ),
  );

  await db.execute(
    sql.raw(
      `ALTER TABLE "${RELS}" ADD COLUMN IF NOT EXISTS "email_templates_id" integer REFERENCES "email_templates"("id") ON DELETE CASCADE`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "${RELS}_email_templates_id_idx" ON "${RELS}"("email_templates_id")`,
    ),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`ALTER TABLE "${RELS}" DROP COLUMN IF EXISTS "email_templates_id"`),
  );
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "email_templates"`));
}
