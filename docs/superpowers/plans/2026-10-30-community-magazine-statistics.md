# Community Magazine Statistics Implementation Plan

> Execute inline in this session from the approved design. Request independent code review before delivery. No database writes or push.

**Goal:** Add all-time magazine performance and current subscriber statistics to owner/admin community Insights.

**Architecture:** Resolve one magazine through a read-only Payload lookup scoped to the authorized community. Read ten published issue metadata rows through Payload and aggregate all published readership, current confirmed subscriptions and recorded join sources in batched SQL, returning bounded per-page rows and a global total. Keep the client query and data states independent of the community period selector.

**Tech Stack:** React, Next.js, tRPC, Drizzle/Postgres, Payload, next-intl, Vitest.

## Task 1: Shared attribution and read model

Files: `src/server/magazines/issue-origin.ts`, `src/server/magazines/stats/join-condition.ts`, `issue-stats.ts`, `community-stats.ts`, `community-stats.test.ts`.

- [x] Add a shared magazine issue-source SQL condition accepting a numeric issue ID or a trusted SQL column expression, retaining the existing `via + issueId` registry semantics. Extract the existing joined/requested-plus-active-membership event condition unchanged for use by both issue and community magazine statistics.
- [x] Define `MagazinePerformance`, published issue metadata and per-issue aggregates. Keep subscriber counts current and readership lifetime; return no reader identifiers or subscriber details.
- [x] Implement `loadCommunityMagazineStats(deps, communityId, locale, page)` with one scoped magazine lookup, a ten-row published issue page sorted by `-publishedAt,-id`, and three batched aggregate queries. Use published issue joins scoped to magazine and community; GROUPING SETS plus HAVING returns only the total and page issue IDs. Totals must never depend on page size.
- [x] Clamp out-of-range pages to the last valid page using a bounded metadata retry; return a distinct missing-magazine result and preserve confirmed subscribers for magazines with no published issues.
- [x] Unit-test read query compilation and aggregation mapping using a mock executor, Payload scoping, confirmed-only subscriptions, issue-page versus article-page views, global reader deduplication, published-only attribution, empty data, pagination and failures. No database access.

Validation: `pnpm exec vitest run src/server/magazines/stats/community-stats.test.ts`.

## Task 2: Owner/admin endpoint

Files: `src/server/api/routers/insights.ts`, `insights.test.ts`.

- [x] Add `magazinePerformance` with `{slug, locale: en|nl|fr = en, page: positive integer <= 100000 = 1}`.
- [x] Enforce owner/admin role before loading Payload or invoking magazine reads; pass the resolved community ID, never an arbitrary client community ID.
- [x] Extend the existing route unit tests with a mocked loader and Payload provider, proving owner/admin access, denied inactive/moderator/member/guest requests without magazine reads and invalid page/locale input.

Validation: `pnpm exec vitest run src/server/api/routers/insights.test.ts`.

## Task 3: Magazine section and localization

Files: `src/components/communities/insights/magazine-performance.tsx`, `magazine-performance-view.tsx`, `magazine-performance.test.tsx`, `insights-dashboard.tsx`, `insights-dashboard.test.tsx`, `messages/{en,nl,fr}.json`.

- [x] Mount magazine performance for owners/admins immediately after general statistics and before follow-up tools. Moderators must not mount or fetch the new section.
- [x] Fetch `{slug, locale, page}` independently of the 7/30/90 selector; use the shared Skeleton, ErrorState/retry and EmptyState patterns.
- [x] Render the magazine name and all-time scope, four ruled totals, attributed joins, and the published issue table with publication dates, views, readers, attributed current subscribers and joins. Reuse `issueStatsPath` and magazine-management paths.
- [x] Add native accessible pagination and a scrollable keyboard-focusable table region on narrow screens; retain totals during page changes by updating only from the response and clearly showing loading. Support long titles and translated labels.
- [x] Explain recorded-reader keys, available history, issue-versus-article views, current subscription attribution and the independent all-time scope in a definitions disclosure.
- [x] Test loading/error/retry, missing magazine, no published issues with subscribers, all-time labels, totals independent of page, issue links, pagination, locale rendering and composition gates.

Validation: run only the new magazine component test and touched composition test files.

## Task 4: Delivery checks

- [x] Run the four touched/new test files, workspace `pnpm typecheck`, targeted ESLint/Prettier and diff checks.
- [x] Render the actual magazine section with synthetic data for desktop/mobile and longer translated copy in a bounded visual check. Use no live app initialization, database or build scripts.
- [x] Request a focused independent review of aggregate SQL, authorization, attribution consistency, scoping, pagination and UI states; fix material findings and rerun only affected checks.
- [x] Record validation in the design document and commit locally. Do not push, deploy, run migrations or send messages.
