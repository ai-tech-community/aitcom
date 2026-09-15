// Creates app.curated_public_event for the thin /events list.
// Seeds the one verified public row (World Summit AI Amsterdam 2026).
// Idempotent so `payload migrate` is a safe no-op when the table exists.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."curated_public_event" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "title" text NOT NULL,
      "date" date NOT NULL,
      "online" boolean NOT NULL DEFAULT false,
      "city" text,
      "url" text NOT NULL,
      "why_en" text NOT NULL,
      "why_nl" text NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "curated_public_event_url_idx"
      ON "app"."curated_public_event" ("url");
    CREATE INDEX IF NOT EXISTS "curated_public_event_date_idx"
      ON "app"."curated_public_event" ("date");
  `);

  await db.execute(sql`
    INSERT INTO "app"."curated_public_event" (
      "id", "title", "date", "online", "city", "url",
      "why_en", "why_nl", "created_at"
    ) VALUES (
      'world-summit-ai-amsterdam-2026',
      'World Summit AI Amsterdam 2026',
      '2026-10-07',
      false,
      'Amsterdam',
      'https://worldsummit.ai/',
      'Flagship global AI summit in the Netherlands for builders to track.',
      'Toonaangevende wereldwijde AI-top in Nederland voor bouwers.',
      '2026-09-15T12:00:00Z'
    )
    ON CONFLICT ("url") DO NOTHING;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."curated_public_event";
  `);
}
