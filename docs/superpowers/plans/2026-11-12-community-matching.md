# Community Matching Implementation Plan

> Execute inline, task by task. Follow the approved design in
> `docs/superpowers/specs/2026-11-12-community-matching-design.md`.

**Goal:** Let community owners define meaningful connection types and introduce
opted-in members from the Members page.

**Architecture:** A pure matching domain module, scoped persistence service, and
small community tRPC router. Matching UI extends the Members page and reuses the
existing introduction consent workflow. Additive schema changes remain unapplied.

**Tech Stack:** Next.js, React, next-intl, tRPC, Zod, Drizzle/Postgres, Vitest.

## Task 1 — Matching model and ranking

- [x] Add `src/lib/communities/matching.ts` and `matching.test.ts`.
- [x] Schemas: connection type (shared/complementary prompts/topics), opt-in
  profile with per-type answers, city/languages/meeting preference.
- [x] Normalize topic values, intersect only current owner-defined options, emit
  directional reasons, rank by substantive overlap then location/language context.
- [x] Test consent, exclusion sets, filters-before-limit, archive handling,
  direction, normalization, incompatibility, deterministic output.
- [x] Run `pnpm exec vitest run src/lib/communities/matching.test.ts`.

## Task 2 — Storage and scoped service

- [x] Extend `src/server/db/schema.ts` with the three tables and optional
  introduction reason/type fields; register an additive migration in
  `src/migrations/index.ts`. Do not run migration commands.
- [x] Add `src/server/communities/matching.ts`: active opted-in profile loading,
  answer validation, history/dismissals, participant lookup and transactional
  introduction creation. Check both memberships and opt-ins, reject self-pairs,
  lock selected profiles while creating the introduction, reject existing
  pending/connected pairs, and atomically insert both notifications.
- [x] Use the existing `introduction_open_pair_uidx` as the concurrency backstop.
- [x] Add mocked service tests for invalid pairs and notification atomicity.

## Task 3 — API access

- [x] Add `src/server/api/routers/community-matching.ts`; register in
  `src/server/api/root.ts` as `communityMatching`.
- [x] Community member endpoints: setup and own profile, save own profile.
- [x] Owner/admin endpoints: save/archive type, suggestions, dismiss/restore,
  paginated opted-in participants, propose introduction, paginated history.
- [x] Add mocked router tests: unauthorized/inactive roles; member blocked from
  management; community IDs constrain updates; type/topic input validated;
  changing type mode is rejected after creation; conflicts return actionable code.
- [x] Run only the new service/router test files.

## Task 4 — Members interface

- [x] Add focused UI under `src/components/communities/matching/`: hub, profile
  form, type editor, match review/propose form, history, and shared member identity.
- [x] Replace Members page composition with the hub while preserving the public
  directory; use infinite pagination and existing auth seed/session hooks.
- [x] Add matching translations in `messages/en.json` and `messages/nl.json`.
- [x] Give each active view explicit loading/error/empty handling and mutation
  failure feedback. Gate controls by server-provided role, never by guessed role.
- [x] Add focused UI tests proving owner/member/guest differences, profile opt-in,
  type mode and prompts, and introduction confirmation from reviewed suggestions.

## Task 5 — Verify and review

- [x] Run only added/touched test files with dummy database URLs.
- [x] Run `pnpm typecheck` and changed-file lint/format checks.
- [x] Run the Impeccable detector once on changed UI targets; fix material issues.
- [x] Review the diff for tenant leaks, duplicate intros, missing translations,
  false matches, disabled/pending states and unintentional modifications.
- [x] Preserve the user's existing edit to `src/payload-types.ts`; never push or
  run any database write. Report migration requirements and verification limits.

## Verification result

- 46 focused unit/component tests passed across the five added test files.
- Root `pnpm typecheck` passed. Changed-file ESLint and Prettier checks passed.
- The UI detector reported no deterministic issues. Component tests exercised
  English, Dutch and French; no live browser or integration tier was run.
- Independent code review found a directory cursor bug and stale-answer opt-out
  failure; both were fixed with regression tests.
- At initial implementation, the migration was prepared and registered without
  database writes, pushing, or outgoing messages. Existing `src/payload-types.ts`
  edits were left untouched.

## Migration execution — 2026-11-12

The user subsequently explicitly requested running the migration. The default
database configured by `.env` had only `20261112a_community_matching` pending.
`pnpm db:apply` applied and recorded it as batch 155. A read-only verification
confirmed its migration record, all three new app tables, and the introduction's
`connection_type_id` and `reason` columns. No other migrations were applied.
