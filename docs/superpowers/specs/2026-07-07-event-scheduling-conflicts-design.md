# Event Scheduling Conflict Check — Design Spec

**Date:** 2026-07-07
**Status:** Approved (grill-with-docs session + confirmed /impeccable shape brief)
**Domain terms:** see `CONTEXT.md` — [[event]], [[audience]], [[preferred-time-slot]],
[[scheduling-conflict]], [[tentative-hold]], [[discovered-event]].
**Architecture:** see `docs/adr/0035-scheduling-conflicts-query-an-internal-index.md`.

## Problem

Event organizers unknowingly schedule events that compete for the same audience
(e.g. several strong CEO events on the same evening in the same city). Everyone
loses: split attendance, weaker events. The platform should detect these
collisions when an event is being scheduled and suggest better times.

## Decisions (all confirmed)

1. **Actor & home** — community organizers, inside the existing event
   creation/edit flow (`src/components/communities/event-form-dialog.tsx`).
2. **Audience** — promoted from the hard-coded enum
   (`EVENT_AUDIENCE_OPTIONS` in `src/lib/event-metadata.ts`) to a Hub-curated
   Payload collection. Each Audience carries: interest tags (the classifier's
   vocabulary), preferred time slots (weekday × time-of-day ranges, local
   timezone, editorial defaults designed for later data refinement), and
   explicit related-audience links (Executives ↔ Founders). Never free-form
   per organizer.
3. **Conflict rule** — graded, never binary: shared Audience (or
   related-audience hit at reduced severity) + time proximity + catchment
   (same city/region for in-person; timezone-compatible for online; hybrid
   counts as both). Wider buffers for in-person (travel/fatigue). Severity
   grades: exact overlap > same evening > same day.
4. **Corpus (ADR-0035)** — always a local query against our own `events`
   index. External coverage is ingestion: connected Luma calendars, URL
   imports, later agent-scale discovery through the existing curation fields
   (`discoverySource`, `curatedByAgent`, `confidenceScore`, `reviewStatus`).
   The curating agent classifies Audiences at ingestion; ADR-0011's review
   queue catches mislabels. Never live third-party API calls at check time.
5. **Creation UX** — advisory, never blocking. Live inline panel directly
   under the date/start/end/timezone cluster; debounced check once date +
   ≥1 audience are set; graded conflict rows + 3–5 one-click alternative
   slot chips (clicking applies date/time to the form). Conflict state also
   shown to reviewers in the ADR-0011 approval queue.
6. **Tentative holds** — unpublished drafts with a chosen date + audience
   register as anonymized low-severity conflicts ("another event targeting
   Executives is being planned around this time" — no title/organizer/
   community) so on-platform organizers can't collide blind.
7. **Monitoring (Phase 2)** — a Vercel cron (mirroring
   `src/app/api/cron/event-reminders/route.ts`) re-checks upcoming native
   events against the growing index; new material conflicts produce one
   deduped advisory notification to the organizer. Respects the notification
   ceiling.
8. **Phasing** — engine first, discovery grows:
   - **Phase 1:** Audience collection + enum migration, conflict engine,
     creation-flow warnings + suggested slots, tentative holds. Corpus =
     native + connected Luma + URL imports.
   - **Phase 2:** monitoring cron + notifications.
   - **Phase 3:** agent-scale discovery ingestion, then learned time slots.

## UI brief (confirmed via /impeccable shape)

- **Register:** product, Restrained. Signal Orange stays on the dialog submit
  only (One Voice Rule). Severity uses semantic tokens — `destructive` for
  direct clash, `warning` for same-day, `info` for tentative/related — always
  paired with an icon **and** a mono grade label (`/ CLASH`, `/ SAME DAY`,
  `/ TENTATIVE`, `/ RELATED`). Flat 1px-bordered panel on `surface-muted`.
- **Layout:** full-width `col-span-2` row under the date/time cluster. Vertical
  budget: header + max 3 conflict rows + "+N more" expand (internal scroll) +
  one row of slot chips (~240px max).
- **States:** idle (hidden; muted hint until date+audience exist) → checking
  (skeleton line, debounced ~600ms) → clear (success line naming audience +
  catchment) → conflicts (severity-sorted rows: icon, grade, title, time
  relation, mono source badge `LUMA`/`AIT`/`IMPORT`, link) → check-failed
  (non-blocking "you can still submit" + retry). Tentative hold row:
  info-toned, dashed border, lock icon, no title/link.
- **Slot chips:** "Wed 11 Jun · 18:00–20:00" + reason annotation ("clear ·
  preferred for Executives"). Click writes date+times into the form, re-runs
  the check, 200ms ease-out highlight on changed inputs (instant under
  reduced motion). Real buttons, keyboard-reachable.
- **Honesty line** whenever conflicts render: "Based on events AIT knows
  about."
- **A11y/i18n:** results in `aria-live="polite"`; color never alone; all
  strings via `next-intl` (Dutch length tolerance); warning-on-muted contrast
  verified ≥4.5:1.
- **Approval queue:** severity badge on pending rows; expanded row reuses the
  conflict-row component read-only.

## Slices

| Slice | Scope | Depends on |
|---|---|---|
| G — Audience foundation | Audiences collection, seed from enum, events migration enum→relationship, consumer updates, types regen | — |
| H — Conflict engine + tentative holds | conflict rule, severity grading, suggested-slot ranking, tRPC check endpoint, tentative holds | G |
| I — Creation-flow UI + approval queue | inline panel, slot chips, approval-queue conflict state | H |
| J — Monitoring cron + notifications | scheduled re-check, deduped organizer notifications | H |
| K — Discovery ingestion + learned slots | agent-scale external event ingestion, audience classification, learned slot refinement | G, H |

## Non-goals / guardrails

- Never block submission on a conflict (stale discovered events make false
  positives inevitable).
- No live external API calls in the check path (ADR-0035).
- No parallel event model — discovered events are rows in the existing
  `events` collection.
- Migrations are hand-written Payload migrations (`src/migrations/*.ts` +
  `db:apply`), never `drizzle db:push`; field changes require
  `payload generate:types` + consumer guards.
