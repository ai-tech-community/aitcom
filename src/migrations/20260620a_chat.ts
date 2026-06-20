import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."message" ADD COLUMN IF NOT EXISTS "ui_resource" jsonb;
    ALTER TABLE "app"."message" ADD COLUMN IF NOT EXISTS "ui_producer_trust" varchar(20);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."message" DROP COLUMN IF EXISTS "ui_producer_trust";
    ALTER TABLE "app"."message" DROP COLUMN IF EXISTS "ui_resource";
  `);
}
