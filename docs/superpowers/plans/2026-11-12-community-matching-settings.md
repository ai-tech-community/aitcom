# Community Matching Settings Implementation Plan

**Goal:** Move owner configuration to Community Settings → Matching, keeping
connection activity in Members and member participation optional.

**Approved design:** The user approved moving connection types, prompts and topic
choices into Settings. Members retains People, Matches, My matching profile and
Introductions. Matches links to Settings for setup and later editing. Members
can browse without participating, opt in without answering every question, and
edit their answers or opt out at any time. Questions appear only after opt-in;
toggling participation retains answers. No schema or matching-policy change.

**Architecture:** Reuse `ConnectionTypeEditor` in a small settings query wrapper
under the existing owner/admin settings layout. Existing matching endpoints and
saved answers remain the source of truth.

**Tech Stack:** Next.js, React, next-intl, tRPC, Vitest.

- [x] Add `settings/matching/page.tsx` and
  `components/communities/settings/matching-settings.tsx` with loading, retry and
  permission states, using the existing setup query and type editor.
- [x] Add Matching to both settings navigation layouts for owners/admins.
- [x] Remove the Connection types tab/editor from `matching/members-hub.tsx`.
- [x] Replace `CommunityMatches.onSetup` with locale-aware Settings links:
  primary setup action when no active types exist, quiet settings link otherwise.
- [x] Clarify optional questions beside the member profile introduction, with
  English, Dutch and French copy.
- [x] Update the matching component and settings navigation tests to verify
  destination links, editor placement, permissions and saving an opt-in profile
  with no question answers.
- [x] Run only `matching.test.tsx` and `settings-sidebar.test.tsx`, root
  `pnpm typecheck`, and changed-file lint/format checks. No database writes or push.

## Verification

All 25 tests in the two touched UI test files passed. Root `pnpm typecheck`,
changed-file ESLint, Prettier and whitespace checks passed. The UI detector
reported no deterministic issues. No database writes or push were performed;
the existing `src/payload-types.ts` edit was left untouched.

## CI build adjustment

The initial PR build compiled successfully but exhausted its 4 GB Node heap
during Next's build-time type checking. The standalone CI type-check and test
jobs and Vercel preview passed. The CI build now receives a 6 GB heap to leave
headroom for both phases; application behavior and database schema are unchanged.
