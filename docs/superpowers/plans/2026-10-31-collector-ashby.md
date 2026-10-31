# Ashby Jobs Implementation Plan

**Status:** slice 2 implemented locally; final review and owner app check pending.

**Goal:** A member selects Ashby jobs or pastes an Ashby board link, starts a
run and gets private job rows, history and CSV/JSON downloads in the existing
collector workspace.

**Architecture:** Extend the job-board Strategy with two reviewed adapters.
Move the common board-name/row contract to a shared job-board module and reuse
the existing Ashby API URL builder through a compatibility re-export. Keep
every request behind CollectorContext. No schema migration or new UI surface.

**Tech Stack:** Zod, existing collectors and tRPC facade, next-intl, Vitest.

## Behaviour and boundaries

- Preset `ashby-board` appears after Greenhouse under Jobs. Its base is
  `{ board: "ashby" }` and it asks only for `name`, with an Ashby-specific
  example. EN/NL/FR text remains together.
- Recognise exact https Ashby board URLs, UUID job/application links and the
  official public API board path. Preserve board-name case. Unknown hosts,
  misleading paths, missing names, credentials, nonstandard ports and invalid
  names fall back to Custom page.
- Use `GET https://api.ashbyhq.com/posting-api/job-board/{name}` and return the
  same `title`, `location`, `department`, `url`, `postedAt` columns as Greenhouse.
  Optional empty fields are null; publishedAt is the source publication date.
- Omit `isListed: false` entries: the API says these postings should only be
  available by direct link. Missing isListed is accepted for older responses.
  Unlisted rows are filtered before checking display fields.
- Empty boards succeed; 404 and malformed/status failures reuse the existing
  translated job-board errors with the correct Ashby host. Keep budgets,
  robots checks, site limits, ownership and exports unchanged.
- Greenhouse behaviour and the startup scanner's URL-builder export remain
  compatible. Bump the job-board collector version for expanded behaviour.

Primary reference: [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api).
Its public list API and a board sample were checked on 2026-10-31. At that
time the Ashby board returned 74 entries; the robots endpoint returned 401,
which the existing collector policy treats as an unavailable rules file (4xx).
Do not bypass or weaken that existing policy for this source.

## Tasks

- [x] Add focused recognizer/parser tests and a saved two-job public fixture.
      Cover UUID/application paths, near misses, missing optional fields, unlisted
      entries, empty boards and malformed JSON structures.
- [x] Extract the common board contract; add the Ashby parser and strict
      recognizer; re-export the moved API URL builder for the startup scanner.
- [x] Extend the job-board Strategy with the Ashby adapter, input choice,
      version and correct 404 host. Prove Greenhouse compatibility and Ashby
      source/error cases with fake collector contexts.
- [x] Add the reviewed preset and a catalog sample; prove actual catalog
      recognition, feature/collector disable behaviour and full form submission
      into the existing run page.
- [x] Run only the added/touched test files, workspace type-check and targeted
      lint/format checks. Use a dummy DB URL; never run full/integration/Chromium
      tiers, builds, migrations, pushes or database writes.
- [x] Replay the guarded collector against the real public board with a stub
      database and local in-memory limiter; report counts/logs without persisting.
- [ ] Review and commit the slice locally. Owner review route:
      `/dashboard/collectors/new/ashby-board`, board name `Ashby`.

Work is prepared on a separate local branch while the Greenhouse PR is
published and merged. The standing no-push rule remains in force unless the
owner grants a specific exception.

Validation on 2026-10-31: all 168 tests in the eight added/touched test files
passed; the workspace type-check and targeted ESLint/Prettier checks passed.
A guarded replay against the real Ashby public API returned 74 rows in about
1.3 seconds with one API page and `Found 74 jobs.` in the log. The database
port was a stub and the database URL was deliberately unusable; no database
writes or live persisted runs were performed.
