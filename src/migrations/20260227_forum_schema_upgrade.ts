import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Create enum types for author_role
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_forum_threads_author_role" AS ENUM('admin', 'moderator', 'contributor', 'member');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_forum_replies_author_role" AS ENUM('admin', 'moderator', 'contributor', 'member');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  // forum_threads: add author_role and view_count columns
  await db.execute(sql`
    ALTER TABLE "forum_threads"
      ADD COLUMN IF NOT EXISTS "author_role" "enum_forum_threads_author_role" DEFAULT 'member',
      ADD COLUMN IF NOT EXISTS "view_count" numeric DEFAULT 0;
  `);

  // forum_threads: convert content from varchar/text to jsonb
  // Wrap existing plain text content in a minimal Lexical JSON structure
  await db.execute(sql`
    ALTER TABLE "forum_threads"
      ALTER COLUMN "content" TYPE jsonb
      USING CASE
        WHEN content IS NULL THEN NULL
        WHEN content::text LIKE '{%' THEN content::jsonb
        ELSE jsonb_build_object(
          'root', jsonb_build_object(
            'type', 'root',
            'children', jsonb_build_array(
              jsonb_build_object(
                'type', 'paragraph',
                'children', jsonb_build_array(
                  jsonb_build_object('type', 'text', 'text', content::text)
                )
              )
            ),
            'direction', 'ltr',
            'format', '',
            'indent', 0,
            'version', 1
          )
        )
      END;
  `);

  // forum_replies: add author_role column
  await db.execute(sql`
    ALTER TABLE "forum_replies"
      ADD COLUMN IF NOT EXISTS "author_role" "enum_forum_replies_author_role" DEFAULT 'member';
  `);

  // forum_replies: convert content from varchar/text to jsonb
  await db.execute(sql`
    ALTER TABLE "forum_replies"
      ALTER COLUMN "content" TYPE jsonb
      USING CASE
        WHEN content IS NULL THEN NULL
        WHEN content::text LIKE '{%' THEN content::jsonb
        ELSE jsonb_build_object(
          'root', jsonb_build_object(
            'type', 'root',
            'children', jsonb_build_array(
              jsonb_build_object(
                'type', 'paragraph',
                'children', jsonb_build_array(
                  jsonb_build_object('type', 'text', 'text', content::text)
                )
              )
            ),
            'direction', 'ltr',
            'format', '',
            'indent', 0,
            'version', 1
          )
        )
      END;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // forum_replies: revert content to varchar and drop author_role
  await db.execute(sql`
    ALTER TABLE "forum_replies"
      ALTER COLUMN "content" TYPE varchar USING content::text,
      DROP COLUMN IF EXISTS "author_role";
  `);

  // forum_threads: revert content to varchar, drop new columns
  await db.execute(sql`
    ALTER TABLE "forum_threads"
      ALTER COLUMN "content" TYPE varchar USING content::text,
      DROP COLUMN IF EXISTS "author_role",
      DROP COLUMN IF EXISTS "view_count";
  `);

  // Drop enum types
  await db.execute(sql`
    DROP TYPE IF EXISTS "enum_forum_replies_author_role";
    DROP TYPE IF EXISTS "enum_forum_threads_author_role";
  `);
}
