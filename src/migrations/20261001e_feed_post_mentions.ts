// Who a post's "@Name" mentions point at (#391, slice 5): a list of
// { userId, name } the server checked. Additive; old posts have none.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts" ADD COLUMN IF NOT EXISTS "mentions" jsonb;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts" DROP COLUMN IF EXISTS "mentions";
  `);
}
