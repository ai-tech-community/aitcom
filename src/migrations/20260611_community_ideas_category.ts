import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_community_ideas_category" AS ENUM('platform', 'agent-capability');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.execute(sql`
    ALTER TABLE "community_ideas"
      ADD COLUMN IF NOT EXISTS "category" "enum_community_ideas_category" DEFAULT 'platform' NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "community_ideas" DROP COLUMN IF EXISTS "category";
  `);
  await db.execute(sql`
    DROP TYPE IF EXISTS "enum_community_ideas_category";
  `);
}
