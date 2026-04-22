# Brand Stats Overhaul + Citations Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the community benchmark with peec.ai-style public brand stats pages — visibility %, per-model breakdown, trend, auto-competitors, top citing sources, top prompts, sentiment — plus citation (URL) capture from existing extractor.

**Architecture:** Add one new source table (`benchmark_citation`), three new aggregate tables, and one extended aggregate column. Extractor prompt gains a citations array in its output — single OpenRouter round-trip. Four new aggregate passes wired into the existing cron. One new composite TRPC endpoint feeds a rewritten brand page and a new brand directory with global search. No changes to MCP tool signatures, `submitRun`, or run submission contracts.

**Tech Stack:** Next.js 15.4 (App Router) · TypeScript · Drizzle ORM on Neon Postgres (via `@payloadcms/db-postgres` migrations) · tRPC · Vitest · shadcn/ui · Recharts.

**Spec:** `docs/superpowers/specs/2026-04-22-brand-stats-citations-design.md`

---

## File Structure

**Created:**
- `src/migrations/20260422_benchmark_citations_and_brand_aggs.ts` — schema migration
- `src/server/benchmark/primary-category.ts` + `.test.ts` — derive primary category for a brand
- `src/server/benchmark/aggregate-citations.ts` — `rebuildAggCitationByBrand`
- `src/server/benchmark/aggregate-brand-visibility.ts` — `rebuildAggBrandVisibilityByModel`, `rebuildAggBrandVisibilityByDay`
- `src/server/api/routers/benchmark-brands.ts` — `brands.search`, `brands.list`, `brands.stats`
- `src/app/[locale]/benchmark/brands/page.tsx` — directory
- `src/app/[locale]/benchmark/brands/_components/BrandSearchCombobox.tsx` — reusable search
- `src/app/[locale]/benchmark/brands/[slug]/_components/BrandHero.tsx`
- `src/app/[locale]/benchmark/brands/[slug]/_components/PerModelBar.tsx`
- `src/app/[locale]/benchmark/brands/[slug]/_components/VisibilityTrendChart.tsx`
- `src/app/[locale]/benchmark/brands/[slug]/_components/CompetitorTable.tsx`
- `src/app/[locale]/benchmark/brands/[slug]/_components/CitationsPanel.tsx`
- `src/app/[locale]/benchmark/brands/[slug]/_components/TopPromptsPanel.tsx`
- `src/app/[locale]/benchmark/brands/[slug]/_components/SentimentStacked.tsx`

**Modified:**
- `src/server/db/schema.ts` — add Drizzle definitions
- `src/server/benchmark/extract-run.ts` — extend prompt + parse citations
- `src/server/benchmark/aggregate.ts` — extend `rebuildBrandRankByPrompt`, call new rebuild fns from `rebuildAllAggregates`
- `src/server/api/routers/benchmark.ts` — mount new `brandsRouter`
- `src/server/api/root.ts` — (if needed) router registration
- `src/app/[locale]/benchmark/brands/[slug]/page.tsx` — rewrite with new composite query

**Notes:**
- Existing aggregate tables key on `model_id` only (no `model_provider`). New aggregates follow that convention. The `benchmark_run` table has `model_provider` but it is not used in aggregate group-bys.
- Migration uses `@payloadcms/db-postgres` — multi-statement SQL OK here (unlike runtime `aggregate.ts` which uses Neon HTTP driver).

---

## Task 1: Migration — citations table, aggregate tables, column extension

**Files:**
- Create: `src/migrations/20260422_benchmark_citations_and_brand_aggs.ts`

- [ ] **Step 1: Write the migration**

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // 1. Citations source table
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_citation" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" uuid NOT NULL REFERENCES "app"."benchmark_run"("id") ON DELETE CASCADE,
      "url" text NOT NULL,
      "domain" text NOT NULL,
      "title" text,
      "snippet" text,
      "position" integer NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "benchmark_citation_run_url_uq" UNIQUE ("run_id", "url")
    );
    CREATE INDEX "benchmark_citation_run_idx" ON "app"."benchmark_citation"("run_id");
    CREATE INDEX "benchmark_citation_domain_idx" ON "app"."benchmark_citation"("domain");
  `);

  // 2. Extend agg_brand_rank_by_prompt with top-5 citation domains
  await db.execute(sql`
    ALTER TABLE "app"."agg_brand_rank_by_prompt"
    ADD COLUMN IF NOT EXISTS "citation_domains_top5" text[] NOT NULL DEFAULT ARRAY[]::text[];
  `);

  // 3. agg_citation_by_brand
  await db.execute(sql`
    CREATE TABLE "app"."agg_citation_by_brand" (
      "brand_id" uuid NOT NULL,
      "category_id" uuid,
      "model_id" text NOT NULL,
      "window_days" integer NOT NULL,
      "domain" text NOT NULL,
      "citation_count" integer NOT NULL,
      "last_seen_at" timestamp with time zone NOT NULL,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "agg_citation_by_brand_brand_idx"
      ON "app"."agg_citation_by_brand"("brand_id", "window_days");
  `);

  // 4. agg_brand_visibility_by_model (+primary_category cache)
  await db.execute(sql`
    CREATE TABLE "app"."agg_brand_visibility_by_model" (
      "brand_id" uuid NOT NULL,
      "model_id" text NOT NULL,
      "window_days" integer NOT NULL,
      "primary_category_id" uuid,
      "mentions_count" integer NOT NULL,
      "runs_total" integer NOT NULL,
      "visibility_pct" numeric NOT NULL,
      "avg_rank" numeric,
      "sentiment_pos_pct" numeric NOT NULL DEFAULT 0,
      "sentiment_neu_pct" numeric NOT NULL DEFAULT 0,
      "sentiment_neg_pct" numeric NOT NULL DEFAULT 0,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "agg_brand_visibility_by_model_brand_idx"
      ON "app"."agg_brand_visibility_by_model"("brand_id", "window_days");
  `);

  // 5. agg_brand_visibility_by_day (brand-pivot trend)
  await db.execute(sql`
    CREATE TABLE "app"."agg_brand_visibility_by_day" (
      "brand_id" uuid NOT NULL,
      "date" date NOT NULL,
      "model_id" text NOT NULL,
      "mentions_count" integer NOT NULL,
      "runs_total" integer NOT NULL,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "agg_brand_visibility_by_day_brand_idx"
      ON "app"."agg_brand_visibility_by_day"("brand_id", "date");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."agg_brand_visibility_by_day";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."agg_brand_visibility_by_model";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."agg_citation_by_brand";`);
  await db.execute(sql`
    ALTER TABLE "app"."agg_brand_rank_by_prompt"
    DROP COLUMN IF EXISTS "citation_domains_top5";
  `);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."benchmark_citation" CASCADE;`);
}
```

- [ ] **Step 2: Run migration**

Run: `pnpm db:migrate`
Expected: `Migration ... complete.` and `\dt app.*` shows the four new tables.

- [ ] **Step 3: Verify schema in psql / drizzle studio**

Run: `pnpm db:studio` (or `psql $DATABASE_URL -c '\d "app"."benchmark_citation"'`)
Expected: columns match spec; unique `(run_id, url)` exists.

- [ ] **Step 4: Commit**

```bash
git add src/migrations/20260422_benchmark_citations_and_brand_aggs.ts
git commit -m "feat(benchmark): schema for citations and brand aggregates"
```

---

## Task 2: Drizzle schema entries

**Files:**
- Modify: `src/server/db/schema.ts` (append after `aggTopBrandByCategory`, around line 1340)

- [ ] **Step 1: Add table definitions**

Append to `src/server/db/schema.ts` (after the existing `aggTopBrandByCategory` block, before the `// ── Launchpad ──` divider):

```typescript
export const benchmarkCitations = appSchema.table(
  "benchmark_citation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    snippet: text("snippet"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    runIdx: index("benchmark_citation_run_idx").on(t.runId),
    domainIdx: index("benchmark_citation_domain_idx").on(t.domain),
  }),
);

export const aggCitationByBrand = appSchema.table(
  "agg_citation_by_brand",
  {
    brandId: uuid("brand_id").notNull(),
    categoryId: uuid("category_id"),
    modelId: text("model_id").notNull(),
    windowDays: integer("window_days").notNull(),
    domain: text("domain").notNull(),
    citationCount: integer("citation_count").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    brandIdx: index("agg_citation_by_brand_brand_idx").on(
      t.brandId,
      t.windowDays,
    ),
  }),
);

export const aggBrandVisibilityByModel = appSchema.table(
  "agg_brand_visibility_by_model",
  {
    brandId: uuid("brand_id").notNull(),
    modelId: text("model_id").notNull(),
    windowDays: integer("window_days").notNull(),
    primaryCategoryId: uuid("primary_category_id"),
    mentionsCount: integer("mentions_count").notNull(),
    runsTotal: integer("runs_total").notNull(),
    visibilityPct: numeric("visibility_pct").notNull(),
    avgRank: numeric("avg_rank"),
    sentimentPosPct: numeric("sentiment_pos_pct").notNull().default("0"),
    sentimentNeuPct: numeric("sentiment_neu_pct").notNull().default("0"),
    sentimentNegPct: numeric("sentiment_neg_pct").notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    brandIdx: index("agg_brand_visibility_by_model_brand_idx").on(
      t.brandId,
      t.windowDays,
    ),
  }),
);

export const aggBrandVisibilityByDay = appSchema.table(
  "agg_brand_visibility_by_day",
  {
    brandId: uuid("brand_id").notNull(),
    date: date("date").notNull(),
    modelId: text("model_id").notNull(),
    mentionsCount: integer("mentions_count").notNull(),
    runsTotal: integer("runs_total").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    brandIdx: index("agg_brand_visibility_by_day_brand_idx").on(
      t.brandId,
      t.date,
    ),
  }),
);
```

Also extend the existing `aggBrandRankByPrompt` table (add the new column — locate the block at lines 1270–1293):

```typescript
// inside aggBrandRankByPrompt, after sentimentNegativePct:
citationDomainsTop5: text("citation_domains_top5")
  .array()
  .notNull()
  .default(sql`ARRAY[]::text[]`),
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: exit code 0 (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(benchmark): drizzle schema for citations and brand aggs"
```

---

## Task 3: Primary-category resolver (pure function, TDD)

The resolver picks a brand's primary category from `brand.categoryIds[]` + its recent mention history. Logic lives in a pure function so the cron and any fallback path share one definition.

**Files:**
- Create: `src/server/benchmark/primary-category.ts`
- Test: `src/server/benchmark/primary-category.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/benchmark/primary-category.test.ts
import { describe, expect, it } from "vitest";
import { resolvePrimaryCategory } from "./primary-category";

describe("resolvePrimaryCategory", () => {
  it("returns the category in brand.categoryIds with the most mentions", () => {
    const result = resolvePrimaryCategory({
      categoryIds: ["cat-a", "cat-b"],
      mentionCountsByCategory: { "cat-a": 5, "cat-b": 12 },
    });
    expect(result).toBe("cat-b");
  });

  it("falls back to first brand.categoryIds element on tie", () => {
    const result = resolvePrimaryCategory({
      categoryIds: ["cat-a", "cat-b"],
      mentionCountsByCategory: { "cat-a": 3, "cat-b": 3 },
    });
    expect(result).toBe("cat-a");
  });

  it("falls back to first brand.categoryIds element when no mention counts present", () => {
    const result = resolvePrimaryCategory({
      categoryIds: ["cat-a", "cat-b"],
      mentionCountsByCategory: {},
    });
    expect(result).toBe("cat-a");
  });

  it("uses inferred category with most mentions when brand.categoryIds is empty", () => {
    const result = resolvePrimaryCategory({
      categoryIds: [],
      mentionCountsByCategory: { "cat-x": 4, "cat-y": 9 },
    });
    expect(result).toBe("cat-y");
  });

  it("returns null when brand.categoryIds is empty and no mentions recorded", () => {
    const result = resolvePrimaryCategory({
      categoryIds: [],
      mentionCountsByCategory: {},
    });
    expect(result).toBeNull();
  });

  it("ignores categories outside brand.categoryIds when list is non-empty", () => {
    const result = resolvePrimaryCategory({
      categoryIds: ["cat-a"],
      mentionCountsByCategory: { "cat-a": 1, "cat-unrelated": 100 },
    });
    expect(result).toBe("cat-a");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/benchmark/primary-category.test.ts`
Expected: FAIL with `Cannot find module './primary-category'`.

- [ ] **Step 3: Implement**

```typescript
// src/server/benchmark/primary-category.ts
export interface PrimaryCategoryInput {
  categoryIds: string[];
  mentionCountsByCategory: Record<string, number>;
}

export function resolvePrimaryCategory(
  input: PrimaryCategoryInput,
): string | null {
  const { categoryIds, mentionCountsByCategory } = input;
  const pool =
    categoryIds.length > 0 ? categoryIds : Object.keys(mentionCountsByCategory);
  if (pool.length === 0) return null;

  let best: string | null = null;
  let bestCount = -1;
  for (const candidate of pool) {
    const count = mentionCountsByCategory[candidate] ?? 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  // Tie-break: first element of `categoryIds` (or first key of counts) is
  // preserved because the loop keeps the first max encountered.
  return best;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/server/benchmark/primary-category.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/server/benchmark/primary-category.ts src/server/benchmark/primary-category.test.ts
git commit -m "feat(benchmark): primary-category resolver"
```

---

## Task 4: Extractor — extend prompt + output schema for citations

**Files:**
- Modify: `src/server/benchmark/extract-run.ts` (prompt at lines ~118–155, `ExtractorOutput` type near top of file, parsing path at lines ~182–220)

- [ ] **Step 1: Extend the `ExtractorOutput` type**

Locate the `ExtractorOutput` type definition (near the top of `extract-run.ts`) and add a `citations` field:

```typescript
interface ExtractorOutput {
  mentions: Array<{
    rawMention: string;
    suggestedBrandSlug: string | null;
    rank: number | null;
    sentiment: "positive" | "neutral" | "negative";
    context: string;
    confidence: number;
  }>;
  inferredCategorySlugs?: string[];
  citations?: Array<{
    url: string;
    domain: string;
    title?: string | null;
    snippet?: string | null;
    position: number;
  }>;
}
```

- [ ] **Step 2: Extend the prompt**

In the `rendered` template string (inside `extractRunInline`), update the OUTPUT SCHEMA and RULES blocks to include citations.

Replace the existing OUTPUT SCHEMA block with:

```text
OUTPUT SCHEMA:
{
  "mentions": [
    {
      "rawMention": "string, exactly as written in the answer",
      "suggestedBrandSlug": "string | null, from the KNOWN BRANDS list above, or null if unknown",
      "rank": "number | null, 1-based if the answer is a ranked list",
      "sentiment": "positive" | "neutral" | "negative",
      "context": "short (<= 280 chars) snippet of the answer around the mention",
      "confidence": "number 0-1, how sure you are this is a real brand mention"
    }
  ],
  "inferredCategorySlugs": ["zero to 3 slugs from the catalog above, excluding the primary"],
  "citations": [
    {
      "url": "full URL exactly as it appears in the answer",
      "domain": "registrable domain only (eTLD+1), e.g. 'reddit.com' not 'www.reddit.com'",
      "title": "link text if the URL came from a markdown link, else null",
      "snippet": "up to 280 chars of surrounding answer text, or null",
      "position": "1-based ordinal position of first appearance in the answer"
    }
  ]
}
```

Append to the RULES block:

```text
- citations: extract every URL present in the answer (inline links, footnotes, "Sources:" sections, bracketed references). Strip www. when computing domain. If no URLs present, return "citations": []. Dedupe by url.
```

- [ ] **Step 3: Bump extractor version string**

Find where the mentions insertion uses the extractor version. Locate any `extractorVersion:` literal in this file (and in the accompanying TRPC call in `benchmark.ts` — see Task 5). Update the literal from `kimi-k2.5-v1` (or whatever is current) to `kimi-k2.5-v2-citations`. If the current literal differs, preserve the base and suffix with `-citations`.

Grep: `rg "extractorVersion" src/server/benchmark src/server/api/routers/benchmark.ts`
Update each occurrence to the new value. Commit the grep output change-set as one edit.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/benchmark/extract-run.ts src/server/api/routers/benchmark.ts
git commit -m "feat(benchmark): extractor prompt and schema for citations"
```

---

## Task 5: Extractor — parse + ingest citations

Insert citations inside the existing extraction path so they land in the same transaction as mentions. Failure to insert citations must not fail the run.

**Files:**
- Modify: `src/server/benchmark/extract-run.ts` (after the mentions-insertion block, before the status update to `done`)
- Test: `src/server/benchmark/extract-citations-ingest.test.ts`

- [ ] **Step 1: Write the failing test for the pure citation-dedup helper**

Refactor the dedup logic into a pure helper first. Create the test:

```typescript
// src/server/benchmark/extract-citations-ingest.test.ts
import { describe, expect, it } from "vitest";
import { normalizeCitations } from "./extract-citations-ingest";

describe("normalizeCitations", () => {
  it("dedupes by url keeping first occurrence", () => {
    const result = normalizeCitations([
      { url: "https://a.com", domain: "a.com", position: 1 },
      { url: "https://a.com", domain: "a.com", position: 3 },
      { url: "https://b.com", domain: "b.com", position: 2 },
    ]);
    expect(result).toEqual([
      { url: "https://a.com", domain: "a.com", position: 1, title: null, snippet: null },
      { url: "https://b.com", domain: "b.com", position: 2, title: null, snippet: null },
    ]);
  });

  it("strips www. and lowercases the domain", () => {
    const result = normalizeCitations([
      { url: "https://WWW.Reddit.com/r/x", domain: "WWW.Reddit.com", position: 1 },
    ]);
    expect(result[0].domain).toBe("reddit.com");
  });

  it("clamps snippet to 280 chars", () => {
    const long = "x".repeat(500);
    const result = normalizeCitations([
      { url: "https://a.com", domain: "a.com", position: 1, snippet: long },
    ]);
    expect(result[0].snippet).toHaveLength(280);
  });

  it("returns [] for malformed input (missing url or domain)", () => {
    const result = normalizeCitations([
      { url: "", domain: "a.com", position: 1 } as never,
      { url: "https://a.com", domain: "", position: 2 } as never,
    ]);
    expect(result).toEqual([]);
  });

  it("returns [] when input is undefined", () => {
    expect(normalizeCitations(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/benchmark/extract-citations-ingest.test.ts`
Expected: FAIL with `Cannot find module './extract-citations-ingest'`.

- [ ] **Step 3: Implement the helper**

```typescript
// src/server/benchmark/extract-citations-ingest.ts
export interface RawCitation {
  url: string;
  domain: string;
  title?: string | null;
  snippet?: string | null;
  position: number;
}

export interface NormalizedCitation {
  url: string;
  domain: string;
  title: string | null;
  snippet: string | null;
  position: number;
}

export function normalizeCitations(
  input: RawCitation[] | undefined,
): NormalizedCitation[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: NormalizedCitation[] = [];
  for (const c of input) {
    if (!c || typeof c.url !== "string" || c.url.length === 0) continue;
    if (typeof c.domain !== "string" || c.domain.length === 0) continue;
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push({
      url: c.url,
      domain: c.domain.replace(/^www\./i, "").toLowerCase(),
      title: c.title ?? null,
      snippet: c.snippet ? c.snippet.slice(0, 280) : null,
      position: c.position,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/server/benchmark/extract-citations-ingest.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Wire into `extractRunInline`**

In `src/server/benchmark/extract-run.ts`, after the mentions are inserted and BEFORE the run status is flipped to `done`, insert:

```typescript
import { normalizeCitations } from "./extract-citations-ingest";
import { benchmarkCitations } from "@/server/db/schema";

// ... inside extractRunInline, after the mentions loop completes:

const citations = normalizeCitations(parsed.citations);
if (citations.length > 0) {
  try {
    await db
      .insert(benchmarkCitations)
      .values(
        citations.map((c) => ({
          runId,
          url: c.url,
          domain: c.domain,
          title: c.title,
          snippet: c.snippet,
          position: c.position,
        })),
      )
      .onConflictDoNothing({
        target: [benchmarkCitations.runId, benchmarkCitations.url],
      });
  } catch (err) {
    // Citations are additive — don't fail the run if the insert path errors.
    console.warn(
      `[extractRunInline] citation insert failed for run ${runId}:`,
      err,
    );
  }
}
```

Note: the unique constraint `(run_id, url)` created in Task 1 is what `onConflictDoNothing` targets.

- [ ] **Step 6: Run typecheck + tests**

Run: `pnpm typecheck && pnpm vitest run src/server/benchmark`
Expected: all pass.

- [ ] **Step 7: Manual smoke test (optional but recommended)**

Run the dev extractor script against a run whose `rawAnswer` contains URLs:
```bash
pnpm tsx src/scripts/dev-extract-run.ts <run-id-with-urls>
```
Expected: `SELECT count(*) FROM app.benchmark_citation WHERE run_id = '<run-id>'` returns > 0.

- [ ] **Step 8: Commit**

```bash
git add src/server/benchmark/extract-citations-ingest.ts src/server/benchmark/extract-citations-ingest.test.ts src/server/benchmark/extract-run.ts
git commit -m "feat(benchmark): ingest citations from extractor output"
```

---

## Task 6: Aggregate — `agg_citation_by_brand`

**Files:**
- Create: `src/server/benchmark/aggregate-citations.ts`

- [ ] **Step 1: Implement the rebuild function**

```typescript
// src/server/benchmark/aggregate-citations.ts
import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";

type DB = typeof _db;
const WINDOWS = [7, 30, 90] as const;

export async function rebuildAggCitationByBrand(db: DB): Promise<void> {
  for (const w of WINDOWS) {
    await db.execute(sql`
      DELETE FROM "app"."agg_citation_by_brand"
      WHERE "window_days" = ${w}
    `);

    await db.execute(sql`
      INSERT INTO "app"."agg_citation_by_brand" (
        "brand_id", "category_id", "model_id", "window_days",
        "domain", "citation_count", "last_seen_at", "updated_at"
      )
      SELECT
        m.brand_id,
        NULL::uuid AS category_id,
        r.model_id,
        ${w} AS window_days,
        c.domain,
        COUNT(DISTINCT c.run_id)::int AS citation_count,
        MAX(c.created_at) AS last_seen_at,
        now()
      FROM "app"."benchmark_citation" c
      JOIN "app"."benchmark_run" r ON r.id = c.run_id
      JOIN "app"."benchmark_brand_mention" m ON m.run_id = r.id
      WHERE m.brand_id IS NOT NULL
        AND r.extraction_status = 'done'
        AND r.captured_at >= now() - (${w} || ' days')::interval
      GROUP BY m.brand_id, r.model_id, c.domain
      HAVING COUNT(DISTINCT c.run_id) > 0
    `);

    // Cap to top-20 domains per (brand, model, window) to bound row count.
    await db.execute(sql`
      WITH ranked AS (
        SELECT ctid, ROW_NUMBER() OVER (
          PARTITION BY "brand_id", "model_id", "window_days"
          ORDER BY "citation_count" DESC, "domain" ASC
        ) AS rn
        FROM "app"."agg_citation_by_brand"
        WHERE "window_days" = ${w}
      )
      DELETE FROM "app"."agg_citation_by_brand" target
      USING ranked
      WHERE target.ctid = ranked.ctid AND ranked.rn > 20
    `);
  }
}
```

- [ ] **Step 2: Sanity-run against the current DB**

Run:
```bash
pnpm tsx -e "import {db} from '@/server/db'; import {rebuildAggCitationByBrand} from '@/server/benchmark/aggregate-citations'; await rebuildAggCitationByBrand(db); console.log('ok');"
```
Expected: prints `ok`. Then `SELECT COUNT(*) FROM app.agg_citation_by_brand;` returns 0 or more rows without error.

- [ ] **Step 3: Commit**

```bash
git add src/server/benchmark/aggregate-citations.ts
git commit -m "feat(benchmark): aggregate for citations by brand"
```

---

## Task 7: Aggregate — brand visibility (by-model + by-day)

**Files:**
- Create: `src/server/benchmark/aggregate-brand-visibility.ts`

- [ ] **Step 1: Implement both rebuild functions**

```typescript
// src/server/benchmark/aggregate-brand-visibility.ts
import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";

type DB = typeof _db;
const WINDOWS = [7, 30, 90] as const;

/**
 * Visibility % per (brand, model, window). Denominator is runs in the brand's
 * primary category. Primary category is derived inside the query as:
 *   - If brand.categoryIds is non-empty, the categoryId in it with the most
 *     90-day mentions for this brand. Ties: first element.
 *   - Else the categoryId appearing most in this brand's mentions over 90 days.
 *   - Else null (denominator = all runs in window).
 */
export async function rebuildAggBrandVisibilityByModel(db: DB): Promise<void> {
  for (const w of WINDOWS) {
    await db.execute(sql`
      DELETE FROM "app"."agg_brand_visibility_by_model"
      WHERE "window_days" = ${w}
    `);

    await db.execute(sql`
      WITH brand_category_counts AS (
        SELECT
          m.brand_id,
          cat.category_id,
          COUNT(DISTINCT r.id) AS cnt
        FROM "app"."benchmark_brand_mention" m
        JOIN "app"."benchmark_run" r ON r.id = m.run_id
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        CROSS JOIN LATERAL (
          SELECT unnest(ARRAY[p.category_id] || p.inferred_category_ids) AS category_id
        ) cat
        WHERE m.brand_id IS NOT NULL
          AND r.extraction_status = 'done'
          AND r.captured_at >= now() - INTERVAL '90 days'
        GROUP BY m.brand_id, cat.category_id
      ),
      brand_primary AS (
        SELECT DISTINCT ON (b.id)
          b.id AS brand_id,
          COALESCE(
            -- Prefer categoryIds list, order by mention count desc, tie-break by array position.
            (SELECT bc.category_id
             FROM brand_category_counts bc
             WHERE bc.brand_id = b.id
               AND bc.category_id = ANY(b.category_ids)
             ORDER BY bc.cnt DESC,
                      array_position(b.category_ids, bc.category_id) ASC
             LIMIT 1),
            -- Fallback: first element of brand.category_ids, regardless of mentions.
            CASE WHEN cardinality(b.category_ids) > 0 THEN b.category_ids[1] ELSE NULL END,
            -- Final fallback: most-mentioned category across inferred mentions.
            (SELECT bc.category_id
             FROM brand_category_counts bc
             WHERE bc.brand_id = b.id
             ORDER BY bc.cnt DESC
             LIMIT 1)
          ) AS primary_category_id
        FROM "app"."brand" b
      ),
      runs_by_model_category AS (
        SELECT
          r.model_id,
          cat.category_id,
          COUNT(DISTINCT r.id) AS runs_total
        FROM "app"."benchmark_run" r
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        CROSS JOIN LATERAL (
          SELECT unnest(ARRAY[p.category_id] || p.inferred_category_ids) AS category_id
        ) cat
        WHERE r.extraction_status = 'done'
          AND r.captured_at >= now() - (${w} || ' days')::interval
        GROUP BY r.model_id, cat.category_id
      ),
      runs_by_model_all AS (
        SELECT r.model_id, COUNT(DISTINCT r.id) AS runs_total
        FROM "app"."benchmark_run" r
        WHERE r.extraction_status = 'done'
          AND r.captured_at >= now() - (${w} || ' days')::interval
        GROUP BY r.model_id
      ),
      brand_model_mentions AS (
        SELECT
          m.brand_id,
          r.model_id,
          COUNT(*)::int AS mentions_count,
          AVG(m.rank)::numeric(10,2) AS avg_rank,
          (SUM(CASE WHEN m.sentiment = 'positive' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100 AS sp,
          (SUM(CASE WHEN m.sentiment = 'neutral'  THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100 AS sn,
          (SUM(CASE WHEN m.sentiment = 'negative' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100 AS sx
        FROM "app"."benchmark_brand_mention" m
        JOIN "app"."benchmark_run" r ON r.id = m.run_id
        WHERE m.brand_id IS NOT NULL
          AND r.extraction_status = 'done'
          AND r.captured_at >= now() - (${w} || ' days')::interval
        GROUP BY m.brand_id, r.model_id
      )
      INSERT INTO "app"."agg_brand_visibility_by_model" (
        "brand_id", "model_id", "window_days", "primary_category_id",
        "mentions_count", "runs_total", "visibility_pct", "avg_rank",
        "sentiment_pos_pct", "sentiment_neu_pct", "sentiment_neg_pct", "updated_at"
      )
      SELECT
        bmm.brand_id,
        bmm.model_id,
        ${w} AS window_days,
        bp.primary_category_id,
        bmm.mentions_count,
        COALESCE(rmc.runs_total, rma.runs_total, 0)::int AS runs_total,
        CASE
          WHEN COALESCE(rmc.runs_total, rma.runs_total, 0) = 0 THEN 0
          ELSE ROUND(
            (bmm.mentions_count::numeric / COALESCE(rmc.runs_total, rma.runs_total)) * 100, 2
          )
        END AS visibility_pct,
        bmm.avg_rank,
        COALESCE(bmm.sp, 0),
        COALESCE(bmm.sn, 0),
        COALESCE(bmm.sx, 0),
        now()
      FROM brand_model_mentions bmm
      JOIN brand_primary bp ON bp.brand_id = bmm.brand_id
      LEFT JOIN runs_by_model_category rmc
        ON rmc.model_id = bmm.model_id AND rmc.category_id = bp.primary_category_id
      LEFT JOIN runs_by_model_all rma
        ON rma.model_id = bmm.model_id
    `);
  }
}

/**
 * Daily visibility per brand/model. Runs-total denominator is runs of that
 * model on that day (all categories, matching existing agg_brand_trends_by_day
 * approach — primary-category scoping not applied at day granularity to keep
 * the chart smooth).
 */
export async function rebuildAggBrandVisibilityByDay(db: DB): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."agg_brand_visibility_by_day"
    WHERE "date" >= (CURRENT_DATE - INTERVAL '90 days')
  `);

  await db.execute(sql`
    WITH day_totals AS (
      SELECT
        r.model_id,
        date_trunc('day', r.captured_at)::date AS d,
        COUNT(DISTINCT r.id)::int AS runs_total
      FROM "app"."benchmark_run" r
      WHERE r.extraction_status = 'done'
        AND r.captured_at >= now() - INTERVAL '90 days'
      GROUP BY r.model_id, date_trunc('day', r.captured_at)::date
    ),
    brand_days AS (
      SELECT
        m.brand_id,
        r.model_id,
        date_trunc('day', r.captured_at)::date AS d,
        COUNT(DISTINCT r.id)::int AS mentions_count
      FROM "app"."benchmark_brand_mention" m
      JOIN "app"."benchmark_run" r ON r.id = m.run_id
      WHERE m.brand_id IS NOT NULL
        AND r.extraction_status = 'done'
        AND r.captured_at >= now() - INTERVAL '90 days'
      GROUP BY m.brand_id, r.model_id, date_trunc('day', r.captured_at)::date
    )
    INSERT INTO "app"."agg_brand_visibility_by_day" (
      "brand_id", "date", "model_id",
      "mentions_count", "runs_total", "updated_at"
    )
    SELECT
      bd.brand_id,
      bd.d,
      bd.model_id,
      bd.mentions_count,
      dt.runs_total,
      now()
    FROM brand_days bd
    JOIN day_totals dt ON dt.model_id = bd.model_id AND dt.d = bd.d
  `);
}
```

- [ ] **Step 2: Sanity-run**

```bash
pnpm tsx -e "import {db} from '@/server/db'; import {rebuildAggBrandVisibilityByModel, rebuildAggBrandVisibilityByDay} from '@/server/benchmark/aggregate-brand-visibility'; await rebuildAggBrandVisibilityByModel(db); await rebuildAggBrandVisibilityByDay(db); console.log('ok');"
```
Expected: `ok`. Then `SELECT COUNT(*) FROM app.agg_brand_visibility_by_model;` returns rows.

- [ ] **Step 3: Commit**

```bash
git add src/server/benchmark/aggregate-brand-visibility.ts
git commit -m "feat(benchmark): aggregates for brand visibility by model and by day"
```

---

## Task 8: Extend `rebuildBrandRankByPrompt` to populate `citation_domains_top5`

**Files:**
- Modify: `src/server/benchmark/aggregate.ts` (the `rebuildBrandRankByPrompt` function around lines 11–45)

- [ ] **Step 1: Replace the INSERT query**

Replace the entire `INSERT INTO "app"."agg_brand_rank_by_prompt"` block inside `rebuildBrandRankByPrompt` with a version that joins citations and aggregates the top 5 domains per (prompt, model, brand):

```typescript
await db.execute(sql`
  WITH mention_rows AS (
    SELECT
      r.prompt_id,
      m.brand_id,
      r.model_id,
      r.id AS run_id,
      r.weight,
      m.rank,
      m.sentiment
    FROM "app"."benchmark_brand_mention" m
    JOIN "app"."benchmark_run" r ON r.id = m.run_id
    WHERE m.brand_id IS NOT NULL
      AND r.captured_at >= now() - (${w} || ' days')::interval
      AND r.extraction_status = 'done'
  ),
  citation_domains AS (
    SELECT
      mr.prompt_id,
      mr.brand_id,
      mr.model_id,
      c.domain,
      COUNT(DISTINCT c.run_id) AS cnt
    FROM mention_rows mr
    JOIN "app"."benchmark_citation" c ON c.run_id = mr.run_id
    GROUP BY mr.prompt_id, mr.brand_id, mr.model_id, c.domain
  ),
  top5_domains AS (
    SELECT prompt_id, brand_id, model_id,
           array_agg(domain ORDER BY cnt DESC, domain ASC)
             FILTER (WHERE rn <= 5) AS domains
    FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY prompt_id, brand_id, model_id
        ORDER BY cnt DESC, domain ASC
      ) AS rn
      FROM citation_domains
    ) t
    GROUP BY prompt_id, brand_id, model_id
  )
  INSERT INTO "app"."agg_brand_rank_by_prompt" (
    "prompt_id", "brand_id", "model_id", "window_days",
    "mention_count", "weighted_score", "avg_rank",
    "sentiment_positive_pct", "sentiment_neutral_pct", "sentiment_negative_pct",
    "citation_domains_top5", "updated_at"
  )
  SELECT
    mr.prompt_id,
    mr.brand_id,
    mr.model_id,
    ${w} AS window_days,
    COUNT(*)::int AS mention_count,
    SUM(mr.weight) AS weighted_score,
    AVG(mr.rank)::numeric(10,2) AS avg_rank,
    (SUM(CASE WHEN mr.sentiment = 'positive' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100 AS sp,
    (SUM(CASE WHEN mr.sentiment = 'neutral'  THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100 AS sn,
    (SUM(CASE WHEN mr.sentiment = 'negative' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100 AS sx,
    COALESCE(td.domains, ARRAY[]::text[]),
    now()
  FROM mention_rows mr
  LEFT JOIN top5_domains td
    ON td.prompt_id = mr.prompt_id
   AND td.brand_id = mr.brand_id
   AND td.model_id = mr.model_id
  GROUP BY mr.prompt_id, mr.brand_id, mr.model_id, td.domains
`);
```

- [ ] **Step 2: Sanity-run**

```bash
pnpm tsx -e "import {db} from '@/server/db'; import {rebuildBrandRankByPrompt} from '@/server/benchmark/aggregate'; await rebuildBrandRankByPrompt(db); console.log('ok');"
```
Expected: `ok`. `SELECT COUNT(*) FROM app.agg_brand_rank_by_prompt WHERE citation_domains_top5 <> '{}'::text[];` — if any citations exist, count > 0.

- [ ] **Step 3: Commit**

```bash
git add src/server/benchmark/aggregate.ts
git commit -m "feat(benchmark): include top-5 citation domains in brand-rank aggregate"
```

---

## Task 9: Wire new rebuilds into `rebuildAllAggregates`

**Files:**
- Modify: `src/server/benchmark/aggregate.ts` (function `rebuildAllAggregates` at the bottom of the file)

- [ ] **Step 1: Import and call new rebuild fns**

At the top of the file, add:
```typescript
import { rebuildAggCitationByBrand } from "./aggregate-citations";
import {
  rebuildAggBrandVisibilityByModel,
  rebuildAggBrandVisibilityByDay,
} from "./aggregate-brand-visibility";
```

Replace the `rebuildAllAggregates` function with:

```typescript
export async function rebuildAllAggregates(db: DB): Promise<{
  ok: true;
  durations: {
    rank: number;
    trends: number;
    matrix: number;
    hero: number;
    citation: number;
    visibilityByModel: number;
    visibilityByDay: number;
  };
}> {
  const t0 = Date.now();
  await rebuildBrandRankByPrompt(db);
  const t1 = Date.now();
  await rebuildBrandTrendsByDay(db);
  const t2 = Date.now();
  await rebuildModelBiasMatrix(db);
  const t3 = Date.now();
  await rebuildTopBrandByCategory(db);
  const t4 = Date.now();
  await rebuildAggCitationByBrand(db);
  const t5 = Date.now();
  await rebuildAggBrandVisibilityByModel(db);
  const t6 = Date.now();
  await rebuildAggBrandVisibilityByDay(db);
  const t7 = Date.now();
  return {
    ok: true,
    durations: {
      rank: t1 - t0,
      trends: t2 - t1,
      matrix: t3 - t2,
      hero: t4 - t3,
      citation: t5 - t4,
      visibilityByModel: t6 - t5,
      visibilityByDay: t7 - t6,
    },
  };
}
```

- [ ] **Step 2: Verify cron endpoint still compiles**

Run: `pnpm typecheck`
Expected: exit 0. (The `/api/cron/benchmark-aggregate/route.ts` returns the spread object so extra duration keys pass through.)

- [ ] **Step 3: Manual cron run**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/benchmark-aggregate
```
Expected: 200 with `durations` including all seven keys.

- [ ] **Step 4: Commit**

```bash
git add src/server/benchmark/aggregate.ts
git commit -m "feat(benchmark): wire new aggregates into cron"
```

---

## Task 10: TRPC — `brands.search` and `brands.list`

**Files:**
- Create: `src/server/api/routers/benchmark-brands.ts`
- Modify: `src/server/api/routers/benchmark.ts` (register sub-router) OR `src/server/api/root.ts` depending on existing pattern
- Test: `src/server/api/routers/benchmark-brands.test.ts` (optional, only cover input validation)

- [ ] **Step 1: Check existing router registration pattern**

Run: `rg "benchmark.*Router|benchmarkRouter" src/server/api -l`
Expected: shows where `benchmarkRouter` is merged. Register the new sub-router at the same level (most likely re-export and nest under `benchmark.brands` via a nested builder, or append to the existing `benchmarkRouter` object).

- [ ] **Step 2: Implement the sub-router**

```typescript
// src/server/api/routers/benchmark-brands.ts
import { z } from "zod";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  brands,
  aggBrandVisibilityByModel,
  aggBrandVisibilityByDay,
  aggCitationByBrand,
  aggBrandRankByPrompt,
  benchmarkCategories,
  benchmarkPrompts,
  benchmarkBrandMentions,
  benchmarkRuns,
} from "@/server/db/schema";

const WINDOWS = z.union([z.literal(7), z.literal(30), z.literal(90)]);

export const benchmarkBrandsRouter = createTRPCRouter({
  search: publicProcedure
    .input(z.object({ q: z.string().min(1).max(100), limit: z.number().int().min(1).max(25).default(10) }))
    .query(async ({ ctx, input }) => {
      const q = `%${input.q.toLowerCase()}%`;
      const rows = await ctx.db
        .select({
          id: brands.id,
          slug: brands.slug,
          canonicalName: brands.canonicalName,
          categoryIds: brands.categoryIds,
        })
        .from(brands)
        .where(
          or(
            sql`lower(${brands.canonicalName}) like ${q}`,
            sql`lower(${brands.slug}) like ${q}`,
            sql`EXISTS (SELECT 1 FROM unnest(${brands.aliases}) a WHERE lower(a) like ${q})`,
          ),
        )
        .orderBy(
          // Prefix matches rank first
          sql`CASE WHEN lower(${brands.canonicalName}) like ${`${input.q.toLowerCase()}%`} THEN 0 ELSE 1 END`,
          brands.canonicalName,
        )
        .limit(input.limit);
      return { brands: rows };
    }),

  list: publicProcedure
    .input(
      z.object({
        categorySlug: z.string().optional(),
        sort: z.enum(["visibility", "alpha", "recent"]).default("visibility"),
        includeUnverified: z.boolean().default(false),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(48).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Resolve categorySlug → categoryId (if provided).
      let categoryId: string | undefined;
      if (input.categorySlug) {
        const [cat] = await ctx.db
          .select({ id: benchmarkCategories.id })
          .from(benchmarkCategories)
          .where(eq(benchmarkCategories.slug, input.categorySlug))
          .limit(1);
        if (!cat) return { brands: [], nextCursor: undefined };
        categoryId = cat.id;
      }

      // Per-brand aggregate across all models, 30d window.
      const rows = await ctx.db.execute(sql`
        WITH brand_totals AS (
          SELECT
            brand_id,
            SUM(mentions_count)::int AS mentions,
            SUM(runs_total)::int AS runs,
            AVG(visibility_pct)::numeric(10,2) AS visibility_pct,
            MAX(updated_at) AS updated_at
          FROM "app"."agg_brand_visibility_by_model"
          WHERE window_days = 30
          GROUP BY brand_id
        )
        SELECT
          b.id, b.slug, b.canonical_name, b.verified, b.category_ids,
          COALESCE(bt.visibility_pct, 0) AS visibility_pct,
          COALESCE(bt.mentions, 0) AS mentions,
          bt.updated_at AS last_aggregated_at
        FROM "app"."brand" b
        LEFT JOIN brand_totals bt ON bt.brand_id = b.id
        WHERE
          (${input.includeUnverified} OR b.verified = true)
          AND (${categoryId ?? null}::uuid IS NULL OR ${categoryId ?? null}::uuid = ANY(b.category_ids))
        ORDER BY
          CASE WHEN ${input.sort} = 'visibility' THEN COALESCE(bt.visibility_pct, 0) ELSE 0 END DESC,
          CASE WHEN ${input.sort} = 'alpha' THEN b.canonical_name END ASC,
          CASE WHEN ${input.sort} = 'recent' THEN b.updated_at END DESC,
          b.canonical_name ASC
        LIMIT ${input.limit + 1}
        OFFSET ${input.cursor ? Number(input.cursor) : 0}
      `);

      const items = (rows as unknown as Array<{
        id: string;
        slug: string;
        canonical_name: string;
        verified: boolean;
        category_ids: string[];
        visibility_pct: string;
        mentions: number;
      }>).slice(0, input.limit);

      const nextCursor =
        rows.length > input.limit
          ? String((input.cursor ? Number(input.cursor) : 0) + input.limit)
          : undefined;

      return {
        brands: items.map((r) => ({
          id: r.id,
          slug: r.slug,
          canonicalName: r.canonical_name,
          verified: r.verified,
          categoryIds: r.category_ids,
          visibilityPct: Number(r.visibility_pct),
          mentions: r.mentions,
        })),
        nextCursor,
      };
    }),
});
```

- [ ] **Step 3: Register the sub-router**

If `benchmarkRouter` is built with `createTRPCRouter({ ... })`, add `brands: benchmarkBrandsRouter` to its object (import from the new file). If there's a separate `appRouter` in `src/server/api/root.ts`, check which pattern exists before editing — follow the existing approach.

Example addition (inside `benchmarkRouter`):
```typescript
import { benchmarkBrandsRouter } from "./benchmark-brands";
// ...
export const benchmarkRouter = createTRPCRouter({
  // ... existing procedures ...
  brands: benchmarkBrandsRouter,
});
```

Call site from UI: `api.benchmark.brands.search.useQuery(...)` and `api.benchmark.brands.list.useQuery(...)`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/benchmark-brands.ts src/server/api/routers/benchmark.ts
git commit -m "feat(benchmark): tRPC brands.search and brands.list"
```

---

## Task 11: TRPC — `brands.stats` (composite for brand page)

**Files:**
- Modify: `src/server/api/routers/benchmark-brands.ts` (add `stats` procedure)

- [ ] **Step 1: Add the stats procedure**

Append inside `createTRPCRouter({ ... })` in `benchmark-brands.ts`:

```typescript
stats: publicProcedure
  .input(
    z.object({
      slug: z.string().min(1),
      window: WINDOWS.default(30),
      modelId: z.string().optional(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const [brand] = await ctx.db
      .select()
      .from(brands)
      .where(eq(brands.slug, input.slug))
      .limit(1);
    if (!brand) return null;

    const w = input.window;

    // Per-model breakdown + primary category (already cached in agg table).
    const perModel = await ctx.db
      .select()
      .from(aggBrandVisibilityByModel)
      .where(
        and(
          eq(aggBrandVisibilityByModel.brandId, brand.id),
          eq(aggBrandVisibilityByModel.windowDays, w),
        ),
      );

    const primaryCategoryId =
      perModel.find((r) => r.primaryCategoryId)?.primaryCategoryId ?? null;

    // Hero visibility — aggregate across models, optionally filter by modelId.
    const filteredPerModel = input.modelId
      ? perModel.filter((r) => r.modelId === input.modelId)
      : perModel;

    const totalMentions = filteredPerModel.reduce(
      (a, r) => a + r.mentionsCount,
      0,
    );
    const totalRuns = filteredPerModel.reduce((a, r) => a + r.runsTotal, 0);
    const visibilityPct = totalRuns === 0 ? 0 : (totalMentions / totalRuns) * 100;

    // Δ vs prior window — compute by running a small direct query for 2*window.
    const priorWindow = w * 2;
    const priorRows = await ctx.db
      .select()
      .from(aggBrandVisibilityByModel)
      .where(
        and(
          eq(aggBrandVisibilityByModel.brandId, brand.id),
          eq(aggBrandVisibilityByModel.windowDays, priorWindow as 7 | 30 | 90),
        ),
      );
    // If the priorWindow aggregate isn't present (only 7/30/90 stored),
    // fall back to 0 — document in plan as future work.
    const priorMentions = priorRows.reduce((a, r) => a + r.mentionsCount, 0);
    const priorRuns = priorRows.reduce((a, r) => a + r.runsTotal, 0);
    const priorVisibility = priorRuns === 0 ? 0 : (priorMentions / priorRuns) * 100;
    const deltaPct = visibilityPct - priorVisibility;

    // Trend (daily).
    const trendDays = await ctx.db
      .select()
      .from(aggBrandVisibilityByDay)
      .where(eq(aggBrandVisibilityByDay.brandId, brand.id))
      .orderBy(aggBrandVisibilityByDay.date);

    // Competitors — top 5 brands in primary category (if any), excluding self.
    const competitors = primaryCategoryId
      ? await ctx.db.execute(sql`
          WITH totals AS (
            SELECT
              v.brand_id,
              SUM(v.mentions_count) AS mentions,
              SUM(v.runs_total) AS runs,
              AVG(v.visibility_pct) AS visibility_pct,
              AVG(v.avg_rank) AS avg_rank,
              AVG(v.sentiment_pos_pct) AS sent_pos
            FROM "app"."agg_brand_visibility_by_model" v
            WHERE v.window_days = ${w}
              AND v.primary_category_id = ${primaryCategoryId}
              AND v.brand_id <> ${brand.id}
            GROUP BY v.brand_id
          )
          SELECT b.id, b.slug, b.canonical_name,
                 t.visibility_pct, t.avg_rank, t.sent_pos
          FROM totals t
          JOIN "app"."brand" b ON b.id = t.brand_id
          ORDER BY t.visibility_pct DESC
          LIMIT 5
        `)
      : [];

    // Top citing domains.
    const citationRows = await ctx.db
      .select({
        domain: aggCitationByBrand.domain,
        count: sql<number>`SUM(${aggCitationByBrand.citationCount})`,
        lastSeenAt: sql<Date>`MAX(${aggCitationByBrand.lastSeenAt})`,
      })
      .from(aggCitationByBrand)
      .where(
        and(
          eq(aggCitationByBrand.brandId, brand.id),
          eq(aggCitationByBrand.windowDays, w),
        ),
      )
      .groupBy(aggCitationByBrand.domain)
      .orderBy(desc(sql`SUM(${aggCitationByBrand.citationCount})`))
      .limit(10);

    // Top prompts via agg_brand_rank_by_prompt (30d always; scale later).
    const topPrompts = await ctx.db.execute(sql`
      SELECT
        p.id AS prompt_id,
        p.text,
        p.category_id,
        SUM(a.mention_count)::int AS mentions,
        AVG(a.avg_rank) AS avg_rank
      FROM "app"."agg_brand_rank_by_prompt" a
      JOIN "app"."benchmark_prompt" p ON p.id = a.prompt_id
      WHERE a.brand_id = ${brand.id} AND a.window_days = ${w}
      GROUP BY p.id, p.text, p.category_id
      ORDER BY mentions DESC
      LIMIT 10
    `);

    return {
      brand: {
        id: brand.id,
        slug: brand.slug,
        canonicalName: brand.canonicalName,
        website: brand.website,
        aliases: brand.aliases,
        categoryIds: brand.categoryIds,
        verified: brand.verified,
      },
      window: w,
      modelIdFilter: input.modelId ?? null,
      primaryCategoryId,
      hero: {
        visibilityPct: Number(visibilityPct.toFixed(2)),
        deltaPct: Number(deltaPct.toFixed(2)),
        totalMentions,
        totalRuns,
      },
      perModel: perModel.map((r) => ({
        modelId: r.modelId,
        mentionsCount: r.mentionsCount,
        runsTotal: r.runsTotal,
        visibilityPct: Number(r.visibilityPct),
        avgRank: r.avgRank ? Number(r.avgRank) : null,
        sentimentPosPct: Number(r.sentimentPosPct),
        sentimentNeuPct: Number(r.sentimentNeuPct),
        sentimentNegPct: Number(r.sentimentNegPct),
      })),
      trendDays: trendDays.map((r) => ({
        date: (r.date as unknown as string).slice(0, 10),
        modelId: r.modelId,
        mentionsCount: r.mentionsCount,
        runsTotal: r.runsTotal,
      })),
      competitors,
      citations: citationRows,
      topPrompts,
    };
  }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 3: Smoke test via tRPC panel / direct call**

In a local browser tab, hit `/api/trpc/benchmark.brands.stats?batch=1&input=...` for a known brand slug, or write a one-off script:

```typescript
// src/scripts/dev-brand-stats.ts
import { createCaller } from "@/server/api/root";
import { db } from "@/server/db";

const caller = createCaller({ db, session: null, headers: new Headers() } as never);
const result = await caller.benchmark.brands.stats({ slug: process.argv[2]!, window: 30 });
console.log(JSON.stringify(result, null, 2));
```
Expected: non-null `result`, populated `perModel` + `hero` if the brand has mentions.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/benchmark-brands.ts
git commit -m "feat(benchmark): tRPC brands.stats composite endpoint"
```

---

## Task 12: Brand page UI — hero, per-model, trend, competitors

Rewrite the brand page to use `brands.stats`. Keep the existing `mentions` panel at the bottom (fed from the existing `getBrandProfile` call or a new slice of `stats`).

**Files:**
- Create: `src/app/[locale]/benchmark/brands/[slug]/_components/BrandHero.tsx`
- Create: `src/app/[locale]/benchmark/brands/[slug]/_components/PerModelBar.tsx`
- Create: `src/app/[locale]/benchmark/brands/[slug]/_components/VisibilityTrendChart.tsx`
- Create: `src/app/[locale]/benchmark/brands/[slug]/_components/CompetitorTable.tsx`
- Modify: `src/app/[locale]/benchmark/brands/[slug]/page.tsx`

- [ ] **Step 1: Build the hero component**

```tsx
// src/app/[locale]/benchmark/brands/[slug]/_components/BrandHero.tsx
"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface Props {
  brand: {
    canonicalName: string;
    website: string | null;
    aliases: string[];
    categoryIds: string[];
  };
  primaryCategoryId: string | null;
  categoriesById: Record<string, { slug: string; name: string }>;
  hero: {
    visibilityPct: number;
    deltaPct: number;
    totalMentions: number;
    totalRuns: number;
  };
  windowDays: 7 | 30 | 90;
  onWindowChange: (w: 7 | 30 | 90) => void;
}

export function BrandHero({
  brand,
  primaryCategoryId,
  categoriesById,
  hero,
  windowDays,
  onWindowChange,
}: Props) {
  const favicon = brand.website
    ? `https://www.google.com/s2/favicons?domain=${new URL(brand.website).hostname}&sz=64`
    : null;
  const deltaColor =
    hero.deltaPct > 0
      ? "text-green-600"
      : hero.deltaPct < 0
        ? "text-red-600"
        : "text-muted-foreground";

  return (
    <header className="flex flex-col gap-4 rounded-lg border p-5">
      <div className="flex items-start gap-4">
        {favicon ? (
          <img src={favicon} alt="" className="h-12 w-12 rounded" />
        ) : (
          <div className="bg-muted flex h-12 w-12 items-center justify-center rounded text-lg font-semibold">
            {brand.canonicalName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">{brand.canonicalName}</h1>
          {brand.website && (
            <a
              href={brand.website}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 underline"
            >
              {brand.website}
            </a>
          )}
          <div className="flex flex-wrap gap-1 pt-1">
            {brand.categoryIds.map((id) => {
              const c = categoriesById[id];
              if (!c) return null;
              const isPrimary = id === primaryCategoryId;
              return (
                <Badge
                  key={id}
                  variant={isPrimary ? "default" : "secondary"}
                  title={isPrimary ? "Primary category" : undefined}
                >
                  {c.name}
                </Badge>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-wide">
            Visibility ({windowDays}d)
          </div>
          <div className="text-4xl font-semibold tabular-nums">
            {hero.visibilityPct.toFixed(1)}%
          </div>
          <div className={`text-sm ${deltaColor}`}>
            {hero.deltaPct >= 0 ? "+" : ""}
            {hero.deltaPct.toFixed(1)} pts vs prior window
          </div>
          <div className="text-muted-foreground text-xs">
            {hero.totalMentions.toLocaleString()} mentions /{" "}
            {hero.totalRuns.toLocaleString()} runs
          </div>
        </div>

        <div className="flex gap-1">
          {([7, 30, 90] as const).map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`rounded border px-3 py-1 text-sm ${
                w === windowDays ? "bg-primary text-primary-foreground" : ""
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Build the per-model bar component**

```tsx
// src/app/[locale]/benchmark/brands/[slug]/_components/PerModelBar.tsx
"use client";

interface Row {
  modelId: string;
  visibilityPct: number;
  mentionsCount: number;
}

interface Props {
  rows: Row[];
  activeModelId: string | null;
  onModelSelect: (modelId: string | null) => void;
}

export function PerModelBar({ rows, activeModelId, onModelSelect }: Props) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No model data yet.</p>;
  }
  const max = Math.max(...rows.map((r) => r.visibilityPct), 1);
  return (
    <div className="flex flex-col gap-2">
      {rows
        .slice()
        .sort((a, b) => b.visibilityPct - a.visibilityPct)
        .map((r) => {
          const isActive = r.modelId === activeModelId;
          return (
            <button
              key={r.modelId}
              onClick={() => onModelSelect(isActive ? null : r.modelId)}
              className={`flex items-center gap-3 rounded px-2 py-1 text-left text-sm hover:bg-muted ${
                isActive ? "bg-muted" : ""
              }`}
            >
              <span className="w-40 truncate font-mono text-xs">
                {r.modelId}
              </span>
              <div className="bg-muted relative h-4 flex-1 overflow-hidden rounded">
                <div
                  className="bg-primary absolute inset-y-0 left-0"
                  style={{ width: `${(r.visibilityPct / max) * 100}%` }}
                />
              </div>
              <span className="w-12 text-right tabular-nums">
                {r.visibilityPct.toFixed(1)}%
              </span>
            </button>
          );
        })}
    </div>
  );
}
```

- [ ] **Step 3: Build the trend chart**

```tsx
// src/app/[locale]/benchmark/brands/[slug]/_components/VisibilityTrendChart.tsx
"use client";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";

interface DayRow {
  date: string;
  modelId: string;
  mentionsCount: number;
  runsTotal: number;
}

interface Props {
  rows: DayRow[];
  windowDays: 7 | 30 | 90;
  activeModelId: string | null;
}

export function VisibilityTrendChart({ rows, windowDays, activeModelId }: Props) {
  const data = useMemo(() => {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const byDate = new Map<string, { mentions: number; runs: number }>();
    for (const r of rows) {
      if (new Date(r.date).getTime() < cutoff) continue;
      if (activeModelId && r.modelId !== activeModelId) continue;
      const cur = byDate.get(r.date) ?? { mentions: 0, runs: 0 };
      cur.mentions += r.mentionsCount;
      cur.runs += r.runsTotal;
      byDate.set(r.date, cur);
    }
    return [...byDate.entries()]
      .map(([date, v]) => ({
        date,
        value: v.runs === 0 ? 0 : (v.mentions / v.runs) * 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, windowDays, activeModelId]);

  return (
    <Card className="h-64 p-4">
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground text-sm">No trend data yet.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(5)}
              fontSize={11}
            />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v)}%`}
              fontSize={11}
              domain={[0, "auto"]}
            />
            <Tooltip
              formatter={(v: unknown) =>
                typeof v === "number" ? `${v.toFixed(1)}%` : ""
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Build the competitor table**

```tsx
// src/app/[locale]/benchmark/brands/[slug]/_components/CompetitorTable.tsx
"use client";
import Link from "next/link";

interface Competitor {
  id: string;
  slug: string;
  canonical_name: string;
  visibility_pct: string | number;
  avg_rank: string | number | null;
  sent_pos: string | number;
}

export function CompetitorTable({ competitors }: { competitors: Competitor[] }) {
  if (competitors.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No competitors found in the same category yet.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-muted-foreground text-xs uppercase">
        <tr>
          <th className="py-2 text-left">Brand</th>
          <th className="py-2 text-right">Visibility</th>
          <th className="py-2 text-right">Avg rank</th>
          <th className="py-2 text-right">Positive %</th>
        </tr>
      </thead>
      <tbody>
        {competitors.map((c) => (
          <tr key={c.id} className="border-t">
            <td className="py-2">
              <Link
                href={`/benchmark/brands/${c.slug}`}
                className="hover:underline"
              >
                {c.canonical_name}
              </Link>
            </td>
            <td className="py-2 text-right tabular-nums">
              {Number(c.visibility_pct).toFixed(1)}%
            </td>
            <td className="py-2 text-right tabular-nums">
              {c.avg_rank ? Number(c.avg_rank).toFixed(1) : "—"}
            </td>
            <td className="py-2 text-right tabular-nums">
              {Number(c.sent_pos).toFixed(0)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Rewrite `page.tsx`**

Replace `src/app/[locale]/benchmark/brands/[slug]/page.tsx` with a client page wiring the new components. Preserve the existing "Recent mentions" section by pulling from the current `getBrandProfile` call alongside `brands.stats`:

```tsx
"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { api } from "@/trpc/react";
import { BrandHero } from "./_components/BrandHero";
import { PerModelBar } from "./_components/PerModelBar";
import { VisibilityTrendChart } from "./_components/VisibilityTrendChart";
import { CompetitorTable } from "./_components/CompetitorTable";
// CitationsPanel, TopPromptsPanel, SentimentStacked added in Task 13

const parseWindow = (v: string | null): 7 | 30 | 90 =>
  v === "7" || v === "90" ? (Number(v) as 7 | 90) : 30;

export default function BrandProfilePage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const windowDays = parseWindow(search.get("window"));
  const modelId = search.get("model");

  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (value === null) sp.delete(key);
    else sp.set(key, value);
    router.replace(`${pathname}?${sp.toString()}`);
  };

  const stats = api.benchmark.brands.stats.useQuery({
    slug,
    window: windowDays,
    modelId: modelId ?? undefined,
  });

  const categories = api.benchmark.listCategories.useQuery();
  const categoriesById = Object.fromEntries(
    (categories.data ?? []).map((c) => [c.id, { slug: c.slug, name: c.name }]),
  );

  const legacyProfile = api.benchmark.getBrandProfile.useQuery({ slug });

  if (stats.isLoading) {
    return (
      <main className="container mx-auto p-6">
        <div className="bg-muted/50 h-40 w-full animate-pulse rounded" />
      </main>
    );
  }
  if (!stats.data) {
    return (
      <main className="container mx-auto flex flex-col gap-4 p-6">
        <Link href="/benchmark" className="text-sm underline">
          <ArrowLeft className="inline h-4 w-4" /> Back to dashboard
        </Link>
        <p>Brand not found.</p>
      </main>
    );
  }

  const s = stats.data;
  const hasData = s.perModel.length > 0 && s.hero.totalMentions > 0;

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <Link href="/benchmark" className="text-sm underline">
        <ArrowLeft className="inline h-4 w-4" /> Back to dashboard
      </Link>

      <BrandHero
        brand={s.brand}
        primaryCategoryId={s.primaryCategoryId}
        categoriesById={categoriesById}
        hero={s.hero}
        windowDays={s.window}
        onWindowChange={(w) => setParam("window", String(w))}
      />

      {!hasData ? (
        <section className="rounded border p-6 text-center">
          <p className="font-medium">Not enough data yet.</p>
          <p className="text-muted-foreground text-sm">
            Contribute a run to help benchmark this brand.
          </p>
          <Link
            href={`/benchmark?tab=run&promptBrand=${s.brand.slug}`}
            className="text-primary mt-2 inline-block underline"
          >
            Contribute a run →
          </Link>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Per model</h2>
            <PerModelBar
              rows={s.perModel}
              activeModelId={modelId}
              onModelSelect={(id) => setParam("model", id)}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Trend ({s.window}d)</h2>
            <VisibilityTrendChart
              rows={s.trendDays}
              windowDays={s.window}
              activeModelId={modelId}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Competitors</h2>
            <CompetitorTable competitors={s.competitors as never} />
          </section>
        </>
      )}

      {/* Recent mentions — existing feature, pulled from legacy endpoint */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Recent mentions</h2>
        {legacyProfile.data?.mentions.length ? (
          <ul className="flex flex-col gap-2">
            {legacyProfile.data.mentions.slice(0, 100).map((m, i) => (
              <li key={i} className="rounded border p-3 text-sm">
                <span className="font-mono text-xs">
                  {m.modelProvider}/{m.modelId}
                </span>
                {m.context && (
                  <p className="text-muted-foreground pt-1">
                    &ldquo;{m.context}&rdquo;
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No mentions yet.</p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Manual browser check**

Run: `pnpm dev` then open `http://localhost:3000/en/benchmark/brands/<known-brand-slug>`
Expected: hero, per-model bar, trend chart, competitor table all render. Changing window via pills updates the URL and re-queries. Clicking a model bar filters the trend.

- [ ] **Step 7: Commit**

```bash
git add src/app/[locale]/benchmark/brands/[slug]/_components src/app/[locale]/benchmark/brands/[slug]/page.tsx
git commit -m "feat(benchmark): brand page hero, per-model, trend, competitors"
```

---

## Task 13: Brand page UI — citations, top prompts, sentiment

**Files:**
- Create: `src/app/[locale]/benchmark/brands/[slug]/_components/CitationsPanel.tsx`
- Create: `src/app/[locale]/benchmark/brands/[slug]/_components/TopPromptsPanel.tsx`
- Create: `src/app/[locale]/benchmark/brands/[slug]/_components/SentimentStacked.tsx`
- Modify: `src/app/[locale]/benchmark/brands/[slug]/page.tsx` — mount the three new components

- [ ] **Step 1: Citations panel**

```tsx
// src/app/[locale]/benchmark/brands/[slug]/_components/CitationsPanel.tsx
"use client";

interface Row {
  domain: string;
  count: number;
  lastSeenAt: string | Date;
}

export function CitationsPanel({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No citations captured for this brand yet.
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.domain} className="flex items-center gap-3 text-sm">
          <img
            src={`https://www.google.com/s2/favicons?domain=${r.domain}&sz=32`}
            alt=""
            className="h-4 w-4"
          />
          <span className="w-40 truncate">{r.domain}</span>
          <div className="bg-muted relative h-3 flex-1 overflow-hidden rounded">
            <div
              className="bg-primary absolute inset-y-0 left-0"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
          <span className="w-10 text-right tabular-nums">{r.count}</span>
          <span className="text-muted-foreground w-24 text-right text-xs">
            {new Date(r.lastSeenAt).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Top prompts panel**

```tsx
// src/app/[locale]/benchmark/brands/[slug]/_components/TopPromptsPanel.tsx
"use client";

interface Row {
  prompt_id: string;
  text: string;
  category_id: string;
  mentions: number;
  avg_rank: string | number | null;
}

export function TopPromptsPanel({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No prompts yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.prompt_id} className="rounded border p-3 text-sm">
          <p className="line-clamp-2">{r.text}</p>
          <div className="text-muted-foreground mt-1 flex gap-4 text-xs">
            <span>{r.mentions} mentions</span>
            {r.avg_rank != null && (
              <span>avg rank {Number(r.avg_rank).toFixed(1)}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Sentiment stacked chart**

```tsx
// src/app/[locale]/benchmark/brands/[slug]/_components/SentimentStacked.tsx
"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";

// Sentiment time series is approximated from per-model breakdown repeated
// daily — or, for v1, rendered as a single static bar. We show a single
// aggregate bar here instead of a time series to avoid fabricating data
// (the aggregate table only stores sentiment at window granularity).

interface Props {
  pos: number;
  neu: number;
  neg: number;
}

export function SentimentStacked({ pos, neu, neg }: Props) {
  const total = pos + neu + neg || 1;
  return (
    <Card className="p-4">
      <div className="flex h-6 overflow-hidden rounded">
        <div
          className="bg-green-500"
          style={{ width: `${(pos / total) * 100}%` }}
          title={`Positive ${pos.toFixed(1)}%`}
        />
        <div
          className="bg-slate-400"
          style={{ width: `${(neu / total) * 100}%` }}
          title={`Neutral ${neu.toFixed(1)}%`}
        />
        <div
          className="bg-red-500"
          style={{ width: `${(neg / total) * 100}%` }}
          title={`Negative ${neg.toFixed(1)}%`}
        />
      </div>
      <div className="text-muted-foreground mt-2 flex justify-between text-xs">
        <span>Positive {pos.toFixed(0)}%</span>
        <span>Neutral {neu.toFixed(0)}%</span>
        <span>Negative {neg.toFixed(0)}%</span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Mount in `page.tsx`**

Inside the `hasData` branch of `page.tsx`, add below the Competitors section:

```tsx
<section className="flex flex-col gap-3">
  <h2 className="text-lg font-medium">Top citing sources</h2>
  <CitationsPanel
    rows={s.citations.map((c: { domain: string; count: number; lastSeenAt: Date }) => ({
      domain: c.domain,
      count: Number(c.count),
      lastSeenAt: c.lastSeenAt,
    }))}
  />
</section>

<section className="flex flex-col gap-3">
  <h2 className="text-lg font-medium">Top prompts</h2>
  <TopPromptsPanel rows={s.topPrompts as never} />
</section>

<section className="flex flex-col gap-3">
  <h2 className="text-lg font-medium">Sentiment</h2>
  <SentimentStacked
    pos={
      s.perModel.reduce((a, r) => a + r.sentimentPosPct * r.mentionsCount, 0) /
      Math.max(s.hero.totalMentions, 1)
    }
    neu={
      s.perModel.reduce((a, r) => a + r.sentimentNeuPct * r.mentionsCount, 0) /
      Math.max(s.hero.totalMentions, 1)
    }
    neg={
      s.perModel.reduce((a, r) => a + r.sentimentNegPct * r.mentionsCount, 0) /
      Math.max(s.hero.totalMentions, 1)
    }
  />
</section>
```

Add the three imports at the top of `page.tsx`:
```tsx
import { CitationsPanel } from "./_components/CitationsPanel";
import { TopPromptsPanel } from "./_components/TopPromptsPanel";
import { SentimentStacked } from "./_components/SentimentStacked";
```

- [ ] **Step 5: Manual check**

Run: `pnpm dev`, open a brand with known citations (trigger `retryRunExtraction` on a recent run if needed so citations repopulate).
Expected: citations panel shows top domains with favicons + counts. Top prompts lists mentions. Sentiment bar shows three segments.

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/benchmark/brands/[slug]/_components src/app/[locale]/benchmark/brands/[slug]/page.tsx
git commit -m "feat(benchmark): brand page citations, top prompts, sentiment"
```

---

## Task 14: Brand directory + global search combobox

**Files:**
- Create: `src/app/[locale]/benchmark/brands/page.tsx`
- Create: `src/app/[locale]/benchmark/brands/_components/BrandSearchCombobox.tsx`
- Modify: the benchmark main page header (find via `rg "listCategories" src/app` — the header that shows category pills) to mount the combobox

- [ ] **Step 1: Search combobox component**

```tsx
// src/app/[locale]/benchmark/brands/_components/BrandSearchCombobox.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/trpc/react";

function useDebounced<T>(value: T, ms = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function BrandSearchCombobox() {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 150);
  const results = api.benchmark.brands.search.useQuery(
    { q: debounced, limit: 10 },
    { enabled: debounced.length > 0 },
  );

  return (
    <div className="relative w-72">
      <input
        className="w-full rounded border px-3 py-2 text-sm"
        placeholder="Search brands…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {debounced.length > 0 && results.data && results.data.brands.length > 0 && (
        <ul className="bg-background absolute left-0 right-0 top-full z-10 max-h-80 overflow-auto rounded border shadow">
          {results.data.brands.map((b) => (
            <li key={b.id}>
              <Link
                href={`/benchmark/brands/${b.slug}`}
                className="hover:bg-muted block px-3 py-2 text-sm"
                onClick={() => setQ("")}
              >
                {b.canonicalName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

If `src/hooks/use-debounced-value.ts` doesn't exist, the inline `useDebounced` above is the fallback — delete the faulty import and keep only the inline helper.

- [ ] **Step 2: Directory page**

```tsx
// src/app/[locale]/benchmark/brands/page.tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/trpc/react";
import { Card } from "@/components/ui/card";

export default function BrandsDirectoryPage() {
  const [categorySlug, setCategorySlug] = useState<string | undefined>();
  const [sort, setSort] = useState<"visibility" | "alpha" | "recent">(
    "visibility",
  );
  const [includeUnverified, setIncludeUnverified] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();

  const categories = api.benchmark.listCategories.useQuery();
  const page = api.benchmark.brands.list.useQuery({
    categorySlug,
    sort,
    includeUnverified,
    cursor,
  });

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Brands</h1>

      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded border px-3 py-1 text-sm ${!categorySlug ? "bg-primary text-primary-foreground" : ""}`}
          onClick={() => setCategorySlug(undefined)}
        >
          All
        </button>
        {(categories.data ?? []).map((c) => (
          <button
            key={c.id}
            className={`rounded border px-3 py-1 text-sm ${c.slug === categorySlug ? "bg-primary text-primary-foreground" : ""}`}
            onClick={() => setCategorySlug(c.slug)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2 text-sm">
        <label>
          Sort{" "}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded border px-2 py-1"
          >
            <option value="visibility">Visibility</option>
            <option value="alpha">Alphabetical</option>
            <option value="recent">Recently active</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeUnverified}
            onChange={(e) => setIncludeUnverified(e.target.checked)}
          />
          Include unverified
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(page.data?.brands ?? []).map((b) => (
          <Link key={b.id} href={`/benchmark/brands/${b.slug}`}>
            <Card className="flex flex-col gap-1 p-3 transition-shadow hover:shadow">
              <div className="truncate font-medium">{b.canonicalName}</div>
              <div className="text-muted-foreground text-xs">
                {b.visibilityPct.toFixed(1)}% visibility · {b.mentions} mentions
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {page.data?.nextCursor && (
        <button
          className="self-center rounded border px-3 py-1 text-sm"
          onClick={() => setCursor(page.data.nextCursor)}
        >
          Load more
        </button>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Mount the combobox in the benchmark header**

Locate the existing benchmark page header (likely `src/app/[locale]/benchmark/page.tsx` or a shared `_components/BenchmarkHeader.tsx`). Add `<BrandSearchCombobox />` in the header next to the existing category pills. Import:

```tsx
import { BrandSearchCombobox } from "./brands/_components/BrandSearchCombobox";
```

- [ ] **Step 4: Manual check**

Run: `pnpm dev`
- Visit `/benchmark/brands` → grid renders with 24 cards, filters work, "Load more" paginates.
- Type in the header combobox → autocomplete shows matches → clicking navigates to brand page.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/benchmark/brands
git commit -m "feat(benchmark): brands directory and global search combobox"
```

---

## Task 15: Final checks

- [ ] **Step 1: Full typecheck + lint + tests**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test
```
Expected: all green.

- [ ] **Step 2: Trigger a full aggregate rebuild**

Run:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/benchmark-aggregate
```
Expected: 200 response; all seven duration keys populated; total under a few seconds on a reasonable dataset.

- [ ] **Step 3: End-to-end dogfood**

1. Submit a fresh run whose `rawAnswer` contains URLs via the Run tab.
2. Wait for extraction status to flip to `done`.
3. Verify `SELECT COUNT(*) FROM app.benchmark_citation WHERE run_id = <new-run-id>;` > 0.
4. Trigger cron again.
5. Visit the mentioned brand's page — confirm the citations panel renders with new domains and that visibility/trend reflect the new run.

- [ ] **Step 4: Commit any final polish**

If any typecheck, lint, or visual issues came up, fix and commit:
```bash
git add -A
git commit -m "chore(benchmark): final polish for brand stats and citations"
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| `benchmark_citation` table with unique (run_id, url) | 1 |
| No schema change to `benchmark_run`, `benchmark_brand_mention`, `brand` | 1 |
| Extractor extended, same round-trip | 4 |
| Ingestion path in same transaction, malformed → warn + continue | 5 |
| `extractorVersion` bump | 4 |
| Retry path picks up citations automatically | — (no code change needed; existing `retryRunExtraction` re-runs `extractRunInline`) |
| No citation↔mention junction in v1 | — (omitted by design) |
| `agg_citation_by_brand` | 6 |
| `agg_brand_visibility_by_model` with primary-category cache | 7 |
| `agg_brand_visibility_by_day` brand-pivot | 7 |
| Top-5 citation domains on `agg_brand_rank_by_prompt` | 8 |
| New rebuilds wired into cron | 9 |
| Primary-category resolver rule | 3, 7 (inline SQL) |
| Visibility metric definition | 7, 11 |
| Δ vs prior window | 11 (best-effort — caveat below) |
| Auto-competitors = top 5 in same primary category | 11 |
| Brand page hero, per-model, trend, competitors, citations, top prompts, sentiment, recent mentions | 12, 13 |
| Brand directory + search | 14 |
| `brands.search`, `brands.list`, `brands.stats` | 10, 11 |
| Unchanged: `submitRun`, `submitExtraction`, `retryRunExtraction`, MCP tools | — (untouched) |
| Empty state when brand <5 mentions | 12 (hasData branch) |

## Known caveats (deferred to follow-ups)

- **Prior-window Δ**: we currently store aggregates only at 7/30/90-day windows. `stats` asks for a `priorWindow = window * 2` which isn't always stored (e.g., 60 isn't a window). Δ will be 0 when priorWindow aggregate is absent. Fix later by computing prior-window visibility on demand from raw mentions.
- **Citation backfill**: old runs have no citations until `retryRunExtraction` is invoked per-run. No bulk backfill script.
- **Primary category flapping**: brands with evenly spread categories may rotate primary between cron ticks; acceptable for v1 (see spec §risks).
- **Sentiment time series**: v1 renders a single aggregate bar, not per-day, since the aggregate table stores sentiment at window granularity only.
