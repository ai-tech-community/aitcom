# Collector Job Details Implementation Plan

**Status:** implemented and independently reviewed; ready for local app testing.

**Goal:** Greenhouse and Ashby runs collect readable descriptions, application
links, employment type and workplace type where supplied. A View details
action opens a responsive job sheet; CSV/JSON include the added fields.

**Architecture:** Extend the shared job row and both adapters. HTML stays
opaque in the adapters and is converted to plain text through a context
capability served by the existing deadline-bound extraction worker. Reuse the
worker's result envelope and list execution machinery for a text operation;
keep page-list extraction limits unchanged. Stored item JSON needs no migration.
Add a focused job-results component; other collectors retain generic tables.

**Tech Stack:** Existing Zod collectors, Cheerio in the worker, Radix Sheet,
next-intl EN/NL/FR, Vitest. No new dependencies.

## Approved experience

- Keep job tables compact: title, location, department, employment/workplace
  type, date and a View details action. Put full descriptions and links in a
  side sheet, full-width on phones. The sheet supports keyboard focus, Escape,
  a translated Close control and scrollable long content.
- Show a missing-description state for sources without a description and a
  new-run hint for older stored rows. Do not backfill or change existing data.
- Render descriptions as plain React text, never unsanitized HTML. Only
  http(s) application links without credentials are actionable. Greenhouse's
  public job/application entry is its absolute_url; Ashby supplies applyUrl.
- Prefer Ashby's descriptionPlain, with sandboxed descriptionHtml fallback.
  Read Greenhouse content with its one layer of HTML entity encoding decoded
  before markup extraction. Preserve paragraph/list breaks and Unicode.
- Keep unknown employment/workplace values as source text. Greenhouse custom
  metadata named Employment Type or Workplace Type can supply these fields;
  absent metadata stays null. Do not infer remote status from a description
  or treat Ashby's isRemote=true as proof of fully remote work.
- Descriptions retain up to 100,000 UTF-16 code units after normalization,
  without splitting a surrogate pair. A visible/exported descriptionTruncated
  flag explains any cut and offers the original posting for the rest. Existing
  response, heap, depth, run and per-operation time budgets still apply.

## Tasks

- [x] Add a text extraction request to the existing worker protocol and
      context capability. Keep the existing list request/result compatible.
- [x] Implement bounded entity decoding and iterative visible-text extraction
      inside the worker; prove paragraph, inert-content, Unicode and truncation
      behaviour with focused tests and a real worker-bundle request.
- [x] Extend job rows with description, applyUrl, employmentType,
      workplaceType and descriptionTruncated. Preserve unlisted filtering and
      existing job fields. Bump collector version and include details in exports.
- [x] Add the compact results table and accessible details sheet, translated
      labels, missing/older-data states and safe source/application links.
- [x] Test both adapters, complete collector extraction, exports and the UI
      interaction. Run only added/touched non-integration tests, workspace
      type-check and targeted lint/format checks. Never run database integration
      or Chromium tiers, builds that apply migrations, push or write a database.
- [x] Build only the HTML worker bundle for the running local app. Replay
      the public APIs with stub database storage and inspect description lengths.
- [x] Review, commit locally and provide exact steps for a fresh app run.

References: [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)
and [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api),
checked 2026-10-31. This details slice comes before adding further job boards.

## Validation and local handoff

- 174 tests passed across the nine added/touched unit, component and worker-bundle
  test files. The final added Escape/single-link test passed in its own file run.
- Workspace `pnpm typecheck`, ESLint on changed TypeScript files, Prettier on
  changed files and `git diff --check` passed. The integration fixture only
  gained the newly required context method; no database or Chromium tier ran.
- `pnpm build:workers` rebuilt the local runtime bundle. Read-only public API
  replays through the live guarded context and stub storage produced 19 Greenhouse
  jobs and 74 Ashby jobs, all with descriptions and valid output schemas.
  Greenhouse descriptions included 7,675 characters; Ashby included 20,068.
  The sampled Greenhouse board omitted employment/workplace metadata; Ashby
  supplied FullTime/Remote. No additional per-job requests were needed.
- Independent reviewer found no actionable issues against this plan and ADR0041.
- Branch `feat/collector-job-details` includes the locally reviewed Ashby slice.
  No push or database writes were performed. The unrelated `src/payload-types.ts`
  working change was preserved and excluded from the feature commit.

To verify the visible slice, refresh the local app, start a **new** Greenhouse
or Ashby collection, then select **View details** beside a job. Read the full
text, use the application link, close with Escape and check CSV/JSON downloads.
Older rows show a new-run hint because no historical data is backfilled.
