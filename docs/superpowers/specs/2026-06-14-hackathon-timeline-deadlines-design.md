# Hackathon Timeline Deadlines + Enforcement — Design

**Date:** 2026-06-14
**Status:** Approved (pending spec review)

## Problem

The hackathon timeline today is a phase-based state machine with **no time dimension**.
Phase is derived in [`src/server/hackathon/phase.ts`](../../../src/server/hackathon/phase.ts)
from event/challenge/team state, and every transition is a manual organizer action
(`lockRosters`, `openJudging`, `finalizeHackathon`). The timeline UI
([`timeline/page.tsx`](../../../src/app/[locale]/events/[slug]/timeline/page.tsx))
renders five milestones but only *kickoff* has an actual timestamp.

Consequences:

- **Registration never closes on time** — users can `joinTeam`/`createTeam` until an
  organizer manually locks rosters.
- **Submissions have no window** — `submitProject` works anytime the phase is `locked`.
- Deadlines that *do* exist are display-only, not enforced anywhere.

This milestone adds **authoritative, enforced event-level deadlines**. It is the
foundation for later milestones (countdown UI, auto-transitions, deadline reminders,
full-timeline iCal), which are explicitly out of scope here.

## Decisions

These were settled during brainstorming and drive the design:

1. **Deadlines are authoritative over manual phase buttons.** When a deadline passes,
   the gate it governs is closed *regardless of phase*. The organizer's manual buttons
   become a way to advance *early*; editing the deadline date is how you extend *late*.
2. **Deadlines live at the Event level** (one timeline per hackathon). No per-challenge
   deadlines — the timeline UI, phase machine, and reminders are all event-scoped today.
3. **At the registration deadline: freeze, don't destroy.** No new teams/joins, but
   existing `forming` teams and unmatched solos are left untouched. `lockRosters` still
   decides which forming teams become official.
4. **`judgingDeadline` is a hard gate** on judge scoring (consistent with Decision 1);
   **`resultsDate` is display/notification only** (nothing to enforce — winners unlock on
   manual `finalize`).
5. **Override = edit the deadline field.** No separate per-phase bypass flags. The gate
   stays a pure `now <= deadline` check with a single source of truth.

## Scope

**In scope**

- Four optional event-level deadline fields.
- A shared, pure gate module (`src/server/hackathon/deadlines.ts`).
- Hard enforcement on four mutations.
- Soft (warn-only) chronological validation.

**Out of scope (deferred to later milestones)**

- Auto phase transitions (#4).
- Countdown / time-remaining UI (#2).
- Deadline-based notifications/reminders (#5).
- Full-timeline iCal export (#6).

## Architecture

Chosen approach: **centralized gate module** (vs. inline per-mutation checks or folding
deadlines into the derived phase). It is the only option that guarantees the enforcement
logic and any future countdown UI read the *same* source of truth, and it mirrors the
existing `src/server/hackathon/*` pure-module style (`phase.ts`, `timeline.ts`).

### 1. Data model

Add four **optional** fields to the Events collection
([`src/collections/Events.ts`](../../../src/collections/Events.ts)), grouped near the
existing `date` / `startTime` / `endTime` / `timezone` fields, shown only when the event
is a hackathon:

| Field                  | Type          | Purpose                              | Gates a write? |
|------------------------|---------------|--------------------------------------|----------------|
| `registrationDeadline` | `timestamptz` | Close team creation/joining          | Yes            |
| `submissionDeadline`   | `timestamptz` | Close project submission             | Yes            |
| `judgingDeadline`      | `timestamptz` | Close judge ranking submission       | Yes            |
| `resultsDate`          | `timestamptz` | Results announcement target          | No (display)   |

- **All optional.** Unset ⇒ that gate falls back to today's phase-driven behavior, so
  **existing events are non-breaking**.
- Interpreted in the event's existing `timezone` field; stored as `timestamptz`.
- Requires a hand-written Payload migration in `src/migrations/` applied via `db:apply`,
  followed by `payload generate:types` and consumer guards. (Per project memory:
  migrations are Payload, not drizzle; types regenerate on field change.)

### 2. Gate module — `src/server/hackathon/deadlines.ts`

Pure functions with `now` injected (never read the clock internally — keeps them
unit-testable), mirroring `phase.ts`:

```
isRegistrationOpen(event, now) -> { open: boolean, deadline: Date | null, reason: string | null }
isSubmissionOpen(event, now)   -> { open: boolean, deadline: Date | null, reason: string | null }
isJudgingOpen(event, now)      -> { open: boolean, deadline: Date | null, reason: string | null }
```

Rule per gate:

- deadline unset ⇒ `{ open: true, deadline: null, reason: null }` (today's behavior).
- deadline set ⇒ `open = now <= deadline`; when closed, `reason` is a stable string
  (`"registration_closed"`, `"submission_closed"`, `"judging_closed"`) used for typed
  errors and i18n.

`resultsDate` has no gate function (display/notification only).

### 3. Enforcement points

Each gate is called at the top of its mutation; a closed gate throws
`TRPCError({ code: "FORBIDDEN", message: reason })`:

| Gate                  | Mutation(s)                  | File                                                                 |
|-----------------------|------------------------------|---------------------------------------------------------------------|
| `isRegistrationOpen`  | `createTeam`, `joinTeam`     | [`teams.ts`](../../../src/server/api/routers/teams.ts)              |
| `isRegistrationOpen`  | looking-for-team matchmaking | [`looking-for-team.ts`](../../../src/server/hackathon/looking-for-team.ts) |
| `isSubmissionOpen`    | `submitProject`              | [`teams.ts`](../../../src/server/api/routers/teams.ts)              |
| `isJudgingOpen`       | `submitRankings`             | [`hackathon.ts`](../../../src/server/api/routers/hackathon.ts)      |

- The deadline check runs **in addition to** existing phase gates — both "phase not
  ready" and "deadline passed" are enforced independently.
- Existing manual buttons (`lockRosters`, `openJudging`, `finalizeHackathon`) are
  untouched; they advance early. Editing a deadline date extends late (Decision 5).

### 4. Validation

A soft validation hook on the Events collection **warns but does not block** when
deadlines are non-chronological (expected order:
`registrationDeadline ≤ submissionDeadline ≤ judgingDeadline ≤ resultsDate`). Organizers
can save out-of-order while drafting.

### 5. Behavior at the registration deadline

Freeze, don't destroy (Decision 3): after `registrationDeadline`, `createTeam`/`joinTeam`
and matchmaking are blocked, but existing `forming` teams and unmatched solos are left
exactly as they are. `lockRosters` still decides which forming teams become official.

## Error handling

- Closed gates throw `TRPCError` with code `FORBIDDEN` and a stable `reason` string for
  i18n on the client.
- Unset deadlines never throw — behavior is identical to today.

## Testing

- **Unit (`deadlines.ts`):** unset ⇒ open; `now` before / exactly at / after the
  deadline; timezone-boundary cases relative to the event `timezone`.
- **Integration:** each mutation throws after its deadline and succeeds before it; unset
  deadlines preserve current behavior; registration freeze leaves `forming` teams intact.

## Migration / rollout notes

- Non-breaking: all fields optional, all existing events behave exactly as before until an
  organizer sets a deadline.
- Order of operations: write migration → `db:apply` → `payload generate:types` → update
  consumers/guards → implement gate module + enforcement → tests.
