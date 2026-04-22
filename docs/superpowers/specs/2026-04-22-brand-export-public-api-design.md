# Brand Export + Public REST API

**Date:** 2026-04-22
**Status:** Draft
**Author:** greguretzky (with Claude)

## Context

Sub-project C of the peec.ai parity roadmap. Ships two read-only public data surfaces so external tools (spreadsheets, BI dashboards, agency reports) can consume brand stats without scraping.

## Goals

- Any visitor can download a brand's stats as CSV in one click.
- Any tool can GET a JSON shape equivalent to `brands.stats` via a stable public URL — no auth.
- Rate-limit public access per IP to prevent abuse.

## Non-goals (v1)

- Write endpoints.
- API keys / paid tiers.
- Looker Studio connector (separate sub-project C2 — needs Google Apps Script project).
- Cross-brand export (all brands in a category, or all brands total).
- Historical CSV including day-level time series beyond 90 days.
- Versioned API contract (`/v1/…`) — flat paths OK for now, version later if we break shape.

## Architecture

### 1. CSV export endpoint

**Route:** `GET /api/benchmark/export/brand/[slug].csv`

**Query params:**
- `window` ∈ `{7, 30, 90}` (default 30)

**Output:** `Content-Type: text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="<slug>-<window>d.csv"`.

**CSV rows** (one row per model):
```
model_id,mentions_count,runs_total,visibility_pct,avg_rank,sentiment_pos_pct,sentiment_neu_pct,sentiment_neg_pct,top_citation_domain
gpt-5-pro,12,34,35.29,2.4,80,15,5,reddit.com
claude-opus-4-7,8,30,26.67,3.1,75,20,5,news.ycombinator.com
…
```

No header comments, no totals row — flat and diff-friendly.

Data source: reuse the same server-side query path as `brands.stats` — fetch `agg_brand_visibility_by_model` rows + `agg_citation_by_brand` for the top domain. Single round-trip per call.

### 2. Public JSON endpoint

**Route:** `GET /api/benchmark/public/brands/[slug]`

**Query params:**
- `window` ∈ `{7, 30, 90}` (default 30)
- `modelId` (optional string)

**Output:** `Content-Type: application/json`. Same shape as the `brands.stats` tRPC procedure returns today, but re-exposed at a stable URL that doesn't require the tRPC batch envelope.

**Why not reuse the tRPC path?** tRPC URLs include a batch-style query string (`?batch=1&input=…`) that's awkward for curl / spreadsheets / BI tools. A clean `/api/benchmark/public/brands/<slug>?window=30` is the minimum ergonomics bar.

Implementation: Next.js route handler calls `benchmarkBrandsRouter.stats` via `createCaller` and re-encodes the result as plain JSON. Zero duplication of business logic.

### 3. Rate limiting

Reuse whatever rate-limit primitive the project already ships. If there isn't one: implement a thin in-memory `Map<ip, { count, resetAt }>` with 60 requests / minute / IP. Returns 429 with `Retry-After` header on breach.

Placement: a shared helper at `src/server/rate-limit.ts` applied inside both route handlers via a 2-line wrapper. If the codebase has an existing middleware pattern, adopt it.

Exceptions: requests from same-origin (our own UI clicking the CSV button) should not be rate-limited. Detect via `Referer` / `Sec-Fetch-Site: same-origin` header.

### 4. UI integration

- **Brand page** (`src/app/[locale]/benchmark/brands/[slug]/page.tsx`): add a small "Download CSV" button near the hero's window picker. Constructs URL from current window + slug and triggers download. No JS-heavy CSV-on-client — server builds it.
- **Public JSON** has no UI surface; it's an integration point.

### 5. Discoverability

Add a tiny `/api/benchmark/public` index route returning `{ brands: "/api/benchmark/public/brands/:slug", export: "/api/benchmark/export/brand/:slug.csv", version: "v1-unstable" }` so curious developers have a starting point.

## Error handling

- Unknown slug → 404 with JSON body `{ error: "brand-not-found" }`.
- Invalid `window` → 400 with JSON body listing valid values.
- Rate-limit breach → 429 with `Retry-After: <seconds>` header and JSON body `{ error: "rate-limited", retryAfter }`.
- Downstream DB error → 500 with generic message (never leak stack traces).

## Testing

- Unit: CSV serializer handles empty data, special chars in domain (quoted if contains comma), missing avg_rank → empty cell.
- Integration: route handler returns expected headers, status codes, shapes for known slug / unknown slug / invalid window / rate-limit breach.
- E2E smoke: `curl http://localhost:3000/api/benchmark/export/brand/openai.csv?window=30` returns well-formed CSV.

## Rollout

Single release. All three endpoints behind no feature flag. Low blast radius — read-only, existing aggregates.

## Risks

- Rate-limit bypass via distributed requests → acceptable for v1. No sensitive data exposed.
- Shape drift if we change aggregate schemas → add `version: "v1-unstable"` to JSON responses so consumers know not to depend on stability yet.
