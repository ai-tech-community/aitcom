# Workable Jobs Implementation Plan

**Status:** implemented and independently reviewed; ready for owner app testing.

**Goal:** Select Workable jobs or paste a company board link, collect its public
jobs with full descriptions, and inspect/download them in the existing app.

**Architecture:** Add a pure Workable adapter to the existing job-board Strategy
and one localized preset after Lever. Fetch the documented public account API;
the context owns redirects, robots, rate limiting and budgets. Description HTML
uses the existing extraction worker. No dependency or migration.

**Tech Stack:** Existing Zod collectors, sandbox worker, next-intl and Vitest.

## Verified source and design

References checked 2026-10-31:
[public account API](https://workable.readme.io/reference/jobs-1),
[careers-page guide](https://help.workable.com/hc/en-us/articles/115012771647-Using-the-Workable-API-to-create-a-careers-page),
and [public endpoint support note](https://help.workable.com/hc/en-us/articles/4903195036183-Troubleshooting-API-issues).
Parent approval: `../specs/2026-10-31-collectors-visible-slices-design.md`, slice 4.

- `GET https://www.workable.com/api/accounts/{name}?details=true` is the
  documented public list with descriptions. It currently redirects to
  `apply.workable.com/api/v1/widget/accounts/{name}?details=true`. Start at the
  documented address; keep every redirect hop guarded. Never use authenticated
  SPI endpoints or the private careers-page search API.
- Real guarded requests with the collector's unchanged identity returned two
  jobs for `careers` and six for `huggingface`, without database storage. Both
  origins' robots files permit these API paths. A missing account returns 404.
- Recognize exact https company boards on `apply.workable.com/{name}`, optional
  `/j/{10-hex-shortcode}` and `/apply`, legacy single-subdomain boards with known
  `/jobs/{numeric-id}` and `/candidates/new` paths, and both public list API paths.
  Reject credentials, nonstandard ports, reserved service hosts/paths, nested
  subdomains and near misses. Global `/j/{code}` links lack a company name and
  continue to Custom page; do not guess or fetch to resolve them.
- The endpoint returns an object with a jobs array. Map title, department,
  employment_type, url and application_url. The real response uses url for the
  posting and application_url for its application form. Combine trimmed
  city/state/country for location, deduplicating identical parts. Do not expose
  the separate locations array, which can contain hidden locations.
- Use published_on only. Keep valid date-only values as YYYY-MM-DD in exports
  and render them as a calendar date regardless of browser timezone. Full
  timestamps retain existing normalization/display. Never use created_at as
  a publication date; invalid dates remain null.
- Map workplace_type remote/hybrid/on_site to existing display codes. If this
  field is absent, telecommuting=true supplies Remote; false does not prove
  on-site and remains null. Preserve future explicit workplace values.
- Pass description HTML unchanged to the bounded worker with encoded=false.
  Preserve the existing 100k text cap/flag, safe links and text-only rendering.
  Empty boards succeed. Reuse translated not-found/status/invalid-response
  failures and existing run history/ownership/downloads. Single response, no
  per-job requests; inherited five-page budget includes redirects and retries.
- Preset `workable-board` asks only for name, with example `careers`. EN/NL/FR
  help shows the company board URL. No new UI components or settings.

## Tasks and file boundaries

- [x] Create `src/lib/job-boards/workable.ts` and `workable.test.ts` for the
      URL builder, strict recognizer, date precision and opaque-markup row mapping.
      Cover a saved real fixture, optional fields, hidden-location exclusion,
      workplace fallback, safe links, absent dates and invalid responses.
- [x] Save two public jobs without lengthy descriptions in
      `src/lib/job-boards/fixtures/workable.json`; document source/retained fields
      in the fixture README. Exercise HTML with synthetic collector test data.
- [x] Extend `src/server/collectors/collectors/job-board.ts` to version 5 and
      add Workable as a single-page adapter. Extend its test file to prove actual
      worker extraction, empty/404/status/malformed cases and unchanged prior boards.
- [x] Add `workable-board` in `src/server/collectors/presets/catalog.ts` and
      extend catalog, recognition and `runs.presets.test.ts` for localization,
      disabled behavior and full supported-link prefill.
- [x] Extend `src/components/collectors/start-run-form.test.tsx` with actual
      preset submission/navigation. Adapt `job-results.tsx` date formatting only
      for YYYY-MM-DD values; prove it in `job-results.test.tsx` using an explicit
      simulated browser timezone and real date formatting.
- [x] Run only the seven added/touched files:
      `pnpm exec vitest run src/lib/job-boards/workable.test.ts src/server/collectors/collectors/job-board.test.ts src/server/collectors/presets/catalog.test.ts src/server/collectors/presets/recognize.test.ts src/server/collectors/runs.presets.test.ts src/components/collectors/start-run-form.test.tsx src/components/collectors/job-results.test.tsx`.
      Run workspace `pnpm typecheck`, targeted ESLint/Prettier and diff checks.
      Never run full/integration/Chromium tiers, production builds or database writes.
- [x] Build only the HTML worker bundle, replay both real public boards with
      stub storage and a deliberately invalid DATABASE_URL, and check full rows.
- [x] Independently review, commit locally, rebase onto merged Lever main and
      expose the slice in the owner's checkout while preserving Payload changes.
      Leave Workable unpublished until a further user instruction.

## Owner app check

Refresh `/dashboard/collectors`, choose **Workable jobs**, enter `careers` and
start a fresh run. Inspect descriptions, application links, publication dates,
run log/history and CSV/JSON. Also paste `https://apply.workable.com/huggingface/`
to check recognition. Persisted app runs are performed by the owner.

## Validation record

150 tests passed across the seven added/touched unit/component files. The
calendar-date file also passed after a lint-only helper correction. Workspace
`pnpm typecheck`, targeted ESLint/Prettier and diff checks passed. Independent
Standards and Spec reviewers found no actionable issues. Their source-contract
question was checked against both real responses: jobs expose description only,
with no separate requirements, benefits or full_description fields.

Guarded full-collector replays used the unchanged collector identity, local
in-memory rate limiting, stub database storage and an unusable DATABASE_URL.
Workable's `careers` board returned two valid jobs with descriptions; Hugging
Face returned six valid jobs with descriptions. Each run used two guarded
response hops for the documented redirect and logged its row count. A missing
account produced board_not_found with the correct host before JSON parsing.
Sample descriptions were 3,125 and 5,046 characters. No database writes or
persisted runs were performed.

Only `pnpm build:workers` ran; no production build or full/integration/Chromium
tier ran locally. Workable remains unpublished for owner app review. The
preceding Lever branch has separate PR/merge authorization from the owner.
