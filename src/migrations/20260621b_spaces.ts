import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Community Spaces (Slice 3, Plan 1) — the `space` table backs DB-driven
 * community navigation. v1 rows are all kind='builtin' (configurable pointers to
 * existing surfaces). Room-only columns (visibility, resident agent) arrive in a
 * later plan. DDL mirrors the Drizzle definition in src/server/db/schema.ts.
 * Idempotent so `pnpm db:apply` is a safe no-op where already applied.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."space" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "kind" varchar(10) NOT NULL DEFAULT 'builtin',
      "builtin_surface" varchar(20),
      "name" text,
      "purpose" text,
      "slug" text NOT NULL,
      "position" integer NOT NULL DEFAULT 0,
      "created_by" varchar(255) REFERENCES "app"."user"("id"),
      "archived_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "space_community_slug_uidx"
      ON "app"."space" ("community_id", "slug");
    CREATE INDEX IF NOT EXISTS "space_community_position_idx"
      ON "app"."space" ("community_id", "position");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."space";`);
}
