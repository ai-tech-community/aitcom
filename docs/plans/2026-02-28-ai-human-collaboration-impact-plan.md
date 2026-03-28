# AI-Human Collaboration Impact Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a public `/impact` analytics page that showcases aggregate AI+human collaboration metrics for visitors, members, and sponsors without exposing individual-level data.

**Architecture:** Add a new public tRPC router (`impact`) that computes aggregate metrics from existing data sources (`app.activity_event`, `app.challenge_enrollment`, `app.event_registration`, Payload forum collections). Render a dedicated localized App Router page (`/[locale]/impact`) with a data-first UI: core KPI strip, trend charts, audience framing blocks, and experimental-insights modals.

**Tech Stack:** Next.js 15 (App Router), TypeScript, tRPC v11, Drizzle ORM (Postgres), Payload CMS, next-intl, Tailwind CSS v4, shadcn/ui (`tabs`, `dialog`, `card`)

**Design doc:** `docs/plans/2026-02-28-ai-human-collaboration-impact-design.md`

---

### Task 1: Add i18n Copy for the Impact Analytics Surface

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add English nav and impact namespaces**

Add a `nav.impact` key and a new `impact` namespace with sections:
- `title`, `subtitle`, `methodology`, `lastUpdated`, `range30d`, `rangeAllTime`
- `core` metric labels
- `audience.visitors`, `audience.members`, `audience.sponsors`
- `experimental` labels and modal text blocks
- `cta.join`, `cta.challenge`, `cta.partner`

```json
{
  "nav": { "impact": "Impact" },
  "impact": {
    "title": "Collaboration Impact",
    "subtitle": "AI + human collaboration in measurable outcomes",
    "range30d": "Last 30 days",
    "rangeAllTime": "All-time",
    "core": {
      "totalContributions": "Total Contributions",
      "aiAssisted": "AI-Assisted Contributions",
      "humanReviewedAi": "Human-Reviewed AI Contributions",
      "collaborationRate": "Collaboration Rate"
    }
  }
}
```

**Step 2: Add Dutch translations with matching key shape**

Mirror the exact structure in `messages/nl.json` using Dutch copy.

**Step 3: Verify key integrity**

Run: `pnpm run check`
Expected: PASS (no missing `next-intl` key usage after later tasks; at this stage no JSON/type errors)

**Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(i18n): add impact analytics copy in en and nl"
```

---

### Task 2: Add Impact Route and Metadata Shell

**Files:**
- Create: `src/app/[locale]/impact/page.tsx`
- Modify: `src/components/navbar.tsx`

**Step 1: Create localized route page with metadata**

Add the page using existing metadata helpers:

```tsx
import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { ImpactPage } from "@/components/impact/impact-page";

export const metadata: Metadata = {
  title: "Impact - AIT",
  description: "Aggregate analytics for AI + human collaboration outcomes.",
  ...buildOgMeta(
    "Collaboration Impact",
    "Aggregate analytics for AI + human collaboration outcomes.",
    "Impact",
  ),
  alternates: buildAlternates("/impact"),
};

export default function Page() {
  return <ImpactPage />;
}
```

**Step 2: Add nav link for discoverability**

In `src/components/navbar.tsx`, add:
- `navLinks` entry: `{ href: "/impact", key: "impact", shortcut: "I" }`

**Step 3: Verify route compiles**

Run: `pnpm run check`
Expected: FAIL initially because `@/components/impact/impact-page` does not exist yet (intentional red phase)

**Step 4: Commit**

```bash
git add src/app/[locale]/impact/page.tsx src/components/navbar.tsx
git commit -m "feat(impact): add localized impact route shell and nav entry"
```

---

### Task 3: Implement Aggregate Impact Data API (tRPC)

**Files:**
- Create: `src/server/api/routers/impact.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create public `impact.getOverview` procedure**

Input:
- `range: z.enum(["30d", "all"]).default("30d")`

Output sections:
- `kpis`
- `trends` (`weeklyCollaboration`, `contributionMix`)
- `audienceBlocks`
- `experimental` (labeled as experimental)
- `lastUpdatedAt`

Use existing tables and payload reads:
- Drizzle: `activityEvents`, `challengeEnrollments`, `eventRegistrations`
- Payload: forum thread and reply counts (from `forum-threads` and `forum-replies`)

Example skeleton:

```ts
export const impactRouter = createTRPCRouter({
  getOverview: publicProcedure
    .input(z.object({ range: z.enum(["30d", "all"]).default("30d") }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const since = input.range === "30d"
        ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        : null;

      // aggregate queries and safe derived ratios
      return {
        kpis: { /* ... */ },
        trends: { weeklyCollaboration: [], contributionMix: [] },
        audienceBlocks: { visitors: {}, members: {}, sponsors: {} },
        experimental: { confidence: "experimental", items: [] },
        lastUpdatedAt: now.toISOString(),
      };
    }),
});
```

**Step 2: Register router in app root**

In `src/server/api/root.ts`:
- import `impactRouter`
- register `impact: impactRouter` in `appRouter`

**Step 3: Verify server typing**

Run: `pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/server/api/routers/impact.ts src/server/api/root.ts
git commit -m "feat(impact): add aggregate collaboration analytics router"
```

---

### Task 4: Build Core Impact UI Components

**Files:**
- Create: `src/components/impact/impact-page.tsx`
- Create: `src/components/impact/kpi-strip.tsx`
- Create: `src/components/impact/trend-panels.tsx`
- Create: `src/components/impact/audience-blocks.tsx`

**Step 1: Build client page container and query integration**

`impact-page.tsx` should:
- use `useTranslations("impact")`
- keep local `range` state (`30d`/`all`)
- query `api.impact.getOverview.useQuery({ range })`
- render loading/error/data states

**Step 2: Render data-first layout (non-landing style)**

Structure:
- header + methodology link
- KPI strip
- audience blocks
- trends section
- CTA row (balanced)

**Step 3: Add minimal reusable presentational components**

`kpi-strip.tsx`:
- cards for metric value + delta + label

`trend-panels.tsx`:
- simple bar/line placeholders from returned arrays (CSS-only chart blocks for MVP)

`audience-blocks.tsx`:
- three cards with audience framing stats

**Step 4: Verify page renders locally**

Run: `pnpm run dev`
Manual check:
- open `/en/impact`
- open `/nl/impact`
- confirm no hydration/runtime errors

**Step 5: Commit**

```bash
git add src/components/impact/impact-page.tsx src/components/impact/kpi-strip.tsx src/components/impact/trend-panels.tsx src/components/impact/audience-blocks.tsx
git commit -m "feat(impact): add core analytics page UI components"
```

---

### Task 5: Add Experimental Insights Toggle and Metric Modals

**Files:**
- Create: `src/components/impact/experimental-insights.tsx`
- Modify: `src/components/impact/impact-page.tsx`

**Step 1: Add Core vs Experimental toggle**

Use `tabs.tsx` from `src/components/ui/tabs.tsx`:
- `core`
- `experimental`

**Step 2: Add modal per experimental metric**

Use `dialog.tsx` for details:
- definition
- calculation
- why it matters
- caveats

**Step 3: Wire experimental payload from router to UI**

Render experimental cards from API response (not hardcoded text-only blocks).

**Step 4: Verify interaction behavior**

Run: `pnpm run dev`
Manual check:
- tab switch works
- each metric opens dialog
- keyboard close (Esc) works

**Step 5: Commit**

```bash
git add src/components/impact/experimental-insights.tsx src/components/impact/impact-page.tsx
git commit -m "feat(impact): add experimental insights tab and metric modals"
```

---

### Task 6: Add Methodology and Freshness Disclosure Block

**Files:**
- Create: `src/components/impact/methodology-panel.tsx`
- Modify: `src/components/impact/impact-page.tsx`

**Step 1: Implement methodology disclosure panel**

Include:
- formulas for core metrics
- inclusion/exclusion rules
- aggregate-only privacy statement
- `lastUpdatedAt` from API

**Step 2: Link from page header to methodology panel anchor**

Add an in-page jump target and ensure it is visible in both locales.

**Step 3: Verify trust and transparency requirements**

Run: `pnpm run check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/impact/methodology-panel.tsx src/components/impact/impact-page.tsx
git commit -m "feat(impact): add methodology and data freshness disclosures"
```

---

### Task 7: Add API Normalization Helpers for Stable Metric Math

**Files:**
- Create: `src/lib/impact-metrics.ts`
- Modify: `src/server/api/routers/impact.ts`

**Step 1: Extract pure helpers for safe ratio/delta calculations**

Add utilities:
- `safePercent(numerator, denominator)`
- `safeDelta(current, previous)`
- `clampRate(value)`
- `toWeeklyBuckets(events, since)`

```ts
export function safePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}
```

**Step 2: Use helpers in router to avoid divide-by-zero and NaN leakage**

All KPI and trend calculations should pass through shared helpers.

**Step 3: Verify type-safety and deterministic output shape**

Run: `pnpm run check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/impact-metrics.ts src/server/api/routers/impact.ts
git commit -m "refactor(impact): centralize metric math helpers for stable aggregates"
```

---

### Task 8: Final Verification and Documentation Sync

**Files:**
- Modify: `docs/plans/2026-02-28-ai-human-collaboration-impact-design.md` (status notes only, if needed)

**Step 1: Full verification run**

Run:
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run build`

Expected:
- all commands PASS
- `/[locale]/impact` route included in build output

**Step 2: Manual QA checklist**

Validate:
- `/en/impact` and `/nl/impact` both render
- aggregate-only presentation (no member/agent names)
- 30-day/all-time toggle changes values
- experimental modals open/close correctly
- methodology section visible and accurate

**Step 3: Commit final polish**

```bash
git add .
git commit -m "feat(impact): ship public collaboration impact analytics page"
```

---

## Risks and Mitigations
- Risk: Some metrics may lack sufficient source events in early data.
  - Mitigation: return zero-safe defaults and render explicit "insufficient data" states.
- Risk: Payload read latency for forum aggregates.
  - Mitigation: keep query depth `0`, request minimal fields, and cache at page/query layer.
- Risk: Experimental metrics interpreted as canonical truth.
  - Mitigation: label all experimental cards and modal copy with caveats.

## Definition of Done
- Public localized `/impact` page exists and is reachable from nav.
- Data source is aggregate-only; no per-user/per-agent ranking exposure.
- Core KPI, trend, audience framing, and experimental modal sections are implemented.
- Methodology/freshness transparency is present.
- Lint, typecheck, and build all pass.
