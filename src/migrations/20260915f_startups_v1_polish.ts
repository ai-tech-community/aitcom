// Thin Startups polish: refresh v1 sources (Cursor joining-spacex) + founders
// imageUrl shape from the fixture. Additive UPDATE only. No invent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { STARTUPS_V1_SEEDS } from "@/lib/investigations/startups-v1-seeds";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const seed of STARTUPS_V1_SEEDS) {
    const sourcesJson = JSON.stringify(seed.sources);
    const foundersJson = JSON.stringify(seed.founders);
    await db.execute(sql`
      UPDATE "app"."startup"
      SET
        "sources" = ${sourcesJson}::jsonb,
        "founders" = ${foundersJson}::jsonb
      WHERE "id" = ${seed.id} OR "homepage" = ${seed.homepage};
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const seed of STARTUPS_V1_SEEDS) {
    const sources = seed.sources.map((href) =>
      href === "https://cursor.com/blog/joining-spacex"
        ? "https://cursor.com/blog"
        : href,
    );
    const founders = seed.founders.map(({ name, url }) => ({ name, url }));
    await db.execute(sql`
      UPDATE "app"."startup"
      SET
        "sources" = ${JSON.stringify(sources)}::jsonb,
        "founders" = ${JSON.stringify(founders)}::jsonb
      WHERE "id" = ${seed.id};
    `);
  }
}
