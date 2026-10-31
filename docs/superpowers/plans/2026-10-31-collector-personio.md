# Personio Jobs Implementation Plan

**Status:** implemented and independently reviewed locally, on top of Workable.

**Goal:** Select Personio jobs or paste a supported company board link, choose
the feed language, and collect jobs/descriptions into the existing details,
history and CSV/JSON flow.

**Architecture:** Add a Personio Strategy because its URL/language inputs differ
from the JSON board-name adapters. Reuse the shared job-row schema and results
component. Add generic XML parsing to the existing extraction worker/context;
the Personio adapter receives the parsed document, keeps description HTML opaque,
then uses the existing bounded text operation. Promote the already locked
`saxes` parser to a direct dependency; no new transitive packages or migration.

**Tech Stack:** saxes 6.0.0, existing sandbox worker, Zod, next-intl, Vitest.

## Source and approved behavior

Parent approval: `../specs/2026-10-31-collectors-visible-slices-design.md`, slice 5.
Primary references checked 2026-10-31:
[feed fields](https://developer.personio.de/docs/retrieving-open-job-positions),
[languages](https://developer.personio.de/v1.0/reference/get_xml),
[integration](https://developer.personio.de/docs/integration-of-open-positions),
[enabling the public feed](https://support.personio.de/hc/en-us/articles/207576365-Integrate-jobs-from-Personio-into-your-website-via-XML).

- Recognize exact https `{account}.jobs.personio.de` and `.com` board roots,
  `/xml`, `/job/{numeric-id}` and `/job/{id}/apply`, preserving the domain.
  Reject credentials, nonstandard ports, near-miss/nested hosts, unsupported
  paths, invalid DNS account labels and unknown language query values.
- Request `/xml?language={de|en|fr|es|nl|it|pt}` through `ctx.fetch` with XML
  Accept. English is the form default; pasted links prefill a valid language.
  Never try another domain/language silently or fetch per-job pages for text.
- Preset `personio-board` appears after Workable under Jobs, asks for board URL
  and language, and has EN/NL/FR labels/help. The new collector ID is
  `personio-jobs`; existing board-name forms stay unchanged. Include this ID
  in the existing job-results rendering branch.
- `<workzag-jobs>` contains zero/many positions. A position maps id/name,
  primary/additional offices, department, employmentType and schedule. Keep
  source employment codes combined; do not infer workplace type from office
  names or title. `createdAt` is not a publication date, so postedAt is null.
- Build posting/application links from the validated host, numeric ID and
  chosen language. The live demo posting links directly to
  `/job/{id}/apply?language={language}`, verified in its public HTML. Text in
  `jobDescriptions/jobDescription` is kept in source order with escaped heading
  names and opaque HTML values; render only the worker's readable text.
- Descriptions may be absent in the chosen language; retain such jobs with
  the existing missing-description state. Personio's company About us section
  is outside the feed and is not fetched. The demo board returned four jobs;
  Personio's own board returned an empty feed on both domain variants.
- Empty feeds succeed. Missing boards (404), other source statuses and malformed
  XML/envelopes use translated job-board failures; 404 explains that the public
  feed may not have been enabled. Existing safety,
  ownership, quotas, history, downloads and 100k description cap still apply.

## Parsing bounds

XML validation/parsing runs only in the existing 256MB, five-second worker.
Enforce 5Mi input characters, 128 element nesting and 100,000 elements during
streaming SAX events; limit serialized document output to 8Mi characters.
Saxes checks a single well-formed XML 1.0 document, names, comments, attributes,
legal Unicode and declared/numeric references. Refuse every DTD through its
doctype event. It does not fetch external entities. Text and CDATA events stay
in order; references decode exactly once and numeric IDs stay strings.

Build null-prototype field maps and combine repeated elements into arrays.
Return null for malformed XML; propagate existing depth/complexity/time refusals.
The worker returns bounded JSON in its existing result envelope, and context
reads that document as unknown for the Personio adapter. `saxes` 6.0.0 was
already in the lockfile via jsdom; declaring it directly adds no package versions.
The strict parser avoids the existing library's permissive validation and
inconsistent reference decoding, found during independent review.

## Tasks and boundaries

- [x] Add XML request mode to `extract/protocol.ts`, implement
      `extract/extract-xml.ts`, and dispatch it in the worker and fake context.
      Add `CollectorContext.parseXml`, its guarded context wrapper and required
      unused integration-fixture stub. Keep list/text modes compatible.
- [x] Add `extract-xml.test.ts` for malformed XML, DTD/entity refusal, CDATA,
      built-in entities, depth/width/body/output limits and large IDs. Extend the
      actual worker bundle test and context capability tests.
- [x] Create `src/lib/job-boards/personio.ts` and tests for URL/language
      recognition and parsed-document mapping. Save a small real demo XML fixture
      and document it. Preserve singleton/repeated positions/description blocks.
- [x] Add `collectors/personio-jobs.ts` and register it in the catalog. Prove
      fake-context XML+HTML extraction, input validation, empty/404/error/malformed
      cases, source URLs and no invented dates in its own tests.
- [x] Add the localized preset, ask samples and recognition/facade tests.
      Extend form submission tests for URL/language and result-page navigation.
      Extend run tests to prove Personio uses the compact details component.
- [x] Run only added/touched non-integration test files, workspace
      `pnpm typecheck`, targeted ESLint/Prettier and diff checks. Never run full,
      database/integration/Chromium tiers or production builds. Build only workers.
- [x] Replay real .de/.com demo feeds, empty and missing boards through the
      guarded context using stub storage, development memory limiter and a dummy
      DATABASE_URL. Never write a database or start a persisted run.
- [x] Independently review, commit locally and expose the slice in the owner's
      checkout, preserving unrelated Payload changes. No branch push is authorized
      by this turn's “next”; Workable and Personio remain local.

## Owner review

Refresh Data collectors, choose **Personio jobs**, enter
`https://demo.jobs.personio.de/` and select German (`de`) for all four descriptions. Collect, open View details,
inspect application links, log/history and CSV/JSON. Paste a `.com/xml?language=de`
link to check domain/language prefill. Use `https://personio.jobs.personio.de/`
for a real empty-feed state. The owner performs persisted app runs.

## Validation and local handoff

229 tests across the eleven added/touched unit/component/worker-bundle files
passed. Workspace `pnpm typecheck`, targeted ESLint/Prettier and diff checks
passed. Independent Standards/Spec reviews identified XML validation/decoding
problems in the initial library choice; strict SAX parsing and exact-layer
regressions resolved them. Both final reviews report no remaining findings.
No full/integration/Chromium test tier or production build ran locally. The
integration fixture gained only the required unused parseXml method.

The final worker bundle was replayed against public feeds through the guarded
context with stub storage, development memory rate limiting and a dummy DB URL.
The .de demo returned four valid jobs (one English description); the .com demo
returned four valid jobs with all four German descriptions. Personio's own
board returned zero jobs successfully. A nonexistent host was refused by its
robots rules; those protections were preserved. A synthetic 404 proves the
translated unavailable-feed explanation. No database writes or persisted app
runs were performed.

`saxes` 6.0.0 was promoted from the existing lockfile into direct dependencies;
no new package versions or transitive packages were added. Dependency setup
used offline installs with lifecycle scripts disabled. The local worker bundle
must be rebuilt after checkout so the app recognizes XML requests.

Branch `feat/collector-personio` includes local Workable work. Neither source
was pushed by this turn's “next” instruction. Owner app testing is the remaining
manual acceptance step; the next roadmap source is Hacker News.
