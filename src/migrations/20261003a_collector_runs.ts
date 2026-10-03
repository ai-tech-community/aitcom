// Data collectors (ADR-0040). Additive:
//
// - app.collector_run: one queued/running/finished run (the stored Command),
//   with metering counters and a worker lease.
// - app.collector_item: the run's rows, ordered by seq; removed with the run.
// - app.collector_blocked_domain: sites that opted out; blocks subdomains.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."collector_run" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL
        REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "agent_id" varchar(255),
      "origin" varchar(16) NOT NULL,
      "collector_id" varchar(64) NOT NULL,
      "collector_version" integer NOT NULL,
      "input" jsonb NOT NULL,
      "status" varchar(16) NOT NULL,
      "stop_reason" varchar(32),
      "attempts" integer DEFAULT 0 NOT NULL,
      "lease_until" timestamp with time zone,
      "pages_fetched" integer DEFAULT 0 NOT NULL,
      "bytes_fetched" bigint DEFAULT 0 NOT NULL,
      "item_count" integer DEFAULT 0 NOT NULL,
      "invalid_item_count" integer DEFAULT 0 NOT NULL,
      "duration_ms" integer,
      "error" varchar(500),
      "log" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "started_at" timestamp with time zone,
      "finished_at" timestamp with time zone,
      "expires_at" timestamp with time zone NOT NULL,
      CONSTRAINT "collector_run_origin_chk"
        CHECK ("origin" IN ('web', 'mcp')),
      CONSTRAINT "collector_run_status_chk"
        CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed'))
    );
    CREATE INDEX IF NOT EXISTS "collector_run_user_created_idx"
      ON "app"."collector_run" USING btree ("user_id", "created_at" DESC);
    CREATE INDEX IF NOT EXISTS "collector_run_status_created_idx"
      ON "app"."collector_run" USING btree ("status", "created_at");
    CREATE INDEX IF NOT EXISTS "collector_run_expires_idx"
      ON "app"."collector_run" USING btree ("expires_at");

    CREATE TABLE IF NOT EXISTS "app"."collector_item" (
      "run_id" varchar(255) NOT NULL
        REFERENCES "app"."collector_run"("id") ON DELETE CASCADE,
      "seq" integer NOT NULL,
      "data" jsonb NOT NULL,
      CONSTRAINT "collector_item_run_id_seq_pk" PRIMARY KEY ("run_id", "seq")
    );

    CREATE TABLE IF NOT EXISTS "app"."collector_blocked_domain" (
      "domain" varchar(255) PRIMARY KEY NOT NULL,
      "reason" varchar(200) NOT NULL,
      "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."collector_item";
    DROP TABLE IF EXISTS "app"."collector_run";
    DROP TABLE IF EXISTS "app"."collector_blocked_domain";
  `);
}
