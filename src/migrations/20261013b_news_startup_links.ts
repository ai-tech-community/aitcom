// Join news rows and rumors to directory startups. Idempotent.
// The backfill only links rows that already exist. It does not insert stories.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import {
  indexNewsStartups,
  matchIndexedNewsStartups,
  type NewsStartupRef,
} from "@/lib/news/startup-match";

const CHUNK = 200;

type Pair = { left: string; right: string };

function queryRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  throw new Error("news startup backfill: query returned no rows");
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."news_item_startup" (
      "news_item_id" varchar(255) NOT NULL REFERENCES "app"."news_item"("id") ON DELETE CASCADE,
      "startup_id" varchar(255) NOT NULL REFERENCES "app"."startup"("id") ON DELETE CASCADE,
      PRIMARY KEY ("news_item_id", "startup_id")
    );
    CREATE INDEX IF NOT EXISTS "news_item_startup_startup_idx"
      ON "app"."news_item_startup" USING btree ("startup_id");

    CREATE TABLE IF NOT EXISTS "app"."news_rumor_startup" (
      "news_rumor_id" varchar(255) NOT NULL REFERENCES "app"."news_rumor"("id") ON DELETE CASCADE,
      "startup_id" varchar(255) NOT NULL REFERENCES "app"."startup"("id") ON DELETE CASCADE,
      PRIMARY KEY ("news_rumor_id", "startup_id")
    );
    CREATE INDEX IF NOT EXISTS "news_rumor_startup_startup_idx"
      ON "app"."news_rumor_startup" USING btree ("startup_id");
  `);

  const startups = queryRows(
    await db.execute(sql`
      SELECT "id", "slug", "name", "homepage"
      FROM "app"."startup"
      WHERE "status" = 'approved'
    `),
  ).flatMap((row): NewsStartupRef[] => {
    const id = text(row.id);
    const slug = text(row.slug);
    const name = text(row.name);
    const homepage = text(row.homepage);
    if (!id || !slug || !name || !homepage) return [];
    return [{ id, slug, name, homepage }];
  });
  if (startups.length === 0) return;
  // Index once. Matching each row on its own reparsed every homepage and
  // blew the 120s deploy limit against the full directory.
  const indexed = indexNewsStartups(startups);

  const stories = queryRows(
    await db.execute(sql`
      SELECT "id", "title", "summary", "ai_summary", "url"
      FROM "app"."news_item"
    `),
  );
  const storyPairs: Pair[] = [];
  for (const row of stories) {
    const id = text(row.id);
    if (!id) continue;
    const matches = matchIndexedNewsStartups(
      {
        title: text(row.title),
        text: `${text(row.summary)}\n${text(row.ai_summary)}`,
        url: text(row.url) || null,
      },
      indexed,
    );
    for (const startup of matches) {
      storyPairs.push({ left: id, right: startup.id });
    }
  }
  await insertPairs(db, storyPairs, "news_item_startup");

  const rumors = queryRows(
    await db.execute(sql`
      SELECT "id", "title", "body", "url"
      FROM "app"."news_rumor"
    `),
  );
  const rumorPairs: Pair[] = [];
  for (const row of rumors) {
    const id = text(row.id);
    if (!id) continue;
    const url = text(row.url);
    const matches = matchIndexedNewsStartups(
      {
        title: text(row.title),
        text: text(row.body),
        url: url || null,
      },
      indexed,
    );
    for (const startup of matches) {
      rumorPairs.push({ left: id, right: startup.id });
    }
  }
  await insertPairs(db, rumorPairs, "news_rumor_startup");
}

async function insertPairs(
  db: MigrateUpArgs["db"],
  pairs: readonly Pair[],
  table: "news_item_startup" | "news_rumor_startup",
): Promise<void> {
  for (let index = 0; index < pairs.length; index += CHUNK) {
    const values = sql.join(
      pairs
        .slice(index, index + CHUNK)
        .map((pair) => sql`(${pair.left}, ${pair.right})`),
      sql`, `,
    );
    if (table === "news_item_startup") {
      await db.execute(sql`
        INSERT INTO "app"."news_item_startup" ("news_item_id", "startup_id")
        VALUES ${values}
        ON CONFLICT DO NOTHING
      `);
      continue;
    }
    await db.execute(sql`
      INSERT INTO "app"."news_rumor_startup" ("news_rumor_id", "startup_id")
      VALUES ${values}
      ON CONFLICT DO NOTHING
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."news_rumor_startup";
    DROP TABLE IF EXISTS "app"."news_item_startup";
  `);
}
