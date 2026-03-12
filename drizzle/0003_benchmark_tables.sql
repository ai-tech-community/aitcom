-- Benchmark tables (app schema, managed by Drizzle)
-- Note: cross-schema FK references to public.user are omitted because
-- that table is managed by Better Auth / Payload, not Drizzle.

CREATE SCHEMA IF NOT EXISTS "app";

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
  "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "benchmark_question_status_idx"
  ON "app"."benchmark_question"("status");
CREATE INDEX IF NOT EXISTS "benchmark_question_topic_idx"
  ON "app"."benchmark_question"("topic");
CREATE INDEX IF NOT EXISTS "benchmark_question_contributor_idx"
  ON "app"."benchmark_question"("contributor_id");

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

CREATE TABLE IF NOT EXISTS "app"."benchmark_vote" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "question_id" uuid NOT NULL REFERENCES "app"."benchmark_question"("id"),
  "user_id" text NOT NULL,
  "vote" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "benchmark_vote_user_question_idx"
  ON "app"."benchmark_vote"("user_id", "question_id");
