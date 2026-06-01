import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community_invite"
      ADD COLUMN IF NOT EXISTS "role" varchar(32);
    ALTER TABLE "app"."community_invite"
      ADD COLUMN IF NOT EXISTS "target_email" varchar(255);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community_invite" DROP COLUMN IF EXISTS "target_email";
    ALTER TABLE "app"."community_invite" DROP COLUMN IF EXISTS "role";
  `);
}
