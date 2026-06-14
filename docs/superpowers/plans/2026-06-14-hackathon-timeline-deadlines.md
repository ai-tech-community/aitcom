# Hackathon Timeline Deadlines + Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authoritative, enforced event-level deadlines (registration / submission / judging / results) to hackathons, so timeline gates close on time instead of only on manual organizer action.

**Architecture:** Four optional deadline fields on the Payload `events` collection. A pure, `now`-injected gate module (`src/server/hackathon/deadlines.ts`) is the single source of truth for "is X open right now," called by the four mutations that must enforce a window and by the looking-for-team gate. Deadlines are authoritative over the manual phase buttons; an unset deadline preserves today's phase-driven behavior (non-breaking). Override = edit the deadline date.

**Tech Stack:** Next.js, Payload CMS (Postgres adapter, hand-written migrations), Drizzle (`app` schema tables), tRPC, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-hackathon-timeline-deadlines-design.md`

**Conventions for this repo (read before starting):**
- Migrations are hand-written Payload migrations in `src/migrations/`, applied with `npm run db:apply`. NEVER `db:push`. The `drizzle/` dir is vestigial.
- Payload-managed tables (`events`, `challenges`) use column type `timestamp(3) with time zone` (NOT `timestamptz`, which is only for the drizzle-managed `app` schema).
- After changing a Payload collection field, run `npx payload generate:types` and commit the regenerated `src/payload-types.ts`.
- Tests are Vitest, co-located as `*.test.ts`. Run a single file with `npx vitest run <path>`.
- Pure domain logic lives in `src/server/hackathon/*` as db-free, deterministic, unit-tested functions (see `phase.ts`, `looking-for-team.ts`).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/migrations/20260614a_event_deadlines.ts` | Add 4 nullable deadline columns to `events` | Create |
| `src/migrations/index.ts` | Migration registry | Modify (register new migration) |
| `src/collections/Events.ts` | Payload field definitions | Modify (add 4 fields) |
| `src/payload-types.ts` | Generated types | Regenerate |
| `src/server/hackathon/deadlines.ts` | Pure gate functions + chronological-order helper | Create |
| `src/server/hackathon/deadlines.test.ts` | Unit tests for the gate module | Create |
| `src/server/api/routers/teams.ts` | Enforce registration gate (`createTeam`, `joinTeam`) + submission gate (`submitTeam`) | Modify |
| `src/server/api/routers/hackathon.ts` | Enforce judging gate (`submitRankings`) | Modify |
| `src/server/hackathon/looking-for-team.ts` | Accept `registrationOpen` and reject when closed | Modify |
| `src/server/hackathon/looking-for-team.test.ts` | Cover the new closed-registration branch | Modify |

---

## Task 1: Migration — add deadline columns to `events`

**Files:**
- Create: `src/migrations/20260614a_event_deadlines.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Write the migration**

Mirror the spelling in `20260613c_challenge_judging_opened.ts` — Payload tables use `timestamp(3) with time zone`, additive, idempotent.

```typescript
// Adds the four hackathon timeline deadline columns to the Payload events table
// (registration / submission / judging gates + results announcement date). All
// nullable: an unset deadline means "no enforced window" and preserves today's
// phase-driven behavior. Payload-managed table, so we use the
// `timestamp(3) with time zone` spelling its Drizzle adapter emits for `date`
// fields (see 20260613c_challenge_judging_opened). Purely additive.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "registration_deadline" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "submission_deadline"   timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "judging_deadline"      timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "results_date"          timestamp(3) with time zone;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      DROP COLUMN IF EXISTS "registration_deadline",
      DROP COLUMN IF EXISTS "submission_deadline",
      DROP COLUMN IF EXISTS "judging_deadline",
      DROP COLUMN IF EXISTS "results_date";
  `);
}
```

- [ ] **Step 2: Register the migration in `src/migrations/index.ts`**

Open `src/migrations/index.ts`, follow the exact pattern already there (an import plus an entry in the exported array, in filename order). Add the import alongside the other `20260613*` imports:

```typescript
import * as migration_20260614a_event_deadlines from './20260614a_event_deadlines'
```

And add its entry at the END of the migrations array (after the last `20260613c` entry), matching the surrounding object shape exactly:

```typescript
  {
    up: migration_20260614a_event_deadlines.up,
    down: migration_20260614a_event_deadlines.down,
    name: '20260614a_event_deadlines',
  },
```

> Note: if the existing entries use a different shape (e.g. no `name`, or a `path`), copy THAT shape — match the file you see, don't impose this one.

- [ ] **Step 3: Apply the migration**

Run: `npm run db:apply`
Expected: completes without error; output reports `20260614a_event_deadlines` applied. Re-running is a no-op (idempotent `IF NOT EXISTS`).

- [ ] **Step 4: Verify the columns exist**

Run: `npm run db:apply` (a second time)
Expected: no pending migrations / nothing to apply — confirms it registered and ran.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/20260614a_event_deadlines.ts src/migrations/index.ts
git commit -m "feat(hackathon): add event deadline columns (registration/submission/judging/results)"
```

---

## Task 2: Payload fields on the Events collection

**Files:**
- Modify: `src/collections/Events.ts` (Basics tab `fields`, near the `date` row at lines ~172-204)
- Regenerate: `src/payload-types.ts`

- [ ] **Step 1: Add the four fields**

In `src/collections/Events.ts`, inside the **Basics** tab `fields` array, immediately AFTER the `timezone` field object (the one ending at line ~204, before `maxAttendees`), insert a deadlines `row`. All four are `date` fields with a day+time picker, shown only for hackathons via `admin.condition`, and all optional:

```typescript
            {
              type: "row",
              admin: {
                // Hackathon timeline deadlines (event-level, all optional).
                // Authoritative over the manual phase buttons: a passed deadline
                // closes its gate regardless of phase; extend by editing the date.
                // Unset = no enforced window (today's phase-driven behavior).
                condition: (data) => data?.type === "hackathon",
              },
              fields: [
                {
                  name: "registrationDeadline",
                  type: "date",
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayAndTime" },
                    description:
                      "After this, team create/join is closed (interpreted in the event timezone).",
                  },
                },
                {
                  name: "submissionDeadline",
                  type: "date",
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayAndTime" },
                    description: "After this, project submission is closed.",
                  },
                },
              ],
            },
            {
              type: "row",
              admin: {
                condition: (data) => data?.type === "hackathon",
              },
              fields: [
                {
                  name: "judgingDeadline",
                  type: "date",
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayAndTime" },
                    description: "After this, judges can no longer submit rankings.",
                  },
                },
                {
                  name: "resultsDate",
                  type: "date",
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayAndTime" },
                    description:
                      "Results announcement target — display/notification only, not enforced.",
                  },
                },
              ],
            },
```

- [ ] **Step 2: Regenerate Payload types**

Run: `npx payload generate:types`
Expected: `src/payload-types.ts` updated; `Event` now has optional `registrationDeadline?`, `submissionDeadline?`, `judgingDeadline?`, `resultsDate?` (`string | null`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no consumers reference the new fields yet, so this should be clean).

- [ ] **Step 4: Commit**

```bash
git add src/collections/Events.ts src/payload-types.ts
git commit -m "feat(hackathon): expose event deadline fields in Payload admin (hackathon-only)"
```

---

## Task 3: Gate module `deadlines.ts` (pure, TDD)

**Files:**
- Create: `src/server/hackathon/deadlines.ts`
- Test: `src/server/hackathon/deadlines.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/server/hackathon/deadlines.test.ts
import { describe, it, expect } from "vitest";

import {
  isRegistrationOpen,
  isSubmissionOpen,
  isJudgingOpen,
  deadlineOrderWarnings,
  type EventDeadlines,
} from "./deadlines";

function ev(overrides: Partial<EventDeadlines> = {}): EventDeadlines {
  return {
    registrationDeadline: null,
    submissionDeadline: null,
    judgingDeadline: null,
    ...overrides,
  };
}

const NOW = new Date("2026-06-14T12:00:00.000Z");

describe("isRegistrationOpen", () => {
  it("is open when the deadline is unset (today's phase-driven behavior)", () => {
    const r = isRegistrationOpen(ev(), NOW);
    expect(r).toEqual({ open: true, deadline: null, reason: null });
  });

  it("is open strictly before the deadline", () => {
    const r = isRegistrationOpen(
      ev({ registrationDeadline: "2026-06-14T13:00:00.000Z" }),
      NOW,
    );
    expect(r.open).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("is open exactly at the deadline (now <= deadline)", () => {
    const r = isRegistrationOpen(
      ev({ registrationDeadline: "2026-06-14T12:00:00.000Z" }),
      NOW,
    );
    expect(r.open).toBe(true);
  });

  it("is closed after the deadline, with a stable reason", () => {
    const r = isRegistrationOpen(
      ev({ registrationDeadline: "2026-06-14T11:00:00.000Z" }),
      NOW,
    );
    expect(r.open).toBe(false);
    expect(r.reason).toBe("registration_closed");
    expect(r.deadline).toEqual(new Date("2026-06-14T11:00:00.000Z"));
  });

  it("accepts a Date instance as well as an ISO string", () => {
    const r = isRegistrationOpen(
      ev({ registrationDeadline: new Date("2026-06-14T11:00:00.000Z") }),
      NOW,
    );
    expect(r.open).toBe(false);
  });
});

describe("isSubmissionOpen", () => {
  it("uses the submission deadline and its own reason", () => {
    const r = isSubmissionOpen(
      ev({ submissionDeadline: "2026-06-14T11:00:00.000Z" }),
      NOW,
    );
    expect(r.open).toBe(false);
    expect(r.reason).toBe("submission_closed");
  });
});

describe("isJudgingOpen", () => {
  it("uses the judging deadline and its own reason", () => {
    const r = isJudgingOpen(
      ev({ judgingDeadline: "2026-06-14T11:00:00.000Z" }),
      NOW,
    );
    expect(r.open).toBe(false);
    expect(r.reason).toBe("judging_closed");
  });
});

describe("deadlineOrderWarnings", () => {
  it("returns no warnings when all unset", () => {
    expect(deadlineOrderWarnings(ev())).toEqual([]);
  });

  it("returns no warnings when chronological", () => {
    expect(
      deadlineOrderWarnings(
        ev({
          registrationDeadline: "2026-06-14T10:00:00.000Z",
          submissionDeadline: "2026-06-14T11:00:00.000Z",
          judgingDeadline: "2026-06-14T12:00:00.000Z",
        }),
      ),
    ).toEqual([]);
  });

  it("warns when submission precedes registration", () => {
    const warnings = deadlineOrderWarnings(
      ev({
        registrationDeadline: "2026-06-14T11:00:00.000Z",
        submissionDeadline: "2026-06-14T10:00:00.000Z",
      }),
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/submission/i);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/server/hackathon/deadlines.test.ts`
Expected: FAIL — `Cannot find module './deadlines'`.

- [ ] **Step 3: Implement the module**

```typescript
// src/server/hackathon/deadlines.ts
// Event-level hackathon timeline gates (spec 2026-06-14). Pure + now-injected so
// they are deterministic, unit-testable, and the SINGLE source of truth shared by
// the enforcing mutations and any future countdown UI. A deadline is authoritative
// over the manual phase buttons; an UNSET deadline means "no enforced window" and
// preserves today's phase-driven behavior (non-breaking). "Open" is inclusive of
// the deadline instant: open === now <= deadline.

export interface EventDeadlines {
  registrationDeadline: Date | string | null;
  submissionDeadline: Date | string | null;
  judgingDeadline: Date | string | null;
}

export interface GateResult {
  open: boolean;
  /** The effective deadline, or null when none is set. */
  deadline: Date | null;
  /** Stable i18n/error key when closed, else null. */
  reason: string | null;
}

function gate(
  raw: Date | string | null | undefined,
  now: Date,
  reason: string,
): GateResult {
  if (raw === null || raw === undefined) {
    return { open: true, deadline: null, reason: null };
  }
  const deadline = raw instanceof Date ? raw : new Date(raw);
  const open = now.getTime() <= deadline.getTime();
  return { open, deadline, reason: open ? null : reason };
}

export function isRegistrationOpen(event: EventDeadlines, now: Date): GateResult {
  return gate(event.registrationDeadline, now, "registration_closed");
}

export function isSubmissionOpen(event: EventDeadlines, now: Date): GateResult {
  return gate(event.submissionDeadline, now, "submission_closed");
}

export function isJudgingOpen(event: EventDeadlines, now: Date): GateResult {
  return gate(event.judgingDeadline, now, "judging_closed");
}

/**
 * Soft validation: returns human-readable warnings when the set deadlines are not
 * chronological (registration ≤ submission ≤ judging). Unset deadlines are skipped.
 * Returns [] when fine. Callers WARN — they must not block the save (organizers set
 * deadlines out of order while drafting).
 */
export function deadlineOrderWarnings(event: EventDeadlines): string[] {
  const toTime = (raw: Date | string | null) =>
    raw === null ? null : (raw instanceof Date ? raw : new Date(raw)).getTime();
  const reg = toTime(event.registrationDeadline);
  const sub = toTime(event.submissionDeadline);
  const judge = toTime(event.judgingDeadline);
  const warnings: string[] = [];
  if (reg !== null && sub !== null && sub < reg) {
    warnings.push("Submission deadline is before the registration deadline.");
  }
  if (sub !== null && judge !== null && judge < sub) {
    warnings.push("Judging deadline is before the submission deadline.");
  }
  return warnings;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/server/hackathon/deadlines.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/deadlines.ts src/server/hackathon/deadlines.test.ts
git commit -m "feat(hackathon): pure deadline gate module (registration/submission/judging + order warnings)"
```

---

## Task 4: Enforce registration gate in `createTeam` and `joinTeam`

**Files:**
- Modify: `src/server/api/routers/teams.ts` (`createTeam` ~lines 144-195, `joinTeam` ~lines 198-243)

- [ ] **Step 1: Add the import**

At the top of `src/server/api/routers/teams.ts`, alongside the other `@/server/hackathon/*` imports (near line 23-28), add:

```typescript
import {
  isRegistrationOpen,
  isSubmissionOpen,
} from "@/server/hackathon/deadlines";
```

> `isSubmissionOpen` is used in Task 5; importing both here keeps one import statement.

- [ ] **Step 2: Gate `createTeam`**

In `createTeam`, the published hackathon `event` is already loaded (lines 147-153). Immediately AFTER that `if (!event) { ... }` block and BEFORE the `payload.findByID` challenge lookup, insert:

```typescript
      const reg = isRegistrationOpen(event, new Date());
      if (!reg.open) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Registration for this hackathon has closed.",
        });
      }
```

- [ ] **Step 3: Gate `joinTeam`**

`joinTeam` (lines 198-243) loads `team` but not the event. After the `if (!team) { ... }` block (line 208-210) and before `assertNotAlreadyOnTeam`, fetch the bound event by `team.eventId` and gate it:

```typescript
      const payload = await getPayloadClient();
      const event = await payload.findByID({
        collection: "events",
        id: team.eventId,
        depth: 0,
      });
      const reg = isRegistrationOpen(event, new Date());
      if (!reg.open) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Registration for this hackathon has closed.",
        });
      }
```

> `getPayloadClient` is already imported at the top of this file (line 22).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`event` from `findByID`/`hackathonEventForChallenge` is the generated `Event` type, structurally compatible with `EventDeadlines`.)

- [ ] **Step 5: Run the existing teams/hackathon tests to confirm nothing regressed**

Run: `npx vitest run src/server/hackathon`
Expected: PASS (pure-module suites unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/teams.ts
git commit -m "feat(hackathon): enforce registration deadline on createTeam/joinTeam"
```

---

## Task 5: Enforce submission gate in `submitTeam`

**Files:**
- Modify: `src/server/api/routers/teams.ts` (`submitTeam` ~lines 333-398)

- [ ] **Step 1: Add the gate**

In `submitTeam`, after the `team.submittedAt` already-submitted check (the block ending ~line 379) and BEFORE the `ctx.db.update(teams)` write (line 381), fetch the bound event and gate submission:

```typescript
      const payload = await getPayloadClient();
      const event = await payload.findByID({
        collection: "events",
        id: team.eventId,
        depth: 0,
      });
      const sub = isSubmissionOpen(event, new Date());
      if (!sub.open) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The submission deadline for this hackathon has passed.",
        });
      }
```

> `isSubmissionOpen` was imported in Task 4 Step 1. `getPayloadClient` is already imported.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run the hackathon suites**

Run: `npx vitest run src/server/hackathon`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/teams.ts
git commit -m "feat(hackathon): enforce submission deadline on submitTeam"
```

---

## Task 6: Enforce judging gate in `submitRankings`

**Files:**
- Modify: `src/server/api/routers/hackathon.ts` (`submitRankings` ~lines 963-990)

- [ ] **Step 1: Add the import**

At the top of `src/server/api/routers/hackathon.ts`, alongside the other `@/server/hackathon/*` imports, add:

```typescript
import { isJudgingOpen } from "@/server/hackathon/deadlines";
```

- [ ] **Step 2: Add the gate**

In `submitRankings`, the `challenge` is loaded by `requireHackathonJudge` (line 980-984) and the existing `if (!challenge.judgingOpenedAt)` check is at lines 985-990. Immediately AFTER that `judgingOpenedAt` check, fetch the bound hackathon event and gate judging by its deadline:

```typescript
      const payload = await getPayloadClient();
      const { docs: eventDocs } = await payload.find({
        collection: "events",
        where: {
          and: [
            { challengeId: { equals: String(input.challengeId) } },
            { type: { equals: "hackathon" } },
            { status: { not_in: ["draft", "rejected", "cancelled"] } },
          ],
        },
        limit: 1,
        depth: 0,
      });
      const event = eventDocs[0];
      if (event) {
        const judging = isJudgingOpen(event, new Date());
        if (!judging.open) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "The judging deadline for this hackathon has passed.",
          });
        }
      }
```

> The event-binding `where` clause mirrors `hackathonEventForChallenge` in `teams.ts`. If `getPayloadClient` is not yet imported in `hackathon.ts`, add `import { getPayloadClient } from "@/server/payload";` with the other imports (grep first: `grep -n "getPayloadClient" src/server/api/routers/hackathon.ts` — if it returns hits, it's already imported).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Run the hackathon suites**

Run: `npx vitest run src/server/hackathon`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): enforce judging deadline on submitRankings"
```

---

## Task 7: Close looking-for-team matchmaking at the registration deadline

**Files:**
- Modify: `src/server/hackathon/looking-for-team.ts` (`assertCanToggleLookingForTeam`, lines 17-35)
- Modify: `src/server/hackathon/looking-for-team.test.ts`
- Modify: the tRPC caller of `assertCanToggleLookingForTeam`

- [ ] **Step 1: Write the failing test**

In `src/server/hackathon/looking-for-team.test.ts`, add to the `assertCanToggleLookingForTeam` describe block:

```typescript
  it("rejects toggling once registration has closed, even in the live phase", () => {
    expect(() =>
      assertCanToggleLookingForTeam({
        phase: "live",
        enrollment: { teamId: null },
        registrationOpen: false,
      }),
    ).toThrow(LookingForTeamError);
  });

  it("allows toggling when registration is open (default) in the live phase", () => {
    expect(() =>
      assertCanToggleLookingForTeam({
        phase: "live",
        enrollment: { teamId: null },
      }),
    ).not.toThrow();
  });
```

> Confirm `LookingForTeamError` is already imported at the top of the test file; if not, add it to the existing import from `./looking-for-team`.

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/server/hackathon/looking-for-team.test.ts`
Expected: FAIL — `registrationOpen` is not an accepted argument / closed case does not throw.

- [ ] **Step 3: Extend the gate**

In `src/server/hackathon/looking-for-team.ts`, update `assertCanToggleLookingForTeam` to accept an optional `registrationOpen` (defaulting to open for back-compat) and reject when explicitly closed. Add the check AFTER the existing phase checks:

```typescript
export function assertCanToggleLookingForTeam(args: {
  phase: HackathonPhase;
  enrollment: { teamId: string | null } | null;
  /** Event-level registration gate; defaults to open when omitted. */
  registrationOpen?: boolean;
}): void {
  if (!args.enrollment) {
    throw new LookingForTeamError(
      "You must enroll in this hackathon before joining the looking-for-team list.",
    );
  }
  if (args.enrollment.teamId !== null) {
    throw new LookingForTeamError("You are already on a team.");
  }
  if (args.phase === "draft") {
    throw new LookingForTeamError("Team formation is not open yet.");
  }
  if (args.phase !== "live") {
    throw new LookingForTeamError("Team formation has closed.");
  }
  if (args.registrationOpen === false) {
    throw new LookingForTeamError("Registration for this hackathon has closed.");
  }
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run src/server/hackathon/looking-for-team.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass `registrationOpen` from the caller**

Locate the tRPC procedure that calls `assertCanToggleLookingForTeam`:

Run: `grep -rn "assertCanToggleLookingForTeam" src/server/api`

In that procedure, the bound hackathon `event` is (or can be) loaded for the challenge. Compute the gate and pass it. Add the import to that router if missing:

```typescript
import { isRegistrationOpen } from "@/server/hackathon/deadlines";
```

Then, where the event for the challenge is available (load it via the same `hackathonEventForChallenge`-style `payload.find` used elsewhere if not already present), change the call to:

```typescript
      assertCanToggleLookingForTeam({
        phase,
        enrollment,
        registrationOpen: event
          ? isRegistrationOpen(event, new Date()).open
          : true,
      });
```

> If the event is not currently loaded in that procedure, add a `payload.find` for the bound event mirroring `hackathonEventForChallenge` (challengeId + type hackathon + status not_in draft/rejected/cancelled, limit 1, depth 0). Keep `registrationOpen: true` as the fallback when no event is found, so non-hackathon paths are unaffected.

- [ ] **Step 6: Typecheck + full hackathon suite**

Run: `npx tsc --noEmit && npx vitest run src/server/hackathon`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/hackathon/looking-for-team.ts src/server/hackathon/looking-for-team.test.ts src/server/api/routers
git commit -m "feat(hackathon): close looking-for-team matchmaking at the registration deadline"
```

---

## Task 8: Wire soft chronological warnings into the Events collection

**Files:**
- Modify: `src/collections/Events.ts` (collection `hooks`)

- [ ] **Step 1: Add a `beforeValidate` hook that warns (never blocks)**

`deadlineOrderWarnings` (Task 3) is already unit-tested, so this task only wires the thin, non-blocking hook. In `src/collections/Events.ts`, import the helper near the top:

```typescript
import { deadlineOrderWarnings } from "@/server/hackathon/deadlines";
```

The collection already has a `hooks` object with `afterChange` (used by geocoding, see lines ~78-85). Add a `beforeValidate` array to the SAME `hooks` object (do not create a second `hooks` key). This logs a warning via the Payload logger and returns `data` unchanged — it must never throw or mutate, so a misordered draft still saves:

```typescript
    beforeValidate: [
      ({ data, req }) => {
        if (data?.type === "hackathon") {
          for (const warning of deadlineOrderWarnings({
            registrationDeadline: data.registrationDeadline ?? null,
            submissionDeadline: data.submissionDeadline ?? null,
            judgingDeadline: data.judgingDeadline ?? null,
          })) {
            req?.payload?.logger?.warn(
              `Event ${data.slug ?? "(new)"}: ${warning}`,
            );
          }
        }
        return data;
      },
    ],
```

> Surfacing these warnings in the admin UI is intentionally deferred to the countdown-UI milestone (#2). This milestone only needs the non-blocking signal, and the ordering logic itself is already covered by `deadlineOrderWarnings` unit tests.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/collections/Events.ts
git commit -m "feat(hackathon): warn (non-blocking) on non-chronological event deadlines"
```

---

## Task 9: Full verification pass

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`
Expected: PASS — including the new `deadlines.test.ts` and the extended `looking-for-team.test.ts`.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint (if the repo lints in CI)**

Run: `npm run lint` (skip if no such script)
Expected: PASS / no new errors in the touched files.

- [ ] **Step 4: Final review against the spec**

Confirm each spec requirement is implemented:
- 4 optional event-level deadline fields — Tasks 1-2 ✅
- Pure gate module, single source of truth — Task 3 ✅
- Registration enforced on create/join + matchmaking — Tasks 4, 7 ✅
- Submission enforced on submitTeam — Task 5 ✅
- Judging enforced on submitRankings; resultsDate display-only (no gate) — Task 6 ✅
- Unset deadline ⇒ today's behavior (non-breaking) — Task 3 logic, exercised everywhere ✅
- Override = edit the date (no extra flags) — by construction ✅
- Freeze-don't-destroy at registration deadline (no destructive writes) — Tasks 4/7 only block new writes ✅
- Soft chronological validation that warns, not blocks — Tasks 3, 8 ✅

- [ ] **Step 5: No extra commit needed** unless Steps 1-3 surfaced fixes; commit those under `fix(hackathon): ...` if so.

---

## Notes / Out of Scope (do NOT build here)

- Countdown / time-remaining UI on the timeline page (#2).
- Automatic phase transitions at deadlines (#4) — transitions stay manual.
- Deadline-based reminders/notifications (#5).
- Full-timeline iCal export (#6).
- Admin-UI surfacing of the chronological warnings (deferred to #2).
