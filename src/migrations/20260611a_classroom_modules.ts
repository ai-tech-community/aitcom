// Classroom modules (ADR-0034): an optional, behaviour-free grouping level
// between a course and its lessons. Adds the Payload "modules" collection table
// and a nullable "module" FK column on "lessons" (existing lessons stay null =
// flat, so this is a non-breaking add). Idempotent (IF [NOT] EXISTS) so payload
// migrate reconciles it as a safe no-op against an already-migrated DB.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "modules" (
      "id" serial PRIMARY KEY,
      "course" numeric NOT NULL,
      "title" varchar NOT NULL,
      "order" numeric DEFAULT 0,
      "summary" varchar,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "modules_course_idx" ON "modules"("course")`,
    ),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "modules_order_idx" ON "modules"("order")`,
    ),
  );

  // Nullable FK on lessons → modules.id. Null = flat (ungrouped).
  await db.execute(
    sql.raw(`ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "module" numeric`),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "lessons_module_idx" ON "lessons"("module")`,
    ),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`ALTER TABLE "lessons" DROP COLUMN IF EXISTS "module"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "modules"`));
}
