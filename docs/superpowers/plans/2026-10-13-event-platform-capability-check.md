# Event Platform Capability Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Session constraint: execution is inline unless the user explicitly selects
> delegation. Use available local skill equivalents; do not assume those
> two named skills are installed. Never push or write to any database.

**Goal:** Establish which target platforms can support free events that register exclusively on AIT Community before coding publishing adapters.

**Architecture:** Separate the platform feasibility gate from two subsequent implementation plans: local registration source tracking and outbound publishing. Only providers with verified API and policy support may be enabled in the redirect-only publishing plan. Unsupported providers remain unavailable; expanding to external registrations requires a revised design.

**Tech Stack:** Official platform documentation and OpenAPI schemas, Markdown, the existing Next.js/tRPC/Drizzle/Payload codebase.

---

## Scope

This plan executes the first step of the
[approved design](../specs/2026-10-13-event-platform-publishing-design.md).
It is a documentation-only capability gate, not a complete coding plan
for the feature. The findings change the feasibility of the original
three-platform redirect assumption. Do not write an adapter against an
imaginary redirect field or quietly switch to native platform registration.

## Files and responsibilities

- Create `docs/research/2026-10-13-event-platform-redirect-capabilities.md`:
  source-backed capability matrix and repository constraints.
- Create `docs/superpowers/plans/2026-10-13-event-platform-capability-check.md`:
  this gate's execution checklist and handoff.
- Modify `docs/superpowers/specs/2026-10-13-event-platform-publishing-design.md`:
  record written-spec approval and link the new findings without changing
  the agreed registration mode.

## Task 1: Verify redirect publishing against primary sources

- [x] Read Luma's current API setup and discovery requirements:
  `https://docs.luma.com/reference/getting-started-with-your-api` and
  `https://help.luma.com/p/featuring-your-event-on-luma`.
- [x] Download the public schema without credentials or mutations:

  ```sh
  curl -fsSL --max-time 20 https://public-api.luma.com/openapi.json -o /tmp/aitcom-luma-openapi-20261013.json
  ```

- [x] Inspect the request body of `POST /v1/events/create`:

  ```python
  import json
  from pathlib import Path

  document = json.loads(
      Path('/tmp/aitcom-luma-openapi-20261013.json').read_text()
  )
  operation = document['paths']['/v1/events/create']['post']
  schema = operation['requestBody']['content']['application/json']['schema']
  if '$ref' in schema:
      schema = document['components']['schemas'][schema['$ref'].split('/')[-1]]
  print(sorted(schema.get('properties', {})))
  print(schema.get('required', []))
  ```

  Result: native registration controls exist; no external registration URL
  is exposed by this create request. This alone does not establish a
  blanket platform prohibition. The separate discovery guidance explicitly
  excludes events that require off-platform registration.

- [x] Read Eventbrite's current listing standards and account-specific
  external ticketing guidance. Record the general prohibition separately
  from the Eventbrite Music exception. The Music resources state that
  new accounts and additions of Music to existing accounts are not being
  accepted.
- [x] Read Meetup's API access and GraphQL publishing guide. Record that
  creation/publishing exists but the reviewed guide does not establish
  an external-registration replacement for RSVP.
- [x] Record fetch limitations: Eventbrite page opens failed, so the
  captured evidence is indexed text from Eventbrite's own official pages.
  No authenticated provider requests, publishing, or account changes occurred.

## Task 2: Map repository constraints

- [x] Read `src/server/luma/client.ts` and
  `src/server/api/routers/luma.ts` for existing read-only integration paths.
- [x] Read `src/lib/events/event-source.ts`: `sourceUrl` routes registration
  externally, so outbound listing URLs must use separate publication records.
- [x] Read `src/server/api/routers/events.ts` and
  `src/server/db/schema.ts`: registration is tied to a local user, and the
  current register mutation creates a new row after cancellation. The
  eventual attribution plan must preserve original source across those rows.
- [x] Read `src/server/events/attendee-details.ts`,
  `src/server/events/organizer-attendees.ts`,
  `src/server/events/attendee-csv.ts`,
  `src/components/events/organizer-attendee-list.tsx`, and
  `src/app/api/events/[slug]/attendees.csv/route.ts`: reuse the organizer
  reader and shared filters for page/export consistency.
- [x] Read `src/middleware.ts`: API routes bypass locale middleware, so an
  attribution redirect route can own an event-scoped cookie and redirect to
  the localized native event URL without changing authentication routes.
- [x] Record the file map for subsequent work in the findings document.

## Task 3: Save findings and reconcile the spec

- [x] Save the findings document with the capability matrix below:

  | Provider | Redirect-only disposition |
  |---|---|
  | Eventbrite | Unavailable for general accounts under current listing standards |
  | Luma | No verified API redirect control; mandatory off-platform registration excludes discovery eligibility |
  | Meetup | Unverified; keep unavailable until schema and policy support are established |

- [x] Update the spec status to acknowledge the user's written-spec approval.
- [x] Link the findings from the spec and preserve the existing rule that
  unsupported redirect providers are unavailable.
- [ ] Capture the user's choice between retaining local-only registration
  with fewer supported destinations and revising the design to synchronize
  native external registrations. The clarification was sent asynchronously;
  an unanswered question is not approval to change the registration model.

## Task 4: Verify documentation and commit

- [x] Run `git diff --check` and inspect the added documents for broken
  relative links, unsupported capability claims, and scope contradictions.
  Expected: no whitespace errors, sources attached to every provider claim,
  and no enabled provider without verified redirect support.
- [x] Stage only the three documentation files and commit with
  `docs: record event platform redirect feasibility`.
- [x] Report the findings and the required product choice to the user.

No runtime tests or typecheck are needed for this documentation-only change.
When application code is changed, run only added/touched unit test files
and `pnpm typecheck`. Do not run the whole test suite, integration/browser
tiers, migrations, development-server bootstrap, or builds that apply
database changes.

## Follow-on plans after the product choice

Keep each follow-on plan independently reviewable and executable:

1. **Registration source tracking:** opaque event/provider links, seven-day
   event-scoped attribution cookies, source persistence across auth and
   cancellation, organizer badges/filters/counts, and matching CSV exports.
   This can ship without provider credentials or automatic publishing.
2. **Outbound publishing:** verified provider capabilities, connections,
   publication history, eligibility/access checks, independent results,
   uncertain-outcome reconciliation, import deduplication, and edit/cancel
   review states. Do not enable any of the currently unverified destinations.
3. **External registration synchronization, only if chosen:** a revised
   spec for non-member attendees, identity matching, privacy, platform
   status mapping, capacity allocation, and cancellation/check-in ownership
   before writing its coding plan.

The original spec's tracking, attendee views, and privacy requirements map
to plan 1; its connection, adapter, publication, failure, and import
requirements map to plan 2. Plan 3 changes the approved scope and therefore
requires a product decision rather than being inferred from "continue".
