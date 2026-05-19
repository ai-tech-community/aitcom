# Benchmark UX Hub + Surface-First Contribute Plan

Date: 2026-05-19
Status: **Active**
Follows: [2026-05-18-brand-benchmark-byoa-plan.md](2026-05-18-brand-benchmark-byoa-plan.md)
(BYOA backend rebuild — completed).

The BYOA backend landed but the UI is still the pre-pivot tab soup.
This plan sequences the UX rebuild driven by
[ADR-0009](../adr/0009-benchmark-ux-hub-and-surface-first-contribute.md).

**Read first:**
- [ADR-0009](../adr/0009-benchmark-ux-hub-and-surface-first-contribute.md) — UX architecture
- [ADR-0001](../adr/0001-brand-benchmark-primary-slice-keys.md) — slicing (model_surface)
- [ADR-0006](../adr/0006-byoa-community-executes-ait-collects.md) — BYOA framing
- [ADR-0007](../adr/0007-byoa-trust-model.md) — weight, threshold
- [ADR-0008](../adr/0008-byoa-coverage-strategy.md) — assignments
- [CONTEXT.md](../../CONTEXT.md)

## V1 scope

In:
- New `/benchmark` hub page (cards + live stats strip).
- New `/benchmark/contribute` route (surface-first redesign).
- New `/benchmark/about` route (single-page methodology with TOC).
- Reusable `<SurfacePicker>` and `<StatLabel>` components.
- Central `stat-definitions.ts` glossary module.
- Brand profile "Help improve coverage" CTA.
- Redirects from old `?tab=run` / `?tab=submit` URLs.

Out (deferred):
- Visual design polish beyond what the components above require.
- Per-locale live stats.
- Server-side surface preference.
- Brand-page coverage map (still pending from the BYOA plan).
- About page i18n beyond English.

## Sequence

### Step 1 — Glossary module + `<StatLabel>` component

Foundation for explaining stats. Build this first because every
later step consumes it.

Files:
- New `src/lib/benchmark-stat-definitions.ts` — one record per stat
  with `{ label, shortDef, longDef, anchor }`. Stats: visibility,
  shareOfVoice, avgRank, sentiment, citationRate, coverage,
  surfaceThreshold, contributorWeight, modelSurface.
- New `src/app/[locale]/benchmark/_components/StatLabel.tsx` —
  renders label + info icon + popover (uses shadcn `Popover`).
  Popover shows `shortDef` and a "Read more →" link to
  `/benchmark/about#${anchor}`.

Exit: import `StatLabel` anywhere; every benchmark stat label in
the codebase can be swapped to it incrementally.

### Step 2 — `/benchmark/about` page

The link target for every `StatLabel`'s "Read more". Single long
page with sticky TOC, plain-English tone, ADR links at section ends.

Files:
- New `src/app/[locale]/benchmark/about/page.tsx`.
- Sections (each an `<h2>` with an `id` matching a `stat-definitions`
  anchor where applicable):
  - `#what` — What this benchmark is.
  - `#how-runs-become-metrics` — Data flow from a contributor's
    paste to a public metric.
  - `#stats` — Glossary. Each stat is an `<h3>` with `id` matching
    its `anchor` (e.g. `#visibility`, `#share-of-voice`).
  - `#slicing` — Why we slice by (product, grounding); link to
    ADR-0001.
  - `#trust` — Inherited weight, ≥3 threshold; link to ADR-0007.
  - `#assignments` — How soft assignments work; link to ADR-0008.
  - `#contribute` — Direct CTA to `/benchmark/contribute`.
  - `#faq` — Common questions.
- A small sticky TOC on the right on `md+`, collapses to a top
  anchor list on small screens.

Exit: `StatLabel` "Read more" links all resolve to a section.

### Step 3 — `/benchmark` hub page

Replace the tabbed `BenchmarkPage` with a small landing page.

Files:
- Rewrite `src/app/[locale]/benchmark/page.tsx`.
- Hub structure:
  - `<h1>` AIT Brand Benchmark.
  - Tagline: "Community-built benchmark of how AI products surface
    brands."
  - 2–3 sentence explainer (paraphrase the About page intro).
  - Three big cards: Help benchmark · Browse brands · How it works.
    Each is a `<Link>` to its route with title, 1-sentence purpose,
    icon.
  - Below the cards: a thin live-stats strip ("N runs this week ·
    M contributors · K brands tracked"). Pulls from a new
    `benchmark.hubStats` tRPC endpoint that returns three integers.
- Redirect handler: if `?tab=run`, redirect to
  `/benchmark/contribute`; if `?tab=submit`, redirect to
  `/benchmark/contribute` (submit-prompt moves under contribute or
  becomes its own page — see Step 5).

Exit: visiting `/benchmark` shows the hub; old tab URLs forward
correctly.

### Step 4 — `<SurfacePicker>` component + localStorage hook

Self-contained component used by `/benchmark/contribute`.

Files:
- New `src/app/[locale]/benchmark/_components/SurfacePicker.tsx`.
  Renders the 8 surface options as a horizontal icon-row of large
  buttons (logos for ChatGPT / Claude / Gemini / Perplexity / Kimi
  with a `+web` / no-web variant where applicable). On selection
  writes to localStorage and calls `onChange`.
- A small `useStoredSurface()` hook (`src/lib/use-stored-surface.ts`)
  reads/writes `ait.benchmark.surface` and returns
  `[value, setValue]`.

Exit: `SurfacePicker` is importable; preference survives reload.

### Step 5 — `/benchmark/contribute` route

The big move. Surface-first contributor flow per ADR-0009 decision 2.

Files:
- New `src/app/[locale]/benchmark/contribute/page.tsx`. Layout
  top-to-bottom:
  1. Header strip — H1, current-surface chip ("Running in: …"),
     "Change" button (re-opens the picker).
  2. If `useStoredSurface()` returns null on first visit — show the
     full `SurfacePicker` instead of the prompt list.
  3. Held-assignments block (existing logic, floated up). Always
     visible regardless of picked surface; each held entry shows
     its pinned surface.
  4. Quick-start CTA — if `listOpenAssignments` returns a bundle for
     the picked surface, show "Grab 5 prompts that need
     {SURFACE_LABEL}" as a primary button. Grabs the bundle in one
     click and refetches.
  5. Prompt list — uses `listApprovedPrompts` + new
     `listPromptCoverage` filtered to the picked surface only.
     Ordered by gap size (lowest distinct_contributors first).
     Filters (category / intent / search / tag) above the list,
     unchanged.
  6. Each prompt card:
     - Prompt text.
     - Tags.
     - **One** coverage chip — the picked surface's status (e.g.
       `0/3 · ChatGPT+web`). Uses a single-chip variant of the
       existing `PromptCoverageStrip`.
     - Buttons: primary "Submit a run" (opens ManualRunForm
       inline as today); outline "Run with my agent" (opens
       AgentRunModal as today).
     - `ManualRunForm` pre-fills `modelSurface` from the page-level
       picker (overriding its current held-assignment logic when
       the picker is set).
  7. My recent runs — collapsed by default into a `<details>` block.
- Delete `src/app/[locale]/benchmark/_components/run-prompts-tab.tsx`
  once `/benchmark/contribute` is the only consumer.
- Move `SubmitPromptTab` (propose-a-new-prompt) into its own
  `/benchmark/contribute/propose` route, or keep as a section
  inside `/benchmark/contribute` under a `<details>` — decide
  during implementation.

Exit: a contributor lands on `/benchmark/contribute`, picks a
surface once, sees a curated prompt list with single-chip cards,
and submits via the inline form.

### Step 6 — Brand profile "Help improve coverage" card

Per ADR-0009 decision 4.

Files:
- Edit `src/app/[locale]/benchmark/brands/[slug]/page.tsx` to insert
  a new section between `MetricCards` and the existing per-model
  block. Visible only when the brand has any (prompt, surface) cell
  with `meets_threshold = false`.
- New `src/app/[locale]/benchmark/brands/[slug]/_components/HelpImproveCoverageCard.tsx`
  reads `listPromptCoverage` for the brand's top prompts and
  summarises gaps per surface. Click sends the contributor to
  `/benchmark/contribute?surface=X&prompts=A,B,C` (the contribute
  page reads these query params on mount and pre-fills picker +
  prompt filter).
- The route handler on `/benchmark/contribute` must respect
  `?surface=` and `?prompts=` query params: set localStorage from
  `?surface`, filter the prompt list to `?prompts`.

Exit: from a thinly-covered brand profile, one click takes the
contributor to a Contribute view scoped to that brand's gap cells.

### Step 7 — Apply `<StatLabel>` across brand pages

Now that the component exists and the About anchors exist, swap
every existing stat label in the brand pages to use it.

Files:
- `src/app/[locale]/benchmark/brands/page.tsx` (sort label, etc.).
- `src/app/[locale]/benchmark/brands/[slug]/page.tsx`
  (Visibility / Avg rank / Sentiment / Citation rate / Coverage
  labels in MetricCards, SurfaceComparisonCard, etc.).
- `src/app/[locale]/benchmark/brands/[slug]/_components/*` —
  audit every place a stat name appears.

Exit: every stat name in the benchmark UI has a (i) icon with a
popover, and clicking "Read more" reaches the matching
`/benchmark/about#anchor` section.

### Step 8 — Hub live stats endpoint

The hub references `benchmark.hubStats`; implement it.

Files:
- New tRPC `benchmark.hubStats` (public). Returns
  `{ runsThisWeek, distinctContributorsThisWeek, brandsTracked }`.
  Cheap query: count rows in `benchmark_run` with `captured_at >=
  now() - INTERVAL '7 days'`, distinct submitted_by_user_id same
  window, count `brand` rows.

Exit: hub strip displays real numbers; refreshes on page load.

## Cross-cutting cleanup

- Remove the obsolete `BenchmarkPage` tab structure once Steps 3
  and 5 ship. Keep an `export const dynamic = 'force-dynamic'` redirect
  page at `/benchmark` that ensures tab=run / tab=submit URLs
  forward to the new routes for ~90 days, then remove.
- Audit copy across the new routes for any pre-BYOA framing ("your
  agent runs these prompts" etc.) — Step 5 of the BYOA plan
  already swept most of it but the new routes inherit fresh copy.
- The redundant `coverage-map.tsx` 8-chip strip becomes single-chip
  by default; expose the multi-chip variant only on the brand-page
  HelpImproveCoverageCard.

## What this plan does *not* cover

- A visual design pass beyond what the new components require
  (typography, theming, illustrations).
- Mobile-first re-layout of the brand profile (still wide-only).
- Per-locale stat definitions (English copy only).
- A11y audit beyond what shadcn components already provide.
- Server-side persistence of surface preference (deferred until
  cross-device complaints appear).
- The brand-page coverage map carried over from the BYOA plan —
  still pending; not blocked by this work.
