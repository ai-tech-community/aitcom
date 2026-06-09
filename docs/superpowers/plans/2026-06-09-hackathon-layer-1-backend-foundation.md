# Hackathon Layer — Plan 1: Backend Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the schema, the Event↔Challenge binding, team formation, per-team competitive grid instantiation, and the competitive claim predicate so that teams form and their commissioned agents can claim competitive work-cells.

**Architecture:** Builds the additive hackathon layer on top of the proven collaborative work-grid ([ADR-0029](../../adr/0029-team-is-a-grouping-over-enrollments-and-the-binding-is-the-discriminator.md), [ADR-0023](../../adr/0023-work-grid-dispatch-is-a-claimable-pull-queue.md)). A `team` row groups per-member `challenge_enrollment` rows (each gains a nullable `teamId`); the hackathon is a nullable `events.challengeId` binding; each team gets its own competitive `work_grid` (gains a nullable `teamId`) cloned from a sponsor-authored `cellTemplate[]` on the challenge. The only net-new claim-path logic is "the claimer's owner is on this grid's team." Pure logic lives in db-free modules with unit tests; the DB claim flow is covered by the existing `RUN_DB_TESTS` integration harness.

**Tech Stack:** Next.js 15 / tRPC 11 / Drizzle ORM (Postgres, `app` schema) / Payload CMS 3 (`public` schema) / Vitest. Drizzle tables in `src/server/db/schema.ts`; Payload collections in `src/collections/`.

**Out of scope (later plans):** submission/finalize/judging/leaderboard/prizes (Plan 2); spectator view + UI + the `isPublic` leaderboard fix (Plan 3); orchestrator cell, live ticker, cron-at-event-start auto-lock, rubric panel (deferred fast-follows).

---

## File Structure

**Create:**
- `src/server/hackathon/binding-invariant.ts` — pure `assertBindable()` (communityId match + event is a hackathon). Unit-tested.
- `src/server/hackathon/binding-invariant.test.ts` — unit tests (no DB).
- `src/server/hackathon/team-join-code.ts` — pure `generateTeamJoinCode()`. Unit-tested.
- `src/server/hackathon/team-join-code.test.ts` — unit tests (no DB).
- `src/server/hackathon/cell-template.ts` — pure `cellTemplateSchema` + `cellTemplateToInserts()`. Unit-tested.
- `src/server/hackathon/cell-template.test.ts` — unit tests (no DB).
- `src/server/hackathon/team-membership.ts` — pure `assertCanJoinTeam()`. Unit-tested.
- `src/server/hackathon/team-membership.test.ts` — unit tests (no DB).
- `src/server/api/routers/teams.ts` — `teamsRouter` (createTeam, joinTeam, leaveTeam, getTeam).
- `src/server/api/routers/hackathon.ts` — `hackathonRouter` (bindChallenge, lockRosters, getHackathon).

**Modify:**
- `src/server/db/schema.ts` — add `teams` table + relations; add `teamId` to `challengeEnrollments` and `workGrids`.
- `src/collections/Events.ts` — add `challengeId` field.
- `src/collections/Challenges.ts` — add `cellTemplate[]` array + `teamConfig` group.
- `src/server/api/routers/work-grid.ts` — add `ownerOnTeam()`; extend `listClaimable` + `claimCell` for competitive grids.
- `src/server/api/routers/work-grid.integration.test.ts` — add the competitive claim flow.
- `src/server/api/root.ts` — register `teamsRouter` and `hackathonRouter`.

---

## Phase A — Schema

### Task A1: Add the `teams` table and `teamId` columns (Drizzle)

**Files:**
- Modify: `src/server/db/schema.ts` (add `teams` near the work-grid tables ~line 1504; add `teamId` to `challengeEnrollments` ~line 1182 and `workGrids` ~line 1504)

- [ ] **Step 1: Add the `teams` table and its relations**

In `src/server/db/schema.ts`, immediately **above** the `// Work grids (...)` comment (~line 1503), insert:

```typescript
// Teams (a grouping over enrollments that enters a hackathon as one unit — ADR-0029)
export const teams = appSchema.table(
  "team",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    challengeId: d.integer().notNull(), // References Payload challenges table
    eventId: d.integer().notNull(), // The bound hackathon event (denormalised for db-only join/leave)
    name: d.varchar({ length: 100 }).notNull(),
    captainId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    joinCode: d.varchar({ length: 20 }).notNull(),
    maxSize: d.integer().notNull().default(5),
    status: d
      .varchar({ length: 20 })
      .notNull()
      .default("forming")
      .$type<"forming" | "locked" | "disbanded">(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull()
      .$onUpdate(() => new Date()),
  }),
  (t) => [
    index("team_challenge_idx").on(t.challengeId),
    index("team_captain_idx").on(t.captainId),
    uniqueIndex("team_join_code_uidx").on(t.joinCode),
  ],
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
  captain: one(user, {
    fields: [teams.captainId],
    references: [user.id],
  }),
  members: many(challengeEnrollments),
}));
```

- [ ] **Step 2: Add `teamId` to `challengeEnrollments`**

In the `challengeEnrollments` table definition (~line 1182), add the column after `progressLogThreadId` and an index in the index array:

```typescript
    progressLogThreadId: d.varchar({ length: 255 }), // FK → challengeThreads.id (set after creation)
    teamId: d.varchar({ length: 255 }).references(() => teams.id), // nullable: set when the enrollment joins a team (ADR-0029)
```

And in its `(t) => [ ... ]` index array, add:

```typescript
    index("enrollment_team_idx").on(t.teamId),
```

- [ ] **Step 3: Add `teamId` to `workGrids`**

In the `workGrids` table definition (~line 1504), add the column after `communityId`:

```typescript
    challengeId: d.integer(), // nullable: non-challenge grids (e.g. one-cell "polish a message")
    communityId: d.varchar({ length: 255 }),
    teamId: d.varchar({ length: 255 }).references(() => teams.id), // nullable: set for a competitive (per-team) grid (ADR-0029)
```

And in its `(t) => [ ... ]` index array, add:

```typescript
    index("work_grid_team_idx").on(t.teamId),
```

- [ ] **Step 4: Write the Payload migration (this repo's real apply mechanism)**

> **Migration mechanism — important.** This repo does NOT apply schema via `drizzle-kit migrate`/`push`. Schema is applied by hand-written **Payload migrations** in `src/migrations/*.ts` (idempotent `IF NOT EXISTS` DDL), registered in `src/migrations/index.ts`, applied by `pnpm db:apply` / `payload migrate` and tracked in `payload_migrations`. The `drizzle/` directory is vestigial here — do not run `db:generate`/`db:push` and do not touch `drizzle/`. Mirror the existing app-schema example `src/migrations/20260604a_work_grid_commission.ts`.

Create `src/migrations/20260609a_hackathon_teams.ts` mirroring that template: a `up({ db })` that `CREATE TABLE IF NOT EXISTS "app"."team" ( ... )` with the team columns + the three indexes, then two `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "team_id" ... REFERENCES "app"."team"("id")` blocks (on `app.challenge_enrollment` and `app.work_grid`) each with its index; and a `down({ db })` that drops the two columns then the table. The team table must be created before the FK columns.

- [ ] **Step 5: Register the migration + typecheck**

In `src/migrations/index.ts`, add `import * as migration_20260609a_hackathon_teams from "./20260609a_hackathon_teams";` after the last import, and append `{ up, down, name: "20260609a_hackathon_teams" }` to the `migrations` array.

Run: `pnpm typecheck`
Expected: no type errors.

> **DB apply is DEFERRED** (no local DB; `DATABASE_URL` is cloud). The migration is authored and committed; applying it (`pnpm db:apply`) happens later against a local/branch DB or CI.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260609a_hackathon_teams.ts src/migrations/index.ts
git commit -m "feat(hackathon): add team table and teamId columns (ADR-0029)"
```

### Task A2: Add the Payload fields — `events.challengeId`, `challenge.cellTemplate[]`, `challenge.teamConfig`

**Files:**
- Modify: `src/collections/Events.ts`
- Modify: `src/collections/Challenges.ts`

- [ ] **Step 1: Add `challengeId` to Events**

In `src/collections/Events.ts`, in the `fields` array next to the existing `communityId` field, add:

```typescript
    {
      name: "challengeId",
      type: "text",
      index: true,
      admin: {
        position: "sidebar",
        description:
          "ID of the Challenge this event runs as a hackathon. Set this to bind an event↔challenge (the binding is the team-based discriminator, ADR-0029). Must share the challenge's communityId.",
      },
    },
```

- [ ] **Step 2: Add `cellTemplate[]` and `teamConfig` to Challenges**

In `src/collections/Challenges.ts`, in the `fields` array immediately **after** the existing `rewards` group, add:

```typescript
    {
      name: "cellTemplate",
      type: "array",
      admin: {
        description:
          "Hackathon work-cell decomposition. Each entry becomes one pending cell in every team's competitive grid when rosters lock (ADR-0029/0023). Leave empty for non-hackathon challenges.",
      },
      fields: [
        { name: "description", type: "text", required: true },
        { name: "taskType", type: "text", required: true },
        {
          name: "verificationMode",
          type: "select",
          required: true,
          defaultValue: "self-report",
          options: [
            { label: "Platform Action", value: "platform-action" },
            { label: "Test", value: "test" },
            { label: "Self-Report", value: "self-report" },
            { label: "Peer Review", value: "peer-review" },
            { label: "Consensus", value: "consensus" },
          ],
        },
        {
          name: "deadlineMinutes",
          type: "number",
          required: true,
          min: 1,
          defaultValue: 60,
        },
      ],
    },
    {
      name: "teamConfig",
      type: "group",
      fields: [
        {
          name: "minTeamSize",
          type: "number",
          required: true,
          min: 1,
          defaultValue: 1,
        },
        {
          name: "maxTeamSize",
          type: "number",
          required: true,
          min: 1,
          defaultValue: 5,
        },
      ],
    },
```

- [ ] **Step 3: Regenerate Payload types and typecheck**

Run: `pnpm payload generate:types` (Payload's standard types generator; reads the config, no DB connection)
Expected: `src/payload-types.ts` updates with `challengeId` on `Event` and `cellTemplate`/`teamConfig` on `Challenge`. If the command requires a DB and fails, report it and proceed — the collection config is the source of truth; types can be regenerated later.

Run: `pnpm typecheck`
Expected: no type errors.

> **Payload migration for these collection changes is DEFERRED.** Unlike the app-schema team table (A1, hand-writable), Payload collection field changes (a column on `events`, the `challenges_cell_template` array child-table, the `team_config_*` group columns) are best generated by `payload migrate:create`, which diffs the live schema and needs a DB. With no local DB here, author the collection config now and generate + commit the Payload migration when a DB is available. The collection config is the source of truth.

- [ ] **Step 4: Commit**

```bash
git add src/collections/Events.ts src/collections/Challenges.ts src/payload-types.ts
git commit -m "feat(hackathon): add events.challengeId binding + challenge cellTemplate/teamConfig (ADR-0029)"
```

---

## Phase B — The Event↔Challenge binding

### Task B1: Pure `assertBindable()` (TDD)

**Files:**
- Create: `src/server/hackathon/binding-invariant.ts`
- Test: `src/server/hackathon/binding-invariant.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/hackathon/binding-invariant.test.ts
import { describe, it, expect } from "vitest";
import { assertBindable } from "./binding-invariant";

describe("assertBindable", () => {
  const base = {
    event: { type: "hackathon", communityId: "comm-1" },
    challenge: { communityId: "comm-1" },
  };

  it("passes when the event is a hackathon and communityIds match", () => {
    expect(() => assertBindable(base.event, base.challenge)).not.toThrow();
  });

  it("passes when both communityIds are null (Hub-wide)", () => {
    expect(() =>
      assertBindable(
        { type: "hackathon", communityId: null },
        { communityId: null },
      ),
    ).not.toThrow();
  });

  it("throws when the event is not a hackathon", () => {
    expect(() =>
      assertBindable({ type: "workshop", communityId: "comm-1" }, base.challenge),
    ).toThrow(/hackathon/i);
  });

  it("throws when communityIds differ", () => {
    expect(() =>
      assertBindable(base.event, { communityId: "comm-2" }),
    ).toThrow(/communityId/i);
  });

  it("treats undefined and null communityId as the same (Hub-wide)", () => {
    expect(() =>
      assertBindable(
        { type: "hackathon", communityId: null },
        { communityId: undefined },
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/hackathon/binding-invariant.test.ts`
Expected: FAIL — `Cannot find module './binding-invariant'`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/server/hackathon/binding-invariant.ts
//
// Pure invariant for the Event↔Challenge binding (ADR-0029). A challenge is
// team-based / competitive EXACTLY when it is bound to a hackathon event, so
// binding is the discriminator. The binding is only legal when the event is a
// hackathon and the two share a communityId (so the Hub-wide / community-scoped
// distinction both inherit cannot be broken by binding across scopes).
//
// Kept db-free so it can be unit-tested without a database or Payload.

export class BindingError extends Error {}

export function assertBindable(
  event: { type: string; communityId: string | null | undefined },
  challenge: { communityId: string | null | undefined },
): void {
  if (event.type !== "hackathon") {
    throw new BindingError(
      "Only an event of type 'hackathon' can be bound to a challenge.",
    );
  }
  const eventCommunity = event.communityId ?? null;
  const challengeCommunity = challenge.communityId ?? null;
  if (eventCommunity !== challengeCommunity) {
    throw new BindingError(
      "Event and challenge must share the same communityId to bind.",
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/hackathon/binding-invariant.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/binding-invariant.ts src/server/hackathon/binding-invariant.test.ts
git commit -m "feat(hackathon): pure assertBindable binding invariant (ADR-0029)"
```

### Task B2: `hackathon.bindChallenge` mutation

**Files:**
- Create: `src/server/api/routers/hackathon.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the hackathon router with `bindChallenge`**

```typescript
// src/server/api/routers/hackathon.ts
//
// The hackathon layer's coordinator router (ADR-0024/0029). A hackathon is the
// composition of an Event and a Challenge; binding an event to a challenge is
// what makes the challenge team-based. AIT is plumbing only — no cognition.

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getPayloadClient } from "@/server/payload";
import { assertBindable, BindingError } from "@/server/hackathon/binding-invariant";

/**
 * Resolve the challenge sponsor gate (mirrors `requireGridAdmin`'s challenge
 * branch in work-grid.ts). Returns the Payload challenge doc on success.
 */
async function requireChallengeSponsor(challengeId: number, userId: string) {
  const payload = await getPayloadClient();
  let challenge;
  try {
    challenge = await payload.findByID({
      collection: "challenges",
      id: challengeId,
      depth: 0,
    });
  } catch {
    throw new TRPCError({ code: "NOT_FOUND", message: "Challenge not found" });
  }
  if (challenge.creatorId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the challenge sponsor can administer this hackathon",
    });
  }
  return challenge;
}

export const hackathonRouter = createTRPCRouter({
  /**
   * Bind a hackathon event to a challenge — the act that makes the challenge
   * team-based (ADR-0029). Sponsor-scoped; enforces the communityId invariant.
   */
  bindChallenge: protectedProcedure
    .input(z.object({ eventId: z.number(), challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireChallengeSponsor(input.challengeId, userId);

      const payload = await getPayloadClient();
      let event;
      try {
        event = await payload.findByID({
          collection: "events",
          id: input.eventId,
          depth: 0,
        });
      } catch {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }

      try {
        assertBindable(
          { type: event.type, communityId: event.communityId ?? null },
          { communityId: challenge.communityId ?? null },
        );
      } catch (e) {
        if (e instanceof BindingError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }

      await payload.update({
        collection: "events",
        id: input.eventId,
        data: { challengeId: String(input.challengeId) },
      });

      return { eventId: input.eventId, challengeId: input.challengeId };
    }),
});
```

- [ ] **Step 2: Register the router**

In `src/server/api/root.ts`, add the import next to the other router imports:

```typescript
import { hackathonRouter } from "@/server/api/routers/hackathon";
```

And add to the `createTRPCRouter({ ... })` object (next to `workGrid: workGridRouter,`):

```typescript
  hackathon: hackathonRouter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Manual verification (Payload-backed)**

In a dev session with a seeded hackathon event + challenge owned by you, call `hackathon.bindChallenge({ eventId, challengeId })` via the tRPC client (or a scratch script). Confirm: the event's `challengeId` is set; binding an event of type `workshop` returns `BAD_REQUEST`; binding across mismatched `communityId` returns `BAD_REQUEST`; a non-sponsor caller gets `FORBIDDEN`.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/hackathon.ts src/server/api/root.ts
git commit -m "feat(hackathon): bindChallenge mutation (sponsor-scoped, communityId invariant)"
```

---

## Phase C — Team formation

### Task C1: Pure `generateTeamJoinCode()` (TDD)

**Files:**
- Create: `src/server/hackathon/team-join-code.ts`
- Test: `src/server/hackathon/team-join-code.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/hackathon/team-join-code.test.ts
import { describe, it, expect } from "vitest";
import { generateTeamJoinCode } from "./team-join-code";

describe("generateTeamJoinCode", () => {
  it("matches the TEAM-XXXXXXXX format (8 unambiguous chars)", () => {
    expect(generateTeamJoinCode()).toMatch(/^TEAM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it("is non-deterministic across calls", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateTeamJoinCode()));
    expect(codes.size).toBeGreaterThan(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/hackathon/team-join-code.test.ts`
Expected: FAIL — `Cannot find module './team-join-code'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/hackathon/team-join-code.ts
//
// Human-shareable team join code (ADR-0029). Mirrors the registration invite
// code style (registration-tools.ts) with a "TEAM-" prefix and an unambiguous
// alphabet (no O/0/I/1). 8 chars over a 32-symbol alphabet ≈ 10^12 space, so a
// collision against the unique index on team.joinCode is negligible; the insert
// caller treats a unique-violation as "regenerate".

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTeamJoinCode(): string {
  let code = "TEAM-";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/hackathon/team-join-code.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/team-join-code.ts src/server/hackathon/team-join-code.test.ts
git commit -m "feat(hackathon): pure generateTeamJoinCode helper"
```

### Task C2: Pure `assertCanJoinTeam()` (TDD)

**Files:**
- Create: `src/server/hackathon/team-membership.ts`
- Test: `src/server/hackathon/team-membership.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/hackathon/team-membership.test.ts
import { describe, it, expect } from "vitest";
import { assertCanJoinTeam } from "./team-membership";

describe("assertCanJoinTeam", () => {
  it("passes for a forming team below max size", () => {
    expect(() =>
      assertCanJoinTeam({ status: "forming", currentSize: 2, maxSize: 5 }),
    ).not.toThrow();
  });

  it("throws when the team is full", () => {
    expect(() =>
      assertCanJoinTeam({ status: "forming", currentSize: 5, maxSize: 5 }),
    ).toThrow(/full/i);
  });

  it("throws when the roster is locked", () => {
    expect(() =>
      assertCanJoinTeam({ status: "locked", currentSize: 1, maxSize: 5 }),
    ).toThrow(/locked/i);
  });

  it("throws when the team is disbanded", () => {
    expect(() =>
      assertCanJoinTeam({ status: "disbanded", currentSize: 0, maxSize: 5 }),
    ).toThrow(/disbanded|not open/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/hackathon/team-membership.test.ts`
Expected: FAIL — `Cannot find module './team-membership'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/hackathon/team-membership.ts
//
// Pure guards for joining a team (ADR-0029). A team only accepts members while
// it is "forming" and below its max size; once the roster locks at hacking-
// window open the membership is frozen so the competitive grid has a stable set
// of eligible claimers. Db-free so it can be unit-tested without a database.

export class TeamJoinError extends Error {}

export function assertCanJoinTeam(team: {
  status: "forming" | "locked" | "disbanded";
  currentSize: number;
  maxSize: number;
}): void {
  if (team.status === "locked") {
    throw new TeamJoinError("This team's roster is locked.");
  }
  if (team.status === "disbanded") {
    throw new TeamJoinError("This team is disbanded and not open to join.");
  }
  if (team.currentSize >= team.maxSize) {
    throw new TeamJoinError("This team is full.");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/hackathon/team-membership.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/team-membership.ts src/server/hackathon/team-membership.test.ts
git commit -m "feat(hackathon): pure assertCanJoinTeam guard"
```

### Task C3: `teamsRouter` — createTeam / joinTeam / leaveTeam / getTeam

**Files:**
- Create: `src/server/api/routers/teams.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the teams router**

```typescript
// src/server/api/routers/teams.ts
//
// Team formation for hackathons (ADR-0029). A team is a grouping over
// enrollments: creating or joining is ONE action that bundles the bound event's
// registration + a challenge enrollment carrying teamId. `unique(userId,
// challengeId)` gives "one team per member per hackathon" for free. eventId and
// maxSize are denormalised onto the team at creation so join/leave touch no
// Payload.

import { z } from "zod";
import { and, eq, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  teams,
  challengeEnrollments,
  eventRegistrations,
  memberProfiles,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { generateTeamJoinCode } from "@/server/hackathon/team-join-code";
import {
  assertCanJoinTeam,
  TeamJoinError,
} from "@/server/hackathon/team-membership";

/** Look up the published hackathon event bound to a challenge, or null. */
async function hackathonEventForChallenge(challengeId: number) {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { challengeId: { equals: String(challengeId) } },
        { type: { equals: "hackathon" } },
        { status: { not_in: ["draft", "rejected", "cancelled"] } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  return docs[0] ?? null;
}

/** Guard: reject if the user already holds a team for this challenge. */
async function assertNotAlreadyOnTeam(
  db: typeof import("@/server/db").db,
  userId: string,
  challengeId: number,
) {
  const existing = await db.query.challengeEnrollments.findFirst({
    where: and(
      eq(challengeEnrollments.userId, userId),
      eq(challengeEnrollments.challengeId, challengeId),
    ),
  });
  if (existing?.teamId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You are already on a team for this hackathon.",
    });
  }
}

/** Bundle: upsert the enrollment (carrying teamId) + the event registration. */
async function bundleJoin(
  tx: Parameters<Parameters<typeof import("@/server/db").db.transaction>[0]>[0],
  args: { userId: string; challengeId: number; eventId: number; teamId: string },
) {
  await tx
    .insert(challengeEnrollments)
    .values({
      userId: args.userId,
      challengeId: args.challengeId,
      teamId: args.teamId,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [challengeEnrollments.userId, challengeEnrollments.challengeId],
      set: { teamId: args.teamId, status: "active" },
    });

  await tx
    .insert(eventRegistrations)
    .values({ userId: args.userId, eventId: args.eventId, status: "registered" })
    .onConflictDoNothing();
}

export const teamsRouter = createTRPCRouter({
  /** Create a team for a hackathon challenge; the caller becomes captain. */
  createTeam: protectedProcedure
    .input(z.object({ challengeId: z.number(), name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const event = await hackathonEventForChallenge(input.challengeId);
      if (!event) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This challenge is not a hackathon (no bound event).",
        });
      }

      const payload = await getPayloadClient();
      const challenge = await payload.findByID({
        collection: "challenges",
        id: input.challengeId,
        depth: 0,
      });
      const maxSize = challenge.teamConfig?.maxTeamSize ?? 5;

      await assertNotAlreadyOnTeam(ctx.db, userId, input.challengeId);

      return ctx.db.transaction(async (tx) => {
        const [team] = await tx
          .insert(teams)
          .values({
            challengeId: input.challengeId,
            eventId: Number(event.id),
            name: input.name,
            captainId: userId,
            joinCode: generateTeamJoinCode(),
            maxSize,
            status: "forming",
          })
          .returning();

        if (!team) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create team",
          });
        }

        await bundleJoin(tx, {
          userId,
          challengeId: input.challengeId,
          eventId: Number(event.id),
          teamId: team.id,
        });

        return team;
      });
    }),

  /** Join an existing forming team by its share code. */
  joinTeam: protectedProcedure
    .input(z.object({ joinCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.joinCode, input.joinCode))
        .limit(1);
      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }

      await assertNotAlreadyOnTeam(ctx.db, userId, team.challengeId);

      const [{ value: currentSize }] = await ctx.db
        .select({ value: count() })
        .from(challengeEnrollments)
        .where(eq(challengeEnrollments.teamId, team.id));

      try {
        assertCanJoinTeam({
          status: team.status,
          currentSize: Number(currentSize),
          maxSize: team.maxSize,
        });
      } catch (e) {
        if (e instanceof TeamJoinError) {
          throw new TRPCError({ code: "CONFLICT", message: e.message });
        }
        throw e;
      }

      await ctx.db.transaction(async (tx) => {
        await bundleJoin(tx, {
          userId,
          challengeId: team.challengeId,
          eventId: team.eventId,
          teamId: team.id,
        });
      });

      return team;
    }),

  /** Leave a forming team. The captain must disband instead. */
  leaveTeam: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.id, input.teamId))
        .limit(1);
      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }
      if (team.status !== "forming") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "The roster is locked; you cannot leave now.",
        });
      }
      if (team.captainId === userId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "The captain must disband the team rather than leave.",
        });
      }

      await ctx.db
        .update(challengeEnrollments)
        .set({ teamId: null })
        .where(
          and(
            eq(challengeEnrollments.userId, userId),
            eq(challengeEnrollments.teamId, input.teamId),
          ),
        );

      return { left: true };
    }),

  /** Read a team and its members (members + captain; respects nothing public — participant view). */
  getTeam: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.id, input.teamId))
        .limit(1);
      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }

      const members = await ctx.db
        .select({
          userId: challengeEnrollments.userId,
          displayName: memberProfiles.displayName,
        })
        .from(challengeEnrollments)
        .innerJoin(
          memberProfiles,
          eq(memberProfiles.userId, challengeEnrollments.userId),
        )
        .where(eq(challengeEnrollments.teamId, team.id));

      return { team, members };
    }),
});
```

- [ ] **Step 2: Register the router**

In `src/server/api/root.ts`, add the import:

```typescript
import { teamsRouter } from "@/server/api/routers/teams";
```

And add to the router object:

```typescript
  teams: teamsRouter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no type errors. (If `challenge.teamConfig` types as possibly-undefined, the `?? 5` fallback already handles it.)

- [ ] **Step 4: Manual verification (Payload-backed)**

With a bound hackathon (from Task B2), call `teams.createTeam({ challengeId, name: "Falcon" })` → returns a team with a `joinCode`, `status: "forming"`; your `challenge_enrollment` now has `teamId` set and an `event_registration` exists. As a second user, `teams.joinTeam({ joinCode })` succeeds; a third attempt after `maxSize` is reached returns `CONFLICT "full"`. `createTeam` on a non-hackathon challenge returns `BAD_REQUEST`.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/teams.ts src/server/api/root.ts
git commit -m "feat(hackathon): teams router — create/join/leave/get (ADR-0029)"
```

---

## Phase D — Per-team competitive grid instantiation

### Task D1: Pure `cellTemplateToInserts()` (TDD)

**Files:**
- Create: `src/server/hackathon/cell-template.ts`
- Test: `src/server/hackathon/cell-template.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/hackathon/cell-template.test.ts
import { describe, it, expect } from "vitest";
import { cellTemplateToInserts, cellTemplateSchema } from "./cell-template";

describe("cellTemplateSchema", () => {
  it("accepts a valid template entry", () => {
    expect(
      cellTemplateSchema.parse([
        { description: "Solve part A", taskType: "solve-code-cell", verificationMode: "test", deadlineMinutes: 30 },
      ]),
    ).toHaveLength(1);
  });

  it("rejects an unknown verificationMode", () => {
    expect(() =>
      cellTemplateSchema.parse([
        { description: "x", taskType: "t", verificationMode: "vibes", deadlineMinutes: 30 },
      ]),
    ).toThrow();
  });
});

describe("cellTemplateToInserts", () => {
  it("maps each template entry to a pending cell insert for the grid", () => {
    const inserts = cellTemplateToInserts(
      [
        { description: "A", taskType: "solve-code-cell", verificationMode: "test", deadlineMinutes: 30 },
        { description: "B", taskType: "polish-text", verificationMode: "self-report", deadlineMinutes: 60 },
      ],
      "grid-123",
    );
    expect(inserts).toEqual([
      { gridId: "grid-123", taskType: "solve-code-cell", verificationMode: "test", status: "pending", deadlineMinutes: 30 },
      { gridId: "grid-123", taskType: "polish-text", verificationMode: "self-report", status: "pending", deadlineMinutes: 60 },
    ]);
  });

  it("returns an empty array for an empty template", () => {
    expect(cellTemplateToInserts([], "grid-1")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/hackathon/cell-template.test.ts`
Expected: FAIL — `Cannot find module './cell-template'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/hackathon/cell-template.ts
//
// The hackathon cell decomposition (ADR-0029/0023). The sponsor hand-authors a
// cellTemplate[] on the challenge; at roster lock it is cloned into one pending
// cell per entry for each team's competitive grid. Db-free + Payload-free so the
// mapping can be unit-tested in isolation.

import { z } from "zod";

export const cellTemplateSchema = z.array(
  z.object({
    description: z.string(),
    taskType: z.string(),
    verificationMode: z.enum([
      "platform-action",
      "test",
      "self-report",
      "peer-review",
      "consensus",
    ]),
    deadlineMinutes: z.number().int().positive(),
  }),
);

export type CellTemplate = z.infer<typeof cellTemplateSchema>;

export interface CellInsert {
  gridId: string;
  taskType: string;
  verificationMode: CellTemplate[number]["verificationMode"];
  status: "pending";
  deadlineMinutes: number;
}

export function cellTemplateToInserts(
  template: CellTemplate,
  gridId: string,
): CellInsert[] {
  return template.map((c) => ({
    gridId,
    taskType: c.taskType,
    verificationMode: c.verificationMode,
    status: "pending",
    deadlineMinutes: c.deadlineMinutes,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/hackathon/cell-template.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/cell-template.ts src/server/hackathon/cell-template.test.ts
git commit -m "feat(hackathon): pure cellTemplate schema + cell-insert mapping"
```

### Task D2: `hackathon.lockRosters` — instantiate one competitive grid per team

**Files:**
- Modify: `src/server/api/routers/hackathon.ts`

- [ ] **Step 1: Add `lockRosters` to the hackathon router**

In `src/server/api/routers/hackathon.ts`, extend the imports:

```typescript
import { and, eq } from "drizzle-orm";
import { teams, workGrids, workCells } from "@/server/db/schema";
import { cellTemplateSchema, cellTemplateToInserts } from "@/server/hackathon/cell-template";
```

Add this procedure to the `createTRPCRouter({ ... })` object (after `bindChallenge`):

```typescript
  /**
   * Lock all forming teams and instantiate one competitive grid per team from
   * the challenge's cellTemplate (ADR-0029). Idempotent: teams already locked
   * are skipped. Sponsor-scoped. (Wiring this to a cron at the event start time
   * is a deferred follow-up; for now an admin triggers it.)
   */
  lockRosters: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const challenge = await requireChallengeSponsor(input.challengeId, userId);

      const template = cellTemplateSchema.parse(challenge.cellTemplate ?? []);

      const forming = await ctx.db
        .select()
        .from(teams)
        .where(
          and(
            eq(teams.challengeId, input.challengeId),
            eq(teams.status, "forming"),
          ),
        );

      const created: { teamId: string; gridId: string; cellCount: number }[] = [];

      for (const team of forming) {
        await ctx.db.transaction(async (tx) => {
          const [locked] = await tx
            .update(teams)
            .set({ status: "locked" })
            .where(and(eq(teams.id, team.id), eq(teams.status, "forming")))
            .returning();
          if (!locked) return; // raced — another lock won

          const [grid] = await tx
            .insert(workGrids)
            .values({
              mode: "competitive",
              status: "active",
              challengeId: input.challengeId,
              communityId: null,
              teamId: team.id,
            })
            .returning();
          if (!grid) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to create competitive grid",
            });
          }

          const inserts = cellTemplateToInserts(template, grid.id);
          if (inserts.length > 0) {
            await tx.insert(workCells).values(inserts);
          }

          created.push({
            teamId: team.id,
            gridId: grid.id,
            cellCount: inserts.length,
          });
        });
      }

      return { lockedTeams: created.length, grids: created };
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Manual verification (Payload-backed)**

With a hackathon that has a `cellTemplate` and two forming teams, call `hackathon.lockRosters({ challengeId })`. Confirm: both teams flip to `locked`; two competitive `work_grid` rows exist (`mode: "competitive"`, matching `teamId`, `challengeId` set, `communityId` null); each grid has one `work_cell` per template entry, all `status: "pending"`, `deadline` null. Calling it a second time returns `lockedTeams: 0` (idempotent).

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): lockRosters instantiates one competitive grid per team (ADR-0029)"
```

---

## Phase E — The competitive claim predicate

This is the marquee change and the one with full DB-integration coverage. The work-grid claim path currently hard-codes `mode = "collaborative"`. We extend it so a competitive cell is claimable **only** by an agent whose owner is on that grid's team — challenge enrollment alone is not enough (that would let any enrolled member raid a rival team's grid).

### Task E1: Add `ownerOnTeam` and extend `listClaimable` + `claimCell`

**Files:**
- Modify: `src/server/api/routers/work-grid.ts`

- [ ] **Step 1: Add the `ownerOnTeam` helper**

In `src/server/api/routers/work-grid.ts`, add `teams` to the schema import:

```typescript
import {
  workGrids,
  workCells,
  workCellResults,
  agentCommissions,
  communityMemberships,
  challengeEnrollments,
  teams,
} from "@/server/db/schema";
```

(Keep `teams` even though only the enrollment is queried — it documents intent and is needed if a later check reads the team row. If the linter flags it as unused, drop it.)

Add this helper next to `ownerEnrolledInChallenge` (~line 128):

```typescript
// Competitive source scope (ADR-0029): an owner is "on" a team iff they hold an
// active enrollment carrying that teamId. Team membership ⊂ challenge enrollment,
// so this is strictly tighter than the challenge source-scope check — a
// competitive cell is claimable only by the grid's own team, never by any other
// member enrolled in the same hackathon challenge.
async function ownerOnTeam(
  db: typeof import("@/server/db").db,
  ownerId: string,
  teamId: string,
) {
  const enrollment = await db.query.challengeEnrollments.findFirst({
    where: and(
      eq(challengeEnrollments.userId, ownerId),
      eq(challengeEnrollments.teamId, teamId),
      eq(challengeEnrollments.status, "active"),
    ),
  });
  return enrollment !== undefined;
}
```

- [ ] **Step 2: Extend `listClaimable`**

Replace the `conditions` array's mode filter and the select + post-filter. Specifically:

Change the first condition from:

```typescript
      eq(workGrids.mode, "collaborative"),
```

to:

```typescript
      inArray(workGrids.mode, ["collaborative", "competitive"]),
```

Change the `.select({ ... })` to also pull mode and teamId:

```typescript
      .select({
        cell: workCells,
        gridMode: workGrids.mode,
        gridTeamId: workGrids.teamId,
        gridChallengeId: workGrids.challengeId,
        gridCommunityId: workGrids.communityId,
      })
```

After the existing `enrolledChallengeIds` / `memberCommunityIds` resolution block (just before the final `return rows.filter(...)`), insert the team-membership resolution:

```typescript
    // Competitive cells (ADR-0029) are claimable only by the grid's own team.
    const teamIds = [
      ...new Set(
        rows
          .filter((r) => r.gridMode === "competitive")
          .map((r) => r.gridTeamId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const memberTeamIds = new Set<string>();
    await Promise.all(
      teamIds.map(async (teamId) => {
        if (await ownerOnTeam(ctx.db, commission.ownerId, teamId)) {
          memberTeamIds.add(teamId);
        }
      }),
    );
```

Replace the final `return rows.filter(...)` with a mode-aware filter:

```typescript
    return rows
      .filter((r) => {
        if (r.gridMode === "competitive") {
          return r.gridTeamId !== null && memberTeamIds.has(r.gridTeamId);
        }
        return (
          (r.gridChallengeId !== null &&
            enrolledChallengeIds.has(r.gridChallengeId)) ||
          (r.gridCommunityId !== null &&
            memberCommunityIds.has(r.gridCommunityId))
        );
      })
      .map((r) => r.cell);
```

- [ ] **Step 3: Extend `claimCell`**

In `claimCell`, change the select to pull `teamId`:

```typescript
      .select({
        cell: workCells,
        gridMode: workGrids.mode,
        gridStatus: workGrids.status,
        gridTeamId: workGrids.teamId,
        gridChallengeId: workGrids.challengeId,
        gridCommunityId: workGrids.communityId,
      })
```

Replace the grid-eligibility guard:

```typescript
    if (row.gridMode !== "collaborative" || row.gridStatus !== "active") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Grid is not an active collaborative grid",
      });
    }
```

with:

```typescript
    if (row.gridStatus !== "active") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Grid is not active",
      });
    }
    if (row.gridMode !== "collaborative" && row.gridMode !== "competitive") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Grid mode is not claimable",
      });
    }
```

Then, in the source-scope block, branch on competitive **before** the existing challenge/community branch. Replace:

```typescript
    if (row.gridChallengeId !== null) {
```

with:

```typescript
    if (row.gridMode === "competitive") {
      // Competitive grids (ADR-0029): claimable ONLY by the grid's own team —
      // challenge enrollment alone is not enough, or a rival could raid the grid.
      if (row.gridTeamId === null) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Competitive grid has no team scope",
        });
      }
      if (!(await ownerOnTeam(ctx.db, commission.ownerId, row.gridTeamId))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this grid's team",
        });
      }
    } else if (row.gridChallengeId !== null) {
```

(The rest of the existing `else if (row.gridCommunityId !== null)` / final `else` chain is unchanged.)

- [ ] **Step 4: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/work-grid.ts
git commit -m "feat(hackathon): competitive claim predicate — owner must be on the grid's team (ADR-0029)"
```

### Task E2: Integration test — competitive claim flow (DB-only)

The claim path reads `challengeId` only as an integer and never calls Payload, so the whole competitive flow can be seeded with plain Drizzle inserts and a fake challenge id — no Payload needed.

**Files:**
- Modify: `src/server/api/routers/work-grid.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Inside the existing `describe.skipIf(!RUN_DB)( "work-grid collaborative flow [DB integration]", () => { ... })` block, add a new test. It reuses the per-test fixture `fx` (owner/agent/apiKey/commission already seeded) and additionally seeds a second owner who is enrolled in the same challenge but **not** on the team.

```typescript
    it("competitive cell is claimable only by an agent whose owner is on the team", async () => {
      const { db, schema, eq } = m;
      const challengeId = 990000 + Math.floor(Math.random() * 9000); // fake Payload id; claim path treats it as an int

      // Grant fx's commission for the competitive task type.
      const ownerCall = ownerCaller(fx.ownerId);
      await ownerCall.commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });

      // Team owned by fx.ownerId, locked. fx.ownerId is enrolled WITH the teamId.
      const [team] = await db
        .insert(schema.teams)
        .values({
          challengeId,
          eventId: 12345,
          name: "Falcon",
          captainId: fx.ownerId,
          joinCode: `TEAM-${fx.suffix.slice(-8).toUpperCase()}`,
          maxSize: 5,
          status: "locked",
        })
        .returning();

      await db.insert(schema.challengeEnrollments).values({
        userId: fx.ownerId,
        challengeId,
        teamId: team!.id,
        status: "active",
      });

      // A competitive grid for that team + one pending cell.
      const [grid] = await db
        .insert(schema.workGrids)
        .values({
          mode: "competitive",
          status: "active",
          challengeId,
          communityId: null,
          teamId: team!.id,
        })
        .returning();
      const [cell] = await db
        .insert(schema.workCells)
        .values({
          gridId: grid!.id,
          taskType: fx.taskType,
          verificationMode: "test",
          status: "pending",
          deadlineMinutes: 30,
        })
        .returning();

      // fx's agent (owner is on the team) CAN see + claim the cell.
      const agentCall = agentCaller(fx.apiKeyRaw);
      const claimable = await agentCall.workGrid.listClaimable({ gridId: grid!.id });
      expect(claimable.map((c) => c.id)).toContain(cell!.id);

      const claimed = await agentCall.workGrid.claimCell({ cellId: cell!.id });
      expect(claimed.status).toBe("claimed");

      // Cleanup of the fake-challenge rows this test created (fx teardown only
      // cleans the community-scoped grid).
      await db.delete(schema.workCells).where(eq(schema.workCells.gridId, grid!.id));
      await db.delete(schema.workGrids).where(eq(schema.workGrids.id, grid!.id));
      await db
        .delete(schema.challengeEnrollments)
        .where(eq(schema.challengeEnrollments.challengeId, challengeId));
      await db.delete(schema.teams).where(eq(schema.teams.id, team!.id));
    });
```

- [ ] **Step 2: Run the test to verify it passes**

Ensure a local DB is configured, then run:

Run: `RUN_DB_TESTS=1 pnpm vitest run src/server/api/routers/work-grid.integration.test.ts`
Expected: the new test PASSES (along with the existing collaborative tests). If `RUN_DB_TESTS` is unset the suite is skipped — set it and a local Postgres/Neon-local proxy must be running (see `isLocalDbConfigured`).

> Note: this is the green step for an already-implemented predicate (Task E1), so it should pass immediately. If it fails, the predicate logic in E1 is wrong — fix E1, not the test.

- [ ] **Step 3: Add the negative case (a non-team enrollee cannot claim)**

Add a second test directly below:

```typescript
    it("competitive cell is NOT claimable by an agent whose owner is enrolled but not on the team", async () => {
      const { db, schema, eq, generateApiKey } = m;
      const challengeId = 980000 + Math.floor(Math.random() * 9000);

      // A SECOND owner + agent, enrolled in the same challenge but teamId = null.
      const outsiderId = `it-outsider-${fx.suffix}`;
      const outsiderAgentId = `it-outsider-agent-${fx.suffix}`;
      await db.insert(schema.user).values({
        id: outsiderId,
        email: `it-outsider-${fx.suffix}@example.test`,
        name: "Outsider",
      });
      await db.insert(schema.memberProfiles).values({
        userId: outsiderId,
        displayName: "Outsider",
        xp: 0,
        level: 1,
      });
      await db.insert(schema.agentProfiles).values({
        id: outsiderAgentId,
        ownerId: outsiderId,
        name: "Outsider Agent",
        status: "active",
      });
      const { raw, hash, prefix } = generateApiKey();
      await db.insert(schema.agentApiKeys).values({
        agentId: outsiderAgentId,
        ownerId: outsiderId,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: ["read", "self-profile", "commission:claim-cell", "commission:submit-result"],
        isActive: true,
      });
      await db.insert(schema.agentManifestAcceptances).values({
        ownerId: outsiderId,
        agentId: outsiderAgentId,
        manifestVersion: m.MANIFEST_VERSION,
      });
      await ownerCaller(outsiderId).commissions.grant({
        taskTypeAllowlist: [fx.taskType],
        sourceScope: "enrolled-challenges",
      });

      // Team owned by fx.ownerId; outsider is enrolled in the challenge with NO team.
      const [team] = await db
        .insert(schema.teams)
        .values({
          challengeId,
          eventId: 12345,
          name: "Hawk",
          captainId: fx.ownerId,
          joinCode: `TEAM-O${fx.suffix.slice(-7).toUpperCase()}`,
          maxSize: 5,
          status: "locked",
        })
        .returning();
      await db.insert(schema.challengeEnrollments).values({
        userId: outsiderId,
        challengeId,
        teamId: null,
        status: "active",
      });

      const [grid] = await db
        .insert(schema.workGrids)
        .values({ mode: "competitive", status: "active", challengeId, communityId: null, teamId: team!.id })
        .returning();
      const [cell] = await db
        .insert(schema.workCells)
        .values({ gridId: grid!.id, taskType: fx.taskType, verificationMode: "test", status: "pending", deadlineMinutes: 30 })
        .returning();

      const outsiderCall = agentCaller(raw);
      const claimable = await outsiderCall.workGrid.listClaimable({ gridId: grid!.id });
      expect(claimable.map((c) => c.id)).not.toContain(cell!.id);

      await expect(outsiderCall.workGrid.claimCell({ cellId: cell!.id })).rejects.toThrow(
        /not a member of this grid's team/i,
      );

      // Cleanup
      await db.delete(schema.workCells).where(eq(schema.workCells.gridId, grid!.id));
      await db.delete(schema.workGrids).where(eq(schema.workGrids.id, grid!.id));
      await db.delete(schema.challengeEnrollments).where(eq(schema.challengeEnrollments.challengeId, challengeId));
      await db.delete(schema.teams).where(eq(schema.teams.id, team!.id));
      await db.delete(schema.agentApiKeys).where(eq(schema.agentApiKeys.agentId, outsiderAgentId));
      await db.delete(schema.agentManifestAcceptances).where(eq(schema.agentManifestAcceptances.agentId, outsiderAgentId));
      await db.delete(schema.agentCommissions).where(eq(schema.agentCommissions.ownerId, outsiderId));
      await db.delete(schema.agentProfiles).where(eq(schema.agentProfiles.id, outsiderAgentId));
      await db.delete(schema.memberProfiles).where(eq(schema.memberProfiles.userId, outsiderId));
      await db.delete(schema.user).where(eq(schema.user.id, outsiderId));
    });
```

- [ ] **Step 4: Run both integration tests**

Run: `RUN_DB_TESTS=1 pnpm vitest run src/server/api/routers/work-grid.integration.test.ts`
Expected: both new tests PASS; existing collaborative tests still PASS.

- [ ] **Step 5: Run the full unit suite (no DB) to confirm nothing else broke**

Run: `pnpm vitest run`
Expected: all pass (the DB integration suite auto-skips without `RUN_DB_TESTS`).

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/work-grid.integration.test.ts
git commit -m "test(hackathon): competitive claim predicate — team-only claim, rival rejected"
```

---

## Self-Review

**Spec coverage** (against the Plan-1 scope):
- Schema (team, `enrollment.teamId`, `events.challengeId`, `work_grid.teamId`, `cellTemplate[]`, `teamConfig`) → Tasks A1, A2. ✓
- Event↔Challenge binding + communityId invariant + binding-as-discriminator → Tasks B1, B2 (and `hackathonEventForChallenge` enforces the discriminator in C3/D2). ✓
- Team formation (captain, join code, one-team-per-member, solo allowed via `minTeamSize` default 1, bundle enroll+register) → Tasks C1–C3. ✓
- Roster lock + one competitive grid per team from the template → Tasks D1, D2. ✓
- Competitive claim predicate (owner ∈ team, rival rejected) → Tasks E1, E2. ✓

**Deferred-correctly (NOT in this plan):** submission/finalize/judging/leaderboard/prizes, the `isPublic` leaderboard fix, spectator view, UI, cron-at-event-start auto-lock, orchestrator cell. ✓

**Placeholder scan:** every code step contains complete code; every test step contains full test code; every command step has an exact command + expected result. ✓

**Type consistency:** `team.status` is `"forming" | "locked" | "disbanded"` across the table (A1), `assertCanJoinTeam` (C2), `teamsRouter` (C3), and `lockRosters` (D2). `workGrids.mode` gains `"competitive"` use in E1, matching the existing `$type<"collaborative" | "competitive">()` (already declared in the schema — no change needed). `cellTemplateToInserts` returns `status: "pending"` matching `workCells.status` (`"pending"` literal used in `createCollaborativeGrid`). `ownerOnTeam(db, ownerId, teamId)` signature matches both call sites in E1. ✓

**Known testing caveat (called out, not hidden):** `createTeam` / `bindChallenge` / `lockRosters` read or write Payload, which the current `RUN_DB_TESTS` harness does not seed; their Payload shells get **manual verification** steps (B2.4, C3.4, D2.3), while all pure logic (B1, C1, C2, D1) and the competitive claim DB path (E2) are automated. Adding a Payload-backed integration harness is a possible follow-up but is out of scope here.

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

After Plan 1 lands, Plan 2 (judging & rewards) and Plan 3 (spectator view + UI) follow.
