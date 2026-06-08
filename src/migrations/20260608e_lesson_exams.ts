import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Exam definition columns on the Payload lessons table.
  await db.execute(sql.raw(`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "exam_mandatory" boolean DEFAULT false`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "exam_pass_threshold" numeric DEFAULT 70`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "exam_max_attempts" numeric DEFAULT 0`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "exam_questions" jsonb`));

  // Per-learner attempt history (app schema).
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "app"."lesson_exam_attempt" (
      "id" varchar(255) PRIMARY KEY,
      "lesson_id" integer NOT NULL,
      "course_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "score" integer NOT NULL,
      "threshold_at_attempt" integer NOT NULL,
      "passed" boolean NOT NULL,
      "answers" jsonb NOT NULL,
      "attempted_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "lesson_exam_attempt_lesson_user_idx" ON "app"."lesson_exam_attempt"("lesson_id","user_id")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "lesson_exam_attempt_course_idx" ON "app"."lesson_exam_attempt"("course_id")`));

  // Course-completion certificates (app schema).
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "app"."course_certificate" (
      "id" varchar(255) PRIMARY KEY,
      "course_id" integer NOT NULL,
      "user_id" varchar(255) NOT NULL,
      "issued_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "course_certificate_user_idx" ON "app"."course_certificate"("user_id")`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "course_certificate_unique" ON "app"."course_certificate"("course_id","user_id")`));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "app"."course_certificate"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "app"."lesson_exam_attempt"`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" DROP COLUMN IF EXISTS "exam_questions"`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" DROP COLUMN IF EXISTS "exam_max_attempts"`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" DROP COLUMN IF EXISTS "exam_pass_threshold"`));
  await db.execute(sql.raw(`ALTER TABLE "lessons" DROP COLUMN IF EXISTS "exam_mandatory"`));
}
