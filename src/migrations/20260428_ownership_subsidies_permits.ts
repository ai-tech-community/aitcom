import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Brand entity-level fields (jurisdiction, ownership-chain context)
  await db.execute(sql`
    ALTER TABLE "app"."brand"
      ADD COLUMN IF NOT EXISTS "jurisdiction" text,
      ADD COLUMN IF NOT EXISTS "jurisdiction_region" text,
      ADD COLUMN IF NOT EXISTS "entity_type" text,
      ADD COLUMN IF NOT EXISTS "ultimate_beneficial_owner" text;
  `);

  // Ownership graph
  await db.execute(sql`
    CREATE TABLE "app"."ownership_edge" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "parent_brand_id" uuid NOT NULL REFERENCES "app"."brand"("id") ON DELETE CASCADE,
      "child_brand_id" uuid NOT NULL REFERENCES "app"."brand"("id") ON DELETE CASCADE,
      "ownership_pct" numeric,
      "effective_from" date,
      "effective_to" date,
      "source_url" text,
      "notes" text,
      "verified" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ownership_edge_no_self" CHECK ("parent_brand_id" <> "child_brand_id")
    );
    CREATE INDEX "ownership_edge_parent_idx" ON "app"."ownership_edge"("parent_brand_id");
    CREATE INDEX "ownership_edge_child_idx" ON "app"."ownership_edge"("child_brand_id");
  `);

  // Subsidies (public money flow)
  await db.execute(sql`
    CREATE TABLE "app"."subsidy" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "datacenter_id" uuid REFERENCES "app"."datacenter"("id") ON DELETE SET NULL,
      "recipient_brand_id" uuid REFERENCES "app"."brand"("id") ON DELETE SET NULL,
      "kind" text NOT NULL,
      "awarded_by" text NOT NULL,
      "jurisdiction" text NOT NULL,
      "amount_usd" numeric,
      "announced_date" date,
      "effective_date" date,
      "term_years" integer,
      "claimed_jobs" integer,
      "claimed_capex_usd" numeric,
      "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "verified" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "subsidy_kind_check" CHECK ("kind" IN (
        'tax-abatement','grant','infrastructure','ppa-discount','land','training','other'
      ))
    );
    CREATE INDEX "subsidy_datacenter_idx" ON "app"."subsidy"("datacenter_id");
    CREATE INDEX "subsidy_recipient_idx" ON "app"."subsidy"("recipient_brand_id");
    CREATE INDEX "subsidy_jurisdiction_idx" ON "app"."subsidy"("jurisdiction");
  `);

  // Permits
  await db.execute(sql`
    CREATE TABLE "app"."permit" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "datacenter_id" uuid NOT NULL REFERENCES "app"."datacenter"("id") ON DELETE CASCADE,
      "kind" text NOT NULL,
      "issuing_body" text NOT NULL,
      "applied_date" date,
      "issued_date" date,
      "status" text NOT NULL DEFAULT 'granted',
      "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "verified" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "permit_kind_check" CHECK ("kind" IN (
        'zoning','environmental','water','grid-interconnect','building','other'
      )),
      CONSTRAINT "permit_status_check" CHECK ("status" IN (
        'pending','granted','denied','withdrawn'
      ))
    );
    CREATE INDEX "permit_datacenter_idx" ON "app"."permit"("datacenter_id");
    CREATE INDEX "permit_kind_idx" ON "app"."permit"("kind");
  `);

  // Status history (concentration drift, anchor-event timelines)
  await db.execute(sql`
    CREATE TABLE "app"."datacenter_status_history" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "datacenter_id" uuid NOT NULL REFERENCES "app"."datacenter"("id") ON DELETE CASCADE,
      "status" text NOT NULL,
      "effective_date" date NOT NULL,
      "source_url" text,
      "notes" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "dc_status_history_dc_idx" ON "app"."datacenter_status_history"("datacenter_id");
    CREATE INDEX "dc_status_history_date_idx" ON "app"."datacenter_status_history"("effective_date");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."datacenter_status_history" CASCADE;`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."permit" CASCADE;`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."subsidy" CASCADE;`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."ownership_edge" CASCADE;`);
  await db.execute(sql`
    ALTER TABLE "app"."brand"
      DROP COLUMN IF EXISTS "ultimate_beneficial_owner",
      DROP COLUMN IF EXISTS "entity_type",
      DROP COLUMN IF EXISTS "jurisdiction_region",
      DROP COLUMN IF EXISTS "jurisdiction";
  `);
}
