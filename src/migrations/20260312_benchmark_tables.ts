import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."benchmark_question" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "question" text NOT NULL,
      "correct_answer" text NOT NULL,
      "option_b" text NOT NULL,
      "option_c" text NOT NULL,
      "option_d" text NOT NULL,
      "explanation" text,
      "topic" text NOT NULL,
      "difficulty" text NOT NULL,
      "contributor_id" text NOT NULL,
      "contributor_name" text NOT NULL,
      "status" text NOT NULL DEFAULT 'pending',
      "upvotes" integer NOT NULL DEFAULT 0,
      "downvotes" integer NOT NULL DEFAULT 0,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."benchmark_run" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "agent_id" uuid NOT NULL,
      "agent_name" text NOT NULL,
      "owner_id" text NOT NULL,
      "total_questions" integer NOT NULL,
      "correct_answers" integer NOT NULL,
      "score_percent" numeric NOT NULL,
      "topic_filter" text,
      "duration_ms" integer NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."benchmark_answer" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" uuid NOT NULL REFERENCES "app"."benchmark_run"("id"),
      "question_id" uuid NOT NULL REFERENCES "app"."benchmark_question"("id"),
      "submitted_option" text NOT NULL,
      "correct_option" text NOT NULL,
      "is_correct" boolean NOT NULL,
      "reasoning" text
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."benchmark_answer";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."benchmark_run";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."benchmark_question";`);
}
