# Community Statistics Implementation Plan

> Execute inline in this session using the approved design. Review the completed feature with a code reviewer before delivery. No push or database writes.

**Goal:** Extend community Insights with trustworthy growth and participation statistics for owners and administrators.

**Architecture:** A pure statistics module defines complete UTC intervals, contribution categories and aggregate DTO construction. A read-only loader aggregates scoped membership and event data in SQL. An owner/admin-gated tRPC query serves a localized statistical view above the existing operational panels.

**Tech Stack:** Next.js, React, tRPC, Drizzle/Postgres, Recharts, next-intl, Vitest.

## Task 1: Metric contract and aggregates

Files: `src/server/communities/statistics.ts`, `statistics.test.ts`, `statistics-queries.ts`, `statistics-queries.test.ts`.

- [x] Define `StatisticsDays = 7 | 30 | 90`, `statisticsPeriod(now, days)` with `[previousStart, start)` and `[start, end)` complete UTC periods; the final date is today's UTC midnight.
- [x] Map every canonical contribution action to Feed, Forum, Ideas, Projects, Events or Challenges; use the existing contribution tuple as the source of allowed actions.
- [x] Define aggregate input rows (day, action, actor type, count), membership snapshot and distinct contributor counts; construct zero-filled daily output and per-area totals. Comparisons return `{current, previous, change, percentChange}`, with `null` percent when previous is zero.
- [x] Load membership counts by status, day/action/actor event counts, and distinct current/previous/returning member contributors with SQL aggregation. Use exact community scope, `[previousStart, end)` time bounds, canonical contribution actions plus membership transitions, and exclude commissioned contributions. Never return actor IDs or event bodies.
- [x] Prove UTC/DST and period edges, zero baselines, zero-filled dates, reconciliation, separate actor types and commissioned/system exclusions. Compile the real Drizzle queries against a mock executor to verify scope, interval and aggregate SQL without a database.

Validation: `pnpm exec vitest run src/server/communities/statistics.test.ts src/server/communities/statistics-queries.test.ts`.

## Task 2: Authorization and endpoint

Files: `src/server/api/routers/insights.ts`, `insights.test.ts`.

- [x] Add `statistics: communityProcedure.input(z.object({slug: z.string(), days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30)}))`.
- [x] Reject roles other than active owner/admin before invoking the loader, then call `loadCommunityStatistics(ctx.db, ctx.community.id, new Date(), input.days)`.
- [x] Mock existing router dependencies and middleware context in unit tests. Prove owner/admin access, rejected roles with no statistics read, default/invalid periods and resolved-community scoping.

Validation: `pnpm exec vitest run src/server/api/routers/insights.test.ts`.

## Task 3: Dashboard extension

Files: `src/components/communities/insights/statistics-dashboard.tsx`, `statistics-view.tsx`, `statistics-charts.tsx`, `statistics-dashboard.test.tsx`, `insights-dashboard.tsx`, `insights-dashboard.test.tsx`, `src/app/[locale]/communities/[slug]/insights/page.tsx`, `messages/{en,nl,fr}.json`.

- [x] Use the existing membership query to show the new statistics only to owner/admin; moderators retain the original health pulse. Keep activation and follow-up panels below an explicit fixed-window explanation.
- [x] Query `{slug, days}` with the 30-day default and a native-radio SegmentedControl for 7/30/90. Use Skeleton/ErrorState with retry; never substitute zero data after a fetch error.
- [x] Present four ruled summary values, exact current/comparison ranges, generated-at live snapshot label, two daily charts, tabular alternatives, category bars, returning/agent totals, current pending/invited counts and data-definition disclosure. Preserve the current membership snapshot on activity-empty views.
- [x] Keep chart labels and legends explicit; disable animation, provide accessible tables and numeric category values, and use the established responsive container and tokens.
- [x] Add all new text to English, Dutch and French catalogs. Format counts and dates through next-intl with UTC for period labels.
- [x] Unit-test period changes, loading/error/retry, zero activity, UTC dates, locale rendering and owner/admin/moderator composition.

Validation: run only the added component test files. Check the three catalogs have identical new-key sets.

## Task 4: Verification and review

- [x] Run the exact new test files together and `pnpm typecheck` for the changed workspace; fix failures, with no full/integration/Chromium test lanes.
- [x] Run targeted lint, formatting and `git diff --check` on changed files.
- [x] Render the statistical React view with synthetic data in a separate local fixture server (no Next build, Payload initialization, real database or migrations). Inspect desktop and mobile in one round and fix observed defects in one batch; confirm once if needed.
- [x] Run `node /Users/greg/.agents/skills/impeccable/scripts/detect.mjs --json` on changed UI targets once, assess findings against the established chart system.
- [x] Request a focused reviewer for accuracy, scoping, access and UI behavior; resolve important findings and rerun only affected checks.
- [x] Record verification and limitations in the design doc and report the implemented route. Never push.

## Execution notes

Completed inline on 2026-10-30. The existing Insights page entry was reused unchanged. The access layout also gained explicit error/retry and skeleton states, with its own six tests, after review identified the membership-read dependency. Verification totals and data limitations are recorded in the approved design document. No database access, migration, deployment or push occurred.
