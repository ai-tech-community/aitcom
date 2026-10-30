# Magazine Active Reading Time Implementation Plan

> Execute inline from the approved tracking scope. Request independent review before delivery. No database writes or push.

**Goal:** Measure active reading time going forward and report total and average measured page-session duration in community Insights.

**Architecture:** A client timer posts cumulative seconds to a same-origin keepalive endpoint. Shared page-access validation precedes an idempotent session upsert; scoped aggregate SQL returns duration totals and measured session counts alongside existing magazine statistics.

**Tech Stack:** React, Next.js, Drizzle/Postgres, Payload, next-intl, Vitest.

## 1. Storage and recording

- [x] Define shared input schema/constants in `src/lib/magazines/reading-time.ts`: UUID, positive issue/article IDs, cumulative integer seconds 0–7200, 15-second reporting and 60-second idle cutoff.
- [x] Add `magazineReadingSessions` to `src/server/db/schema.ts`; add and register `src/migrations/20261030a_magazine_reading_time.ts` with bounded seconds, foreign keys and magazine index. Verify migration through a mocked executor only.
- [x] Extract existing access/article-placement validation from `stats/record.ts` for reuse without changing opening semantics.
- [x] Add `stats/reading-time.ts`: upsert a UUID-bound page tally with `GREATEST(existing, LEAST(input, elapsed + 15, 7200))`, matching magazine/issue/article on conflict. Initial values accept at most 15 seconds.
- [x] Add `src/app/api/magazine-reading-time/route.ts`: validate JSON, reject foreign Origin, rate limit, resolve session, invoke the guarded recorder, and return recorded status without leaking content.
- [x] Add mocked unit tests for migration, recorder and endpoint access/validation behavior.

## 2. Client measurement

- [x] Add `src/components/magazines/reading/active-reading-time.ts`: attach visible/focused/idle-aware timer, generate one in-memory UUID, send cumulative updates with keepalive and retry via later reports. Ignore timer gaps over five seconds. Dispose listeners/timer and flush best effort.
- [x] Mount measurement from `read-tracker.tsx` with stable per-page session identity and effect cleanup; preserve existing view/read-end recording.
- [x] Add fake-timer unit tests covering active/idle/hide/blur/resume, suspended timers, failure/retry, disabled tracker, teardown and Strict Mode.

## 3. Insights reporting

- [x] Extend `stats/community-stats.ts` DTO with active seconds and measured sessions. Add one scoped GROUPING SETS aggregate with positive-session filtering and bounded per-page rows.
- [x] Extend `magazine-performance-view.tsx` with total active time, average per measured page session, measured count, empty em dash and per-issue average. Add localized duration units/help in `messages/{en,nl,fr}.json`.
- [x] Extend focused server/component tests with weighted global averages, empty measurement states, no historical denominator and locale coverage.

## 4. Delivery

- [x] Run only added/touched test files and `pnpm typecheck`; targeted ESLint/Prettier and diff checks.
- [x] Request focused independent review of access, idempotency, session accounting, lifecycle, aggregates and labels. Resolve material findings.
- [x] Update validation notes and commit locally. Do not apply migrations, push or deploy.
