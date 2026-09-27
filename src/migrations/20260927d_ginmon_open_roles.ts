// Ginmon's careers scan stored the jobs-index button "Offene Stellen"
// (https://www.ginmon.de/careers/jobs) as the only open role. The live board
// on 2026-09-27 is six Recruitee cards. Close that index row and upsert the
// six card headings. Idempotent: a later careers scan matches these source
// URLs, refreshes copy, and leaves the index row closed.
//
// The first card's heading includes the trailing token "Ginmon" as published
// on the board. Descriptions stay empty here; offer pages that still respond
// are filled by the startup jobs cron. Two of the six offer URLs 404 on
// Recruitee while the public board still lists them — keep the card titles.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "app"."startup_role" AS r
    SET "status" = 'closed', "fetched_at" = now()
    FROM "app"."startup" AS s
    WHERE r."startup_id" = s."id"
      AND s."slug" = 'ginmon'
      AND r."status" = 'open'
      AND (
        lower(btrim(r."title")) IN (
          'offene stellen',
          'offene positionen',
          'offene jobs',
          'stellenangebote',
          'aktuelle stellen',
          'aktuelle stellenangebote',
          'ab sofort suchen wir',
          'open positions',
          'we are now looking for'
        )
        OR replace(
          replace(
            replace(
              lower(
                rtrim(
                  split_part(split_part(r."source_url", '?', 1), '#', 1),
                  '/'
                )
              ),
              'https://',
              ''
            ),
            'http://',
            ''
          ),
          'www.',
          ''
        ) IN (
          'ginmon.de/careers',
          'ginmon.de/careers/jobs',
          'ginmon.de/en/careers/jobs',
          'ginmon.de/karriere'
        )
      );
  `);

  await db.execute(sql`
    INSERT INTO "app"."startup_role" (
      "id",
      "startup_id",
      "slug",
      "title",
      "location",
      "source_url",
      "apply_url",
      "fetched_at",
      "board",
      "status"
    )
    SELECT
      gen_random_uuid()::text,
      s."id",
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM "app"."startup_role" AS taken
          WHERE taken."slug" = v.slug
            AND NOT (
              taken."startup_id" = s."id"
              AND taken."source_url" = v.source_url
            )
        )
        THEN v.slug || '-2'
        ELSE v.slug
      END,
      v.title,
      v.location,
      v.source_url,
      v.source_url,
      now(),
      'html',
      'open'
    FROM "app"."startup" AS s
    CROSS JOIN (
      VALUES
        (
          'ginmon-product-manager-m-w-d-wealth-management-platform-ginmon',
          'Product Manager (m/w/d) – Wealth Management Platform Ginmon',
          'Frankfurt am Main, Hessen, Deutschland',
          'https://ginmon.recruitee.com/o/product-manager-mwd-wealth-management-platform-ginmon'
        ),
        (
          'ginmon-product-manager-m-w-d-digital-wealth-management-apeiron',
          'Product Manager (m/w/d) – Digital Wealth Management (apeiron)',
          'Frankfurt am Main, Hessen, Deutschland',
          'https://ginmon.recruitee.com/o/product-manager-mwd-digital-wealth-management-apeiron'
        ),
        (
          'ginmon-business-development-representative-m-w-d',
          'Business Development Representative (m/w/d)',
          'Frankfurt am Main, Hessen, Deutschland',
          'https://ginmon.recruitee.com/o/business-development-representative-mwd'
        ),
        (
          'ginmon-werkstudent-finance-controlling-m-w-d',
          'Werkstudent Finance & Controlling (m/w/d)',
          'Frankfurt am Main, Hessen, Deutschland',
          'https://ginmon.recruitee.com/o/werkstudent-finance-controlling-mwd'
        ),
        (
          'ginmon-initiativbewerbung-finanzen-it-fintech-asset-management-m-w-d',
          'Initiativbewerbung – Finanzen | IT | Fintech | Asset Management (m/w/d)',
          'Frankfurt am Main, Hessen, Deutschland',
          'https://ginmon.recruitee.com/o/initiativbewerbung-finanzen-it-fintech-asset-management-mwd'
        ),
        (
          'ginmon-working-student-software-engineering-m-f-d',
          'Working Student Software Engineering (m/f/d)',
          'Frankfurt am Main, Hessen, Deutschland',
          'https://ginmon.recruitee.com/o/working-student-software-engineering-mfd'
        )
    ) AS v(slug, title, location, source_url)
    WHERE s."slug" = 'ginmon'
    ON CONFLICT ("startup_id", "source_url") DO UPDATE
    SET
      "title" = EXCLUDED."title",
      "location" = EXCLUDED."location",
      "apply_url" = EXCLUDED."apply_url",
      "status" = 'open',
      "board" = 'html',
      "fetched_at" = now();
  `);

  await db.execute(sql`
    UPDATE "app"."startup" AS s
    SET "open_role_count" = (
      SELECT count(*)::int
      FROM "app"."startup_role" AS r
      WHERE r."startup_id" = s."id"
        AND r."status" = 'open'
    )
    WHERE s."slug" = 'ginmon';
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // The closed index row was not a role. Restoring it would put the bug back.
}
