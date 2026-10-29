// DDL only. Prepared for deployment; do not run against a database locally.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_magazines_font" AS ENUM ('italiana', 'bodoni', 'cormorant', 'geist');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    ALTER TABLE "public"."magazines"
      ADD COLUMN IF NOT EXISTS "font" "public"."enum_magazines_font" DEFAULT 'italiana';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "public"."magazines" DROP COLUMN IF EXISTS "font";
    DROP TYPE IF EXISTS "public"."enum_magazines_font";
  `);
}
