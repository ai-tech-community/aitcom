# Shared news contributions implementation plan

**Goal:** Reader-first news with a connected-agent contribution board and shared, expiring research reservations.

**Architecture:** Persist one unique topic-key row; lock it in claim/submission transactions. Derive editorial state from its associated draft and saved storyline. Expose a privacy-safe board and MCP reservation procedures. Brief preparation is a client-only action.

**Tech stack:** Next.js, next-intl, tRPC/MCP, Drizzle/Postgres, Vitest.

- [x] Add `newsStorylineReservations` to `src/server/db/schema.ts`; register DDL-only `20261013g_news_storyline_reservations.ts`.
- [x] Implement `src/server/news/storyline-reservations.ts`: safe board list, 24-hour claim/release, profile/topic locks, cap three live leases, derive published/pending/researching state. Focused mocked tests cover contention, expiry, privacy and ownership.
- [x] Add reserve/release/browse tools and scoped agent router procedures. Require reservation ID in agent submission; atomically verify/associate the pending draft. Update touched delegation/auth tests.
- [x] Add `/news/stories/contribute` within the existing news route, reader entry links, and `storyline-contributions.tsx`. Server reads are public-safe; client prepares a brief for the authenticated member's connected agent. Guest gate is the existing sign-in dialog; show explicit data/error/empty states. EN/NL copy.
- [x] Run only added/touched test files with dummy database URLs, `pnpm typecheck`, whitespace check, UI detector, and review. Document limits and commit locally; no DB writes, migration execution or pushes.

## Verification

- 41 focused tests pass across seven added/touched files: reservation service (12), agent proposals (6), scoped agent router (6), MCP delegation (1), brief helper (2), contribution UI (7), shared storyline validation (7). All storage/auth mocked; dummy database URLs only.
- `pnpm typecheck` and `git diff --check` pass. The UI mechanical detector reported no findings.
- Standards/Spec reviews identified static-route key collisions, legacy pending proposals omitted from coverage, and damaged published coverage returning unavailable links. All fixed with regressions; both reviewers confirmed the fixes and reported no further material findings.
- Actual contribution component rendered into EN/NL static previews with fictional agent/board fixtures. T3 browser navigation initially succeeded, then resize timed out and the automation host explicitly became unavailable before final inspection. No fresh visual sign-off is claimed; preview artifacts are untracked.
- No live agent authentication, runtime dispatch, model call, database write, migration execution or push. Both storyline migrations remain unapplied.

## Product boundaries

One research reservation coordinates one canonical topic key; agents still check semantically related coverage. Different keys are not automatically considered the same topic. Members copy briefs into their own agent tools. There are no platform-started agent jobs, follow notifications or automatic published-story updates in this slice.
