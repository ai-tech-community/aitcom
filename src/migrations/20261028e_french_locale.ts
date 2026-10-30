import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/** Prepare French locale support; this migration is applied by deployment. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Production uses _locales; generated/dev schemas use enum__locales.
    -- Version-locale enums also depend on which collections have versions.
    DO $$
    DECLARE locale_enum text;
    BEGIN
      FOR locale_enum IN
        SELECT t.typname FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'
          AND t.typname IN (
            '_locales', 'enum__locales',
            'enum__events_v_published_locale',
            'enum__articles_v_published_locale',
            'enum__pages_v_published_locale'
          )
      LOOP
        EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', locale_enum, 'fr');
      END LOOP;
    END $$;

    ALTER TABLE "app"."magazine_subscription"
      DROP CONSTRAINT IF EXISTS "magazine_subscription_locale_check";
    ALTER TABLE "app"."magazine_subscription"
      ADD CONSTRAINT "magazine_subscription_locale_check"
      CHECK ("locale" IN ('en', 'nl', 'fr'));
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Postgres enum values cannot safely be removed. Preserve French CMS
  // content; subscriptions fall back to English when reverting this feature.
  await db.execute(sql`
    UPDATE "app"."magazine_subscription" SET "locale" = 'en' WHERE "locale" = 'fr';
    ALTER TABLE "app"."magazine_subscription"
      DROP CONSTRAINT IF EXISTS "magazine_subscription_locale_check";
    ALTER TABLE "app"."magazine_subscription"
      ADD CONSTRAINT "magazine_subscription_locale_check"
      CHECK ("locale" IN ('en', 'nl'));
  `);
}
