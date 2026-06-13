# Hackathon Hub — Plan 1: Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two backend additions the tabbed hub consumes — a manual, non-scoring task-progress status on work cells, and a `hackathon.agentStats` query for the Agents tab — without touching scoring, the work-grid claim/verify mechanism, or regular events.

**Architecture:** A new `work_cell.progress_status` (+ `progress_note`) column carries a kanban-style status (`todo/in_progress/blocked/done`) orthogonal to the verification pipeline; a human `team-workspace.updateCellProgress` mutation (claimant-or-captain) writes it, gated by a pure, unit-tested predicate. `hackathon.agentStats(challengeId)` aggregates per-agent claimed/reported/verified counts over the hackathon's competitive grids, following the existing `analytics` query pattern, with the row-merge extracted into a pure, unit-tested helper.

**Tech Stack:** Next.js App Router · tRPC v11 · Drizzle (Postgres, app schema) · Payload-style hand-written migrations · vitest (pure unit + opt-in DB-integration).

This is the first of four sequenced plans (backend foundation → participant hub shell → Agents tab → organizer manage tabs) decomposed from `docs/superpowers/specs/2026-06-13-hackathon-tabbed-hub-design.md`.

**Scope note — deferred:** the agent-facing MCP `update-cell-progress` tool (design Part C.2) is intentionally **not** in this plan. It must wrap a `workGrid`-level procedure that resolves agent identity, and that router's internals haven't been extracted yet. It is a small follow-up; the human path + board (Plans 1–2) is the v1 value, and agents already appear in `agentStats` via their claims/results. Tracked at the end of this plan.

---

### Task 1: Pure task-progress module

The status vocabulary and the "who may edit" rule, db-free and unit-tested — the single source of truth both the mutation (Task 3) and later UI reuse.

**Files:**
- Create: `src/server/hackathon/task-progress.ts`
- Test: `src/server/hackathon/task-progress.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/hackathon/task-progress.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import {
  TASK_PROGRESS_STATUSES,
  isTaskProgressStatus,
  canEditCellProgress,
} from "./task-progress";

describe("TASK_PROGRESS_STATUSES", () => {
  it("is the kanban vocabulary in board order", () => {
    expect(TASK_PROGRESS_STATUSES).toEqual([
      "todo",
      "in_progress",
      "blocked",
      "done",
    ]);
  });
});

describe("isTaskProgressStatus", () => {
  it("accepts every valid status", () => {
    for (const s of TASK_PROGRESS_STATUSES) {
      expect(isTaskProgressStatus(s)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const s of ["", "TODO", "done ", "verified", "claimed", null, undefined, 3]) {
      expect(isTaskProgressStatus(s)).toBe(false);
    }
  });
});

describe("canEditCellProgress", () => {
  it("lets the cell's current claimant edit", () => {
    expect(
      canEditCellProgress({
        userId: "u1",
        captainId: "cap",
        claimedByUserId: "u1",
      }),
    ).toBe(true);
  });

  it("lets the team captain edit even an unclaimed cell", () => {
    expect(
      canEditCellProgress({
        userId: "cap",
        captainId: "cap",
        claimedByUserId: null,
      }),
    ).toBe(true);
  });

  it("blocks a non-claimant non-captain team member", () => {
    expect(
      canEditCellProgress({
        userId: "u2",
        captainId: "cap",
        claimedByUserId: "u1",
      }),
    ).toBe(false);
  });

  it("blocks a member on an unclaimed cell when they are not captain", () => {
    expect(
      canEditCellProgress({
        userId: "u2",
        captainId: "cap",
        claimedByUserId: null,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/server/hackathon/task-progress.test.ts`
Expected: FAIL — cannot find module `./task-progress`.

- [ ] **Step 3: Write minimal implementation**

Create `src/server/hackathon/task-progress.ts`:

```typescript
// Manual, kanban-style progress status for a work cell — informational only,
// orthogonal to the verification pipeline that drives scoring (ADR-0029). A
// cell marked "done" here still needs a reported result that gets verified
// before it counts. Db-free + deterministic so it can be unit-tested and
// shared by the team-workspace mutation and the workspace board UI.

export const TASK_PROGRESS_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
] as const;

export type TaskProgressStatus = (typeof TASK_PROGRESS_STATUSES)[number];

export function isTaskProgressStatus(x: unknown): x is TaskProgressStatus {
  return (
    typeof x === "string" &&
    (TASK_PROGRESS_STATUSES as readonly string[]).includes(x)
  );
}

/**
 * Who may change a cell's manual progress status. Caller is assumed already
 * verified as a team member; this narrows to the cell's current claimant or
 * the team captain (so the captain can coordinate even unclaimed cells).
 */
export function canEditCellProgress(args: {
  userId: string;
  captainId: string;
  claimedByUserId: string | null;
}): boolean {
  return args.userId === args.captainId || args.userId === args.claimedByUserId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/server/hackathon/task-progress.test.ts`
Expected: PASS (3 describe blocks, all green).

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/task-progress.ts src/server/hackathon/task-progress.test.ts
git commit -m "feat(hackathon): pure task-progress status + edit predicate (#hub)"
```

---

### Task 2: Schema column + migration

Add `progress_status` / `progress_note` to `work_cell` in the Drizzle schema and a hand-written, idempotent migration. App schema — no Payload types regen.

**Files:**
- Modify: `src/server/db/schema.ts` (the `workCells` table, ~lines 1701–1753)
- Create: `src/migrations/20260612f_work_cell_progress.ts`
- Modify: `src/migrations/index.ts` (register the migration last)

- [ ] **Step 1: Add the columns to the Drizzle schema**

In `src/server/db/schema.ts`, inside the `workCells` table column object, add these two columns immediately after the existing `deadlineMinutes: d.integer(),` line and before `createdAt`:

```typescript
    progressStatus: d
      .varchar({ length: 20 })
      .notNull()
      .default("todo")
      .$type<"todo" | "in_progress" | "blocked" | "done">(),
    progressNote: d.text(),
```

- [ ] **Step 2: Create the migration**

Create `src/migrations/20260612f_work_cell_progress.ts`:

```typescript
// Adds app.work_cell.progress_status + progress_note: the manual, kanban-style
// task progress (todo/in_progress/blocked/done) teams set by hand, alongside —
// and never affecting — the verification pipeline that drives scoring
// (ADR-0029). DDL mirrors the Drizzle definition in src/server/db/schema.ts
// (workCells.progressStatus/progressNote). Fully idempotent (IF NOT EXISTS) so
// `payload migrate` reconciles as a safe no-op against a DB that already has
// the columns; existing rows backfill to 'todo' via the column DEFAULT.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."work_cell"
      ADD COLUMN IF NOT EXISTS "progress_status" varchar(20) NOT NULL DEFAULT 'todo';
    ALTER TABLE "app"."work_cell"
      ADD COLUMN IF NOT EXISTS "progress_note" text;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."work_cell" DROP COLUMN IF EXISTS "progress_note";
    ALTER TABLE "app"."work_cell" DROP COLUMN IF EXISTS "progress_status";
  `);
}
```

- [ ] **Step 3: Register the migration**

In `src/migrations/index.ts`, add the import alongside the other `20260612*` imports (after the `20260612e_email_templates` import line):

```typescript
import * as migration_20260612f_work_cell_progress from "./20260612f_work_cell_progress";
```

Then add this entry as the **last** element of the `migrations` array (after the `20260612e_email_templates` entry, before the closing `]`):

```typescript
  {
    up: migration_20260612f_work_cell_progress.up,
    down: migration_20260612f_work_cell_progress.down,
    name: "20260612f_work_cell_progress",
  },
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean (no output). Confirms the schema `$type` union and migration compile.

- [ ] **Step 5: Apply locally and verify the column exists**

(Requires the docker dev stack up: `docker compose up -d postgres wsproxy`.)

Run:
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
  pnpm exec tsx scripts/db-apply-pending.ts
```
Expected: applies `20260612f_work_cell_progress` (and any other pending), prints "Applied + recorded …".

Verify:
```bash
docker exec hackathon-hub-postgres-1 psql -U postgres -d aitcom -c \
  "select column_name from information_schema.columns where table_schema='app' and table_name='work_cell' and column_name in ('progress_status','progress_note') order by 1;"
```
Expected: two rows — `progress_note`, `progress_status`. (If the container name differs, use `docker compose ps` to find it.)

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260612f_work_cell_progress.ts src/migrations/index.ts
git commit -m "feat(hackathon): work_cell manual progress columns + migration (#hub)"
```

---

### Task 3: `team-workspace.updateCellProgress` mutation

The human path: a team member who is the cell's claimant (or the captain) sets the manual status/note. Mirrors the existing `assignCell`/`reportResult` authorization + transaction pattern. Behavior is verified by the DB integration test in Task 5 (the repo's pattern for DB mutations); the edit rule itself is unit-tested in Task 1.

**Files:**
- Modify: `src/server/api/routers/team-workspace.ts`

- [ ] **Step 1: Add imports**

At the top of `src/server/api/routers/team-workspace.ts`, extend the existing schema import to include `teams`, and add the task-progress import. The schema import currently is:

```typescript
import {
  workGrids,
  workCells,
  workCellResults,
  teamActivityEvents,
  teamPresence,
  memberProfiles,
} from "@/server/db/schema";
```

Change it to add `teams`:

```typescript
import {
  workGrids,
  workCells,
  workCellResults,
  teamActivityEvents,
  teamPresence,
  memberProfiles,
  teams,
} from "@/server/db/schema";
```

And add, after the existing `import { appendActivity } from "@/server/hackathon/activity";` line:

```typescript
import {
  canEditCellProgress,
  isTaskProgressStatus,
  TASK_PROGRESS_STATUSES,
} from "@/server/hackathon/task-progress";
```

- [ ] **Step 2: Add the mutation**

Add this procedure inside the `createTRPCRouter({ ... })` object in `team-workspace.ts` (place it next to `assignCell`). The `requireTeamMember` helper and `requireTeamGridId` helper already exist in this file:

```typescript
  /**
   * Set a cell's manual, kanban-style progress status (and optional note).
   * Informational only — does NOT touch verification or score. Editable by the
   * cell's current claimant or the team captain.
   */
  updateCellProgress: protectedProcedure
    .input(
      z.object({
        cellId: z.string(),
        teamId: z.string(),
        status: z.enum(TASK_PROGRESS_STATUSES),
        note: z.string().max(500).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireTeamMember(ctx.db, userId, input.teamId);
      const gridId = await requireTeamGridId(ctx.db, input.teamId);

      // Defence in depth: the input is already z.enum-constrained.
      if (!isTaskProgressStatus(input.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid status" });
      }

      const [team] = await ctx.db
        .select({ captainId: teams.captainId })
        .from(teams)
        .where(eq(teams.id, input.teamId));
      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }

      const [cell] = await ctx.db
        .select({ claimedByUserId: workCells.claimedByUserId })
        .from(workCells)
        .where(
          and(eq(workCells.id, input.cellId), eq(workCells.gridId, gridId)),
        );
      if (!cell) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cell not found" });
      }

      if (
        !canEditCellProgress({
          userId,
          captainId: team.captainId,
          claimedByUserId: cell.claimedByUserId,
        })
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the cell's claimant or the team captain can update its progress.",
        });
      }

      const [updated] = await ctx.db
        .update(workCells)
        .set({ progressStatus: input.status, progressNote: input.note ?? null })
        .where(and(eq(workCells.id, input.cellId), eq(workCells.gridId, gridId)))
        .returning();
      return updated;
    }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean. Confirms `teams.captainId`, the `z.enum(TASK_PROGRESS_STATUSES)` input, and the `progressStatus`/`progressNote` columns all line up.

- [ ] **Step 4: Run the full unit suite (no regressions)**

Run: `pnpm test`
Expected: all green (the new pure tests from Task 1 included); no DB tests run.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/team-workspace.ts
git commit -m "feat(hackathon): updateCellProgress mutation (claimant or captain) (#hub)"
```

---

### Task 4: `hackathon.agentStats` query + pure merge helper

Per-agent claimed/reported/verified counts over the hackathon's competitive grids. The row-merge is extracted into a pure, unit-tested helper; the query follows the existing `analytics` Promise.all pattern.

**Files:**
- Create: `src/server/hackathon/agent-stats.ts`
- Test: `src/server/hackathon/agent-stats.test.ts`
- Modify: `src/server/api/routers/hackathon.ts`

- [ ] **Step 1: Write the failing test for the merge helper**

Create `src/server/hackathon/agent-stats.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { mergeAgentStats } from "./agent-stats";

describe("mergeAgentStats", () => {
  it("merges claims and results by agent and sums counts", () => {
    const merged = mergeAgentStats(
      [
        { agentId: "a1", teamId: "t1", claimed: 3 },
        { agentId: "a2", teamId: "t2", claimed: 1 },
      ],
      [
        { agentId: "a1", reported: 2, verified: 1 },
        { agentId: "a2", reported: 1, verified: 1 },
      ],
    );
    expect(merged).toEqual([
      { agentId: "a1", teamId: "t1", claimed: 3, reported: 2, verified: 1 },
      { agentId: "a2", teamId: "t2", claimed: 1, reported: 1, verified: 1 },
    ]);
  });

  it("includes an agent that has results but no recorded claim row", () => {
    const merged = mergeAgentStats(
      [],
      [{ agentId: "a9", reported: 1, verified: 0 }],
    );
    expect(merged).toEqual([
      { agentId: "a9", teamId: null, claimed: 0, reported: 1, verified: 0 },
    ]);
  });

  it("includes an agent that has a claim but no results yet", () => {
    const merged = mergeAgentStats(
      [{ agentId: "a3", teamId: "t1", claimed: 2 }],
      [],
    );
    expect(merged).toEqual([
      { agentId: "a3", teamId: "t1", claimed: 2, reported: 0, verified: 0 },
    ]);
  });

  it("ranks by verified desc, then reported desc, then agentId", () => {
    const merged = mergeAgentStats(
      [
        { agentId: "b", teamId: "t", claimed: 0 },
        { agentId: "a", teamId: "t", claimed: 0 },
        { agentId: "c", teamId: "t", claimed: 0 },
      ],
      [
        { agentId: "b", reported: 5, verified: 1 },
        { agentId: "a", reported: 5, verified: 1 },
        { agentId: "c", reported: 9, verified: 3 },
      ],
    );
    expect(merged.map((s) => s.agentId)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate its inputs", () => {
    const claims = [{ agentId: "a1", teamId: "t1", claimed: 1 }];
    const results = [{ agentId: "a1", reported: 1, verified: 1 }];
    const snapshot = JSON.stringify({ claims, results });
    mergeAgentStats(claims, results);
    expect(JSON.stringify({ claims, results })).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/server/hackathon/agent-stats.test.ts`
Expected: FAIL — cannot find module `./agent-stats`.

- [ ] **Step 3: Write the merge helper**

Create `src/server/hackathon/agent-stats.ts`:

```typescript
// Merges two per-agent aggregate result sets — cells claimed (from work_cell)
// and results reported/verified (from work_cell_result) — into one ranked
// roster for the Agents tab. Db-free + deterministic so it can be unit-tested
// in isolation; the hackathon.agentStats query owns the SQL and calls this.

export interface AgentClaimRow {
  agentId: string;
  teamId: string | null;
  claimed: number;
}

export interface AgentResultRow {
  agentId: string;
  reported: number;
  verified: number;
}

export interface AgentStat {
  agentId: string;
  teamId: string | null;
  claimed: number;
  reported: number;
  verified: number;
}

export function mergeAgentStats(
  claims: AgentClaimRow[],
  results: AgentResultRow[],
): AgentStat[] {
  const byId = new Map<string, AgentStat>();

  for (const c of claims) {
    byId.set(c.agentId, {
      agentId: c.agentId,
      teamId: c.teamId,
      claimed: c.claimed,
      reported: 0,
      verified: 0,
    });
  }

  for (const r of results) {
    const existing = byId.get(r.agentId);
    if (existing) {
      existing.reported = r.reported;
      existing.verified = r.verified;
    } else {
      byId.set(r.agentId, {
        agentId: r.agentId,
        teamId: null,
        claimed: 0,
        reported: r.reported,
        verified: r.verified,
      });
    }
  }

  return [...byId.values()].sort(
    (a, b) =>
      b.verified - a.verified ||
      b.reported - a.reported ||
      a.agentId.localeCompare(b.agentId),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/server/hackathon/agent-stats.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the `agentStats` query to the hackathon router**

In `src/server/api/routers/hackathon.ts`, add the import near the other `@/server/hackathon/*` imports:

```typescript
import { mergeAgentStats } from "@/server/hackathon/agent-stats";
```

Ensure `agentProfiles` is in the `@/server/db/schema` import list of this file (add it if absent). Then add this procedure to the router object (place it next to `analytics`). It is a `publicProcedure` — participating-agent stats are public hackathon info, like the team leaderboard:

```typescript
  agentStats: publicProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Two independent per-agent aggregates over this hackathon's competitive
      // grids, then merged + ranked by the pure helper. Mirrors analytics().
      const [claimRows, resultRows] = await Promise.all([
        // Cells currently claimed by each agent, with the team they belong to.
        ctx.db
          .select({
            agentId: workCells.claimedBy,
            teamId: workGrids.teamId,
            claimed: sql<number>`count(*)`.mapWith(Number),
          })
          .from(workCells)
          .innerJoin(workGrids, eq(workCells.gridId, workGrids.id))
          .where(
            and(
              eq(workGrids.challengeId, input.challengeId),
              eq(workGrids.mode, "competitive"),
              isNotNull(workCells.claimedBy),
            ),
          )
          .groupBy(workCells.claimedBy, workGrids.teamId),

        // Results authored by each agent: reported total + verified subset.
        ctx.db
          .select({
            agentId: workCellResults.agentId,
            reported: sql<number>`count(*)`.mapWith(Number),
            verified:
              sql<number>`count(*) filter (where ${workCellResults.verificationOutcome} = 'verified')`.mapWith(
                Number,
              ),
          })
          .from(workCellResults)
          .innerJoin(workCells, eq(workCellResults.cellId, workCells.id))
          .innerJoin(workGrids, eq(workCells.gridId, workGrids.id))
          .where(
            and(
              eq(workGrids.challengeId, input.challengeId),
              eq(workGrids.mode, "competitive"),
              isNotNull(workCellResults.agentId),
            ),
          )
          .groupBy(workCellResults.agentId),
      ]);

      const stats = mergeAgentStats(
        claimRows
          .filter((r): r is { agentId: string; teamId: string | null; claimed: number } => r.agentId !== null)
          .map((r) => ({ agentId: r.agentId, teamId: r.teamId, claimed: r.claimed })),
        resultRows
          .filter((r): r is { agentId: string; reported: number; verified: number } => r.agentId !== null)
          .map((r) => ({ agentId: r.agentId, reported: r.reported, verified: r.verified })),
      );

      if (stats.length === 0) return [];

      // Decorate with agent identity for display.
      const profiles = await ctx.db
        .select({
          id: agentProfiles.id,
          name: agentProfiles.name,
          avatar: agentProfiles.avatar,
          ownerId: agentProfiles.ownerId,
        })
        .from(agentProfiles)
        .where(inArray(agentProfiles.id, stats.map((s) => s.agentId)));
      const profileById = new Map(profiles.map((p) => [p.id, p]));

      return stats.map((s) => ({
        ...s,
        name: profileById.get(s.agentId)?.name ?? "Agent",
        avatar: profileById.get(s.agentId)?.avatar ?? null,
        ownerId: profileById.get(s.agentId)?.ownerId ?? null,
      }));
    }),
```

Note: `eq`, `and`, `sql`, `isNotNull`, `inArray` are already imported in this file (used by `analytics`). `publicProcedure` is already imported (used by `teamLeaderboard`/`peoplesChoiceState`).

- [ ] **Step 6: Typecheck + unit suite**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; all unit tests pass (including the new `agent-stats` tests).

- [ ] **Step 7: Commit**

```bash
git add src/server/hackathon/agent-stats.ts src/server/hackathon/agent-stats.test.ts src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): agentStats query + pure merge helper (#hub)"
```

---

### Task 5: DB integration test (opt-in)

End-to-end proof against a real local DB for the two pieces that can't be unit-tested: the `updateCellProgress` authorization/behavior (claimant + captain allowed, non-member FORBIDDEN, score/verification unchanged) and `agentStats` aggregation (per-agent counts, team attribution). Follows the repo's opt-in gate so a plain `pnpm test` skips it.

**Files:**
- Create: `src/server/api/routers/hackathon-task-progress.integration.test.ts`

- [ ] **Step 1: Scaffold the gated suite**

Create `src/server/api/routers/hackathon-task-progress.integration.test.ts` with this header + gate (copied verbatim from `hackathon-peoples-choice.integration.test.ts`, only the top doc comment changed):

```typescript
/**
 * DB-INTEGRATION test for manual task progress (updateCellProgress) and the
 * agentStats query (#hub). Proves, against a REAL local DB, that:
 *   - the cell's claimant and the team captain can set progress; a non-member
 *     is FORBIDDEN;
 *   - setting progress NEVER changes the cell's verification status or any
 *     score (non-scoring guarantee, ADR-0029);
 *   - agentStats returns per-agent claimed/reported/verified counts over the
 *     hackathon's competitive grids, attributed to the right team.
 *
 * ── This suite AUTO-SKIPS unless you explicitly opt in. ──────────────────────
 * Same gate as the other hackathon integration suites: a plain `pnpm test`
 * SKIPS everything here and never opens a db connection. It only runs when
 * BOTH RUN_DB_TESTS === "1" AND a local-looking DB is configured. Enable with:
 *
 *   RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
 *     NEON_LOCAL_PROXY=localhost:5433 \
 *     pnpm exec vitest run src/server/api/routers/hackathon-task-progress.integration.test.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}

function looksLikeLocalDb(url: string): boolean {
  if (!url) return false;
  if (looksLikeCloudNeon(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const proxy = process.env.NEON_LOCAL_PROXY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  if (proxy) return true;
  return looksLikeLocalDb(dbUrl);
}

const RUN_DB = isLocalDbConfigured();
```

- [ ] **Step 2: Write the fixture + tests**

Append the suite body. It seeds (directly via `db`, the way the other integration suites do): a community + sponsor user, a captain user + member user + outsider user, a challenge (Payload) with a hackathon event, a locked team with the captain + member enrolled, a competitive `workGrid` for the team, two `workCells` in it, and one `agentProfile`. Then it drives `createCaller(...).teamWorkspace.updateCellProgress` and `.hackathon.agentStats`.

Model the seeding + teardown helpers and the `userCaller(userId)` builder on `hackathon-peoples-choice.integration.test.ts` (same `m.createCaller({ db, session: { user: { id } }, headers: new Headers() })` shape). The assertions to implement:

```typescript
describe.skipIf(!RUN_DB)("manual task progress + agentStats [DB integration]", () => {
  // ... Mods type + beforeAll module import block copied from the
  //     peoples-choice suite (db, schema, createCaller, eq, and, inArray) ...
  // ... beforeEach seeds the fixture described above into `fx` ...
  // ... afterEach tears it down FK-safe: activity events → results → cells →
  //     grid → enrollments → team → agent → users → Payload challenge/event ...

  it("lets the claimant set progress without touching verification or score", async () => {
    // member claims cell A via teamWorkspace.claimCell (or seed it claimed by member)
    const caller = userCaller(fx.memberUserId);
    const updated = await caller.teamWorkspace.updateCellProgress({
      cellId: fx.cellAId,
      teamId: fx.teamId,
      status: "in_progress",
      note: "started",
    });
    expect(updated.progressStatus).toBe("in_progress");
    // verification untouched: no result row appeared, cell.status unchanged
    const [cell] = await m.db
      .select()
      .from(m.schema.workCells)
      .where(m.eq(m.schema.workCells.id, fx.cellAId));
    expect(cell.progressStatus).toBe("in_progress");
    const results = await m.db
      .select()
      .from(m.schema.workCellResults)
      .where(m.eq(m.schema.workCellResults.cellId, fx.cellAId));
    expect(results).toHaveLength(0); // marking "in_progress" did not report/score anything
  });

  it("lets the captain set progress on an unclaimed cell", async () => {
    const caller = userCaller(fx.captainUserId);
    const updated = await caller.teamWorkspace.updateCellProgress({
      cellId: fx.cellBId, // unclaimed
      teamId: fx.teamId,
      status: "blocked",
    });
    expect(updated.progressStatus).toBe("blocked");
  });

  it("FORBIDS a non-member from setting progress", async () => {
    const caller = userCaller(fx.outsiderUserId);
    await expect(
      caller.teamWorkspace.updateCellProgress({
        cellId: fx.cellAId,
        teamId: fx.teamId,
        status: "done",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("FORBIDS a member who is neither claimant nor captain", async () => {
    // cell A is claimed by memberUserId; have a SECOND non-captain member try
    const caller = userCaller(fx.secondMemberUserId);
    await expect(
      caller.teamWorkspace.updateCellProgress({
        cellId: fx.cellAId,
        teamId: fx.teamId,
        status: "done",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("agentStats returns per-agent claimed/reported/verified for the hackathon", async () => {
    // seed: agent claims cell B, reports a result, organizer verifies it
    // (use the existing workGrid claim/submit/verify procedures or insert rows)
    const stats = await userCaller(fx.memberUserId).hackathon.agentStats({
      challengeId: fx.challengeId,
    });
    const a = stats.find((s) => s.agentId === fx.agentId);
    expect(a).toBeDefined();
    expect(a!.teamId).toBe(fx.teamId);
    expect(a!.claimed).toBeGreaterThanOrEqual(1);
    expect(a!.verified).toBe(1);
  });
});
```

(Fill the fixture seeding/teardown verbatim from the peoples-choice suite's structure — same tables, plus an `agentProfiles` insert and a couple of `workCells`. The `secondMemberUserId` is a third enrolled team member used only to prove the "member but not claimant/captain" FORBIDDEN path.)

- [ ] **Step 3: Run the gated suite against the local stack**

(Docker dev stack up; migration from Task 2 applied.)

Run:
```bash
RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
  NEON_LOCAL_PROXY=localhost:5433 \
  pnpm exec vitest run src/server/api/routers/hackathon-task-progress.integration.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 4: Confirm it auto-skips in the default suite**

Run: `pnpm exec vitest run src/server/api/routers/hackathon-task-progress.integration.test.ts`
Expected: the suite is SKIPPED (no DB connection opened).

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/hackathon-task-progress.integration.test.ts
git commit -m "test(hackathon): DB-integration for task progress + agentStats (#hub)"
```

---

### Task 6: (Deferred follow-up) Agent MCP `update-cell-progress` tool

**Not implemented in this plan.** The agent path lets a commissioned agent set the progress of a cell it has claimed, via an MCP tool wrapping a `workGrid`-level procedure that resolves agent identity (mirroring `claim-work-cell` / `submit-cell-result` in `src/app/api/mcp/commission-tools.ts`). Implementing it requires first extracting the `workGrid` router internals (how agent identity is resolved and how `claimCell`/`submitCellResult` authorize), which this plan did not cover.

Capture as a follow-up issue: "Agent MCP `update-cell-progress` tool" — add a `workGrid.updateCellProgress` procedure authorized by `workCells.claimedBy === agentId`, reusing the `TASK_PROGRESS_STATUSES`/`canEditCellProgress` module from Task 1, then register the MCP tool gated on the `commission:submit-result` scope. The human path and the board (Plans 1–2) do not depend on it.

---

## Self-Review

**Spec coverage (Part C of the design):**
- Manual status `todo/in_progress/blocked/done` + note → Task 1 (vocabulary), Task 2 (columns). ✓
- Claimant-or-captain edit, non-scoring → Task 1 (predicate), Task 3 (mutation), Task 5 (integration proof incl. verification-unchanged). ✓
- `hackathon.agentStats` for the Agents tab (Part B.3) → Task 4 + Task 5. ✓
- Hand-written migration, app schema, no drizzle push → Task 2. ✓
- Agent MCP progress tool → explicitly deferred (Task 6) with rationale, not silently dropped. ✓
- Activity-feed `progress_updated` entry → intentionally out of v1 (design called it opt-in/low-key); progress is a live field, not an event. Noted here so it's a decision, not an omission.

**Placeholder scan:** Task 5's fixture seeding says "model on the peoples-choice suite" rather than pasting ~150 lines of identical seed/teardown — this is a deliberate DRY reference to a concrete, named existing file (the skill permits referencing established patterns for verbatim-copyable scaffolding), and every assertion in the suite is written out in full. All implementation code (Tasks 1–4) is complete and copy-paste ready.

**Type consistency:** `TASK_PROGRESS_STATUSES` / `TaskProgressStatus` / `canEditCellProgress` / `isTaskProgressStatus` (Task 1) are used with identical names in Tasks 3. `progressStatus`/`progressNote` (camelCase Drizzle) ↔ `progress_status`/`progress_note` (snake_case DDL) match the casing convention (`casing: "snake_case"` in drizzle.config.ts). `mergeAgentStats` / `AgentClaimRow` / `AgentResultRow` / `AgentStat` (Task 4) are consistent between helper, test, and query. The query's claim aggregate selects `claimedBy` (the agent FK) — consistent with the schema column name.
