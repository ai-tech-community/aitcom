# Benchmark Dashboard v2 — Design

Date: 2026-04-21
Status: Design approved, pending spec review before plan.
Supersedes: [2026-04-20-benchmark-dashboard-redesign-design.md](./2026-04-20-benchmark-dashboard-redesign-design.md)

## Summary

Replace the v1 single-hero Dashboard tab with a per-category list + chart explorer. Keep the v1 category pills + shareable URL state. The Dashboard tab now shows, for the selected category:

1. A thin **top-summary banner** ("CRM: **Salesforce** — 34% of AI answers").
2. An inline `[ 7 · 30 · 90 ]` **window-segmented control** with a Share button.
3. A **low-data banner** when `totalAnswers < 5` ("Few runs so far — trends stabilize after ~5 answers. Bring your agent to improve signal.").
4. A two-column grid on desktop: a scrollable **ranked brand list** (all brands in the category, not a top-N cutoff) on the left, a **multi-line trend chart** (one line per brand) on the right.

Clicking a row in the list highlights that brand's line in the chart (others dim). Clicking the brand NAME inside a row navigates to `/benchmark/brands/[slug]`. Clicking elsewhere on the row toggles highlight and mirrors `?b=<slug>` in the URL for deep links. Time-window swap keeps the active brand; category swap clears it.

No model filter on the dashboard. Per-brand × per-model depth lives on the brand profile page, not here.

## Goals

- **See every brand in a category, not just the leader.** Full scrollable list, no top-N truncation.
- **Trends over time as a first-class view.** One line per brand, full window visible.
- **Progressive focus.** Visitor clicks a brand → chart highlights → brand name click → dedicated profile page.
- **Shareable state.** Category, window, and active brand all reflect in the URL.
- **Honest small-sample UX.** A low-data banner flags when the numbers are noisy, rather than hiding data.

## Non-Goals (MVP)

- Per-model comparison on the dashboard (stays on `modelScope = 'all'`).
- ModelBreakdown panel on the dashboard (moves to brand profile page).
- Global "all categories" view.
- Brand filter / search in the list (deferred).
- Custom chart palette admin (fixed 10-hue fallback for MVP).

## Audience & Hero Decisions

Unchanged from v1: primary audience is **outside visitors** — press, prospects, researchers. The v2 shift is: "what does the benchmark say about _these brands_" beats "what does AI recommend for this category _in one number_". A single number made sense as PR bait; a ranked list + trend makes sense as analysis.

Visual direction remains editorial within AIT tokens.

## Data Model

**No new tables.** Both list and chart read the existing `agg_brand_trends_by_day` populated hourly by the `benchmark-aggregate` cron. The banner keeps reading `agg_top_brand_by_category` (also populated by the same cron).

Brand auto-creation (already shipped in the v1 branch): extractor mentions with no matching brand insert a new `brand` row with `verified = false`, slug derived from the canonical name, `category_ids = [prompt.categoryId]`. Admins can merge duplicates later via the alias queue.

## API Surface

### New public procedure: `benchmark.getCategoryBrandList`

Input:
```ts
{
  categoryId: z.string().uuid(),
  windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
}
```

Output:
```ts
{
  brands: Array<{
    brandId: string;
    slug: string;
    canonicalName: string;
    sharePct: number;           // 0..100
    mentionCount: number;       // distinct runs in this category/window
    rank: number;               // 1-based
    sparkline: Array<{ date: string; value: number }>; // 30 buckets over window
  }>;
  totalAnswers: number;
  lowData: boolean;             // totalAnswers < 5
}
```

Implementation sketch:
1. Query `agg_brand_trends_by_day` rows for this `categoryId` within `now() - windowDays`.
2. Per-brand aggregate: `mentionCount = sum(run_count)`, `sharePct = avg(mentionPct)`.
3. Sort by `mentionCount DESC, canonicalName ASC`. Rank = array index + 1. Unlimited length (all brands that showed up).
4. `totalAnswers` = `COUNT(DISTINCT benchmark_run.id)` for `(category, window, extraction_status='done')` — separate small query.
5. Sparklines: call `buildSparkline(rows, windowDays)` pure helper per brand; downsamples daily points into 30 fixed buckets with zero-fill at gaps.

### New public procedure: `benchmark.getCategoryBrandTrend`

Input:
```ts
{
  categoryId: z.string().uuid(),
  windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
}
```

Output:
```ts
{
  series: Array<{
    brandId: string;
    slug: string;
    canonicalName: string;
    points: Array<{ date: string; value: number }>; // one per day, zero-filled
  }>;
}
```

Date range: `CURRENT_DATE - windowDays` through `CURRENT_DATE`. Points are day-level, `value = avg(mentionPct)` across all models for that `(category, brand, day)`. Days where the brand had zero mentions emit `value = 0`.

Same sort order as the list (so color assignment is stable between the two panels when derived from index).

### Kept

- `getHeroTopBrand` — banner only now.
- `getBrandProfile` — brand page (unchanged).
- `listCategories` — pills.

### Dropped from the dashboard render path (stay on router for now)

- `getHeroOverview` — unused after v2; cleanup in a follow-up PR.

## Component Structure

All new components live under `src/app/[locale]/benchmark/_components/dashboard/`.

### Create

- `top-summary-banner.tsx` — one-line banner above the main grid. Props: `{ hero: HeroTopBrand | null, categoryName: string }`. Hidden when `hero` is null.
- `window-segmented.tsx` — inline `[ 7 · 30 · 90 ]` control. Props: `{ value, onChange }`.
- `low-data-banner.tsx` — conditional warning card. Props: `{ totalAnswers: number, threshold?: number (default 5) }`. Renders nothing when `totalAnswers >= threshold`.
- `brand-ranked-list.tsx` — scrollable container. Props: `{ brands, activeBrandSlug, onToggleBrand }`.
- `ranked-brand-row.tsx` — single row with rank · name · share · sparkline. Props: `{ brand, active, onToggle }`. Brand name rendered as an inline `<Link>` to `/benchmark/brands/<slug>` with `stopPropagation` so the row's toggle doesn't fire.
- `brand-trend-chart.tsx` — Recharts `<LineChart>` with one `<Line>` per brand. Props: `{ series, activeBrandSlug, colorFor(slug)→string }`. Active line: `strokeWidth=3`, opacity=1; others: `strokeWidth=1`, opacity=0.25.
- `chart-palette.ts` — exports `colorFor(slug: string): string` using a 10-hue cyclic palette seeded by stable string hash of slug. Documented single-source-of-truth for both list sparkline and chart line colors.
- `build-sparkline.ts` + `build-sparkline.test.ts` — pure helper: `buildSparkline(points: Array<{ date; value }>, windowDays: 7|30|90, buckets = 30)` → `Array<{ date; value }>` of fixed length `buckets`.

### Rewrite

- `dashboard-tab.tsx` — thin orchestrator. Reads `useDashboardQueryState` (extended with `activeBrandSlug`). Renders:
  ```
  <CategoryPills />
  <Row><WindowSegmented /><HeroActions /></Row>
  <TopSummaryBanner />
  <LowDataBanner />
  <Grid>
    <BrandRankedList />
    <BrandTrendChart />
  </Grid>
  ```

### Extend

- `use-dashboard-query-state.ts` — add `activeBrandSlug: string | null` field + `setActiveBrand(slug | null)` in `update`. Serialize to `?b=<slug>`.

### Delete (no callers after rewrite; verified in plan)

- `hero-card.tsx`
- `hero-headline.tsx`
- `hero-metrics.tsx`
- `runner-up-note.tsx`
- `hero-actions.tsx` *(replaced — new file lives directly in dashboard-tab; note: old file exported `HeroActions`; v2 can reuse the share+options surface — see §4 below)*
- `model-breakdown.tsx`
- `brand-trend-mini.tsx`

Actually, `hero-actions.tsx` is still useful as the Share + Options popover. Keep it; the v2 dashboard calls it directly above the grid. The Options popover loses its "window" select (now inline) — repurpose that slot for future filters (model multi-select); for MVP the popover only contains the window control as a fallback. Confirm in plan.

### Keep

- `dashboard-empty.tsx` — still used when categories are empty.
- `vertical-pills.tsx` — still the category switcher.
- `latest-runs-feed.tsx` — drop from the dashboard render for v2 (not part of the new layout). Stays as a file; can be moved to a future feed page.

## Visual Language

All existing AIT Tailwind tokens. No new palette.

**Container:** `max-w-6xl mx-auto`. Vertical stack with `gap-4`.

**Category pills:** unchanged from v1.

**Window-segmented control:** `flex gap-1 rounded-md bg-muted/40 p-1`. Each `<Button variant="ghost" size="sm">`. Active: `bg-background shadow-sm`. Right-aligned in a row with the existing `HeroActions` (Share + Options).

**Top summary banner:** `Card p-4`. One line in `text-base`: `<Category>: <strong>{brand}</strong> — {share}% of AI answers`. Hides when hero data is null.

**Low-data banner:** `Card p-3 bg-muted/40 border-dashed`. A `lucide-react` `AlertTriangle` icon + short copy (i18n `benchmark.lowData.body`). No CTA button; the copy mentions running more prompts.

**Grid:** `grid gap-6 md:grid-cols-[minmax(320px,1fr)_2fr]`. Stacks on mobile.

**Ranked list card:** `Card max-h-[520px] overflow-y-auto divide-y`. Inner scroll.

**Ranked row:** `flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40 transition`. Active: `bg-primary/10`. Layout:
```
[Rank w-8] [Name grow] [Spacer] [Share w-14 right] [Sparkline w-20 h-8]
```
- Rank: `text-muted-foreground text-sm tabular-nums`
- Name: `inline <Link> font-medium hover:underline underline-offset-4` — clicking navigates; `stopPropagation` prevents the row-toggle.
- Share: `text-sm tabular-nums`
- Sparkline: Recharts `<LineChart>` with no axes/tooltip, `strokeWidth=1.5`, color from `colorFor(slug)`.

**Trend chart card:** `Card p-6 h-[520px]`. Recharts `<LineChart>`. `XAxis dataKey="date"` with `tickFormatter` for compact mm-dd. `YAxis` with `domain=[0, 'auto']` and `tickFormatter={(v) => \`${v}%\`}`. `Tooltip` formatted per-line. `Legend` hidden (too many brands). Active brand line: `strokeWidth={3}`, opacity 1; others: `strokeWidth={1}`, opacity 0.25.

**Palette:** `chart-palette.ts` exports `colorFor(slug)`. 10-hue fallback: `#2563eb #16a34a #dc2626 #d97706 #7c3aed #0891b2 #db2777 #65a30d #9333ea #ea580c`. Stable assignment via FNV-1a hash of slug mod 10.

**Skeletons:** list card renders 6 animate-pulse rows; chart card renders a single `h-[480px] animate-pulse` block; banner renders a single-line skeleton.

## Interaction & URL State

Extended URL params (adds `?b`):
- `?c=<categorySlug>` — active category (omit when default)
- `?w=7|30|90` — window (omit when 30)
- `?b=<brandSlug>` — highlighted brand (omit when none)

Behavior:

1. Pill click: `?c` updated, `?b` cleared. All queries re-fire.
2. Window click: `?w` updated, `?b` preserved (same brand across windows is meaningful). Queries re-fire.
3. Row click: toggle `?b=<slug>` (clicking same row again clears it). Chart re-highlights client-side; no network.
4. Chart hover: temporary visual highlight + tooltip; not URL-persisted.
5. Brand name click inside a row: `router.push('/benchmark/brands/<slug>')` with `stopPropagation` on the link's `onClick`.
6. Share: copies the current URL including all three params.

Default selection on first load (no `?c`): pick the category with the highest `sharePct` at `windowDays=30` per the existing `resolveDefaultCategory` logic, still driven by the `getHeroOverview` query OR by a quick `getCategoryBrandList` against each category (choose the former — already exists and is cheaper).

## Data Flow & Error Handling

**Happy path** per pill change:
1. `useDashboardQueryState` resolves `{ categorySlug, windowDays, activeBrandSlug, modelScope='all' }`.
2. `listCategories` (cached) → pill labels.
3. `getHeroTopBrand` → banner (fails softly, banner hides).
4. `getCategoryBrandList` → ranked list + sparkline data.
5. `getCategoryBrandTrend` → chart lines.

React-Query uses `placeholderData: keepPreviousData` on the list + chart queries so swaps don't flicker.

**Zero / low data:**
- Categories empty → `DashboardEmpty` for the whole tab (unchanged).
- Category selected, `getCategoryBrandList.brands` empty → list renders "No data for _{Category}_ in this window" body text; chart renders a similar empty state. Banner hides because hero is null.
- `totalAnswers < 5` and brands present → low-data banner above the grid; list + chart still render normally.

**Errors:**
- Each of banner / list / chart renders its own inline "Couldn't load — retry" affordance on error. No full-tab crash.
- Invalid URL params (unknown slug, bad window, unknown brand slug) → coerced silently to defaults; URL rewritten on next update.

**Loading:** skeletons per card; no full-page spinner.

## Testing

**Unit tests (vitest, co-located):**
- `build-sparkline.test.ts` — empty input; single day; sparse with gaps; full-window; off-by-one at window edges; deterministic bucket count.
- Existing `resolve-default-category.test.ts` stays.

**Component tests:** skipped (no Playwright harness).

**Manual smoke checklist** (post-deploy):
1. Zero runs in category → list empty with copy, chart empty with copy, banner hidden, low-data banner hidden (since `totalAnswers === 0`, not `< 5 AND > 0` — confirm the copy branch).
2. 1-run category (all brands at 100%) → low-data banner shown; list sorted alphabetical (tie-break); chart lines overlap at 100%.
3. Multi-run category → leader shown in top banner; list ranks match chart line prominence when hovered; click row → line highlights + `?b=` in URL.
4. Swap window 30 → 7 → 90 → all three queries re-fire; `?b=` preserved; URL correctly drops `?w` when returning to 30.
5. Swap category → `?b=` cleared; chart lines change.
6. Click a brand NAME (not the row) → navigates to brand profile page.
7. Share link → incognito reload lands on identical state.
8. Network throw on any one query → isolated retry affordance; other cards render fine.

## Rollout

1. Stack commits on top of the existing `feat/benchmark-dashboard-redesign` branch (PR #47). PR description updated to reflect v2.
2. No DB migration; no seed changes.
3. Deploy triggers existing aggregate cron; data already in place.
4. Smoke per §Testing manual checklist.

## Open Questions (flagged for plan, non-blocking)

- Keeping `hero-actions.tsx` vs replacing with a simpler share-only button — plan decides. Recommend keep-and-simplify: popover retains a single "Window" control as a secondary path, plus room for future model-multi-select without needing another popover surface.
- Color palette vs future design-token set — plan uses the fallback hues; tokenized palette is a follow-up.
- i18n key cleanup — plan defers removal of `hero.metricAnswers/metricModels/metricWindow/metricBrands/runnerUp/window/share/options/copied/copyFailed/emptyCategory.*` (unused after v2) to a follow-up PR so this PR stays focused on UI+API changes.
- Unused `benchmark.getHeroOverview` — same; follow-up.
