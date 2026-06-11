# Hackathon Participant Workspace — Backend Foundation (Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend that lets a hackathon team member view, assign, claim, and report their team's work cells as a peer to commissioned agents, plus the activity/presence/heatmap data the workspace UI (Plan 5) and dashboard (Plan 6) will render.

**Architecture:** Humans and agents are peers on the same competitive work grid. Cells gain nullable `assignedToUserId` / `claimedByUserId`; results gain a nullable `userId` (a cell is claimed/authored by an agent **or** a user, never both). A new `teamWorkspace` tRPC router exposes member-gated reads/mutations; organizer verification (`verifyCellResult`) and `finalizeHackathon` scoring are unchanged because they count *verified results* regardless of author. Two new tables (`teamActivityEvents`, `teamPresence`) back the feed and presence strip. Reads/mutations are gated by team membership via a shared `ownerOnTeam` helper extracted from `work-grid.ts`.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres, `app` schema), tRPC, Zod, Vitest. Migrations are hand-written Payload `@payloadcms/db-postgres` DDL applied via `pnpm db:apply` (drizzle is vestigial — never `db:push`). Pure logic is unit-tested db-free; full flows use the `RUN_DB_TESTS=1`-gated integration harness.

**Spec:** `docs/superpowers/specs/2026-06-10-hackathon-participant-workspace-design.md`

---

## File structure

**Create:**
- `src/server/hackathon/cell-state.ts` — pure mapping `status (+ verified flag) → heatmap state` and the agent-XOR-user invariant checker.
- `src/server/hackathon/cell-state.test.ts` — unit tests for the above.
- `src/server/api/routers/team-workspace.ts` — the member-gated workspace router.
- `src/server/api/routers/team-workspace.integration.test.ts` — gated end-to-end test (assign → claim → report → verify → heatmap/activity).
- `src/migrations/20260610a_participant_workspace.ts` — DDL: new cell/result columns, `team_activity_event`, `team_presence`.

**Modify:**
- `src/server/db/schema.ts` — add columns to `workCells` / `workCellResults`; add `teamActivityEvents` + `teamPresence` tables and relations.
- `src/server/hackathon/team-membership.ts` — add the shared `ownerOnTeam(db, userId, teamId)` helper.
- `src/server/api/routers/work-grid.ts` — import `ownerOnTeam` from the shared module (delete the local copy); also clear `claimedByUserId` in `requeueExpiredCells`.
- `src/migrations/index.ts` — register the new migration.
- `src/server/api/root.ts` — register `teamWorkspaceRouter` as `teamWorkspace`.

---

## Task 1: Pure cell-state helper + invariant

**Files:**
- Create: `src/server/hackathon/cell-state.ts`
- Test: `src/server/hackathon/cell-state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/hackathon/cell-state.test.ts
import { describe, it, expect } from "vitest";
import { cellHeatState, assertSingleClaimant } from "./cell-state";

describe("cellHeatState", () => {
  it("maps a pending cell to 'pending'", () => {
    expect(cellHeatState("pending", null)).toBe("pending");
  });
  it("maps requeued to 'pending' (back in the queue)", () => {
    expect(cellHeatState("requeued", null)).toBe("pending");
  });
  it("maps claimed to 'claimed'", () => {
    expect(cellHeatState("claimed", null)).toBe("claimed");
  });
  it("maps completed with a pending result to 'completed'", () => {
    expect(cellHeatState("completed", "pending")).toBe("completed");
  });
  it("maps completed with a verified result to 'verified'", () => {
    expect(cellHeatState("completed", "verified")).toBe("verified");
  });
  it("maps failed to 'failed'", () => {
    expect(cellHeatState("failed", "failed")).toBe("failed");
  });
});

describe("assertSingleClaimant", () => {
  it("allows an agent-only claimant", () => {
    expect(() => assertSingleClaimant("agent-1", null)).not.toThrow();
  });
  it("allows a user-only claimant", () => {
    expect(() => assertSingleClaimant(null, "user-1")).not.toThrow();
  });
  it("allows an unclaimed cell", () => {
    expect(() => assertSingleClaimant(null, null)).not.toThrow();
  });
  it("rejects a cell claimed by both an agent and a user", () => {
    expect(() => assertSingleClaimant("agent-1", "user-1")).toThrow(
      /both an agent and a user/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/server/hackathon/cell-state.test.ts`
Expected: FAIL — `Cannot find module './cell-state'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/server/hackathon/cell-state.ts
// Pure helpers for the participant workspace (Plan 4). Db-free so they unit-test
// without a database. `cellHeatState` is the single source of truth for the
// heatmap colour buckets shared by the workspace (full content) and the
// spectator dashboard (content-free) — see ADR-0030.

export type CellStatus =
  | "pending"
  | "claimed"
  | "completed"
  | "failed"
  | "requeued";

export type VerificationOutcome = "pending" | "verified" | "failed";

export type HeatState =
  | "pending"
  | "claimed"
  | "completed"
  | "verified"
  | "failed";

/**
 * Collapse a cell's (status, latest verification outcome) into the heatmap
 * bucket. A `completed` cell is "awaiting verification" until its result is
 * verified; a verified result is the dark-green terminal state. `requeued`
 * folds back to `pending` (it is claimable again).
 */
export function cellHeatState(
  status: CellStatus,
  verificationOutcome: VerificationOutcome | null,
): HeatState {
  switch (status) {
    case "pending":
    case "requeued":
      return "pending";
    case "claimed":
      return "claimed";
    case "failed":
      return "failed";
    case "completed":
      return verificationOutcome === "verified" ? "verified" : "completed";
  }
}

/**
 * Enforce the design invariant: a cell is claimed by an agent OR a user, never
 * both. Throws a plain Error (callers map to TRPCError) when both are set.
 */
export function assertSingleClaimant(
  claimedByAgentId: string | null,
  claimedByUserId: string | null,
): void {
  if (claimedByAgentId !== null && claimedByUserId !== null) {
    throw new Error(
      "A cell cannot be claimed by both an agent and a user.",
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/server/hackathon/cell-state.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/cell-state.ts src/server/hackathon/cell-state.test.ts
git commit -m "feat(hackathon): pure cell heat-state + single-claimant invariant (Plan 4)"
```

---

## Task 2: Schema — cell/result columns + activity & presence tables

**Files:**
- Modify: `src/server/db/schema.ts` (workCells ~1611-1655; workCellResults; add two tables near `teams` ~1556)

- [ ] **Step 1: Add the new columns to `workCells`**

In `src/server/db/schema.ts`, inside the `workCells` table definition, immediately after the existing `claimedBy` line (`claimedBy: d.varchar({ length: 255 }).references(() => agentProfiles.id),`) add:

```typescript
    // Plan 4: a human team member can claim a cell as a peer to a commissioned
    // agent. A cell is claimed by an agent (claimedBy) OR a user
    // (claimedByUserId), never both (assertSingleClaimant). assignedToUserId is
    // a soft planning layer (who the team intends to do it) with no lock.
    claimedByUserId: d.varchar({ length: 255 }).references(() => user.id),
    assignedToUserId: d.varchar({ length: 255 }).references(() => user.id),
```

- [ ] **Step 2: Make `workCellResults.agentId` nullable and add `userId`**

Find the `workCellResults` table definition in `src/server/db/schema.ts`. Change the `agentId` column so it is no longer `.notNull()` and add a `userId` column. The author is an agent OR a user:

```typescript
    // Plan 4: a result is authored by an agent (agentId) OR a human team member
    // (userId), never both. agentId is now nullable for human-authored results.
    agentId: d.varchar({ length: 255 }).references(() => agentProfiles.id),
    userId: d.varchar({ length: 255 }).references(() => user.id),
```

Then change the table's uniqueness so a human result never collides on a null `agentId`. Replace the existing `uniqueIndex(...).on(t.cellId, t.agentId)` (the "one result per agent per cell" index) with a single result per cell — competitive grids are single-claimer and `finalizeHackathon` already dedupes by cellId:

```typescript
    uniqueIndex("work_cell_result_cell_uidx").on(t.cellId),
```

- [ ] **Step 3: Add the `teamActivityEvents` and `teamPresence` tables**

In `src/server/db/schema.ts`, immediately after `teamsRelations` (~line 1564), add:

```typescript
// Append-only activity log for a team workspace (Plan 4). One row per workspace
// action; powers the feed. The actor is a user (actorUserId) OR an agent
// (actorAgentId) — agent actions show in the feed even though agents are not
// shown as "present".
export const teamActivityEvents = appSchema.table(
  "team_activity_event",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    teamId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => teams.id),
    cellId: d.varchar({ length: 255 }).references(() => workCells.id),
    actorUserId: d.varchar({ length: 255 }).references(() => user.id),
    actorAgentId: d.varchar({ length: 255 }).references(() => agentProfiles.id),
    type: d
      .varchar({ length: 20 })
      .notNull()
      .$type<"assigned" | "claimed" | "reported" | "verified" | "failed">(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("team_activity_team_idx").on(t.teamId),
    index("team_activity_created_idx").on(t.createdAt),
  ],
);

// Per-member presence heartbeat for a team workspace (Plan 4). One row per
// (team, user); upserted by the heartbeat mutation. "Online" is derived at read
// time from lastSeenAt (no stored online flag).
export const teamPresence = appSchema.table(
  "team_presence",
  (d) => ({
    teamId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => teams.id),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    lastSeenAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    index("team_presence_team_idx").on(t.teamId),
  ],
);
```

- [ ] **Step 4: Ensure `primaryKey` is imported**

At the top of `src/server/db/schema.ts`, confirm `primaryKey` is in the `drizzle-orm/pg-core` import list (alongside `index`, `uniqueIndex`). If absent, add it.

Run: `grep -n "primaryKey" src/server/db/schema.ts`
Expected: a match in the import list. If not, add `primaryKey` to the import.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors from the schema changes).

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(hackathon): cell human-claim columns + activity/presence tables (Plan 4)"
```

---

## Task 3: Migration DDL

**Files:**
- Create: `src/migrations/20260610a_participant_workspace.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Write the migration**

```typescript
// src/migrations/20260610a_participant_workspace.ts
// Plan 4 (participant workspace): humans become peers to agents on a competitive
// work grid. Adds claimed_by_user_id + assigned_to_user_id to work_cell; adds
// user_id to work_cell_result and makes agent_id nullable; swaps the
// (cell_id, agent_id) result uniqueness for one-result-per-cell; and creates the
// team_activity_event + team_presence tables. DDL mirrors the Drizzle defs in
// src/server/db/schema.ts. Idempotent (IF [NOT] EXISTS) so payload migrate
// reconciles it as a safe no-op against an already-migrated DB.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // work_cell: human claim + soft assignment columns.
  await db.execute(sql`
    ALTER TABLE "app"."work_cell"
      ADD COLUMN IF NOT EXISTS "claimed_by_user_id" varchar(255) REFERENCES "app"."user"("id"),
      ADD COLUMN IF NOT EXISTS "assigned_to_user_id" varchar(255) REFERENCES "app"."user"("id");
  `);

  // work_cell_result: human-authored results. agent_id becomes nullable; add
  // user_id; replace the per-agent uniqueness with one result per cell.
  await db.execute(sql`
    ALTER TABLE "app"."work_cell_result"
      ALTER COLUMN "agent_id" DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS "user_id" varchar(255) REFERENCES "app"."user"("id");
    DROP INDEX IF EXISTS "app"."work_cell_result_cell_id_agent_id_index";
    CREATE UNIQUE INDEX IF NOT EXISTS "work_cell_result_cell_uidx"
      ON "app"."work_cell_result" ("cell_id");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."team_activity_event" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "team_id" varchar(255) NOT NULL REFERENCES "app"."team"("id"),
      "cell_id" varchar(255) REFERENCES "app"."work_cell"("id"),
      "actor_user_id" varchar(255) REFERENCES "app"."user"("id"),
      "actor_agent_id" varchar(255) REFERENCES "app"."agent_profile"("id"),
      "type" varchar(20) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "team_activity_team_idx" ON "app"."team_activity_event" ("team_id");
    CREATE INDEX IF NOT EXISTS "team_activity_created_idx" ON "app"."team_activity_event" ("created_at");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."team_presence" (
      "team_id" varchar(255) NOT NULL REFERENCES "app"."team"("id"),
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "last_seen_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY ("team_id", "user_id")
    );
    CREATE INDEX IF NOT EXISTS "team_presence_team_idx" ON "app"."team_presence" ("team_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."team_presence";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."team_activity_event";`);
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."work_cell_result_cell_uidx";
    ALTER TABLE "app"."work_cell_result" DROP COLUMN IF EXISTS "user_id";
  `);
  await db.execute(sql`
    ALTER TABLE "app"."work_cell"
      DROP COLUMN IF EXISTS "assigned_to_user_id",
      DROP COLUMN IF EXISTS "claimed_by_user_id";
  `);
}
```

> **Note on the dropped index name:** `work_cell_result_cell_id_agent_id_index` is the default name Drizzle/Payload generates for `uniqueIndex().on(cellId, agentId)`. Before relying on it, confirm the actual name in the DB with `\d "app"."work_cell_result"` (psql) or by checking the migration that created it under `src/migrations/`. The `DROP INDEX IF EXISTS` is a no-op if the name differs — adjust the literal to the real name so the swap actually happens.

- [ ] **Step 2: Register the migration**

In `src/migrations/index.ts`, add the import and the entry following the existing pattern (match how `20260609d_*` is registered — same alphabetical/array ordering).

Run: `grep -n "20260609d" src/migrations/index.ts`
Expected: shows the import line and the array/object entry format to mirror. Add the `20260610a_participant_workspace` entry the same way, after the `20260609d` entry.

- [ ] **Step 3: Verify the migration name resolves**

Run: `grep -n "20260610a_participant_workspace" src/migrations/index.ts`
Expected: matches in both the import and the registry list.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Apply locally (optional — requires the local Docker DB up)**

Run: `pnpm db:apply`
Expected: applies `20260610a_participant_workspace` and reports success. Skip if no local DB is running; the migration is idempotent and will apply on the next environment that runs it.

- [ ] **Step 6: Commit**

```bash
git add src/migrations/20260610a_participant_workspace.ts src/migrations/index.ts
git commit -m "feat(hackathon): migration for human claim columns + activity/presence (Plan 4)"
```

---

## Task 4: Extract `ownerOnTeam` to the shared module

**Files:**
- Modify: `src/server/hackathon/team-membership.ts` (add the helper)
- Modify: `src/server/api/routers/work-grid.ts` (import it; delete the local copy)

- [ ] **Step 1: Add `ownerOnTeam` to `team-membership.ts`**

Append to `src/server/hackathon/team-membership.ts`:

```typescript
import { and, eq } from "drizzle-orm";
import { challengeEnrollments } from "@/server/db/schema";
import type { db as Db } from "@/server/db";

/**
 * Competitive source scope (ADR-0029): a user is "on" a team iff they hold an
 * ACTIVE challenge enrollment carrying that teamId. Shared by the work-grid
 * router (agent claim eligibility) and the team-workspace router (human claim +
 * read gating) so both enforce the same membership truth.
 */
export async function ownerOnTeam(
  db: typeof Db,
  userId: string,
  teamId: string,
): Promise<boolean> {
  const enrollment = await db.query.challengeEnrollments.findFirst({
    where: and(
      eq(challengeEnrollments.userId, userId),
      eq(challengeEnrollments.teamId, teamId),
      eq(challengeEnrollments.status, "active"),
    ),
  });
  return enrollment !== undefined;
}
```

> If `team-membership.ts`'s header comment says "Db-free so it can be unit-tested without a database," update that comment — the file now also exports a db-backed helper. Keep the pure `assertCanJoinTeam` / `TeamJoinError` exactly as they are.

- [ ] **Step 2: Replace the local copy in `work-grid.ts`**

In `src/server/api/routers/work-grid.ts`:
1. Add `ownerOnTeam` to the existing import from `@/server/hackathon/team-membership` (create the import if none exists — there is already a `team-join-code` import nearby to mirror).
2. Delete the local `async function ownerOnTeam(...) {...}` definition (the one with the ADR-0029 comment, ~lines 149-162).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — `work-grid.ts` resolves `ownerOnTeam` from the shared module; no duplicate-definition or unused-import errors.

- [ ] **Step 4: Run the existing work-grid integration test is unaffected (compile only, no DB)**

Run: `pnpm exec vitest run src/server/api/routers/work-grid.integration.test.ts`
Expected: the suite AUTO-SKIPS (no `RUN_DB_TESTS=1`) but must load without import errors. Expected output: tests skipped, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/team-membership.ts src/server/api/routers/work-grid.ts
git commit -m "refactor(hackathon): share ownerOnTeam between work-grid and workspace (Plan 4)"
```

---

## Task 5: Clear `claimedByUserId` on deadline requeue

**Files:**
- Modify: `src/server/api/routers/work-grid.ts` (`requeueExpiredCells`, ~lines 194-207)

- [ ] **Step 1: Update the requeue set-clause**

In `requeueExpiredCells`, add `claimedByUserId: null` to the `.set({...})` so a human-claimed cell whose deadline lapses is fully released (today only the agent `claimedBy` is cleared):

```typescript
  return db
    .update(workCells)
    .set({
      status: "requeued",
      claimedBy: null,
      claimedByUserId: null,
      claimedAt: null,
      deadline: null,
    })
    .where(
      and(eq(workCells.status, "claimed"), lt(workCells.deadline, new Date())),
    )
    .returning();
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/work-grid.ts
git commit -m "fix(hackathon): clear human claim column on deadline requeue (Plan 4)"
```

---

## Task 6: `teamWorkspace` router — `cells` read

**Files:**
- Create: `src/server/api/routers/team-workspace.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the router with a member gate and the `cells` query**

```typescript
// src/server/api/routers/team-workspace.ts
// Participant workspace (Plan 4): member-gated reads + mutations over a team's
// competitive work grid. Humans act as peers to commissioned agents — a cell is
// claimed/authored by an agent OR a user, never both. Organizer verification
// (work-grid verifyCellResult) and finalizeHackathon scoring are unchanged: they
// count VERIFIED results regardless of author. Every state-changing action
// appends one teamActivityEvent for the feed.

import { z } from "zod";
import { and, eq, desc, inArray, gte, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  teams,
  workGrids,
  workCells,
  workCellResults,
  teamActivityEvents,
  teamPresence,
  memberProfiles,
  challengeEnrollments,
} from "@/server/db/schema";
import { ownerOnTeam } from "@/server/hackathon/team-membership";
import { cellHeatState } from "@/server/hackathon/cell-state";

/** Throw FORBIDDEN unless the caller is an active member of the team. */
async function requireTeamMember(
  db: typeof import("@/server/db").db,
  userId: string,
  teamId: string,
) {
  if (!(await ownerOnTeam(db, userId, teamId))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this team.",
    });
  }
}

/** Resolve a team's single competitive grid id, or throw NOT_FOUND. */
async function requireTeamGridId(
  db: typeof import("@/server/db").db,
  teamId: string,
): Promise<string> {
  const [grid] = await db
    .select({ id: workGrids.id })
    .from(workGrids)
    .where(and(eq(workGrids.teamId, teamId), eq(workGrids.mode, "competitive")))
    .limit(1);
  if (!grid) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This team has no work grid yet (rosters not locked).",
    });
  }
  return grid.id;
}

export const teamWorkspaceRouter = createTRPCRouter({
  /**
   * The team's grid cells WITH content + latest result + assignee/claimant, for
   * the workspace heatmap and drawers. Member-gated (rivals never see content).
   */
  cells: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireTeamMember(ctx.db, ctx.session.user.id, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId);

      const cells = await ctx.db
        .select()
        .from(workCells)
        .where(eq(workCells.gridId, gridId));

      const cellIds = cells.map((c) => c.id);
      const results =
        cellIds.length > 0
          ? await ctx.db
              .select()
              .from(workCellResults)
              .where(inArray(workCellResults.cellId, cellIds))
          : [];
      const resultByCell = new Map(results.map((r) => [r.cellId, r]));

      return cells.map((cell) => {
        const result = resultByCell.get(cell.id) ?? null;
        return {
          ...cell,
          heatState: cellHeatState(
            cell.status,
            result?.verificationOutcome ?? null,
          ),
          result,
        };
      });
    }),
});
```

- [ ] **Step 2: Register the router**

In `src/server/api/root.ts`:
1. Add `import { teamWorkspaceRouter } from "@/server/api/routers/team-workspace";` next to the existing `teamsRouter` import (line ~40).
2. Add `teamWorkspace: teamWorkspaceRouter,` to the router map next to `teams: teamsRouter,` (line ~91).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (If `workCellResults.verificationOutcome` is typed as an enum, `cellHeatState`'s param accepts `"pending" | "verified" | "failed" | null` — cast or widen at the call site if the DB type is `string`.)

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/team-workspace.ts src/server/api/root.ts
git commit -m "feat(hackathon): teamWorkspace.cells member-gated read (Plan 4)"
```

---

## Task 7: `assignCell` mutation + activity helper

**Files:**
- Modify: `src/server/api/routers/team-workspace.ts`

- [ ] **Step 1: Add an internal activity-append helper and the `assignCell` mutation**

Add the helper above the router (after `requireTeamGridId`):

```typescript
type Tx = Parameters<
  Parameters<(typeof import("@/server/db").db)["transaction"]>[0]
>[0];

/** Append one activity event (call inside the same tx as the action). */
async function appendActivity(
  tx: Tx,
  args: {
    teamId: string;
    cellId: string | null;
    actorUserId?: string | null;
    actorAgentId?: string | null;
    type: "assigned" | "claimed" | "reported" | "verified" | "failed";
  },
) {
  await tx.insert(teamActivityEvents).values({
    teamId: args.teamId,
    cellId: args.cellId,
    actorUserId: args.actorUserId ?? null,
    actorAgentId: args.actorAgentId ?? null,
    type: args.type,
  });
}
```

Add the mutation inside the router (after `cells`):

```typescript
  /** Soft-assign a cell to a teammate (or clear it). No lock — planning only. */
  assignCell: protectedProcedure
    .input(
      z.object({
        cellId: z.string(),
        teamId: z.string(),
        userId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireTeamMember(ctx.db, ctx.session.user.id, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId);

      // The assignee, when set, must themselves be a team member.
      if (input.userId !== null) {
        await requireTeamMember(ctx.db, input.userId, input.teamId);
      }

      return ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(workCells)
          .set({ assignedToUserId: input.userId })
          .where(and(eq(workCells.id, input.cellId), eq(workCells.gridId, gridId)))
          .returning();
        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cell not found" });
        }
        await appendActivity(tx, {
          teamId: input.teamId,
          cellId: input.cellId,
          actorUserId: ctx.session.user.id,
          type: "assigned",
        });
        return updated;
      });
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/team-workspace.ts
git commit -m "feat(hackathon): teamWorkspace.assignCell soft assignment + activity log (Plan 4)"
```

---

## Task 8: `claimCellAsMember` + `releaseCell` mutations

**Files:**
- Modify: `src/server/api/routers/team-workspace.ts`

- [ ] **Step 1: Add the human claim and release mutations**

Add inside the router:

```typescript
  /**
   * Human claim — the participant analogue of work-grid claimCell. Atomic flip
   * pending/requeued → claimed, locking the cell to this user. Re-arms a fresh
   * deadline from the cell's deadlineMinutes (mirrors the agent path). Member-
   * gated; the cell must belong to this team's grid.
   */
  claimCellAsMember: protectedProcedure
    .input(z.object({ cellId: z.string(), teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireTeamMember(ctx.db, userId, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId);

      const [cell] = await ctx.db
        .select()
        .from(workCells)
        .where(and(eq(workCells.id, input.cellId), eq(workCells.gridId, gridId)))
        .limit(1);
      if (!cell) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cell not found" });
      }

      return ctx.db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(workCells)
          .set({
            status: "claimed",
            claimedByUserId: userId,
            claimedBy: null,
            claimedAt: new Date(),
            deadline:
              cell.deadlineMinutes !== null
                ? new Date(Date.now() + cell.deadlineMinutes * 60_000)
                : null,
          })
          .where(
            and(
              eq(workCells.id, input.cellId),
              inArray(workCells.status, ["pending", "requeued"]),
            ),
          )
          .returning();
        if (!claimed) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Cell already claimed",
          });
        }
        await appendActivity(tx, {
          teamId: input.teamId,
          cellId: input.cellId,
          actorUserId: userId,
          type: "claimed",
        });
        return claimed;
      });
    }),

  /** Release a cell this member claimed (back to pending). Own-claim only. */
  releaseCell: protectedProcedure
    .input(z.object({ cellId: z.string(), teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireTeamMember(ctx.db, userId, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId);

      const [released] = await ctx.db
        .update(workCells)
        .set({
          status: "pending",
          claimedByUserId: null,
          claimedAt: null,
          deadline: null,
        })
        .where(
          and(
            eq(workCells.id, input.cellId),
            eq(workCells.gridId, gridId),
            eq(workCells.status, "claimed"),
            eq(workCells.claimedByUserId, userId),
          ),
        )
        .returning();
      if (!released) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You have not claimed this cell.",
        });
      }
      return released;
    }),
```

> `Date.now()` is fine in application code here — the no-`Date.now()` rule applies only to Workflow scripts, not the app. This mirrors the existing agent `claimCell` deadline arming verbatim.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/team-workspace.ts
git commit -m "feat(hackathon): teamWorkspace human claim + release (Plan 4)"
```

---

## Task 9: `reportResult` mutation (human-authored result)

**Files:**
- Modify: `src/server/api/routers/team-workspace.ts`

- [ ] **Step 1: Add the report mutation**

Add inside the router:

```typescript
  /**
   * Human report — the participant analogue of work-grid submitCellResult. Flips
   * a cell THIS member has claimed claimed → completed and inserts a user-
   * authored result (verificationOutcome="pending", awaiting organizer verify).
   * The self-guarding UPDATE matches only a cell still claimed by this user, so
   * there is no TOCTOU window.
   */
  reportResult: protectedProcedure
    .input(
      z.object({
        cellId: z.string(),
        teamId: z.string(),
        output: z.string().min(1).max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireTeamMember(ctx.db, userId, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId);

      return ctx.db.transaction(async (tx) => {
        const [completed] = await tx
          .update(workCells)
          .set({ status: "completed" })
          .where(
            and(
              eq(workCells.id, input.cellId),
              eq(workCells.gridId, gridId),
              eq(workCells.status, "claimed"),
              eq(workCells.claimedByUserId, userId),
            ),
          )
          .returning();
        if (!completed) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This cell is not claimed by you.",
          });
        }

        await tx
          .insert(workCellResults)
          .values({
            cellId: input.cellId,
            userId,
            agentId: null,
            output: input.output,
            verificationOutcome: "pending",
          })
          .onConflictDoNothing({ target: workCellResults.cellId });

        await appendActivity(tx, {
          teamId: input.teamId,
          cellId: input.cellId,
          actorUserId: userId,
          type: "reported",
        });
        return completed;
      });
    }),
```

> The `onConflictDoNothing({ target: workCellResults.cellId })` relies on the one-result-per-cell unique index from Task 2/3. If `workCellResults` requires other non-null columns (check the table def — e.g. a non-null `verificationDetails` default), include them here; the agent path's `submitCellResult` insert (work-grid.ts ~527-536) is the reference for required fields.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/team-workspace.ts
git commit -m "feat(hackathon): teamWorkspace human reportResult (Plan 4)"
```

---

## Task 10: `activity`, `presence`, `heartbeat`

**Files:**
- Modify: `src/server/api/routers/team-workspace.ts`

- [ ] **Step 1: Add the feed read, presence read, and heartbeat mutation**

Add inside the router:

```typescript
  /** Recent activity for the team feed (newest first). Member-gated. */
  activity: protectedProcedure
    .input(z.object({ teamId: z.string(), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      await requireTeamMember(ctx.db, ctx.session.user.id, input.teamId);
      return ctx.db
        .select()
        .from(teamActivityEvents)
        .where(eq(teamActivityEvents.teamId, input.teamId))
        .orderBy(desc(teamActivityEvents.createdAt))
        .limit(input.limit);
    }),

  /** Members seen within the freshness window are "online". Member-gated. */
  presence: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireTeamMember(ctx.db, ctx.session.user.id, input.teamId);
      const since = new Date(Date.now() - 45_000); // 45s freshness window
      const rows = await ctx.db
        .select({
          userId: teamPresence.userId,
          lastSeenAt: teamPresence.lastSeenAt,
          displayName: memberProfiles.displayName,
        })
        .from(teamPresence)
        .innerJoin(memberProfiles, eq(memberProfiles.userId, teamPresence.userId))
        .where(and(eq(teamPresence.teamId, input.teamId), gte(teamPresence.lastSeenAt, since)));
      return rows;
    }),

  /** Heartbeat — upsert the caller's presence for the team. Member-gated. */
  heartbeat: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireTeamMember(ctx.db, userId, input.teamId);
      await ctx.db
        .insert(teamPresence)
        .values({ teamId: input.teamId, userId, lastSeenAt: new Date() })
        .onConflictDoUpdate({
          target: [teamPresence.teamId, teamPresence.userId],
          set: { lastSeenAt: new Date() },
        });
      return { ok: true };
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (`isNull` / `challengeEnrollments` imports from Task 6 may now be unused — remove any unused imports to satisfy lint.)

- [ ] **Step 3: Lint**

Run: `pnpm exec next lint --file src/server/api/routers/team-workspace.ts`
Expected: no errors (fix unused imports if flagged).

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/team-workspace.ts
git commit -m "feat(hackathon): teamWorkspace activity feed + presence heartbeat (Plan 4)"
```

---

## Task 11: `teamHeatmap` — public content-free status array

**Files:**
- Modify: `src/server/api/routers/hackathon.ts` (add a `publicProcedure` next to `teamGridStatus`)

- [ ] **Step 1: Add the dashboard heatmap query**

In `src/server/api/routers/hackathon.ts`, add after `teamGridStatus` (~line 826). Import `cellHeatState` at the top (`import { cellHeatState } from "@/server/hackathon/cell-state";`):

```typescript
  /**
   * Public, content-free per-cell status array for the spectator dashboard
   * heatmap (ADR-0030, amended): the colour of each cell's progress, never its
   * content/output. Ordered stably by cell id so the matrix is stable across
   * polls. Returns an empty array if the team has no competitive grid yet.
   */
  teamHeatmap: publicProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [grid] = await ctx.db
        .select({ id: workGrids.id })
        .from(workGrids)
        .where(
          and(
            eq(workGrids.teamId, input.teamId),
            eq(workGrids.mode, "competitive"),
          ),
        )
        .limit(1);
      if (!grid) return [];

      const cells = await ctx.db
        .select({ id: workCells.id, status: workCells.status })
        .from(workCells)
        .where(eq(workCells.gridId, grid.id));

      const cellIds = cells.map((c) => c.id);
      const verified =
        cellIds.length > 0
          ? await ctx.db
              .select({ cellId: workCellResults.cellId })
              .from(workCellResults)
              .where(
                and(
                  inArray(workCellResults.cellId, cellIds),
                  eq(workCellResults.verificationOutcome, "verified"),
                ),
              )
          : [];
      const verifiedCells = new Set(verified.map((v) => v.cellId));

      return cells
        .map((c) => ({
          heatState: cellHeatState(
            c.status,
            verifiedCells.has(c.id) ? "verified" : null,
          ),
        }))
        .sort(); // stable: array of {heatState}; order is by query, deterministic enough
    }),
```

> Remove the trailing `.sort()` if it does not produce a meaningful order on objects — instead `ORDER BY` cell id in the cells query (`.orderBy(workCells.id)`) for stable matrix ordering and return the mapped array directly. Pick one; do not ship both.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): teamHeatmap public content-free status array (Plan 4)"
```

---

## Task 12: Integration test — human claim → report → verify → heatmap/activity

**Files:**
- Create: `src/server/api/routers/team-workspace.integration.test.ts`

This is a DB-integration test gated exactly like `work-grid.integration.test.ts` (auto-skips unless `RUN_DB_TESTS=1` and a local DB). Copy that file's opt-in gate header verbatim, then exercise the human path.

- [ ] **Step 1: Write the integration test**

```typescript
// src/server/api/routers/team-workspace.integration.test.ts
// DB-INTEGRATION test for the participant workspace human path (Plan 4).
// AUTO-SKIPS unless RUN_DB_TESTS=1 AND a local-looking DB is configured (see the
// identical gate in work-grid.integration.test.ts). Enable with:
//   RUN_DB_TESTS=1 pnpm exec vitest run src/server/api/routers/team-workspace.integration.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

// ── Opt-in gate (copy verbatim from work-grid.integration.test.ts) ───────────
// [Copy the looksLikeCloudNeon / looksLikeLocalDb / isLocalDbConfigured block
//  and the `const RUN = isLocalDbConfigured(); const d = RUN ? describe : describe.skip;`
//  pattern from work-grid.integration.test.ts so this suite never touches a
//  cloud DB and skips cleanly without one.]

// The test body (inside the gated `d(...)`) must:
//  1. Seed: a user, a member profile, a team (status "locked"), a challenge
//     enrollment carrying teamId (active), and a competitive workGrid for the
//     team with one pending workCell (deadlineMinutes set). Reuse the seed
//     helpers / direct inserts that work-grid.integration.test.ts uses.
//  2. Build a tRPC caller with the seeded user's session (mirror how the other
//     integration test constructs `appRouter.createCaller({ db, session })`).
//  3. Assert the flow:

//   it("rejects a non-member reading cells", async () => {
//     const outsiderCaller = makeCaller(outsiderSession);
//     await expect(outsiderCaller.teamWorkspace.cells({ teamId })).rejects.toThrow(/not a member/);
//   });

//   it("lets a member claim, report, and reflects state in the heatmap", async () => {
//     const caller = makeCaller(memberSession);
//     const claimed = await caller.teamWorkspace.claimCellAsMember({ cellId, teamId });
//     expect(claimed.status).toBe("claimed");
//     expect(claimed.claimedByUserId).toBe(memberUserId);

//     await caller.teamWorkspace.reportResult({ cellId, teamId, output: "robot arm built; video: https://x" });
//     const cells = await caller.teamWorkspace.cells({ teamId });
//     const cell = cells.find((c) => c.id === cellId)!;
//     expect(cell.status).toBe("completed");
//     expect(cell.heatState).toBe("completed");        // pending verification
//     expect(cell.result?.userId).toBe(memberUserId);  // human-authored
//     expect(cell.result?.agentId).toBeNull();

//     // organizer verifies via the unchanged work-grid procedure → scored bucket
//     const adminCaller = makeCaller(sponsorSession);
//     await adminCaller.workGrid.verifyCellResult({ cellId, outcome: "verified" });
//     const after = await caller.teamWorkspace.cells({ teamId });
//     expect(after.find((c) => c.id === cellId)!.heatState).toBe("verified");

//     // public dashboard heatmap shows the verified state, no content
//     const heat = await caller.hackathon.teamHeatmap({ teamId });
//     expect(heat.some((h) => h.heatState === "verified")).toBe(true);

//     // activity feed recorded claim + report
//     const feed = await caller.teamWorkspace.activity({ teamId });
//     expect(feed.map((e) => e.type)).toEqual(expect.arrayContaining(["claimed", "reported"]));
//   });

//   it("blocks a second human claim on an already-claimed cell", async () => {
//     const other = makeCaller(otherMemberSession);
//     await expect(other.teamWorkspace.claimCellAsMember({ cellId, teamId })).rejects.toThrow(/already claimed/);
//   });
```

> Replace the commented scaffold with concrete code following `work-grid.integration.test.ts`'s exact seeding + caller construction. Keep the gate identical so a plain `pnpm test` skips this suite and never connects to a DB.

- [ ] **Step 2: Run gated (skips without opt-in)**

Run: `pnpm exec vitest run src/server/api/routers/team-workspace.integration.test.ts`
Expected: SKIPPED (no `RUN_DB_TESTS=1`), suite loads with 0 failures / import errors.

- [ ] **Step 3: Run against a local DB (if available)**

Run: `RUN_DB_TESTS=1 pnpm exec vitest run src/server/api/routers/team-workspace.integration.test.ts`
Expected: PASS (all assertions). Requires the Docker Postgres + wsproxy dev stack and `pnpm db:apply` already run.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/team-workspace.integration.test.ts
git commit -m "test(hackathon): integration test for human claim/report/verify path (Plan 4)"
```

---

## Task 13: Full verification pass

- [ ] **Step 1: Unit tests**

Run: `pnpm test`
Expected: PASS, including `cell-state.test.ts`; all integration suites SKIP cleanly.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm check`
Expected: PASS (`next lint && tsc --noEmit`).

- [ ] **Step 3: Confirm the migration is registered and named correctly**

Run: `grep -n "20260610a_participant_workspace" src/migrations/index.ts`
Expected: import + registry entry present.

- [ ] **Step 4: Final commit (if any lint fixes were needed)**

```bash
git add -A
git commit -m "chore(hackathon): Plan 4 verification fixes" || echo "nothing to commit"
```

---

## Notes for Plan 5 (workspace UI) and Plan 6 (dashboard)

- Plan 5 consumes `teamWorkspace.{cells,assignCell,claimCellAsMember,releaseCell,reportResult,activity,presence,heartbeat}` and renders the heatmap (`heatState` → colour), the cell drawer, the connect-agent panel, the activity feed, and the presence strip; it polls `cells`/`activity`/`presence` (~5s) and fires `heartbeat` (~20s). Route: `/events/[slug]/team`, gated to team members (redirect non-members).
- Plan 6 consumes `hackathon.teamHeatmap` for the public dashboard and adds the "Enter your team workspace →" button to `HackathonPanel`.
- During Plan 5/6, record the two ADRs from the spec: the ADR-0030 amendment (content-free per-cell status heatmap) and a new ADR (a work cell may be claimed/authored by a human team member, not only a commissioned agent).
```
