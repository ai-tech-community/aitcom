// "@everyone" in feed posts (#391): when a post's @everyone went out to
// its community, so it goes out once. Additive.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts"
      ADD COLUMN IF NOT EXISTS "announced_at" timestamp(3) with time zone;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts" DROP COLUMN IF EXISTS "announced_at";
  `);
}
