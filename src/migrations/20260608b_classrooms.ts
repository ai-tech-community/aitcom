import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Payload collection tables (Payload also auto-creates via push in dev; keep for prod).
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "courses" (
      "id" serial PRIMARY KEY,
      "title" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "summary" varchar,
      "author_id" varchar NOT NULL,
      "author_name" varchar,
      "status" varchar DEFAULT 'draft' NOT NULL,
      "community_id" varchar NOT NULL,
      "is_public" boolean DEFAULT false,
      "enrollment_count" numeric DEFAULT 0,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `),
  );
  await db.execute(
    sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "courses_slug_idx" ON "courses"("slug")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "courses_community_id_idx" ON "courses"("community_id")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "courses_author_id_idx" ON "courses"("author_id")`,
    ),
  );

  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "lessons" (
      "id" serial PRIMARY KEY,
      "course" numeric NOT NULL,
      "title" varchar NOT NULL,
      "order" numeric DEFAULT 0,
      "youtube_url" varchar,
      "body" jsonb,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "lessons_course_idx" ON "lessons"("course")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "lessons_order_idx" ON "lessons"("order")`,
    ),
  );

  // lessons.resources is an array field → Payload represents it as a child table
  // "lessons_resources" (one row per resource), shape mirroring other array tables
  // like launchpad_projects_links: _order, _parent_id (FK→lessons, cascade), a
  // varchar id PK, and the array fields. Payload's read query lateral-joins this
  // table, so it MUST exist or `lessons` queries fail.
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "lessons_resources" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
      "id" varchar PRIMARY KEY,
      "label" varchar NOT NULL,
      "url" varchar NOT NULL
    )
  `),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "lessons_resources_order_idx" ON "lessons_resources"("_order")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "lessons_resources_parent_id_idx" ON "lessons_resources"("_parent_id")`,
    ),
  );

  // Drizzle tracking tables (app schema).
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "app"."course_enrollment" (
      "id" varchar(255) PRIMARY KEY,
      "course_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "enrolled_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "course_enrollment_course_idx" ON "app"."course_enrollment"("course_id")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "course_enrollment_user_idx" ON "app"."course_enrollment"("user_id")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "course_enrollment_unique" ON "app"."course_enrollment"("course_id","user_id")`,
    ),
  );

  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "app"."lesson_completion" (
      "id" varchar(255) PRIMARY KEY,
      "lesson_id" integer NOT NULL,
      "course_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "completed_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "lesson_completion_course_idx" ON "app"."lesson_completion"("course_id")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "lesson_completion_user_idx" ON "app"."lesson_completion"("user_id")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "lesson_completion_unique" ON "app"."lesson_completion"("lesson_id","user_id")`,
    ),
  );

  // Community policy column.
  await db.execute(
    sql.raw(
      `ALTER TABLE "app"."community" ADD COLUMN IF NOT EXISTS "classroom_create_policy" varchar(30) DEFAULT 'all_members' NOT NULL`,
    ),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(
      `ALTER TABLE "app"."community" DROP COLUMN IF EXISTS "classroom_create_policy"`,
    ),
  );
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "app"."lesson_completion"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "app"."course_enrollment"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "lessons_resources"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "lessons"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "courses"`));
}
