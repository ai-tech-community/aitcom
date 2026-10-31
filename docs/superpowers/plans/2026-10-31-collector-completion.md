# Collector Completion Plan

**Status:** authorized for autonomous implementation, PR publication and merge.

**Objective:** finish the approved twelve-slice Data collectors roadmap. Continue
without owner checkpoints between slices; each completed slice has a reachable
app action and observable result. Keep the existing guards, owner isolation,
quotas, bounded worker, localized copy and exports. No direct database writes.

## Delivery

1. Publish and merge reviewed Workable/Personio after all remote checks pass.
2. Add Research sources: Hacker News list/limit and public GitHub organization
   repositories, both through guarded fetch and honest request/time budgets.
3. Ship one measured static HTML template using the existing page-list strategy.
4. Finish visible expiry and bounded retention cleanup, plus staff domain opt-outs.
5. Finish collect-scope MCP tools/guidance and visible agent origin in run history.
6. Add structured Event-page extraction in the bounded worker and Events presets.
7. Review source/workflow commits, run only changed/added focused test files and
   workspace type-check, publish completion PR(s), resolve CI and merge.

The existing tickets `.scratch/collector-resume/issues/06` through `12` define
acceptance. Source-specific event-site presets (Luma/Eventbrite/Meetup), browser
rendering, member scripts, authenticated collection and recurring schedules are
separate follow-ups per the approved parent design, not implicit promises.

Use isolated execution worktree and preserve the unrelated Payload type diff.
Build only workers locally; never run the production build (migration script),
full/integration/Chromium tests or type-check:all. Tests use mocks/stub storage
and a deliberately unusable DB URL. Live replays read public sources only.

Progress and exact review routes are recorded below as each slice completes.

## Implemented slices and visible actions

- **06 / Hacker News:** Research → Hacker News stories, Top/New/Ask/Show and
  1–50 story IDs. Skips are logged; source date, author, points, comments,
  external and discussion URLs become rows. Pasting `/ask` or `/show` opens
  the selected list. Read-only live replay returned two stories via three
  guarded API requests, with stub storage and the local in-memory limiter.
- **07 / GitHub:** Research → GitHub repositories, public organization and
  1–500 repositories. Fixed public API pagination, no access token, clear
  unknown/rate-limited/invalid outcomes and honest item-limit stops. Live
  octokit replay returned two rows with a deliberate partial stop.
- **08 / Template:** Jobs → Python community jobs. Verified python.org/jobs/
  returned HTTP 200 through the real robots, network and rate-limit guard.
  The saved fixture is a reduced two-row response captured 2026-10-31, with
  source links and dates. Selectors remain in Show settings. The current
  source list is one page, with no invented next-page selector.
- **09 / Retention:** A run displays its stored expiry as an exact localized
  UTC date. Facade reads/history and downloads exclude expired runs at once.
  Authenticated scheduled GET cleans at most 25 expired runs, under row locks
  with SKIP LOCKED and cascading item deletion. Queued runs past expiry are
  never claimed; running runs are kept while their lease is live. No live
  cleanup was invoked and no database was mutated during verification.
- **10 / Opt-outs:** Staff see Site opt-outs in the workspace footer. Every
  operation enforces the admin role and feature flag. Domain-only input is
  canonicalized, including IDNs, with inline refusal. Adding an existing
  domain updates its reason; removal and errors are visible. The existing
  blocklist table and per-hop network enforcement are reused unchanged.
- **11 / Agents:** Data collectors → Your agent grants/revokes `collect` on
  existing owner-bound active keys. Granting acknowledges the collection
  rules; key regeneration requires a new grant. Current-manifest acceptance
  also gates the scope. Claimed agents receive list/start/status/items tools;
  every invocation reauthenticates and checks scope, owner and feature flag.
  Starts use the same facade/quota; history, recent runs and the run page show
  Agent. Guidance and the public tool catalog describe the real permission.
- **12 / Events:** Events → Event page accepts a public page address. Only
  initial-HTML Event JSON-LD is read, inside the existing deadline/heap-bound
  bundled worker; no script, remote context or browser rendering is run.
  Arrays, @graph, ItemList, local venue/organizer references, attendance mode
  and source dates produce generic exportable rows. Missing/malformed data
  has translated failures; skipped entries and truncation remain explicit.

All sources use the shared owner-private history, table and CSV/JSON exports.
EN/NL/FR copy accompanies new visible behavior. Local verification is limited
exactly to added/changed unit files, the workspace type-check and worker build.
The existing integration fixture only gains the new unused context capability;
it is not executed locally. Full local production build is deliberately not run
because its script applies migrations. No credentials or replay scripts ship.

## Review and publication

Independent Standards and Spec reviews compare the completion commit against
`a59c8779`. Acceptance comes from the approved resume tickets 06–12, reflected
above, and the parent data-collectors design. All blocking findings must be fixed
before publishing. Workable/Personio PR #546 is tracked separately and must be
green/merged before rebasing this completion onto main and creating its PR.

### Review resolutions

- Standards: mixed active-key permissions now show access as allowed when any
  key has it, so the owner can always revoke all grants. The permission panel
  uses the shared compact loading/error/retry states. Both have regressions.
- Spec: string-valued Event venues are preserved; a direct PostalAddress gives
  its city. The worker also accepts an explicit schema.org Event subtype list,
  checked against the official Event hierarchy, without accepting arbitrary
  type suffixes or fetching contexts. Focused extraction regressions cover it.
- The measured Python template was replayed through the actual bundled worker:
  20 rows, correct python.org source links, one guarded page request.
- Workable/Personio #546 passed all CI and preview checks and merged before
  completion publication. Remaining changes preserve the unrelated Payload diff.
