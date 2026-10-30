// Staff/agent facility editor. DDL only: nullable source and checked-at on
// the live facility rows, plus the Payload collection that edits them. No
// backfill and no row deletes. Existing slugs stay where they are.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."datacenter"
      ADD COLUMN IF NOT EXISTS "source_url" text;
    ALTER TABLE "app"."datacenter"
      ADD COLUMN IF NOT EXISTS "checked_at" timestamptz;
    DO $$ BEGIN
      ALTER TABLE "app"."datacenter"
        ADD CONSTRAINT "datacenter_source_url_https"
        CHECK (source_url IS NULL OR source_url ~ '^https://');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_datacenter_facilities_status" AS ENUM(
        'announced', 'under-construction', 'operational', 'expanding', 'decommissioned', 'cancelled'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_datacenter_facilities_permits_kind" AS ENUM(
        'zoning', 'environmental', 'water', 'grid-interconnect', 'building', 'other'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_datacenter_facilities_permits_status" AS ENUM(
        'pending', 'granted', 'denied', 'withdrawn'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "datacenter_facilities" (
      "id" serial PRIMARY KEY,
      "name" varchar NOT NULL,
      "operator" varchar NOT NULL,
      "country" varchar NOT NULL,
      "city" varchar,
      "lat" numeric NOT NULL,
      "lng" numeric NOT NULL,
      "capacity_mw" numeric,
      "status" "enum_datacenter_facilities_status" DEFAULT 'announced' NOT NULL,
      "source_url" varchar NOT NULL,
      "checked_at" timestamp(3) with time zone NOT NULL,
      "slug" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "datacenter_facilities_slug_idx"
      ON "datacenter_facilities"("slug");
    CREATE INDEX IF NOT EXISTS "datacenter_facilities_updated_at_idx"
      ON "datacenter_facilities"("updated_at");
    CREATE INDEX IF NOT EXISTS "datacenter_facilities_created_at_idx"
      ON "datacenter_facilities"("created_at");

    CREATE TABLE IF NOT EXISTS "datacenter_facilities_permits" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "kind" "enum_datacenter_facilities_permits_kind" NOT NULL,
      "issuing_body" varchar NOT NULL,
      "status" "enum_datacenter_facilities_permits_status" DEFAULT 'granted' NOT NULL,
      "applied_date" timestamp(3) with time zone,
      "issued_date" timestamp(3) with time zone,
      "source_url" varchar
    );
    CREATE INDEX IF NOT EXISTS "datacenter_facilities_permits_order_idx"
      ON "datacenter_facilities_permits"("_order");
    CREATE INDEX IF NOT EXISTS "datacenter_facilities_permits_parent_id_idx"
      ON "datacenter_facilities_permits"("_parent_id");
    DO $$ BEGIN
      ALTER TABLE "datacenter_facilities_permits"
        ADD CONSTRAINT "datacenter_facilities_permits_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."datacenter_facilities"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "datacenter_facilities_id" integer;
    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_datacenter_facilities_fk"
        FOREIGN KEY ("datacenter_facilities_id") REFERENCES "public"."datacenter_facilities"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_datacenter_facilities_id_idx"
      ON "payload_locked_documents_rels"("datacenter_facilities_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_datacenter_facilities_fk";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "datacenter_facilities_id";
    DROP TABLE IF EXISTS "datacenter_facilities_permits";
    DROP TABLE IF EXISTS "datacenter_facilities";
    DROP TYPE IF EXISTS "public"."enum_datacenter_facilities_permits_status";
    DROP TYPE IF EXISTS "public"."enum_datacenter_facilities_permits_kind";
    DROP TYPE IF EXISTS "public"."enum_datacenter_facilities_status";
    ALTER TABLE "app"."datacenter"
      DROP CONSTRAINT IF EXISTS "datacenter_source_url_https";
    ALTER TABLE "app"."datacenter"
      DROP COLUMN IF EXISTS "checked_at";
    ALTER TABLE "app"."datacenter"
      DROP COLUMN IF EXISTS "source_url";
  `);
}
