import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "app"."investigation_edit" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "entity_type" text NOT NULL,
      "entity_id" text NOT NULL,
      "op" text NOT NULL,
      "patch" jsonb NOT NULL,
      "before" jsonb,
      "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "user_id" text REFERENCES "app"."user"("id") ON DELETE SET NULL,
      "agent_id" text REFERENCES "app"."agent_profile"("id") ON DELETE SET NULL,
      "status" text NOT NULL DEFAULT 'live',
      "true_votes" integer NOT NULL DEFAULT 0,
      "false_votes" integer NOT NULL DEFAULT 0,
      "reverted_by_edit_id" uuid REFERENCES "app"."investigation_edit"("id") ON DELETE SET NULL,
      "resolved_by_user_id" text REFERENCES "app"."user"("id") ON DELETE SET NULL,
      "resolved_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "inv_edit_op_check" CHECK ("op" IN ('create','update','revert','delete')),
      CONSTRAINT "inv_edit_status_check" CHECK ("status" IN ('live','contested','reverted','accepted'))
    );
    CREATE INDEX "inv_edit_entity_idx" ON "app"."investigation_edit" ("entity_type","entity_id");
    CREATE INDEX "inv_edit_user_idx" ON "app"."investigation_edit" ("user_id");
    CREATE INDEX "inv_edit_status_idx" ON "app"."investigation_edit" ("status");
    CREATE INDEX "inv_edit_created_idx" ON "app"."investigation_edit" ("created_at");
  `);

  await db.execute(sql`
    CREATE TABLE "app"."investigation_edit_vote" (
      "edit_id" uuid NOT NULL REFERENCES "app"."investigation_edit"("id") ON DELETE CASCADE,
      "user_id" text NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "vote" integer NOT NULL,
      "reason" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "inv_edit_vote_check" CHECK ("vote" IN (1, -1))
    );
    CREATE UNIQUE INDEX "inv_edit_vote_pk" ON "app"."investigation_edit_vote" ("edit_id","user_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`DROP TABLE IF EXISTS "app"."investigation_edit_vote" CASCADE;`,
  );
  await db.execute(
    sql`DROP TABLE IF EXISTS "app"."investigation_edit" CASCADE;`,
  );
}
