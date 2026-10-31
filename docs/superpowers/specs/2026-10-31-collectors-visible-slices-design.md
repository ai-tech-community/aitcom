# Data collectors: visible delivery slices

**Status:** Greenhouse merged in [PR #542](https://github.com/ai-tech-community/aitcom/pull/542).
Ashby and full job details merged in [PR #543](https://github.com/ai-tech-community/aitcom/pull/543).
Lever is reviewed locally and ready for the owner's app check.

## Delivery agreement

Resume the existing data collectors, one usable source or workflow per slice.
Each slice fits a focused implementation session and ends with an action a
member can perform in `/dashboard/collectors` and an observable result.
Shared changes belong to the first feature that needs them. Existing queued
execution, guarded context, ownership, quotas, history and exports remain the
foundation. ADR-0040 and ADR-0041 still apply.

Individual work tickets are saved locally under
`.scratch/collector-resume/issues/` (one file per numbered slice, with blockers
and acceptance criteria). No remote tracker issues were created. Slice 1 is
accepted locally; its review in the normally deployed app is pending.

| Slice                  | Visible result                                                                 | Blocked by    |
| ---------------------- | ------------------------------------------------------------------------------ | ------------- |
| 1. Greenhouse jobs     | Paste a board link, recognise it, start a run, view jobs and download CSV/JSON | Existing core |
| 2. Ashby jobs          | Recognised Ashby board and downloadable job rows, including JS-built boards    | 1             |
| 3. Lever jobs          | Lever sidebar entry, link recognition and job rows                             | 1             |
| 4. Workable jobs       | Workable sidebar entry, recognition and job rows                               | 1             |
| 5. Personio jobs       | Personio sidebar entry and jobs from its public XML feed                       | 1             |
| 6. Hacker News         | Top/New/Ask/Show choice, item limit, story rows and downloads                  | Existing core |
| 7. GitHub repositories | Organisation input, repositories with descriptions, stars and links            | Existing core |
| 8. First HTML template | One verified site's list without writing selectors                             | Existing core |
| 9. Dataset expiry      | Expiry visible on each run and automatic cleanup of expired datasets           | Existing core |
| 10. Site opt-outs      | Staff manage blocked domains; affected runs explain the refusal                | Existing core |
| 11. Agent collections  | MCP starts a run visible in My runs, identified as agent-started               | Existing core |
| 12. Event page         | Structured Event data becomes names, dates, venues and links                   | Existing core |

Luma, Eventbrite and Meetup are separate follow-up slices, each dependent on
slice 12 and evidence that public pages contain usable data and allow collection.
Do not promise support before that check. Browser rendering, member-written
scripts, logged-in collection and recurring member schedules are separate work.

Every slice includes a reachable UI, useful rows from a supported example,
clear invalid-input/empty/source-failure states, history and CSV/JSON export,
tests only for files added or touched, and the workspace type-check. Delivery
includes the exact review route and steps. Do not push or write to a database
during implementation or verification. Never run the production build (it
applies migrations).

## Slice 1: Greenhouse jobs

### Member flow

Add **Greenhouse jobs** under Jobs in the existing rail. The preset asks for
the company's board name, with an example and help explaining the relevant
part of a board link. Pasting a supported https Greenhouse board link opens
this preset with its name filled in and the existing recognised-source line.
Unknown links continue to open Custom page. Preserve the current first-use
acknowledgement and feature gate; local `.env` already has
`FEATURE_COLLECTORS=on` (production configuration is unverified).

The run produces `title`, `location`, `department`, `url`, `postedAt` columns.
Missing optional values are null. Never substitute `updated_at` for a posting
date. Empty boards succeed with zero rows. A 404 says the board was not found;
other non-2xx statuses and malformed responses have actionable translated
messages. Keep EN, NL and FR copy together. Existing run screens and export
formatters render these rows without a new results surface.

### Implementation boundaries

- `job-board` collector initially accepts only `board: "greenhouse"` and a
  validated board name; later slices extend the supported board choices.
- Read the public API only through `ctx.fetch`, so every request obeys the
  existing site rules, rate limits, quotas and network protection.
- Reuse the existing Greenhouse API URL builder from a small shared module.
  The startup scanner keeps its startup-specific title/HTML normalisation;
  the collector reads raw structured fields without importing that subsystem.
- Recognise exact supported hosts and board/embed/API paths. Marketing pages,
  misleading hostnames, missing/invalid names and plain-http links fall back
  to Custom page; never guess a board from an arbitrary path.
- Add string-choice form fields (including a single string literal) using
  the existing select primitive. Preserve typed schema validation; numeric,
  boolean, mixed and empty choices remain unsupported. The preset fills the
  board choice behind Show settings and asks only for its name.
- Retain the existing limits architecture: one API response with bounded
  body/rows/time, logs and the normal worker, without schema changes.

API reference: [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html).
Its list endpoint exposes published jobs, and `content=true` supplies department
data. A posting date is not guaranteed by the list endpoint.

### Verification and review

Use saved response fixtures and fake collector contexts; never create a live
run against the configured database. Cover structured rows, missing optional
fields, no invented date, empty/404/error/malformed responses, input validation,
link recognition near misses, disabled presets and the complete form submission
to the existing run-page navigation. Run only added/touched test files and
`pnpm typecheck`, plus lint/format checks for touched files. In-app review after
normal deployment: `/dashboard/collectors/new/greenhouse-board`, enter a board
name or paste its link from the workspace, start, inspect results and download.

### Slice 1 delivery record

- The owner confirmed collection works in the local app on 2026-10-31 after
  fixing local worker wake-up and local rate-limiter dependencies, and asked
  to create/merge the PR and continue with Ashby. Deployment review remains
  separate from the completed local review.
- PR #542 merged on 2026-10-31 as `a0740dac` after CI formatting, lint/type-check,
  full tests, production build and the Vercel preview all passed. The owner
  granted a specific exception to the standing no-push rule for the reviewed
  Greenhouse branch. Ashby remains local and unpublished.

- Implemented on branch `feat/collector-greenhouse`; initial feature commit
  `6d97f264`. No migration is needed. No push or deployment performed.
- 206 tests across the 11 added/touched test files passed, including a saved
  two-job response from Greenhouse's own board, schema-driven form submission,
  keyboard selection, translated failures, disabled-preset fallback and startup
  scanner compatibility. All tests used a nonworking database URL; no database
  writes or live persisted runs were performed.
- `pnpm typecheck`, targeted ESLint and formatting checks passed. Independent
  Standards and Spec reviews reported no findings.
- Design detector: suppressed the broken-image false positive only for the
  existing startup parser fixture test. Follow-up review aligned all ten flagged
  13px/15px text sizes in the touched collector forms to the documented
  `text-sm`/`text-base` scale; no typography suppressions were added.
- Review after normal deployment: open `/dashboard/collectors`, choose
  Greenhouse jobs or paste `https://job-boards.greenhouse.io/greenhouse`,
  verify the board name is `greenhouse`, start a run, then inspect the title,
  location, department, URL and postedAt columns and download CSV/JSON. This
  manual persisted-run check remains for the owner's normal app review.
- Next slice: Ashby jobs (slice 2).

## Slice 2 local delivery

The Ashby job-board adapter, preset, strict board/job link recognition and
EN/NL/FR copy are implemented on `feat/collector-ashby`. The form and existing
private run history/table/exports use the same job columns as Greenhouse.
Unlisted Ashby postings are omitted. Eight focused test files (168 tests),
type-check, lint and formatting passed; a guarded public API replay returned
74 job rows without database storage. Standards and Spec reviews found no
issues. Review plan:
`../plans/2026-10-31-collector-ashby.md`. Owner route after checkout:
`/dashboard/collectors/new/ashby-board`, board name `Ashby`.

## Ashby/details merge and Lever handoff

On 2026-10-31 the owner authorized PR creation, merge and continuation.
PR #543 merged as `762b205e` after all GitHub checks (full tests, lint/type-check,
format and build) and the Vercel preview passed. CI identified a stale
five-column expectation in the local-worker tests; its exact row was updated
for the richer schema and all five tests passed locally. A preview font-loader
failure in unchanged magazine code cleared on a preview retry without a source
change. No database writes were performed by local verification.

Slice 3, Lever, is implemented and reviewed on `feat/collector-lever`, based
on that merged main. It supports global/EU board links, complete descriptions,
five-page bounded pagination, existing history/details and CSV/JSON. All 121
focused tests, type-check, targeted lint/format and independent Standards/Spec
reviews passed. Guarded stub-storage API replays returned 10 global and 324 EU
jobs. The rebase preserved the reviewed feature diff byte-for-byte.

Owner review: refresh `/dashboard/collectors`, choose **Lever jobs** and enter
`leverdemo`, or paste `https://jobs.eu.lever.co/leverdemo`. Inspect View details,
application links, run log/history and CSV/JSON. Lever remains unpublished;
next planned source after owner review is Workable (slice 4).
