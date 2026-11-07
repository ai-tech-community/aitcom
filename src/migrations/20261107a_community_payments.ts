// Additive DDL only. Do not apply during agent verification.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."payment_connection" (
      "id" uuid PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL,
      "owner_id" varchar(255) NOT NULL,
      "provider" text NOT NULL,
      "account_id" text,
      "balance_account_id" text,
      "legal_entity_id" text,
      "business_line_id" text,
      "store_id" text,
      "country" text NOT NULL DEFAULT 'NL',
      "charges_enabled" boolean NOT NULL DEFAULT false,
      "payouts_enabled" boolean NOT NULL DEFAULT false,
      "account_label" text,
      "portal_configuration_id" text,
      "environment" text NOT NULL,
      "state_hash" text,
      "state_expires_at" timestamp with time zone,
      "disconnected_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      FOREIGN KEY ("community_id") REFERENCES "app"."community" ("id"),
      FOREIGN KEY ("owner_id") REFERENCES "app"."user" ("id")
    );
    CREATE TABLE IF NOT EXISTS "app"."payment_offer" (
      "id" uuid PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL,
      "connection_id" uuid NOT NULL,
      "title" text NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "kind" text NOT NULL,
      "amount" integer NOT NULL,
      "currency" text NOT NULL DEFAULT 'EUR',
      "interval" text NOT NULL,
      "resource_id" integer,
      "published" boolean NOT NULL DEFAULT false,
      "published_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      FOREIGN KEY ("community_id") REFERENCES "app"."community" ("id"),
      FOREIGN KEY ("connection_id") REFERENCES "app"."payment_connection" ("id"),
      CONSTRAINT "payment_offer_amount_positive" CHECK ("amount" >= 100 AND "amount" <= 1000000)
    );
    CREATE TABLE IF NOT EXISTS "app"."payment_policy" (
      "community_id" varchar(255) PRIMARY KEY NOT NULL,
      "active_connection_id" uuid,
      "paid_entry_at" timestamp with time zone,
      FOREIGN KEY ("community_id") REFERENCES "app"."community" ("id"),
      FOREIGN KEY ("active_connection_id") REFERENCES "app"."payment_connection" ("id")
    );
    CREATE TABLE IF NOT EXISTS "app"."payment_order" (
      "id" uuid PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL,
      "connection_id" uuid NOT NULL,
      "offer_id" uuid NOT NULL,
      "buyer_id" varchar(255),
      "buyer_email" text NOT NULL,
      "checkout_locale" text NOT NULL DEFAULT 'en',
      "title" text NOT NULL,
      "kind" text NOT NULL,
      "amount" integer NOT NULL,
      "currency" text NOT NULL,
      "interval" text NOT NULL,
      "resource_id" integer,
      "status" text NOT NULL DEFAULT 'pending',
      "fulfillment" text NOT NULL DEFAULT 'pending',
      "provider_reference" text,
      "checkout_reference" text,
      "capture_reference" text,
      "checkout_url" text,
      "receipt_url" text,
      "renewal_of" uuid,
      "paid_period_end" timestamp with time zone,
      "request_key" uuid NOT NULL,
      "reservation_until" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      FOREIGN KEY ("community_id") REFERENCES "app"."community" ("id"),
      FOREIGN KEY ("connection_id") REFERENCES "app"."payment_connection" ("id"),
      FOREIGN KEY ("offer_id") REFERENCES "app"."payment_offer" ("id"),
      FOREIGN KEY ("buyer_id") REFERENCES "app"."user" ("id")
    );
    CREATE TABLE IF NOT EXISTS "app"."payment_subscription" (
      "id" uuid PRIMARY KEY NOT NULL,
      "order_id" uuid NOT NULL,
      "community_id" varchar(255) NOT NULL,
      "connection_id" uuid NOT NULL,
      "user_id" varchar(255),
      "provider_reference" text,
      "customer_reference" text,
      "token" text,
      "status" text NOT NULL DEFAULT 'pending',
      "paid_through" timestamp with time zone,
      "anchor" timestamp with time zone,
      "sequence" integer NOT NULL DEFAULT 0,
      "next_bill_at" timestamp with time zone,
      "cancel_at_period_end" boolean NOT NULL DEFAULT false,
      "provider_updated_at" timestamp with time zone,
      FOREIGN KEY ("order_id") REFERENCES "app"."payment_order" ("id"),
      FOREIGN KEY ("community_id") REFERENCES "app"."community" ("id"),
      FOREIGN KEY ("connection_id") REFERENCES "app"."payment_connection" ("id"),
      FOREIGN KEY ("user_id") REFERENCES "app"."user" ("id")
    );
    CREATE TABLE IF NOT EXISTS "app"."payment_billing_attempt" (
      "id" uuid PRIMARY KEY NOT NULL,
      "subscription_id" uuid NOT NULL,
      "sequence" integer NOT NULL,
      "attempt" integer NOT NULL DEFAULT 0,
      "provider_reference" text,
      "status" text NOT NULL DEFAULT 'pending',
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      FOREIGN KEY ("subscription_id") REFERENCES "app"."payment_subscription" ("id")
    );
    CREATE TABLE IF NOT EXISTS "app"."payment_event" (
      "id" text PRIMARY KEY NOT NULL,
      "connection_id" uuid NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      FOREIGN KEY ("connection_id") REFERENCES "app"."payment_connection" ("id")
    );
    CREATE TABLE IF NOT EXISTS "app"."payment_refund" (
      "id" uuid PRIMARY KEY NOT NULL,
      "order_id" uuid NOT NULL,
      "provider_reference" text,
      "amount" integer NOT NULL,
      "status" text NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      FOREIGN KEY ("order_id") REFERENCES "app"."payment_order" ("id")
    );
    CREATE TABLE IF NOT EXISTS "app"."payment_complimentary_member" (
      "community_id" varchar(255) NOT NULL,
      "user_id" varchar(255) NOT NULL,
      PRIMARY KEY ("community_id", "user_id"),
      FOREIGN KEY ("community_id") REFERENCES "app"."community" ("id"),
      FOREIGN KEY ("user_id") REFERENCES "app"."user" ("id")
    );
    CREATE TABLE IF NOT EXISTS "app"."payment_outbox" (
      "order_id" uuid PRIMARY KEY NOT NULL REFERENCES "app"."payment_order" ("id"),
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "attempted_at" timestamp with time zone,
      "last_attempt_at" timestamp with time zone,
      "sent_at" timestamp with time zone
    );
    CREATE TABLE IF NOT EXISTS "app"."payment_command" (
      "id" text PRIMARY KEY NOT NULL,
      "order_id" uuid NOT NULL REFERENCES "app"."payment_order" ("id"),
      "kind" text NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "completed_at" timestamp with time zone,
      "attempted_at" timestamp with time zone
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_connection_community_provider_uq" ON "app"."payment_connection" ("community_id", "provider") WHERE "disconnected_at" IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_connection_account_uq" ON "app"."payment_connection" ("provider", "account_id");
    CREATE INDEX IF NOT EXISTS "payment_offer_community_idx" ON "app"."payment_offer" ("community_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_order_request_uq" ON "app"."payment_order" ("request_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_order_provider_reference_uq" ON "app"."payment_order" ("connection_id", "provider_reference");
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_order_checkout_reference_uq" ON "app"."payment_order" ("connection_id", "checkout_reference");
    CREATE INDEX IF NOT EXISTS "payment_order_buyer_idx" ON "app"."payment_order" ("buyer_id");
    CREATE INDEX IF NOT EXISTS "payment_order_resource_idx" ON "app"."payment_order" ("community_id", "kind", "resource_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_subscription_order_uq" ON "app"."payment_subscription" ("order_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_subscription_provider_uq" ON "app"."payment_subscription" ("connection_id", "provider_reference");
    CREATE INDEX IF NOT EXISTS "payment_subscription_user_idx" ON "app"."payment_subscription" ("community_id", "user_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_billing_period_uq" ON "app"."payment_billing_attempt" ("subscription_id", "sequence", "attempt");
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_refund_provider_uq" ON "app"."payment_refund" ("order_id", "provider_reference");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."payment_command";
    DROP TABLE IF EXISTS "app"."payment_outbox";
    DROP TABLE IF EXISTS "app"."payment_complimentary_member";
    DROP TABLE IF EXISTS "app"."payment_refund";
    DROP TABLE IF EXISTS "app"."payment_event";
    DROP TABLE IF EXISTS "app"."payment_billing_attempt";
    DROP TABLE IF EXISTS "app"."payment_subscription";
    DROP TABLE IF EXISTS "app"."payment_order";
    DROP TABLE IF EXISTS "app"."payment_policy";
    DROP TABLE IF EXISTS "app"."payment_offer";
    DROP TABLE IF EXISTS "app"."payment_connection";
  `);
}
