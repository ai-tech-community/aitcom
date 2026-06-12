import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

// The Events collection gained 'cancelled', 'completed', and 'rejected'
// status options without a matching enum migration, so any query mentioning
// those values (e.g. hackathonEventForChallenge's status not_in filter, or
// the winners/gallery pages' draft/rejected exclusion) threw
// "invalid input value for enum enum_events_status" on databases whose enum
// predates the options — including fresh local stacks, where Payload's dev
// push has been observed to create the enum with only {draft, published}.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TYPE "public"."enum_events_status" ADD VALUE IF NOT EXISTS 'cancelled';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TYPE "public"."enum_events_status" ADD VALUE IF NOT EXISTS 'completed';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TYPE "public"."enum_events_status" ADD VALUE IF NOT EXISTS 'rejected';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TYPE "public"."enum__events_v_version_status" ADD VALUE IF NOT EXISTS 'cancelled';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TYPE "public"."enum__events_v_version_status" ADD VALUE IF NOT EXISTS 'completed';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TYPE "public"."enum__events_v_version_status" ADD VALUE IF NOT EXISTS 'rejected';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Postgres does not support removing enum values; leave enum intact.
}
