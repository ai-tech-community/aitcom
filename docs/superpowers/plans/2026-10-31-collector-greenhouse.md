# Greenhouse Jobs Implementation Plan

> Execute inline, one task at a time. User-approved scope is slice 1 of
> `../specs/2026-10-31-collectors-visible-slices-design.md`.

**Goal:** A member can paste a Greenhouse board link, collect its jobs, inspect
the resulting rows and download them through the existing collector workspace.

**Architecture:** Add one Strategy (`job-board`, Greenhouse only), a reviewed
`greenhouse-board` preset and strict pure recognition. Move the existing URL
builder to a small shared module and re-export it for startup-scan compatibility.
Add string-choice support to the schema-driven form with the existing Select.
All fetching remains behind CollectorContext. No migration or new runner.

**Tech Stack:** Next.js, React, Zod 4, tRPC, next-intl, Vitest.

## Task 1: Shared Greenhouse data and collector

- [ ] Create `src/lib/job-boards/greenhouse.ts`: move the existing
      `greenhouseBoardUrl(token)` unchanged; export a strict board-name schema,
      supported-link recognition and structured response parser. The parser returns
      null for an invalid envelope, preserves empty boards, reads department names,
      accepts only http(s) job links and never treats updated_at as postedAt.
- [ ] Re-export the builder from
      `src/lib/investigations/startup-job-boards.ts` for existing callers.
- [ ] Add `src/server/collectors/collectors/job-board.ts`: input
      `z.object({ board: z.enum(["greenhouse"]), name: greenhouseBoardName })`,
      fixed row schema `{ title, location, department, url, postedAt }`, translated
      hints and sample, 5000-row/60-second limit, ctx-only API fetch. Map 404 to
      board_not_found, other statuses to board_status, and invalid JSON/envelopes
      to board_response_invalid. Empty boards yield no rows normally.
- [ ] Register the collector in `src/server/collectors/catalog.ts`; extend
      failure codes and EN/NL/FR messages.
- [ ] Add saved fixture and focused parser/collector tests. Extend the existing
      startup board test to verify the shared URL builder contract.

## Task 2: Working preset and form

- [ ] Extend `src/lib/collectors/form-fields.ts` with a `choice` kind for
      nonempty string enums and string consts. Keep row-column choices unsupported.
      Coerce choice values as strings; preserve empty optional omission.
- [ ] Extend `src/components/collectors/field-renderers.tsx` using the current
      Select components: labelled trigger, error/help association, required state,
      placeholder and selection callback. Add the field rejection mapping.
- [ ] Add the preset to `src/server/collectors/presets/catalog.ts` under Jobs,
      before existing entries, with base board=greenhouse, ask=[name] and a pure
      recognizer. Add its ASK_SAMPLES entry.
- [ ] Update the obsolete all-links-fall-back recognition test and add table
      tests for supported board/embed/API addresses, invalid hosts, paths, names
      and http links. Preserve Custom page fallback.
- [ ] Add form tests using the actual collector/preset metadata: pasted name,
      recognised line, no selectors, submitted input and success navigation. Cover
      unknown board field errors opening settings and focusing the choice.

## Task 3: Verify and deliver

- [ ] Run added/touched Vitest files with `SKIP_ENV_VALIDATION=1`, without any
      real database URL, integration suites or Chromium tiers.
- [ ] Run `pnpm typecheck` and targeted lint/format checks. Never run build.
- [ ] Review the complete diff against the spec and repository standards;
      fix findings and rerun only checks justified by the fix.
- [ ] Record verified behaviour, limitations and route in the spec; commit
      named files locally, with no AI attribution. Never push.

Review route: `/dashboard/collectors/new/greenhouse-board`.
No deployment or live database run is part of this implementation session.
