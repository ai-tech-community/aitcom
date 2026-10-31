# Data collectors: visible delivery slices

**Status:** approved in conversation on 2026-10-31; slice 1 in implementation.

## Delivery agreement

Resume the existing data collectors, one usable source or workflow per slice.
Each slice fits a focused implementation session and ends with an action a
member can perform in `/dashboard/collectors` and an observable result.
Shared changes belong to the first feature that needs them. Existing queued
execution, guarded context, ownership, quotas, history and exports remain the
foundation. ADR-0040 and ADR-0041 still apply.

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
