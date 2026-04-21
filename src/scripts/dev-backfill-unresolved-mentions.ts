/**
 * Dev-only: auto-create brands for existing benchmark_brand_mention rows
 * that still have brand_id = NULL, link the mentions, and merge matching
 * brand_alias_queue entries. Idempotent.
 *
 * Usage: pnpm dlx tsx --env-file=.env src/scripts/dev-backfill-unresolved-mentions.ts
 */

import { neon } from "@neondatabase/serverless";
import { slugifyBrandName } from "@/server/benchmark/slugify";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  const unresolved = (await sql`
    SELECT m.id, m.raw_mention, m.run_id, p.category_id
    FROM "app"."benchmark_brand_mention" m
    JOIN "app"."benchmark_run" r ON r.id = m.run_id
    JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
    WHERE m.brand_id IS NULL
  `) as Array<{
    id: string;
    raw_mention: string;
    run_id: string;
    category_id: string;
  }>;
  console.log(`Unresolved mentions: ${unresolved.length}`);

  const nameToBrandId = new Map<string, string>();
  let created = 0;

  for (const m of unresolved) {
    const key = m.raw_mention.trim().toLowerCase();
    let brandId = nameToBrandId.get(key);
    if (!brandId) {
      const slug = slugifyBrandName(m.raw_mention) || `brand-${Date.now()}`;
      const inserted = (await sql`
        INSERT INTO "app"."brand"
          ("slug", "canonical_name", "aliases", "category_ids", "verified")
        VALUES (${slug}, ${m.raw_mention.trim()}, ARRAY[]::text[],
                ARRAY[${m.category_id}]::uuid[], false)
        ON CONFLICT (slug) DO NOTHING
        RETURNING id
      `) as Array<{ id: string }>;
      if (inserted[0]) {
        brandId = inserted[0].id;
        created++;
      } else {
        const [existing] = (await sql`
          SELECT id FROM "app"."brand" WHERE slug = ${slug} LIMIT 1
        `) as Array<{ id: string }>;
        brandId = existing?.id;
      }
      if (brandId) nameToBrandId.set(key, brandId);
    }
    if (brandId) {
      await sql`
        UPDATE "app"."benchmark_brand_mention"
        SET brand_id = ${brandId}
        WHERE id = ${m.id}
      `;
    }
  }

  const merged = (await sql`
    UPDATE "app"."brand_alias_queue" q
    SET status = 'merged', reviewed_at = now()
    FROM "app"."brand" b
    WHERE q.status = 'pending'
      AND lower(q.raw_mention) = lower(b.canonical_name)
    RETURNING q.id
  `) as Array<{ id: string }>;

  console.log(
    `Created ${created} brands · merged ${merged.length} alias queue entries`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
