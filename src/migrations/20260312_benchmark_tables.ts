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
      "contributor_id" text NOT NULL REFERENCES "public"."user"("id"),
      "contributor_name" text NOT NULL,
      "status" text NOT NULL DEFAULT 'pending',
      "upvotes" integer NOT NULL DEFAULT 0,
      "downvotes" integer NOT NULL DEFAULT 0,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "benchmark_question_status_idx"
      ON "app"."benchmark_question"("status");
    CREATE INDEX IF NOT EXISTS "benchmark_question_topic_idx"
      ON "app"."benchmark_question"("topic");
    CREATE INDEX IF NOT EXISTS "benchmark_question_contributor_idx"
      ON "app"."benchmark_question"("contributor_id");
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

    CREATE INDEX IF NOT EXISTS "benchmark_run_agent_idx"
      ON "app"."benchmark_run"("agent_id");
    CREATE INDEX IF NOT EXISTS "benchmark_run_score_idx"
      ON "app"."benchmark_run"("score_percent");
    CREATE INDEX IF NOT EXISTS "benchmark_run_topic_idx"
      ON "app"."benchmark_run"("topic_filter");
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

    CREATE INDEX IF NOT EXISTS "benchmark_answer_run_idx"
      ON "app"."benchmark_answer"("run_id");
    CREATE INDEX IF NOT EXISTS "benchmark_answer_question_idx"
      ON "app"."benchmark_answer"("question_id");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."benchmark_vote" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "question_id" uuid NOT NULL REFERENCES "app"."benchmark_question"("id"),
      "user_id" text NOT NULL REFERENCES "public"."user"("id"),
      "vote" text NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "benchmark_vote_user_question_idx"
      ON "app"."benchmark_vote"("user_id", "question_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."benchmark_vote";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."benchmark_answer";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."benchmark_run";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."benchmark_question";`);
}
