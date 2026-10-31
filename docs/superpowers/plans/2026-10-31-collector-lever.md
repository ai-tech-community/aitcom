# Lever Jobs Implementation Plan

**Status:** implemented and independently reviewed; ready for local app testing.

**Goal:** Select Lever jobs or paste a hosted board link, collect published
jobs with full descriptions, and inspect/download them in the existing app.

**Architecture:** One Lever preset extends the existing job-board Strategy.
Use `board: "lever"` for global and `board: "lever-eu"` for EU; pasted EU
addresses prefill the latter. This avoids introducing region settings to
unrelated sources. All requests use CollectorContext, and all source HTML
uses its bounded text-extraction worker. No migration or dependency.

**Tech Stack:** Existing Zod, collectors, sandbox worker, next-intl, Vitest.

## Verified source and design

Official reference: [Lever Postings API](https://github.com/lever/postings-api),
checked 2026-10-31 along with global/EU `leverdemo` responses and robots files.
The approved parent design is
`../specs/2026-10-31-collectors-visible-slices-design.md`, slice 3.

- Use `https://api.lever.co/v0/postings/{name}?mode=json&limit=100&skip=0`
  and its `api.eu.lever.co` counterpart. Increment skip by 100 after full
  pages; stop after a short page. Keep the five-page budget and report a
  partial page-limit outcome if page five is full. Deduplicate hosted URLs
  across pages without using the deduplicated count to determine pagination.
- Recognize exact https hosted board paths, UUID job paths, `/apply`, and
  list API paths on the corresponding region hosts. Refuse credentials,
  nonstandard ports, near-miss hosts, unsupported paths and invalid names.
  Preserve board name case. Ignore link filters: this slice collects a board.
- Map title from `text`, location from categories.location, department from
  categories.department (team fallback), employment from categories.commitment,
  source/application links from hostedUrl/applyUrl. Map remote/hybrid/on-site to
  existing workplace codes, unspecified to null; preserve future source values.
  Leave postedAt null: createdAt is not a reliable publication timestamp.
- Description order is combined opening/body (`descriptionPlain` preferred,
  `description` HTML fallback), each named list, salary description, then closing
  content. Escape plain text before wrapping it with source HTML and send the
  whole composition to `ctx.extractText` once per job. Never parse HTML in an
  adapter or interpolate it into React. Existing 100k text cap/flag applies.
- Empty boards succeed. Reuse translated board-not-found/status/invalid-response
  failures, with the correct global/EU host. Preserve guarded fetch, robots,
  quotas, history, private ownership and CSV/JSON behavior.
- A single Lever jobs preset appears after Ashby under Jobs. Ask only for the
  board name. EN/NL/FR help explains the name and asks users with EU boards to
  paste the full link. Existing Show settings can change the board variant.

## Implementation tasks

- [x] Create `src/lib/job-boards/lever.ts` and `lever.test.ts`. Export the
      page size, URL builder, strict recognizer and pure opaque-markup parser.
      Test both regions, path near misses, missing fields, description composition,
      absent publication date, optional links and malformed arrays.
- [x] Save a small real public response fixture in
      `src/lib/job-boards/fixtures/lever.json` and document retained fields.
      Add fixture assertions with stable expected source fields.
- [x] Extend `src/server/collectors/collectors/job-board.ts` to version 4,
      add both Lever variants and paging. Keep Greenhouse/Ashby single-page behavior.
      Extend its test file for worker text composition, two-page collection, full
      final page limits, duplicate URLs and global/EU source failures.
- [x] Add the Lever preset in `src/server/collectors/presets/catalog.ts`.
      Extend catalog/recognition tests and `runs.presets.test.ts` to prove correct
      region prefill, disable behavior and localization. Extend
      `src/components/collectors/start-run-form.test.tsx` to prove actual submission
      and navigation for a recognized EU board.
- [x] Run only these six added/touched test files:
      `pnpm exec vitest run src/lib/job-boards/lever.test.ts src/server/collectors/collectors/job-board.test.ts src/server/collectors/presets/catalog.test.ts src/server/collectors/presets/recognize.test.ts src/server/collectors/runs.presets.test.ts src/components/collectors/start-run-form.test.tsx`.
      Run `pnpm typecheck`, targeted ESLint/Prettier and `git diff --check`.
      No full tests, DB/integration/Chromium tiers or production builds.
- [x] Replay both public boards through the live context with stub database
      storage, a dummy DATABASE_URL and development in-memory rate limiting. Use
      the already rebuilt worker or `pnpm build:workers` only. Never write a DB.
- [x] Independently review, commit locally, move onto merged main, and make
      the branch available in the user's checkout without touching Payload changes.
      Do not push the next slice without a further user instruction.

## In-app acceptance

After checkout, refresh `/dashboard/collectors`. Choose Lever jobs, enter
`leverdemo`, collect and open View details. Also paste
`https://jobs.eu.lever.co/leverdemo` and verify Show settings has `lever-eu`.
Inspect the description lists/closing text, application link, run log/history,
and CSV/JSON. The owner performs persisted runs; agent verification uses stubs.

## Validation

121 tests passed across the six added/touched test files. The pagination test
also passed after strengthening the duplicate-full-page case. Workspace
`pnpm typecheck`, targeted ESLint/Prettier and `git diff --check` passed.
Independent Standards and Spec reviewers reported no actionable findings.
No full/integration/Chromium test tier or production build ran locally.

Read-only replays used the real guarded context, in-memory development limiter,
stub storage and an unusable database URL. The global demo returned 10 valid
jobs, nine with descriptions (one had no source text); the EU demo returned
324 valid jobs, all with descriptions, in four pages (100/100/100/24). Both
completed normally. No database writes or persisted app runs were performed.

The worker bundle was rebuilt with `pnpm build:workers`. No new worker code
was needed for this source. Lever remains local and unpublished for owner
review; the preceding Ashby/details PR has separate push/merge authorization.
