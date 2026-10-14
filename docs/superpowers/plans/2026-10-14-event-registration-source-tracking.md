# Event Registration Source Tracking Implementation Plan

> Execute inline using the implement skill. Do not delegate implementation,
> push, apply migrations, or write to any database. The user's quick-test
> rules override the implement skill's full-suite instruction.

**Goal:** Attribute free native-event registrations to a tracked platform link,
retain that source through authentication and repeat registration, and expose
it consistently to the organizer and in CSV.

**Architecture:** Server-generated AES-GCM tokens encode an event ID and a
provider. A local redirect validates the native published free event and
sets an encrypted, timestamped, seven-day event-scoped HttpOnly cookie.
The registration mutation reads this cookie, preserves the earliest local
registration's attribution, and stores the source on the new registration.
Shared pure filters and totals keep the attendee page and CSV consistent.

**Implementation refinement:** Use opaque authenticated encryption rather
than a link table. Both satisfy event-bound, server-validated source links;
no provider connection or external publishing is introduced. Link tokens
and cookie tokens have distinct purposes. Authentication-secret rotation
invalidates both safely, falling back to direct/unknown.

## Task 1: Source model and cryptographic boundary

Files: create `src/lib/events/registration-source.ts` and its test; create
`src/server/events/registration-source-token.ts` and its test.

- [x] Define providers `luma`, `eventbrite`, `meetup`, plus fallback
  `direct_or_unknown`; unknown inputs map to fallback. Define shared source
  filters, registration totals excluding cancellations/payment rows, and
  check-in totals requiring attended status and a timestamp.
- [x] Implement authenticated opaque tokens with purpose, event ID, source,
  and capture time for cookies. Derive a domain-specific AES-256 key from
  the existing auth secret. Validate tampering, event mismatch, purpose,
  malformed payloads, future timestamps, and seven-day expiry.
- [x] Verify the public token and filter APIs with unit tests. Test expiry
  with explicit time arguments, not timers or live services.

## Task 2: Persist source and connect registration

Files: modify `src/server/db/schema.ts`, `src/migrations/index.ts`,
`src/server/api/routers/events.ts`; create an additive
`src/migrations/20261026a_event_registration_source.ts`; create
`src/server/events/registration-attribution.ts` and targeted test.

- [x] Add `registration_source` with direct/unknown default and nullable
  `attributed_at`. Register the migration but do not execute it.
- [x] Read the earliest registration for an event/user to preserve its
  source even after cancellation creates another row. Existing historical
  registrations retain direct/unknown rather than inventing attribution.
- [x] For a first free registration, resolve only its event-specific cookie.
  Read at the server boundary; do not accept a caller-supplied source enum.
  Keep existing paid registration behavior outside attribution scope.
- [x] Unit-test attribution with mocked data access and extend existing
  registration unit tests to verify saved source without a real database.

## Task 3: Tracked links usable by the organizer

Files: create `src/app/api/events/ref/[token]/route.ts` and its test;
modify the events router and create
`src/components/events/registration-source-links.tsx` and its test.

- [x] Add an organizer-only free/published/native event link query using
  the existing organizer resolver. Produce absolute localized links using
  the configured app origin, never an arbitrary redirect target.
- [x] On link visits, validate the token and current event eligibility,
  set a secure-in-production event-scoped cookie with HttpOnly,
  SameSite=Lax, Path=/ and seven-day expiry, then redirect to the event.
  Invalid links return to the events directory without setting a cookie.
- [x] Add a compact tracked-link section, including before the first attendee
  registers, with accessible copy buttons, pending/error feedback, and copy
  explaining these links do not publish events or override platform rules.
- [x] Test redirect/cookie behavior and link copying using mocks only.

## Task 4: Organizer source view and export

Files: modify `src/server/events/attendee-details.ts`,
`src/server/events/attendee-csv.ts`,
`src/components/events/organizer-attendee-list.tsx`,
`src/app/api/events/[slug]/attendees.csv/route.ts`, their unit tests, and
`messages/en.json` / `messages/nl.json`.

- [x] Carry source through the existing privacy-aware read model. Historical
  and missing values use direct/unknown; preserve organizer-only access.
- [x] Add a source badge, accessible filter, and compact registration/check-in
  totals by source. Keep existing status filtering and search behavior.
- [x] Share filtering with CSV, including source/status/search query values;
  append a translated source column without shifting existing columns.
- [x] Localize all new controls, errors, source labels, and attribution caveats
  in English and Dutch. Use the incumbent design-system components.
- [x] Test source filtering, totals, check-in undo effects, CSV agreement,
  historical defaults, link UI, and unauthorized access at existing seams.

## Task 5: Focused checks and review

- [x] Run only added/touched unit test files with
  `pnpm exec vitest run <explicit file paths>` and `pnpm typecheck`.
- [x] Run `git diff --check`; do not run integration tests, full suites,
  browsers, or builds that may apply migrations.
- [x] Review Standards and Spec using the code-review skill. Resolve findings
  within this source-tracking slice; automatic platform publishing is
  explicitly deferred by the approved capability gate.
- [x] Commit implementation, plan progress, and the encryption refinement in
  the spec to the current branch without pushing.

## Verification record

- Targeted tests: 98 tests across the 12 added/touched unit test files pass
  in the latest runs for each file. No full suite or integration/browser tier
  was run. Tests use mocked provider/data access and no database connections.
- Workspace typecheck passed after implementation and again after review
  corrections to the shared Select and CSV ordering.
- Standards review: the source filter was changed to shared Select primitives;
  the reviewer confirmed no remaining findings.
- Spec review: source totals now follow the visible filters and CSV source
  follows all question columns; the reviewer confirmed both findings resolved.
- Migration authored and registered, never executed. No database writes,
  external platform publishing, or pushes were performed.
