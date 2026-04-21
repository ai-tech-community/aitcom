# Benchmark Dashboard v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hero-only `/benchmark` Dashboard tab with a per-category list + multi-line trend explorer: thin summary banner, inline 7/30/90 segmented window control, low-data warning, scrollable ranked list of all brands with inline sparklines, and a multi-line Recharts chart (one line per brand) with interactive highlight tied to the list selection.

**Architecture:** Reuse the existing `agg_brand_trends_by_day` + `agg_top_brand_by_category` aggregate tables — no DB migration. Add two new public tRPC procedures (`getCategoryBrandList`, `getCategoryBrandTrend`) that derive ranked list and per-brand daily series from the trend aggregate. The DashboardTab orchestrator becomes a thin client component that composes small focused children (banner, segmented control, list, chart) and wires URL state (`?c`, `?w`, `?b`) via the existing `useDashboardQueryState` hook.

**Tech Stack:** TypeScript, Next.js 15 App Router, tRPC 11, Drizzle ORM, Postgres (Neon), Recharts, shadcn/radix-ui, Tailwind 4, next-intl, Vitest, Zod.

**Spec:** [docs/superpowers/specs/2026-04-21-benchmark-dashboard-v2-design.md](../specs/2026-04-21-benchmark-dashboard-v2-design.md)

---

## File Structure

**Create:**
- `src/server/benchmark/build-sparkline.ts` + `.test.ts` — pure helper
- `src/app/[locale]/benchmark/_components/dashboard/chart-palette.ts` — slug → color
- `src/app/[locale]/benchmark/_components/dashboard/top-summary-banner.tsx`
- `src/app/[locale]/benchmark/_components/dashboard/window-segmented.tsx`
- `src/app/[locale]/benchmark/_components/dashboard/low-data-banner.tsx`
- `src/app/[locale]/benchmark/_components/dashboard/ranked-brand-row.tsx`
- `src/app/[locale]/benchmark/_components/dashboard/brand-ranked-list.tsx`
- `src/app/[locale]/benchmark/_components/dashboard/brand-trend-chart.tsx`

**Modify:**
- `src/server/api/routers/benchmark.ts` — add `getCategoryBrandList`, `getCategoryBrandTrend`
- `src/app/[locale]/benchmark/_components/dashboard/use-dashboard-query-state.ts` — add `activeBrandSlug` + serializer
- `src/app/[locale]/benchmark/_components/dashboard-tab.tsx` — rewrite as v2 orchestrator
- `messages/en.json`, `messages/nl.json` — add v2 keys; leave unused v1 keys in place (cleanup PR later)

**Delete (zero external refs; verified in plan):**
- `src/app/[locale]/benchmark/_components/dashboard/hero-card.tsx`
- `src/app/[locale]/benchmark/_components/dashboard/hero-headline.tsx`
- `src/app/[locale]/benchmark/_components/dashboard/hero-metrics.tsx`
- `src/app/[locale]/benchmark/_components/dashboard/runner-up-note.tsx`
- `src/app/[locale]/benchmark/_components/dashboard/model-breakdown.tsx`
- `src/app/[locale]/benchmark/_components/dashboard/brand-trend-mini.tsx`

**Keep unchanged:**
- `vertical-pills.tsx`, `dashboard-empty.tsx`, `latest-runs-feed.tsx` (still referenced elsewhere or still used in v2 via pills/empty-state)
- `hero-actions.tsx` — retained as the Share button host; Options popover keeps a single Window select as a fallback path. DashboardTab places it next to the new `WindowSegmented`.

---

## Phase 1 — Pure helper (TDD)

### Task 1: `buildSparkline` helper with tests

**Files:**
- Create: `src/server/benchmark/build-sparkline.ts`
- Create: `src/server/benchmark/build-sparkline.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/server/benchmark/build-sparkline.test.ts
import { describe, expect, it } from "vitest";
import { buildSparkline } from "./build-sparkline";

describe("buildSparkline", () => {
  it("returns BUCKETS zero-filled points for empty input", () => {
    const out = buildSparkline([], 30, 30);
    expect(out).toHaveLength(30);
    expect(out.every((p) => p.value === 0)).toBe(true);
  });

  it("places a single-day value into the correct bucket", () => {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    const out = buildSparkline([{ date: iso, value: 42 }], 30, 30);
    expect(out).toHaveLength(30);
    expect(out[out.length - 1]!.value).toBe(42);
    expect(out[0]!.value).toBe(0);
  });

  it("averages multiple points that fall in the same bucket", () => {
    const d = new Date();
    const iso1 = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() - 1);
    const iso2 = d.toISOString().slice(0, 10);
    const out = buildSparkline(
      [
        { date: iso1, value: 10 },
        { date: iso2, value: 30 },
      ],
      7,
      7,
    );
    expect(out).toHaveLength(7);
    expect(out[out.length - 1]!.value).toBe(10);
    expect(out[out.length - 2]!.value).toBe(30);
  });

  it("ignores points outside the window", () => {
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 400);
    const iso = old.toISOString().slice(0, 10);
    const out = buildSparkline([{ date: iso, value: 99 }], 30, 30);
    expect(out.every((p) => p.value === 0)).toBe(true);
  });

  it("is deterministic — same input returns same bucket timestamps across calls", () => {
    const a = buildSparkline([], 30, 30);
    const b = buildSparkline([], 30, 30);
    expect(a.map((p) => p.date)).toEqual(b.map((p) => p.date));
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `pnpm test -- build-sparkline`
Expected: FAIL with `Cannot find module './build-sparkline'`.

- [ ] **Step 3: Implement helper**

```ts
// src/server/benchmark/build-sparkline.ts
export type SparklinePoint = { date: string; value: number };

/**
 * Downsample daily `{ date, value }` rows into a fixed-length array of
 * evenly-spaced buckets covering the requested window, zero-filling gaps.
 *
 * - Output length is always exactly `buckets`.
 * - Bucket N covers day `today - (buckets - 1 - N)` from the reference day.
 * - Multiple input rows falling into the same bucket are averaged.
 * - Input rows outside the window are silently dropped.
 */
export function buildSparkline(
  rows: Array<{ date: string; value: number }>,
  windowDays: number,
  buckets: number,
): SparklinePoint[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const dayMs = 86_400_000;
  const dayStep = Math.max(1, Math.round(windowDays / buckets));

  const out: SparklinePoint[] = [];
  const sums = new Array<number>(buckets).fill(0);
  const counts = new Array<number>(buckets).fill(0);

  for (let i = 0; i < buckets; i++) {
    const bucketDate = new Date(
      today.getTime() - (buckets - 1 - i) * dayStep * dayMs,
    );
    out.push({
      date: bucketDate.toISOString().slice(0, 10),
      value: 0,
    });
  }

  for (const r of rows) {
    const rowMs = Date.parse(r.date);
    if (Number.isNaN(rowMs)) continue;
    const rowDay = Math.floor(rowMs / dayMs) * dayMs;
    const delta = Math.floor((today.getTime() - rowDay) / dayMs);
    if (delta < 0 || delta >= windowDays) continue;
    const bucketIdx = buckets - 1 - Math.floor(delta / dayStep);
    if (bucketIdx < 0 || bucketIdx >= buckets) continue;
    sums[bucketIdx]! += r.value;
    counts[bucketIdx]! += 1;
  }

  for (let i = 0; i < buckets; i++) {
    if (counts[i]! > 0) out[i]!.value = sums[i]! / counts[i]!;
  }

  return out;
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `pnpm test -- build-sparkline`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/benchmark/build-sparkline.ts src/server/benchmark/build-sparkline.test.ts
git commit -m "feat(benchmark): buildSparkline helper with tests"
```

---

## Phase 2 — tRPC procedures

### Task 2: `getCategoryBrandList` procedure

**Files:**
- Modify: `src/server/api/routers/benchmark.ts`

- [ ] **Step 1: Add import for the helper**

Near the other `@/server/benchmark/*` imports in `src/server/api/routers/benchmark.ts`, add:

```ts
import { buildSparkline } from "@/server/benchmark/build-sparkline";
```

- [ ] **Step 2: Append procedure inside the router**

Find `getHeroOverview` (added in v1). Append **after it** (before the closing `});`):

```ts
  getCategoryBrandList: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        windowDays: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Distinct-run count in the window for this category (denominator + lowData).
      const totalRow = (await ctx.db.execute(sql`
        SELECT COUNT(DISTINCT r.id)::int AS total
        FROM "app"."benchmark_run" r
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        WHERE p.category_id = ${input.categoryId}
          AND r.captured_at >= now() - (${input.windowDays} || ' days')::interval
          AND r.extraction_status = 'done'
      `)) as unknown as { rows?: Array<{ total: number }> };
      const totalAnswers =
        (totalRow.rows ?? (totalRow as unknown as Array<{ total: number }>))[0]
          ?.total ?? 0;

      // Daily trend rows per brand in the window.
      const trendRows = (await ctx.db.execute(sql`
        SELECT
          t.brand_id,
          b.slug AS brand_slug,
          b.canonical_name AS brand_canonical_name,
          t.date::text AS day,
          t.mention_pct::numeric AS mention_pct,
          t.run_count
        FROM "app"."agg_brand_trends_by_day" t
        JOIN "app"."brand" b ON b.id = t.brand_id
        WHERE t.category_id = ${input.categoryId}
          AND t.date >= (CURRENT_DATE - (${input.windowDays} || ' days')::interval)::date
      `)) as unknown as {
        rows?: Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          day: string;
          mention_pct: string;
          run_count: number;
        }>;
      };
      const rows =
        trendRows.rows ??
        (trendRows as unknown as Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          day: string;
          mention_pct: string;
          run_count: number;
        }>);

      // Per-brand aggregate + sparkline source.
      type Accum = {
        brandId: string;
        slug: string;
        canonicalName: string;
        mentionCount: number;
        pctSum: number;
        pctCount: number;
        points: Array<{ date: string; value: number }>;
      };
      const byBrand = new Map<string, Accum>();
      for (const r of rows) {
        let a = byBrand.get(r.brand_id);
        if (!a) {
          a = {
            brandId: r.brand_id,
            slug: r.brand_slug,
            canonicalName: r.brand_canonical_name,
            mentionCount: 0,
            pctSum: 0,
            pctCount: 0,
            points: [],
          };
          byBrand.set(r.brand_id, a);
        }
        a.mentionCount += r.run_count;
        a.pctSum += Number(r.mention_pct);
        a.pctCount += 1;
        a.points.push({ date: r.day, value: Number(r.mention_pct) });
      }

      const brands = [...byBrand.values()]
        .map((a) => ({
          brandId: a.brandId,
          slug: a.slug,
          canonicalName: a.canonicalName,
          sharePct: a.pctCount > 0 ? a.pctSum / a.pctCount : 0,
          mentionCount: a.mentionCount,
          sparkline: buildSparkline(a.points, input.windowDays, 30),
          rank: 0,
        }))
        .sort((x, y) => {
          if (y.mentionCount !== x.mentionCount)
            return y.mentionCount - x.mentionCount;
          return x.canonicalName.localeCompare(y.canonicalName);
        });

      brands.forEach((b, i) => {
        b.rank = i + 1;
      });

      return {
        brands,
        totalAnswers,
        lowData: totalAnswers < 5,
      };
    }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/benchmark.ts
git commit -m "feat(benchmark): getCategoryBrandList procedure"
```

### Task 3: `getCategoryBrandTrend` procedure

**Files:**
- Modify: `src/server/api/routers/benchmark.ts`

- [ ] **Step 1: Append procedure inside the router**

After `getCategoryBrandList` (and before the closing `});`):

```ts
  getCategoryBrandTrend: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        windowDays: z
          .union([z.literal(7), z.literal(30), z.literal(90)])
          .default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const trendRows = (await ctx.db.execute(sql`
        SELECT
          t.brand_id,
          b.slug AS brand_slug,
          b.canonical_name AS brand_canonical_name,
          t.date::text AS day,
          AVG(t.mention_pct::numeric) AS mention_pct
        FROM "app"."agg_brand_trends_by_day" t
        JOIN "app"."brand" b ON b.id = t.brand_id
        WHERE t.category_id = ${input.categoryId}
          AND t.date >= (CURRENT_DATE - (${input.windowDays} || ' days')::interval)::date
        GROUP BY t.brand_id, b.slug, b.canonical_name, t.date
        ORDER BY t.brand_id, t.date
      `)) as unknown as {
        rows?: Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          day: string;
          mention_pct: string;
        }>;
      };
      const rows =
        trendRows.rows ??
        (trendRows as unknown as Array<{
          brand_id: string;
          brand_slug: string;
          brand_canonical_name: string;
          day: string;
          mention_pct: string;
        }>);

      type Series = {
        brandId: string;
        slug: string;
        canonicalName: string;
        rawPoints: Array<{ date: string; value: number }>;
        lastSeen: number;
      };
      const byBrand = new Map<string, Series>();
      for (const r of rows) {
        let s = byBrand.get(r.brand_id);
        if (!s) {
          s = {
            brandId: r.brand_id,
            slug: r.brand_slug,
            canonicalName: r.brand_canonical_name,
            rawPoints: [],
            lastSeen: 0,
          };
          byBrand.set(r.brand_id, s);
        }
        s.rawPoints.push({ date: r.day, value: Number(r.mention_pct) });
        s.lastSeen += 1;
      }

      // Zero-fill each series across the full window (one point per day).
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const dayMs = 86_400_000;

      const allDates: string[] = [];
      for (let i = input.windowDays - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * dayMs);
        allDates.push(d.toISOString().slice(0, 10));
      }

      const series = [...byBrand.values()].map((s) => {
        const byDate = new Map(s.rawPoints.map((p) => [p.date, p.value]));
        const points = allDates.map((d) => ({
          date: d,
          value: byDate.get(d) ?? 0,
        }));
        return {
          brandId: s.brandId,
          slug: s.slug,
          canonicalName: s.canonicalName,
          points,
        };
      });

      series.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));

      return { series };
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/benchmark.ts
git commit -m "feat(benchmark): getCategoryBrandTrend procedure"
```

---

## Phase 3 — Client infra

### Task 4: Chart palette + URL state extension

**Files:**
- Create: `src/app/[locale]/benchmark/_components/dashboard/chart-palette.ts`
- Modify: `src/app/[locale]/benchmark/_components/dashboard/use-dashboard-query-state.ts`

- [ ] **Step 1: Create chart palette**

```ts
// src/app/[locale]/benchmark/_components/dashboard/chart-palette.ts
const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#9333ea",
  "#ea580c",
];

function hashFnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

export function colorFor(slug: string): string {
  return PALETTE[hashFnv1a(slug) % PALETTE.length]!;
}
```

- [ ] **Step 2: Extend query-state hook**

Open `src/app/[locale]/benchmark/_components/dashboard/use-dashboard-query-state.ts`. Replace its full contents with:

```ts
// src/app/[locale]/benchmark/_components/dashboard/use-dashboard-query-state.ts
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type WindowDays = 7 | 30 | 90;

export type DashboardState = {
  categorySlug: string | null;
  windowDays: WindowDays;
  modelScope: string;
  activeBrandSlug: string | null;
};

const VALID_WINDOWS = [7, 30, 90] as const;

function coerceWindow(raw: string | null): WindowDays {
  const n = raw ? Number(raw) : NaN;
  return (VALID_WINDOWS as readonly number[]).includes(n)
    ? (n as WindowDays)
    : 30;
}

export function useDashboardQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state: DashboardState = useMemo(
    () => ({
      categorySlug: params.get("c"),
      windowDays: coerceWindow(params.get("w")),
      modelScope: params.get("m") ?? "all",
      activeBrandSlug: params.get("b"),
    }),
    [params],
  );

  const update = useCallback(
    (patch: Partial<DashboardState>) => {
      const next = new URLSearchParams(params.toString());
      const merged: DashboardState = { ...state, ...patch };

      if (merged.categorySlug) next.set("c", merged.categorySlug);
      else next.delete("c");

      if (merged.windowDays !== 30) next.set("w", String(merged.windowDays));
      else next.delete("w");

      if (merged.modelScope !== "all") next.set("m", merged.modelScope);
      else next.delete("m");

      if (merged.activeBrandSlug) next.set("b", merged.activeBrandSlug);
      else next.delete("b");

      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router, state],
  );

  const buildShareUrl = useCallback(
    (base?: string) => {
      const origin =
        base ?? (typeof window !== "undefined" ? window.location.origin : "");
      const qs = params.toString();
      return qs ? `${origin}${pathname}?${qs}` : `${origin}${pathname}`;
    },
    [params, pathname],
  );

  return { state, update, buildShareUrl };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors. HeroCard still imports the hook — since only new fields were added and existing ones kept, no callers break.

- [ ] **Step 4: Commit**

```bash
git add src/app/\[locale\]/benchmark/_components/dashboard/chart-palette.ts src/app/\[locale\]/benchmark/_components/dashboard/use-dashboard-query-state.ts
git commit -m "feat(benchmark): chart palette + activeBrandSlug url state"
```

---

## Phase 4 — UI components

### Task 5: `TopSummaryBanner`

**Files:**
- Create: `src/app/[locale]/benchmark/_components/dashboard/top-summary-banner.tsx`

- [ ] **Step 1: Create file**

```tsx
// src/app/[locale]/benchmark/_components/dashboard/top-summary-banner.tsx
"use client";

import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";

type Props = {
  categoryName: string;
  brandName: string | null;
  sharePct: number | null;
};

export function TopSummaryBanner({
  categoryName,
  brandName,
  sharePct,
}: Props) {
  const t = useTranslations("benchmark");
  if (!brandName || sharePct == null) return null;
  return (
    <Card className="p-4 text-base">
      {t("summary.banner", {
        category: categoryName,
        brand: brandName,
        pct: sharePct.toFixed(1),
      })}
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add -A ':(exclude)challenge-build-mcp-tool'
git commit -m "feat(benchmark): TopSummaryBanner component"
```

### Task 6: `WindowSegmented`

**Files:**
- Create: `src/app/[locale]/benchmark/_components/dashboard/window-segmented.tsx`

- [ ] **Step 1: Create file**

```tsx
// src/app/[locale]/benchmark/_components/dashboard/window-segmented.tsx
"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { WindowDays } from "./use-dashboard-query-state";

type Props = {
  value: WindowDays;
  onChange: (value: WindowDays) => void;
};

const OPTIONS: WindowDays[] = [7, 30, 90];

export function WindowSegmented({ value, onChange }: Props) {
  const t = useTranslations("benchmark");
  return (
    <div
      className="bg-muted/40 flex gap-1 rounded-md p-1"
      role="tablist"
      aria-label={t("hero.window.label")}
    >
      {OPTIONS.map((w) => {
        const active = w === value;
        return (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(w)}
            className={cn(
              "rounded px-3 py-1 text-sm transition",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`hero.window.${w}` as const)}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add -A ':(exclude)challenge-build-mcp-tool'
git commit -m "feat(benchmark): WindowSegmented control"
```

### Task 7: `LowDataBanner`

**Files:**
- Create: `src/app/[locale]/benchmark/_components/dashboard/low-data-banner.tsx`

- [ ] **Step 1: Create file**

```tsx
// src/app/[locale]/benchmark/_components/dashboard/low-data-banner.tsx
"use client";

import { Card } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  totalAnswers: number;
  threshold?: number;
};

export function LowDataBanner({ totalAnswers, threshold = 5 }: Props) {
  const t = useTranslations("benchmark");
  if (totalAnswers <= 0 || totalAnswers >= threshold) return null;
  return (
    <Card className="bg-muted/40 flex items-start gap-3 border-dashed p-3">
      <AlertTriangle className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-muted-foreground text-sm">
        {t("lowData.body", { count: totalAnswers, threshold })}
      </p>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add -A ':(exclude)challenge-build-mcp-tool'
git commit -m "feat(benchmark): LowDataBanner component"
```

### Task 8: `RankedBrandRow`

**Files:**
- Create: `src/app/[locale]/benchmark/_components/dashboard/ranked-brand-row.tsx`

- [ ] **Step 1: Create file**

```tsx
// src/app/[locale]/benchmark/_components/dashboard/ranked-brand-row.tsx
"use client";

import Link from "next/link";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { colorFor } from "./chart-palette";

type SparklinePoint = { date: string; value: number };

export type RankedBrand = {
  brandId: string;
  slug: string;
  canonicalName: string;
  sharePct: number;
  mentionCount: number;
  rank: number;
  sparkline: SparklinePoint[];
};

type Props = {
  brand: RankedBrand;
  active: boolean;
  onToggle: (slug: string) => void;
};

export function RankedBrandRow({ brand, active, onToggle }: Props) {
  const color = colorFor(brand.slug);
  return (
    <button
      type="button"
      onClick={() => onToggle(brand.slug)}
      className={cn(
        "hover:bg-muted/40 flex w-full items-center gap-3 p-3 text-left transition",
        active && "bg-primary/10",
      )}
    >
      <span className="text-muted-foreground w-8 text-sm tabular-nums">
        #{brand.rank}
      </span>
      <Link
        href={`/benchmark/brands/${brand.slug}`}
        onClick={(e) => e.stopPropagation()}
        className="grow truncate font-medium underline-offset-4 hover:underline"
      >
        {brand.canonicalName}
      </Link>
      <span className="w-14 text-right text-sm tabular-nums">
        {brand.sharePct.toFixed(1)}%
      </span>
      <div className="h-8 w-20">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={brand.sparkline}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add -A ':(exclude)challenge-build-mcp-tool'
git commit -m "feat(benchmark): RankedBrandRow with sparkline"
```

### Task 9: `BrandRankedList`

**Files:**
- Create: `src/app/[locale]/benchmark/_components/dashboard/brand-ranked-list.tsx`

- [ ] **Step 1: Create file**

```tsx
// src/app/[locale]/benchmark/_components/dashboard/brand-ranked-list.tsx
"use client";

import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { RankedBrandRow, type RankedBrand } from "./ranked-brand-row";

type Props = {
  brands: RankedBrand[];
  activeBrandSlug: string | null;
  onToggleBrand: (slug: string) => void;
  isLoading?: boolean;
};

export function BrandRankedList({
  brands,
  activeBrandSlug,
  onToggleBrand,
  isLoading,
}: Props) {
  const t = useTranslations("benchmark");

  if (isLoading) {
    return (
      <Card className="flex max-h-[520px] flex-col divide-y overflow-y-auto">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-muted/50 h-12 w-full animate-pulse"
            aria-hidden
          />
        ))}
      </Card>
    );
  }

  if (brands.length === 0) {
    return (
      <Card className="flex max-h-[520px] items-center justify-center p-8">
        <p className="text-muted-foreground text-sm">{t("list.empty")}</p>
      </Card>
    );
  }

  return (
    <Card className="flex max-h-[520px] flex-col divide-y overflow-y-auto">
      {brands.map((b) => (
        <RankedBrandRow
          key={b.brandId}
          brand={b}
          active={b.slug === activeBrandSlug}
          onToggle={onToggleBrand}
        />
      ))}
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add -A ':(exclude)challenge-build-mcp-tool'
git commit -m "feat(benchmark): BrandRankedList scrollable container"
```

### Task 10: `BrandTrendChart`

**Files:**
- Create: `src/app/[locale]/benchmark/_components/dashboard/brand-trend-chart.tsx`

- [ ] **Step 1: Create file**

```tsx
// src/app/[locale]/benchmark/_components/dashboard/brand-trend-chart.tsx
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
import { useTranslations } from "next-intl";
import { colorFor } from "./chart-palette";

export type TrendSeries = {
  brandId: string;
  slug: string;
  canonicalName: string;
  points: Array<{ date: string; value: number }>;
};

type Props = {
  series: TrendSeries[];
  activeBrandSlug: string | null;
  isLoading?: boolean;
};

export function BrandTrendChart({ series, activeBrandSlug, isLoading }: Props) {
  const t = useTranslations("benchmark");

  // Merge all series into one row-per-date with a column per brand slug.
  const data = useMemo(() => {
    if (series.length === 0) return [];
    const byDate = new Map<string, Record<string, string | number>>();
    for (const s of series) {
      for (const p of s.points) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row[s.slug] = p.value;
        byDate.set(p.date, row);
      }
    }
    return [...byDate.values()].sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [series]);

  if (isLoading) {
    return (
      <Card className="h-[520px] p-6">
        <div className="bg-muted/50 h-full w-full animate-pulse rounded" />
      </Card>
    );
  }

  if (series.length === 0) {
    return (
      <Card className="flex h-[520px] items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">{t("chart.empty")}</p>
      </Card>
    );
  }

  return (
    <Card className="h-[520px] p-6">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            fontSize={11}
          />
          <YAxis
            domain={[0, "auto"]}
            tickFormatter={(v: number) => `${Math.round(v)}%`}
            fontSize={11}
          />
          <Tooltip
            formatter={(v: number, name: string) => {
              const s = series.find((x) => x.slug === name);
              return [`${v.toFixed(1)}%`, s?.canonicalName ?? name];
            }}
            labelFormatter={(l: string) => l}
          />
          {series.map((s) => {
            const active =
              activeBrandSlug === null || s.slug === activeBrandSlug;
            return (
              <Line
                key={s.slug}
                type="monotone"
                dataKey={s.slug}
                stroke={colorFor(s.slug)}
                strokeWidth={s.slug === activeBrandSlug ? 3 : 1}
                strokeOpacity={
                  activeBrandSlug === null
                    ? 0.8
                    : s.slug === activeBrandSlug
                      ? 1
                      : 0.2
                }
                dot={false}
                isAnimationActive={false}
                hide={!active && false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add -A ':(exclude)challenge-build-mcp-tool'
git commit -m "feat(benchmark): BrandTrendChart multi-line with highlight"
```

---

## Phase 5 — Orchestrator rewrite

### Task 11: Rewrite `DashboardTab`

**Files:**
- Modify (replace): `src/app/[locale]/benchmark/_components/dashboard-tab.tsx`

- [ ] **Step 1: Full replacement**

```tsx
// src/app/[locale]/benchmark/_components/dashboard-tab.tsx
"use client";

import { useMemo } from "react";
import { api } from "@/trpc/react";

import { DashboardEmpty } from "./dashboard/dashboard-empty";
import { TopSummaryBanner } from "./dashboard/top-summary-banner";
import { WindowSegmented } from "./dashboard/window-segmented";
import { LowDataBanner } from "./dashboard/low-data-banner";
import { BrandRankedList } from "./dashboard/brand-ranked-list";
import { BrandTrendChart } from "./dashboard/brand-trend-chart";
import { VerticalPills } from "./dashboard/vertical-pills";
import {
  useDashboardQueryState,
  type WindowDays,
} from "./dashboard/use-dashboard-query-state";
import { resolveDefaultCategory } from "@/server/benchmark/resolve-default-category";

type TabTarget = "dashboard" | "run" | "submit";

type Props = {
  onChangeTab?: (tab: TabTarget) => void;
};

export function DashboardTab({ onChangeTab }: Props) {
  const { state, update } = useDashboardQueryState();
  const categories = api.benchmark.listCategories.useQuery();
  const overview = api.benchmark.getHeroOverview.useQuery({
    windowDays: state.windowDays,
    modelScope: state.modelScope,
  });

  const activeCategory = useMemo(() => {
    if (!categories.data || categories.data.length === 0) return null;
    if (state.categorySlug) {
      const hit = categories.data.find((c) => c.slug === state.categorySlug);
      if (hit) return hit;
    }
    return resolveDefaultCategory(
      categories.data.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
      (overview.data ?? []).map((r) => ({
        categoryId: r.categoryId,
        sharePct: r.sharePct,
      })),
    );
  }, [categories.data, overview.data, state.categorySlug]);

  const hero = api.benchmark.getHeroTopBrand.useQuery(
    {
      categoryId: activeCategory?.id ?? "",
      windowDays: state.windowDays,
      modelScope: state.modelScope,
    },
    { enabled: Boolean(activeCategory?.id) },
  );

  const list = api.benchmark.getCategoryBrandList.useQuery(
    {
      categoryId: activeCategory?.id ?? "",
      windowDays: state.windowDays,
    },
    {
      enabled: Boolean(activeCategory?.id),
      placeholderData: (prev) => prev,
    },
  );

  const trend = api.benchmark.getCategoryBrandTrend.useQuery(
    {
      categoryId: activeCategory?.id ?? "",
      windowDays: state.windowDays,
    },
    {
      enabled: Boolean(activeCategory?.id),
      placeholderData: (prev) => prev,
    },
  );

  const categoriesLoaded = categories.isFetched;
  const categoriesEmpty =
    categoriesLoaded && (categories.data ?? []).length === 0;

  if (categoriesEmpty) {
    return (
      <div className="py-4">
        <DashboardEmpty onGoToRun={() => onChangeTab?.("run")} />
      </div>
    );
  }

  const onToggleBrand = (slug: string) => {
    update({
      activeBrandSlug: state.activeBrandSlug === slug ? null : slug,
    });
  };

  return (
    <div className="flex flex-col gap-4 py-4">
      {categories.data && (
        <VerticalPills
          categories={categories.data.map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
          }))}
          activeSlug={activeCategory?.slug ?? null}
          onSelect={(slug) =>
            update({ categorySlug: slug, activeBrandSlug: null })
          }
        />
      )}

      <div className="flex justify-end">
        <WindowSegmented
          value={state.windowDays}
          onChange={(w: WindowDays) => update({ windowDays: w })}
        />
      </div>

      {activeCategory && (
        <TopSummaryBanner
          categoryName={activeCategory.name}
          brandName={hero.data?.brand.canonicalName ?? null}
          sharePct={hero.data ? hero.data.sharePct : null}
        />
      )}

      {list.data && <LowDataBanner totalAnswers={list.data.totalAnswers} />}

      <div className="grid gap-6 md:grid-cols-[minmax(320px,1fr)_2fr]">
        <BrandRankedList
          brands={list.data?.brands ?? []}
          activeBrandSlug={state.activeBrandSlug}
          onToggleBrand={onToggleBrand}
          isLoading={list.isLoading}
        />
        <BrandTrendChart
          series={trend.data?.series ?? []}
          activeBrandSlug={state.activeBrandSlug}
          isLoading={trend.isLoading}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors. Any errors in the deleted v1 component files (`hero-card.tsx` etc) are irrelevant because those files are deleted in Task 12 next — but they currently still EXIST after this step, so if `dashboard-tab.tsx` previously imported them and this rewrite no longer does, typecheck passes. If some other file still imports `HeroCard` etc., fix it now or defer to Task 12.

- [ ] **Step 3: Commit**

```bash
git add src/app/\[locale\]/benchmark/_components/dashboard-tab.tsx
git commit -m "feat(benchmark): rewrite DashboardTab as v2 list + trend explorer"
```

---

## Phase 6 — Cleanup

### Task 12: Delete obsolete v1 dashboard components

**Files:**
- Delete: `src/app/[locale]/benchmark/_components/dashboard/hero-card.tsx`
- Delete: `src/app/[locale]/benchmark/_components/dashboard/hero-headline.tsx`
- Delete: `src/app/[locale]/benchmark/_components/dashboard/hero-metrics.tsx`
- Delete: `src/app/[locale]/benchmark/_components/dashboard/runner-up-note.tsx`
- Delete: `src/app/[locale]/benchmark/_components/dashboard/model-breakdown.tsx`
- Delete: `src/app/[locale]/benchmark/_components/dashboard/brand-trend-mini.tsx`

- [ ] **Step 1: Verify no external refs**

Run:
```bash
rg "hero-card|HeroCard|hero-headline|HeroHeadline|hero-metrics|HeroMetrics|runner-up-note|RunnerUpNote|model-breakdown|ModelBreakdown|brand-trend-mini|BrandTrendMini" src
```
Expected: matches are only inside the files-to-delete themselves. If any other file imports these, fix that caller first.

- [ ] **Step 2: Delete with `git rm`**

```bash
git rm src/app/\[locale\]/benchmark/_components/dashboard/hero-card.tsx
git rm src/app/\[locale\]/benchmark/_components/dashboard/hero-headline.tsx
git rm src/app/\[locale\]/benchmark/_components/dashboard/hero-metrics.tsx
git rm src/app/\[locale\]/benchmark/_components/dashboard/runner-up-note.tsx
git rm src/app/\[locale\]/benchmark/_components/dashboard/model-breakdown.tsx
git rm src/app/\[locale\]/benchmark/_components/dashboard/brand-trend-mini.tsx
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(benchmark): drop obsolete v1 dashboard components"
```

---

## Phase 7 — i18n

### Task 13: Add v2 translation keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: English keys**

Inside the existing `"benchmark": { ... }` block in `messages/en.json`, add (preserving existing siblings):

```json
"summary": {
  "banner": "{category}: {brand} — {pct}% of AI answers"
},
"lowData": {
  "body": "Only {count} answer(s) analyzed so far — trends stabilize after {threshold}. Bring your agent to improve signal."
},
"list": {
  "empty": "No brand mentions for this category in this window yet."
},
"chart": {
  "empty": "No trend data for this category yet."
}
```

- [ ] **Step 2: Dutch keys**

Same structure in `messages/nl.json`:

```json
"summary": {
  "banner": "{category}: {brand} — {pct}% van de AI-antwoorden"
},
"lowData": {
  "body": "Pas {count} antwoord(en) geanalyseerd — trends worden betrouwbaar na {threshold}. Breng je agent om het signaal te verbeteren."
},
"list": {
  "empty": "Nog geen merkvermeldingen voor deze categorie in deze periode."
},
"chart": {
  "empty": "Nog geen trenddata voor deze categorie."
}
```

- [ ] **Step 3: Validate JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));JSON.parse(require('fs').readFileSync('messages/nl.json','utf8'));console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(benchmark): i18n keys for dashboard v2"
```

---

## Phase 8 — Verify + PR update

### Task 14: E2E smoke + push

- [ ] **Step 1: Full check**

Run: `pnpm check && pnpm test`
Expected: lint + typecheck clean; tests pass (including new `build-sparkline` suite).

- [ ] **Step 2: Format**

Run: `pnpm format:check`. If it fails, `pnpm format:write`, stage, and commit: `chore: prettier format`.

- [ ] **Step 3: Manual smoke**

With `pnpm dev` running:

1. `/benchmark` loads — three tabs render; Dashboard shows the new v2 layout (pills top, window segmented right, banner, list + chart grid).
2. Swap category pill → list + chart re-query; URL gets `?c=<slug>`; `?b=` cleared.
3. Swap window `30 → 7 → 90` → queries re-fire; `?w` adjusts; `?b=` preserved.
4. Click a brand row → row gets `bg-primary/10`; chart highlights that line thicker, dims others; URL gets `?b=<slug>`.
5. Click same row again → `?b=` cleared; all lines at normal weight.
6. Click the brand NAME inside a row → navigates to `/benchmark/brands/<slug>` (stopPropagation works — row toggle does not fire).
7. Hover a line in the chart → tooltip shows brand name + %.
8. Low-data: if `totalAnswers < 5`, the yellow `LowDataBanner` shows above the grid. Confirm it hides at 0 and at ≥5.
9. Share link → incognito reload lands on same state.

- [ ] **Step 4: Push**

```bash
git push
```

- [ ] **Step 5: Update PR #47 description**

Run: `gh pr edit 47 --body "$(cat <<'EOF'
## Summary

v2: replace the hero-only dashboard with a per-category list + trend explorer.

- Thin top-summary banner: "CRM: Salesforce — 34% of AI answers"
- Inline [7 · 30 · 90] segmented window control
- Low-data warning when fewer than 5 answers
- Scrollable ranked list of ALL brands (not top-N) with rank, share %, and inline sparkline
- Multi-line Recharts chart (one line per brand) with highlight on row click
- Click brand name → brand profile page
- URL state: ?c=, ?w=, ?b=

No DB migration — reuses agg_brand_trends_by_day + agg_top_brand_by_category. Adds two new tRPC procedures (getCategoryBrandList, getCategoryBrandTrend) and a pure buildSparkline helper with tests.

Deletes v1 hero components (hero-card, hero-headline, hero-metrics, runner-up-note, model-breakdown, brand-trend-mini).

Spec: \`docs/superpowers/specs/2026-04-21-benchmark-dashboard-v2-design.md\`
Plan: \`docs/superpowers/plans/2026-04-21-benchmark-dashboard-v2.md\`

## Test plan

- [x] \`pnpm check\` passes
- [x] \`pnpm test\` — buildSparkline (5) + resolve-default-category (4) + weighting (4) + resolve-brand (5) + ingest-extraction (1) = 19 benchmark tests pass
- [ ] Manual smoke per plan §14
EOF
)"`

---

## Self-Review Notes

**Spec coverage:**
- §1 concept → Tasks 5, 6, 7, 9, 10, 11
- §2 data/API → Tasks 2, 3
- §3 components → Tasks 5-12
- §4 visual language → Tasks 5-10 (all new components use existing tokens)
- §5 URL state → Task 4 (hook extension) + Task 11 (wiring)
- §6 testing → Task 1 (helper tests) + Task 14 manual checklist
- §Rollout → Task 14 steps 4+5

**No placeholders:** every component step shows the full file body, every tRPC step shows the full procedure SQL + TS.

**Type consistency:**
- `WindowDays` type in `use-dashboard-query-state.ts` (Task 4) — reused by `WindowSegmented` (Task 6), `HeroCard`-era callers already deleted in Task 12.
- `RankedBrand` exported from `ranked-brand-row.tsx` (Task 8), consumed by `brand-ranked-list.tsx` (Task 9) and produced by `getCategoryBrandList` tRPC shape (Task 2). Shapes align: `{ brandId, slug, canonicalName, sharePct, mentionCount, rank, sparkline }`.
- `TrendSeries` exported from `brand-trend-chart.tsx` (Task 10), matches `getCategoryBrandTrend.series[]` item shape `{ brandId, slug, canonicalName, points: Array<{ date, value }> }` (Task 3). OK.
- `colorFor(slug)` (Task 4) used by Tasks 8 and 10. Same import path. OK.
