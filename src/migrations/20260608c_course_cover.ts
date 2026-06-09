import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(
      `ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "cover_image_url" varchar`,
    ),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`ALTER TABLE "courses" DROP COLUMN IF EXISTS "cover_image_url"`),
  );
}
