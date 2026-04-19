import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // 1. Add new columns to community_rules global
  await db.execute(sql`
    ALTER TABLE "community_rules" ADD COLUMN IF NOT EXISTS "version" numeric DEFAULT 1 NOT NULL;
    ALTER TABLE "community_rules" ADD COLUMN IF NOT EXISTS "effective_date" timestamptz;
    ALTER TABLE "community_rules" DROP COLUMN IF EXISTS "content";
  `);

  // 2. Create enum types and sections array table
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_community_rules_sections_icon" AS ENUM('shield', 'users', 'flag', 'scale', 'brain', 'gavel');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS "community_rules_sections" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "slug" varchar NOT NULL,
      "icon" "enum_community_rules_sections_icon"
    );
  `);

  // 3. Create the sections locales table (title + content are localized)
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "_locales" AS ENUM('en', 'nl');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS "community_rules_sections_locales" (
      "title" varchar,
      "content" jsonb,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" "_locales" NOT NULL,
      "_parent_id" varchar NOT NULL
    );
  `);

  // 4. Drop the old community_rules locales table (content was localized, now moved to sections)
  await db.execute(sql`
    DROP TABLE IF EXISTS "community_rules_locales";
  `);

  // 5. Add foreign keys and indexes
  await db.execute(sql`
    ALTER TABLE "community_rules_sections"
      ADD CONSTRAINT "community_rules_sections_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "community_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    CREATE INDEX IF NOT EXISTS "community_rules_sections_order_idx" ON "community_rules_sections" ("_order");
    CREATE INDEX IF NOT EXISTS "community_rules_sections_parent_id_idx" ON "community_rules_sections" ("_parent_id");

    ALTER TABLE "community_rules_sections_locales"
      ADD CONSTRAINT "community_rules_sections_locales_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "community_rules_sections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    CREATE UNIQUE INDEX IF NOT EXISTS "community_rules_sections_locales_locale_parent_id_unique"
      ON "community_rules_sections_locales" ("_locale", "_parent_id");
  `);

  // 6. Create rules_acceptance collection table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "rules_acceptance" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" varchar NOT NULL,
      "rules_version" numeric NOT NULL,
      "accepted_at" timestamptz NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS "rules_acceptance_user_id_idx" ON "rules_acceptance" ("user_id");
    CREATE INDEX IF NOT EXISTS "rules_acceptance_updated_at_idx" ON "rules_acceptance" ("updated_at");
    CREATE INDEX IF NOT EXISTS "rules_acceptance_created_at_idx" ON "rules_acceptance" ("created_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Drop new tables and enum types
  await db.execute(sql`
    DROP TABLE IF EXISTS "rules_acceptance";
    DROP TABLE IF EXISTS "community_rules_sections_locales";
    DROP TABLE IF EXISTS "community_rules_sections";
    DROP TYPE IF EXISTS "enum_community_rules_sections_icon";
  `);

  // Restore original community_rules columns
  await db.execute(sql`
    ALTER TABLE "community_rules" DROP COLUMN IF EXISTS "version";
    ALTER TABLE "community_rules" DROP COLUMN IF EXISTS "effective_date";
  `);

  // Recreate original locales table with content field
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "community_rules_locales" (
      "content" jsonb,
      "id" serial PRIMARY KEY NOT NULL,
      "_locale" varchar NOT NULL,
      "_parent_id" integer NOT NULL
    );

    ALTER TABLE "community_rules_locales"
      ADD CONSTRAINT "community_rules_locales_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "community_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

    CREATE UNIQUE INDEX IF NOT EXISTS "community_rules_locales_locale_parent_id_unique"
      ON "community_rules_locales" ("_locale", "_parent_id");
  `);
}
