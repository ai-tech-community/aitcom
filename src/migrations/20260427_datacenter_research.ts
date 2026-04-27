import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "app"."datacenter" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" text NOT NULL,
      "slug" text NOT NULL UNIQUE,
      "operator_id" uuid NOT NULL REFERENCES "app"."brand"("id") ON DELETE RESTRICT,
      "status" text NOT NULL DEFAULT 'announced',
      "ai_dedicated" boolean NOT NULL DEFAULT false,
      "lat" numeric NOT NULL,
      "lng" numeric NOT NULL,
      "address" text,
      "city" text,
      "region" text,
      "country" text NOT NULL,
      "capacity_mw" numeric,
      "capacity_mw_planned" numeric,
      "square_footage" numeric,
      "rack_count" integer,
      "gpus" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "primary_power_source" text,
      "utility_id" uuid REFERENCES "app"."brand"("id") ON DELETE SET NULL,
      "pue_pledged" numeric,
      "cooling_type" text,
      "water_draw_mgd" numeric,
      "water_draw_cubic_m" numeric,
      "wue_pledged" numeric,
      "announced_date" date,
      "groundbreak_date" date,
      "online_date" date,
      "full_capacity_date" date,
      "capex_usd" numeric,
      "description" text,
      "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "submitted_by_user_id" text REFERENCES "app"."user"("id") ON DELETE SET NULL,
      "verified" boolean NOT NULL DEFAULT false,
      "verified_count" integer NOT NULL DEFAULT 0,
      "extractor_metadata" jsonb,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "datacenter_status_check" CHECK ("status" IN (
        'announced','under-construction','operational','expanding','decommissioned','cancelled'
      )),
      CONSTRAINT "datacenter_power_source_check" CHECK (
        "primary_power_source" IS NULL OR "primary_power_source" IN (
          'grid-mixed','gas','nuclear','solar','wind','hydro','geothermal','hybrid'
        )
      ),
      CONSTRAINT "datacenter_cooling_check" CHECK (
        "cooling_type" IS NULL OR "cooling_type" IN (
          'air','open-loop','closed-loop','direct-to-chip','immersion'
        )
      )
    );
    CREATE INDEX "datacenter_operator_idx" ON "app"."datacenter"("operator_id");
    CREATE INDEX "datacenter_country_idx" ON "app"."datacenter"("country");
    CREATE INDEX "datacenter_status_idx" ON "app"."datacenter"("status");
    CREATE INDEX "datacenter_verified_idx" ON "app"."datacenter"("verified");
    CREATE INDEX "datacenter_loc_idx" ON "app"."datacenter"("lat","lng");
  `);

  await db.execute(sql`
    CREATE TABLE "app"."datacenter_supplier" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "datacenter_id" uuid NOT NULL REFERENCES "app"."datacenter"("id") ON DELETE CASCADE,
      "supplier_id" uuid NOT NULL REFERENCES "app"."brand"("id") ON DELETE RESTRICT,
      "category" text NOT NULL,
      "role" text,
      "contract_value_usd" numeric,
      "is_local" boolean NOT NULL DEFAULT false,
      "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "verified" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "dc_supplier_category_check" CHECK ("category" IN (
        'gc','civil','electrical','transformer','backup-power','cooling',
        'fiber','hardware','security','staffing','other'
      ))
    );
    CREATE INDEX "dc_supplier_dc_idx" ON "app"."datacenter_supplier"("datacenter_id");
    CREATE INDEX "dc_supplier_supplier_idx" ON "app"."datacenter_supplier"("supplier_id");
    CREATE INDEX "dc_supplier_category_idx" ON "app"."datacenter_supplier"("category");
    CREATE UNIQUE INDEX "dc_supplier_dc_supplier_category_uq"
      ON "app"."datacenter_supplier"("datacenter_id","supplier_id","category");
  `);

  await db.execute(sql`
    CREATE TABLE "app"."energy_deal" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "title" text NOT NULL,
      "datacenter_id" uuid REFERENCES "app"."datacenter"("id") ON DELETE SET NULL,
      "buyer_id" uuid NOT NULL REFERENCES "app"."brand"("id") ON DELETE RESTRICT,
      "counterparty_id" uuid NOT NULL REFERENCES "app"."brand"("id") ON DELETE RESTRICT,
      "type" text NOT NULL,
      "energy_type" text,
      "mw" numeric,
      "term_years" numeric,
      "signed_date" date,
      "start_date" date,
      "value_usd" numeric,
      "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "verified" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "energy_deal_type_check" CHECK ("type" IN (
        'ppa','vppa','grid','behind-meter','nuclear','on-site'
      )),
      CONSTRAINT "energy_deal_energy_type_check" CHECK (
        "energy_type" IS NULL OR "energy_type" IN (
          'solar','wind','nuclear','gas','hydro','geothermal','mixed'
        )
      )
    );
    CREATE INDEX "energy_deal_dc_idx" ON "app"."energy_deal"("datacenter_id");
    CREATE INDEX "energy_deal_buyer_idx" ON "app"."energy_deal"("buyer_id");
    CREATE INDEX "energy_deal_counterparty_idx" ON "app"."energy_deal"("counterparty_id");
    CREATE INDEX "energy_deal_signed_idx" ON "app"."energy_deal"("signed_date");
  `);

  await db.execute(sql`
    CREATE TABLE "app"."datacenter_finding" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "datacenter_id" uuid REFERENCES "app"."datacenter"("id") ON DELETE SET NULL,
      "user_id" text NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "title" text NOT NULL,
      "body" text,
      "evidence_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "status" text NOT NULL DEFAULT 'review',
      "upvotes" integer NOT NULL DEFAULT 0,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "dc_finding_status_check" CHECK ("status" IN (
        'draft','review','verified','disputed'
      ))
    );
    CREATE INDEX "dc_finding_dc_idx" ON "app"."datacenter_finding"("datacenter_id");
    CREATE INDEX "dc_finding_user_idx" ON "app"."datacenter_finding"("user_id");
    CREATE INDEX "dc_finding_status_idx" ON "app"."datacenter_finding"("status");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."datacenter_finding" CASCADE;
    DROP TABLE IF EXISTS "app"."energy_deal" CASCADE;
    DROP TABLE IF EXISTS "app"."datacenter_supplier" CASCADE;
    DROP TABLE IF EXISTS "app"."datacenter" CASCADE;
  `);
}
