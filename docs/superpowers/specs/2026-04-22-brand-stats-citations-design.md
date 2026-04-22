# Brand Stats Overhaul + Citations Tracking

**Date:** 2026-04-22
**Status:** Draft — awaiting review
**Author:** greguretzky (with Claude)

## Context

Existing benchmark is crowd/agent-driven: users and MCP-authenticated agents submit raw LLM answers for community prompts. An LLM extractor (OpenRouter `moonshotai/kimi-k2.5`) pulls brand mentions; cron jobs build aggregates for the `/benchmark` dashboard.

Competitor **peec.ai** offers a paid, automated tracker that polls LLMs daily and shows brand-owners a rich stats page per brand: visibility %, per-model breakdown, trend, competitor comparison, citations/sources, sentiment.

We stay open and community-driven (no payments, no tenancy, no per-user projects). We want any visitor to **search or pick a brand and see a peec-style public stats page**, fed by the community data we already collect.

This spec covers the first bundled sub-project:

1. **Citations capture** — extract URLs the LLM cited in each answer
2. **Brand stats overhaul** — upgrade `/benchmark/brands/[slug]` into a full dashboard
3. **Brand search / index** — `/benchmark/brands` directory + global search

Seven explicit non-goals (see end of doc) are deferred to follow-up sub-projects.

## Goals

- Any visitor can discover and land on a brand stats page in ≤2 clicks
- Brand stats page surfaces: visibility %, per-model breakdown, trend, auto-competitors, top citing sources, top prompts, sentiment, recent mentions
- Citations captured for every new run with zero change to submission contract (TRPC + MCP tool signatures stay the same)
- No regression to existing run-submission / extraction / dashboard flow

## Non-goals (v1)

- Geo / country breakdown (locale field exists but not surfaced)
- Tags on prompts
- Public REST export / Looker Studio connector / CSV download
- Alerts / webhooks on rank or visibility shifts
- AI-suggested prompts for cold-start brands
- Strategy / recommendation engine
- Multi-project or tenancy
- Precise citation↔mention junction linking (see Architecture §3)
- Backfilling citations for historical runs (new runs forward only; per-run `retryRunExtraction` populates on demand)

## Architecture

### 1. Data model

**New table: `benchmark_citation`**

| column         | type       | notes                                   |
|----------------|------------|-----------------------------------------|
| id             | uuid pk    |                                         |
| run_id         | uuid fk    | → `benchmark_run.id`, cascade delete   |
| url            | text       | raw URL as extracted                    |
| domain         | text       | indexed, denormalized eTLD+1            |
| title          | text null  | link text if markdown link              |
| snippet        | text null  | 80–280 char surrounding context         |
| position       | int        | ordinal position in answer (1-based)    |
| created_at     | timestamptz|                                         |

- Unique constraint: `(run_id, url)` to dedupe within a run
- Index: `(domain)`, `(run_id)`

**No changes** to: `benchmark_run`, `benchmark_brand_mention`, `benchmark_prompt`, `brand`, MCP tool input schemas, `submitRun` TRPC input. (Note: the brand table is named `brand` in the current schema — `benchmark_brand_mention` is the mention table, not the brand table.)

### 2. Extractor changes

Single OpenRouter call keeps one round-trip. Output schema extended:

```json
{
  "mentions": [ /* unchanged */ ],
  "citations": [
    { "url": "...", "domain": "...", "title": "...", "snippet": "...", "position": 1 }
  ]
}
```

Extractor system prompt gains:

> Additionally, extract every URL present in the answer (inline links, footnotes, "Sources:" sections, bracketed citations). For each URL return: full `url`, registrable `domain` (eTLD+1), link text as `title` (null if not a markdown link), up to 280 chars of surrounding context as `snippet`, and 1-based `position` reflecting order of first appearance.

`extractorVersion` string on run bumps to note new schema (e.g. `kimi-k2.5-v2-citations`).

**Ingestion (`submitExtraction` TRPC):**

1. Existing path: reconcile mentions → `benchmark_brand_mention` (unchanged)
2. New path: insert citations → `benchmark_citation`, `onConflictDoNothing` on `(run_id, url)`
3. Both inside existing transaction; run marked `done` only if both succeed
4. Malformed/missing `citations` array → log warning, persist mentions only, status still `done` (citations are additive)

**Retry:** existing `retryRunExtraction` re-runs the full extractor → backfills citations for that run. No separate migration path.

### 3. Citation↔brand correlation

v1 **does not** maintain a precise citation↔mention junction. Correlation happens at aggregation time:

> Citations from runs where brand X was mentioned (in the brand's primary category, within the window).

This is fast, simple, and accurate enough for "Top sources mentioning Brand X" at the scale of 10–20 top domains. If false correlation becomes an issue (answer cites Source A about Brand Y but brand X also mentioned in same answer), we add a junction table in a later sub-project.

### 4. Aggregations

Extend the existing `/api/cron/benchmark-aggregate` endpoint. All new aggregates follow the same pattern as `agg_brand_rank_by_prompt`: materialized tables rebuilt by the cron, indexed for fast reads.

**New: `agg_citation_by_brand`**

| column           | type        |
|------------------|-------------|
| brand_id         | uuid        |
| category_id      | uuid null   |
| model_provider   | text        |
| model_id         | text        |
| window_days      | int (7/30/90)|
| domain           | text        |
| citation_count   | int         |
| last_seen_at     | timestamptz |

Query logic per slice:

```sql
SELECT c.domain, COUNT(DISTINCT c.run_id) AS citation_count, MAX(c.created_at) AS last_seen_at
FROM benchmark_citation c
JOIN benchmark_run r ON r.id = c.run_id
JOIN benchmark_brand_mention m ON m.run_id = r.id
WHERE m.brand_id = :brand_id
  AND r.captured_at >= now() - (:window_days || ' days')::interval
  AND (:model_provider IS NULL OR r.model_provider = :model_provider)
GROUP BY c.domain
ORDER BY citation_count DESC
LIMIT 20
```

Top 20 domains per slice. Bounded row count.

**New: `agg_brand_visibility_by_model`**

| column              | type  |
|---------------------|-------|
| brand_id            | uuid  |
| model_provider      | text  |
| model_id            | text  |
| window_days         | int   |
| mentions_count      | int   |
| runs_total          | int   |
| visibility_pct      | float |
| avg_rank            | float |
| sentiment_pos_pct   | float |
| sentiment_neu_pct   | float |
| sentiment_neg_pct   | float |

Denominator (`runs_total`) = runs in brand's **primary category** in window (see §5 metric definitions).

**New: `agg_brand_visibility_by_day`**

| column         | type        |
|----------------|-------------|
| brand_id       | uuid        |
| date           | date        |
| model_provider | text        |
| mentions_count | int         |
| runs_total     | int         |

Powers sparklines and trend chart. `agg_brand_trends_by_day` currently keyed by category/model — this is the brand pivot.

**Extend `agg_brand_rank_by_prompt`**: add column `citation_domains_top5 text[]` — top 5 domains from runs in that (prompt, model, window) slice. Single-query fetch for the "Top prompts" panel.

**Cost estimate:** 4 additional group-by passes per cron tick, all indexed. Expected to fit current cron window; measure after first deploy.

### 5. Metric definitions (authoritative)

**Primary category resolution.** The `brand` table stores `categoryIds uuid[]` (multi-category, no explicit primary). For pages and denominators that need a single category, compute a **primary category** per brand:

```
primary_category(brand) :=
  IF brand.categoryIds[] IS NOT EMPTY
    pick the category_id in brand.categoryIds with the most mentions for this brand in the last 90 days
    ties → first element of brand.categoryIds
  ELSE
    pick the category_id appearing most often across this brand's mentions in the last 90 days (inferred)
    ELSE null (brand has no category data — render "All categories" denominator)
```

Cached in a new helper view / aggregate column `agg_brand_visibility_by_model.primary_category_id` (populated by the same cron that builds the aggregate). Single source of truth for the brand page.

- **Visibility %** for (brand, window) = `mentions_count / runs_total × 100`, where `runs_total` = runs in the brand's **primary category** (from the cache above) in the window. If primary category is null, denominator is all runs in window. Applied identically on hero, per-model chart, and trend.
- **Δ visibility** = current window visibility − prior equal-length window visibility (pt difference, not %).
- **Competitors** = top 5 brands by visibility % whose `categoryIds` contains the subject brand's primary category, excluding the brand itself, same window.
- **Sentiment breakdown** = counts of `benchmark_brand_mention.sentiment ∈ {positive, neutral, negative}` for runs in window, expressed as % of that brand's mentions.
- **Top prompts** = prompts ranked by `mentions_count` for the brand in window; show avg rank, sample context snippet.

### 6. UI surfaces

**Route `/benchmark/brands/[slug]` — brand stats page (replace current minimal page)**

Top → bottom sections:

1. **Hero** — canonical name, favicon derived from `brand.website` (same `s2/favicons` trick used for citation domains; fallback to initial letter avatar if no website), website link, primary category + remaining `categoryIds` as chips. Big visibility % number. Δ vs prior window. Window picker (7 / 30 / 90, URL-persisted via existing `?window=` pattern). No dedicated logo column added in v1.
2. **Per-model breakdown** — horizontal bar chart, one bar per `(model_provider, model_id)` with runs in window. Click bar → filter rest of page via `?model=` query param.
3. **Trend** — line chart, daily visibility %. Overlay: top 3 auto-competitors' lines, dashed.
4. **Competitor table** — 5 rows: brand name (link), visibility %, avg rank, dominant sentiment, Δ.
5. **Top sources (citations)** — top 10 domains from `agg_citation_by_brand`. Favicon (via `https://www.google.com/s2/favicons?domain=…`) + domain + count + last seen. Empty state: "No citations captured yet — [contribute a run]".
6. **Top prompts** — top 10 prompts with brand mentions. Columns: prompt text, category, mentions count, avg rank, one sample context snippet.
7. **Sentiment over time** — stacked area chart (pos/neu/neg) across window.
8. **Recent mentions** — collapsed by default, expands existing 100-mention list (preserve current implementation).

Empty-state rule: brand with fewer than 5 mentions in any window → show "Not enough data yet — contribute a run" CTA linking to Run tab with `?promptBrand=<slug>` prefill.

**Route `/benchmark/brands` — brand directory (new)**

- Search input (client-fuzzy if list ≤ 500 brands, server-backed otherwise)
- Category filter (reuse existing category pill component)
- Sort: visibility (default), alphabetical, recently active
- Grid of brand cards: name, primary category, current visibility %, 14-day sparkline
- Pagination (cursor-based) or infinite scroll; 24 per page
- Toggle: "Include unverified brands" (off by default — auto-created brands clutter the index)

**Global brand search component (new, reusable)**

- Headless combobox, debounced 150ms
- `GET /api/benchmark/brands/search?q=…` — returns top 10 matches (ILIKE on name + alias array, prefix-preferred)
- Mount in the benchmark page header alongside category pills
- Keyboard-first interaction; ⌘K global shortcut deferred

**Linking** (existing deep links continue to work):
- Dashboard brand list → `/benchmark/brands/[slug]` ✓
- Competitor table rows → `/benchmark/brands/[slug]` ✓
- Recent mentions entries → `/benchmark/brands/[slug]` ✓

### 7. TRPC surface

New:
- `benchmark.brands.search({ q: string, limit?: number (≤25) })` → `{ brands: { slug, name, primaryCategory }[] }`
- `benchmark.brands.list({ categorySlug?, sort: 'visibility'|'alpha'|'recent', cursor?, includeUnverified?: boolean })` → `{ brands: BrandCard[], nextCursor? }`
- `benchmark.brands.stats({ slug, window: 7|30|90, model? })` → composite object with hero, perModel, trend, competitors, citations, topPrompts, sentiment

Unchanged: `submitRun`, `submitExtraction`, `retryRunExtraction`, `list-benchmark-prompts`, `submit-benchmark-run`.

## Error handling

- Extractor returns invalid JSON → existing retry path (up to 2 attempts, then `extractionStatus: failed`) unchanged; citations absent does not count as failure
- Citation insert conflict on `(run_id, url)` → skipped silently via `onConflictDoNothing`
- Brand stats query for unknown slug → 404 page
- Brand stats query for brand with zero runs → render page with empty-state CTA, no errors
- Cron aggregate failure on new tables → existing cron logs it, other aggregates continue (isolated per-step try/catch, following existing pattern)

## Testing

- Unit: extractor output parser handles missing/malformed `citations` field, dedup logic on `(run_id, url)`, domain extraction from URL edge cases (IDN, ports, query strings)
- Integration: submit run → extraction runs → assert `benchmark_citation` rows exist with expected domains; retry path backfills citations on an existing run
- Aggregate: fixture with known runs/mentions/citations → cron job produces expected rows in all four aggregate tables
- UI: brand page renders each section with seeded data; empty states render for <5 mentions; window/model query-param persistence works
- Regression: existing dashboard, run submission, MCP `submit-benchmark-run` flow unaffected

## Rollout (phases, each shippable independently)

1. Schema migration: create `benchmark_citation` + extend `agg_brand_rank_by_prompt`
2. Extractor: schema bump, prompt update, ingestion path
3. Aggregations: four new/extended cron passes; re-run to populate
4. Brand page: hero + per-model + trend + competitor table (dogfood internally)
5. Brand page: citations panel + top prompts + sentiment
6. Brand directory + global search component

Phases 1–3 are invisible infra (safe to ship behind existing cron); 4–6 are user-visible.

## Open risks

- **Citation recall depends on submitter** — if agent pastes only the prose part of an LLM answer and omits the sources block, we capture nothing. Acceptable for v1; agents can be nudged via MCP-tool description update (no contract change required).
- **False correlation in `agg_citation_by_brand`** — see §3; monitor for "Top sources" panels that feel off and add junction table if needed.
- **Primary category cache staleness** — primary category is derived and cached per cron tick. New brand with only fresh mentions may show "All categories" denominator until next cron run. Acceptable; full recompute every tick.
- **Brands with many categories** — primary picked as most-mentioned-in-90d; brands evenly spread across categories will flap. Tie-breaker is `categoryIds[0]`. If flapping becomes noticeable, promote primary to a real column populated by moderator.
- **Cron runtime** — 4 new passes; will measure and partition or background-queue if needed.
