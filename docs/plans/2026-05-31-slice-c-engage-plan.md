# Slice C — Engage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Engage loop — rituals (recurring forum-thread heartbeat), admin-configurable digest recall, dual-trigger warm-welcome, and agent-drafted broadcast — on top of the A/B/F foundation.

**Architecture:** Pure-logic cores (vitest, injected clock) + thin tRPC (`communityProcedure`/`agentProcedure`) + thin cron + thin MCP, **reusing** the Slice B digest/broadcast pipeline, Slice F advisory-draft machinery, and Slice A insight selectors. No DB transactions — claim-before-act / CAS / DM dedup.

**Tech Stack:** Next.js App Router, tRPC, Drizzle (`drizzle-orm/neon-http`, `app` Postgres schema), Payload CMS (`forum-threads`), Vitest, Vercel Cron.

**Design + decisions:** [`docs/plans/2026-05-31-slice-c-engage-design.md`](2026-05-31-slice-c-engage-design.md), [`docs/adr/0016-engage-loop-rituals-recall.md`](../adr/0016-engage-loop-rituals-recall.md), ADR-0014/0015.

**Conventions (do not relearn):**

- CI = `pnpm check` (next lint + tsc). **Always** run `pnpm format:check` and `pnpm prettier --write` on changed files before committing.
- Migrations: `src/migrations/<key>.ts` (`up`/`down`, `sql` from `@payloadcms/db-postgres`) + register in `src/migrations/index.ts` (import + **last** array entry). App tables in `"app"` schema. FK targets: `"app"."community"`, `"app"."user"`, `"app"."agent_profile"`, `"app"."forum_threads"` lives in **`public`** (Payload), so `ritual_occurrence.thread_id` references `public.forum_threads(id)` (integer).
- Agent-callable endpoints need an MCP tool, not just a tRPC procedure.
- `GitHub Closes #a, #b` auto-closes only the FIRST — close the rest manually.

**Names locked across tasks (use exactly):**

- `src/server/communities/rituals.ts`: `dateKey`, `weekdayOf`, `weekdayLabel`, `isRitualDue`, `nextFireDate`, types `RitualMode`, `RitualStatus`, `RitualSchedule`.
- `src/server/notifications/ritual-items.ts`: `buildRitualItems`, types `EngageConfig`, `RitualRecapItem`, `RitualReminderItem`.
- `src/server/inbox/dm.ts`: `sendDirectMessage`.
- `src/server/notifications/broadcast-send.ts`: `sendCommunityBroadcast`.
- Schema exports: `rituals`, `ritualOccurrences`, `communityEngageConfig`.
- Draft `type` strings: `ritual_suggestion`, `welcome_nudge`, `broadcast`.

---

## File Structure

| File                                                     | Responsibility                                                                        | Task  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----- |
| `src/server/communities/rituals.ts` (+`.test.ts`)        | Pure ritual cadence/due/label logic                                                   | 1     |
| `src/server/db/schema.ts` (modify)                       | `rituals`, `ritualOccurrences`, `communityEngageConfig` tables                        | 1     |
| `src/migrations/20260531d_engage_rituals.ts` (+ index)   | DDL for the 3 tables                                                                  | 1     |
| `src/app/api/cron/rituals/route.ts`                      | Daily fire: claim, supersede, post thread                                             | 2     |
| `vercel.json` (modify)                                   | Register the rituals cron                                                             | 2     |
| `src/server/api/routers/rituals.ts` (+ root.ts)          | Manage/approve/reviewSuggestion (`communityProcedure`)                                | 3     |
| `src/server/api/routers/advisory.ts` (modify)            | `suggestRitual`, `unactivatedNewcomers`, `suggestWelcome`, `suggestBroadcast`         | 3,6,7 |
| `src/app/api/mcp/advisory-tools.ts` (modify)             | `propose-ritual`, `get-unactivated-newcomers`, `suggest-welcome`, `suggest-broadcast` | 3,6,7 |
| `src/components/communities/rituals/*`                   | Ritual admin UI                                                                       | 4     |
| `src/server/notifications/ritual-items.ts` (+`.test.ts`) | Pure `buildRitualItems`                                                               | 5     |
| `src/app/api/cron/hub-digest/route.ts` (modify)          | Fill `ritualItems`                                                                    | 5     |
| `src/server/api/routers/engageConfig.ts` (+ root.ts)     | Digest toggle get/set (`communityProcedure`, owner/admin)                             | 5     |
| `src/server/inbox/dm.ts`                                 | Shared `sendDirectMessage` (DM dedup+insert)                                          | 6     |
| `src/server/api/routers/insights.ts` (modify)            | `sendWelcome` (organizer-UI, owner/admin/moderator)                                   | 6     |
| `src/server/api/routers/agent-management.ts` (modify)    | `reviewDraft` welcome_nudge + broadcast branches; community-scoped auth               | 6,7   |
| `src/server/notifications/broadcast-send.ts`             | Extracted `sendCommunityBroadcast`                                                    | 7     |
| `src/server/api/routers/broadcast.ts` (modify)           | Call `sendCommunityBroadcast`                                                         | 7     |
| `CONTEXT.md` (modify)                                    | Ritual lifecycle, engage config, draft-queue scope                                    | 8     |

---

## Task 1: Ritual core — schema, migration, pure cadence logic

**Files:**

- Create: `src/server/communities/rituals.ts`
- Test: `src/server/communities/rituals.test.ts`
- Modify: `src/server/db/schema.ts` (add 3 tables near `agentDrafts`, ~line 719)
- Create: `src/migrations/20260531d_engage_rituals.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Write the failing test for the pure logic**

Create `src/server/communities/rituals.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  dateKey,
  weekdayOf,
  weekdayLabel,
  isRitualDue,
  nextFireDate,
} from "./rituals";

// Fixed instants (UTC). 2026-06-01 is a Monday (weekday 1).
const MON = new Date("2026-06-01T13:00:00.000Z");
const TUE = new Date("2026-06-02T13:00:00.000Z");

describe("dateKey / weekdayOf / weekdayLabel", () => {
  it("dateKey returns the UTC YYYY-MM-DD", () => {
    expect(dateKey(MON)).toBe("2026-06-01");
  });
  it("weekdayOf returns 0=Sun..6=Sat in UTC", () => {
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(TUE)).toBe(2);
  });
  it("weekdayLabel maps to a short name", () => {
    expect(weekdayLabel(1)).toBe("Mon");
    expect(weekdayLabel(0)).toBe("Sun");
  });
});

describe("isRitualDue", () => {
  it("fires when active, weekday matches, and not yet fired today", () => {
    expect(
      isRitualDue({ weekday: 1, status: "active", lastFiredOn: null }, MON),
    ).toBe(true);
  });
  it("does not fire on a non-matching weekday", () => {
    expect(
      isRitualDue({ weekday: 1, status: "active", lastFiredOn: null }, TUE),
    ).toBe(false);
  });
  it("does not fire twice the same day (lastFiredOn === today)", () => {
    expect(
      isRitualDue(
        { weekday: 1, status: "active", lastFiredOn: "2026-06-01" },
        MON,
      ),
    ).toBe(false);
  });
  it("fires again a week later after a prior fire", () => {
    const nextMon = new Date("2026-06-08T13:00:00.000Z");
    expect(
      isRitualDue(
        { weekday: 1, status: "active", lastFiredOn: "2026-06-01" },
        nextMon,
      ),
    ).toBe(true);
  });
  it("never fires when paused", () => {
    expect(
      isRitualDue({ weekday: 1, status: "paused", lastFiredOn: null }, MON),
    ).toBe(false);
  });
});

describe("nextFireDate", () => {
  it("returns today's date when today matches the weekday", () => {
    expect(nextFireDate(1, MON)).toBe("2026-06-01");
  });
  it("returns the next matching weekday when today does not match", () => {
    // From Tuesday, next Monday is 2026-06-08
    expect(nextFireDate(1, TUE)).toBe("2026-06-08");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/server/communities/rituals.test.ts`
Expected: FAIL — `Cannot find module './rituals'`.

- [ ] **Step 3: Implement the pure logic**

Create `src/server/communities/rituals.ts`:

```typescript
/** Pure ritual scheduling logic. No DB, no clock — `now` is always injected. */

export type RitualMode = "auto" | "review";
export type RitualStatus = "active" | "paused";

export type RitualSchedule = {
  /** 0=Sunday .. 6=Saturday (UTC). */
  weekday: number;
  status: RitualStatus;
  /** "YYYY-MM-DD" of the last fire, or null if never fired. */
  lastFiredOn: string | null;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** UTC calendar-date key "YYYY-MM-DD" for an instant. */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** UTC weekday (0=Sun..6=Sat). */
export function weekdayOf(d: Date): number {
  return d.getUTCDay();
}

/** Short weekday label, e.g. 1 -> "Mon". */
export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[((weekday % 7) + 7) % 7]!;
}

/** True if this ritual should fire on `now`'s date. */
export function isRitualDue(r: RitualSchedule, now: Date): boolean {
  if (r.status !== "active") return false;
  if (weekdayOf(now) !== r.weekday) return false;
  return r.lastFiredOn !== dateKey(now);
}

/** The soonest date (>= `from`'s date) whose weekday matches, as "YYYY-MM-DD". */
export function nextFireDate(weekday: number, from: Date): string {
  const delta = (((weekday - weekdayOf(from)) % 7) + 7) % 7;
  const d = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate() + delta,
    ),
  );
  return dateKey(d);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/server/communities/rituals.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Add the schema tables**

In `src/server/db/schema.ts`, immediately after the `agentSuggestions` table (~line 719), add:

```typescript
export const rituals = appSchema.table("ritual", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  communityId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => communities.id),
  authorUserId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => user.id),
  suggestedByAgentId: d
    .varchar({ length: 255 })
    .references(() => agentProfiles.id),
  title: d.varchar({ length: 255 }).notNull(),
  body: d.text().notNull(),
  category: d.varchar({ length: 20 }).notNull().default("general"),
  weekday: d.integer().notNull(),
  mode: d.varchar({ length: 10 }).notNull().default("review"),
  status: d.varchar({ length: 10 }).notNull().default("active"),
  lastFiredOn: d.date(),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}));

export const ritualOccurrences = appSchema.table(
  "ritual_occurrence",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ritualId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => rituals.id),
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => communities.id),
    scheduledFor: d.date().notNull(),
    status: d.varchar({ length: 10 }).notNull().default("pending"),
    threadId: d.integer(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    postedAt: d.timestamp({ withTimezone: true }),
  }),
  (t) => [
    uniqueIndex("ritual_occurrence_ritual_date_uidx").on(
      t.ritualId,
      t.scheduledFor,
    ),
    index("ritual_occurrence_community_status_idx").on(t.communityId, t.status),
  ],
);

export const communityEngageConfig = appSchema.table(
  "community_engage_config",
  (d) => ({
    communityId: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .references(() => communities.id),
    ritualRecap: d.boolean().notNull().default(true),
    ritualReminder: d.boolean().notNull().default(true),
    atRiskLine: d.boolean().notNull().default(false),
    updatedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
);
```

> Confirm `index` and `uniqueIndex` are already imported at the top of schema.ts (they are — used by `introductions`). `d.date()` and `d.boolean()` / `d.integer()` are standard drizzle column builders available on the `d` helper.

- [ ] **Step 6: Write the migration**

Create `src/migrations/20260531d_engage_rituals.ts`:

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."ritual" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "author_user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "suggested_by_agent_id" varchar(255) REFERENCES "app"."agent_profile"("id"),
      "title" varchar(255) NOT NULL,
      "body" text NOT NULL,
      "category" varchar(20) DEFAULT 'general' NOT NULL,
      "weekday" integer NOT NULL,
      "mode" varchar(10) DEFAULT 'review' NOT NULL,
      "status" varchar(10) DEFAULT 'active' NOT NULL,
      "last_fired_on" date,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "ritual_community_idx" ON "app"."ritual" USING btree ("community_id");
    CREATE INDEX IF NOT EXISTS "ritual_status_weekday_idx" ON "app"."ritual" USING btree ("status","weekday");

    CREATE TABLE IF NOT EXISTS "app"."ritual_occurrence" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "ritual_id" varchar(255) NOT NULL REFERENCES "app"."ritual"("id"),
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "scheduled_for" date NOT NULL,
      "status" varchar(10) DEFAULT 'pending' NOT NULL,
      "thread_id" integer,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "posted_at" timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ritual_occurrence_ritual_date_uidx" ON "app"."ritual_occurrence" ("ritual_id","scheduled_for");
    CREATE INDEX IF NOT EXISTS "ritual_occurrence_community_status_idx" ON "app"."ritual_occurrence" USING btree ("community_id","status");

    CREATE TABLE IF NOT EXISTS "app"."community_engage_config" (
      "community_id" varchar(255) PRIMARY KEY NOT NULL REFERENCES "app"."community"("id"),
      "ritual_recap" boolean DEFAULT true NOT NULL,
      "ritual_reminder" boolean DEFAULT true NOT NULL,
      "at_risk_line" boolean DEFAULT false NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."community_engage_config";
    DROP TABLE IF EXISTS "app"."ritual_occurrence";
    DROP TABLE IF EXISTS "app"."ritual";
  `);
}
```

> Note: `thread_id` is intentionally **not** a FK (Payload's `forum_threads` lives in `public` and is Payload-managed; cross-schema integer reference kept loose, matching how Slice F/B referenced Payload ids).

- [ ] **Step 7: Register the migration**

In `src/migrations/index.ts`: add the import alongside the others, and append the entry as the **last** element of the `migrations` array:

```typescript
import * as migration_20260531d_engage_rituals from "./20260531d_engage_rituals";
```

```typescript
  {
    up: migration_20260531d_engage_rituals.up,
    down: migration_20260531d_engage_rituals.down,
    name: "20260531d_engage_rituals",
  },
```

- [ ] **Step 8: Typecheck + format**

Run: `pnpm check` (expect no new errors) and `pnpm prettier --write src/server/communities/rituals.ts src/server/communities/rituals.test.ts src/server/db/schema.ts src/migrations/20260531d_engage_rituals.ts src/migrations/index.ts`

- [ ] **Step 9: Commit**

```bash
git add src/server/communities/rituals.ts src/server/communities/rituals.test.ts src/server/db/schema.ts src/migrations/20260531d_engage_rituals.ts src/migrations/index.ts
git commit -m "feat(engage): ritual schema + migration + pure cadence logic"
```

---

## Task 2: Ritual cron — claim-guarded fire + thread materialization

**Files:**

- Create: `src/app/api/cron/rituals/route.ts`
- Modify: `vercel.json`

Reference patterns: `src/app/api/cron/hub-digest/route.ts` (auth + structure), `src/server/api/routers/forum.ts:491-507` (`payload.create` for `forum-threads`), `src/server/activity` `logActivity` (already imported in forum.ts).

- [ ] **Step 1: Write the cron route**

Create `src/app/api/cron/rituals/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { and, eq, lt, or, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { rituals, ritualOccurrences } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { logActivity } from "@/server/activity";
import {
  dateKey,
  isRitualDue,
  type RitualStatus,
} from "@/server/communities/rituals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = dateKey(now);
  let posted = 0;
  let pending = 0;

  const active = await db
    .select()
    .from(rituals)
    .where(eq(rituals.status, "active"));

  for (const r of active) {
    if (
      !isRitualDue(
        {
          weekday: r.weekday,
          status: r.status as RitualStatus,
          lastFiredOn: r.lastFiredOn,
        },
        now,
      )
    ) {
      continue;
    }

    // CAS claim: only one runner flips lastFiredOn for today.
    const claimed = await db
      .update(rituals)
      .set({ lastFiredOn: today })
      .where(
        and(
          eq(rituals.id, r.id),
          or(isNull(rituals.lastFiredOn), lt(rituals.lastFiredOn, today)),
        ),
      )
      .returning({ id: rituals.id });
    if (claimed.length === 0) continue; // another runner won

    // Supersede any still-pending occurrence (heartbeat stays current).
    await db
      .update(ritualOccurrences)
      .set({ status: "skipped" })
      .where(
        and(
          eq(ritualOccurrences.ritualId, r.id),
          eq(ritualOccurrences.status, "pending"),
        ),
      );

    // Create the occurrence row; the unique (ritual_id, scheduled_for) index
    // absorbs a double-fire race.
    let occurrenceId: string;
    try {
      const [occ] = await db
        .insert(ritualOccurrences)
        .values({
          ritualId: r.id,
          communityId: r.communityId,
          scheduledFor: today,
          status: r.mode === "auto" ? "posted" : "pending",
        })
        .returning({ id: ritualOccurrences.id });
      occurrenceId = occ!.id;
    } catch {
      continue; // occurrence for today already exists
    }

    if (r.mode === "review") {
      pending++;
      continue; // an admin approves it via rituals.approveOccurrence
    }

    // auto mode: post the thread now, in the author's name.
    const threadId = await postRitualThread(r);
    await db
      .update(ritualOccurrences)
      .set({ status: "posted", threadId, postedAt: new Date() })
      .where(eq(ritualOccurrences.id, occurrenceId));
    posted++;
  }

  return NextResponse.json({ success: true, posted, pending, today });
}

/** Materialise a ritual as a forum thread authored by the ritual owner. */
async function postRitualThread(r: {
  id: string;
  communityId: string;
  authorUserId: string;
  title: string;
  body: string;
  category: string;
}): Promise<number> {
  const payload = await getPayloadClient();
  const baseSlug = r.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const slug = `${baseSlug}-${Date.now()}`;

  const author = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, r.authorUserId),
    columns: { name: true },
  });

  const thread = await payload.create({
    collection: "forum-threads",
    data: {
      title: r.title,
      slug,
      content: plainTextToLexical(r.body),
      category: r.category,
      authorId: r.authorUserId,
      authorName: author?.name ?? "organizer",
      authorRole: "member",
      isPinned: false,
      isLocked: false,
      replyCount: 0,
      lastActivityAt: new Date().toISOString(),
      communityId: r.communityId,
    },
  });

  await logActivity(db, {
    actorId: r.authorUserId,
    actorType: "member",
    action: "thread.create",
    targetType: "forum-threads",
    targetId: String(thread.id),
    communityId: r.communityId,
    metadata: { title: r.title, category: r.category, slug, ritualId: r.id },
  });

  return Number(thread.id);
}
```

> Verify the exact import paths during implementation: `getPayloadClient` (grep `export.*getPayloadClient` — used in forum.ts), `logActivity` (grep `export.*function logActivity`), `plainTextToLexical` from `@/server/challenge-engine/lexical`. Match the signatures used in `forum.ts:480-517`.

- [ ] **Step 2: Register the cron in `vercel.json`**

Add to the `crons` array (after the `hub-digest` entry):

```json
{
  "path": "/api/cron/rituals",
  "schedule": "0 13 * * *"
}
```

Daily at 13:00 UTC — one hour before the Monday 14:00 hub-digest, so Monday rituals are posted before the digest recaps them.

- [ ] **Step 3: Verify build + typecheck**

Run: `pnpm check`
Expected: no new errors. (This route has no unit test — it is thin glue over the tested `isRitualDue` core and Payload. It is exercised manually below.)

- [ ] **Step 4: Manual smoke (optional, requires DB)**

With a seeded `active` ritual whose `weekday` = today and `mode` = `auto`:
Run: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/rituals`
Expected JSON: `{ success: true, posted: 1, ... }` and a new `forum_threads` row + `ritual_occurrence` row with `status='posted'`.

- [ ] **Step 5: Format + commit**

```bash
pnpm prettier --write src/app/api/cron/rituals/route.ts vercel.json
git add src/app/api/cron/rituals/route.ts vercel.json
git commit -m "feat(engage): rituals cron — claim-guarded fire + thread materialization"
```

---

## Task 3: Ritual tRPC + agent suggest/review + MCP

**Files:**

- Create: `src/server/api/routers/rituals.ts`
- Modify: `src/server/api/root.ts` (register `ritualsRouter`)
- Modify: `src/server/api/routers/advisory.ts` (add `suggestRitual`)
- Modify: `src/app/api/mcp/advisory-tools.ts` (add `propose-ritual`)

Role rule: rituals are owner/admin/moderator. Define a local guard mirroring `insights.ts:34` `requireAdmin`.

- [ ] **Step 1: Write the rituals router**

Create `src/server/api/routers/rituals.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import { rituals, ritualOccurrences, agentDrafts } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { logActivity } from "@/server/activity";
import { dateKey } from "@/server/communities/rituals";

/** owner/admin/moderator may manage rituals. */
function requireManager(role: string | null) {
  if (role !== "owner" && role !== "admin" && role !== "moderator") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

const ritualInput = z.object({
  title: z.string().min(3).max(255),
  body: z.string().min(1).max(10000),
  category: z
    .enum(["general", "question", "showcase", "job"])
    .default("general"),
  weekday: z.number().int().min(0).max(6),
  mode: z.enum(["auto", "review"]).default("review"),
});

export const ritualsRouter = createTRPCRouter({
  list: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireManager(ctx.communityRole);
      return ctx.db
        .select()
        .from(rituals)
        .where(eq(rituals.communityId, ctx.community.id))
        .orderBy(desc(rituals.createdAt));
    }),

  create: communityProcedure
    .input(ritualInput.extend({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      const [r] = await ctx.db
        .insert(rituals)
        .values({
          communityId: ctx.community.id,
          authorUserId: ctx.session.user.id,
          title: input.title,
          body: input.body,
          category: input.category,
          weekday: input.weekday,
          mode: input.mode,
        })
        .returning({ id: rituals.id });
      return { ritualId: r!.id };
    }),

  update: communityProcedure
    .input(
      ritualInput.partial().extend({ slug: z.string(), ritualId: z.string() }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      const { slug: _slug, ritualId, ...fields } = input;
      await ctx.db
        .update(rituals)
        .set(fields)
        .where(
          and(
            eq(rituals.id, ritualId),
            eq(rituals.communityId, ctx.community.id),
          ),
        );
      return { ok: true };
    }),

  setStatus: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        ritualId: z.string(),
        status: z.enum(["active", "paused"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      await ctx.db
        .update(rituals)
        .set({ status: input.status })
        .where(
          and(
            eq(rituals.id, input.ritualId),
            eq(rituals.communityId, ctx.community.id),
          ),
        );
      return { ok: true };
    }),

  pendingOccurrences: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireManager(ctx.communityRole);
      return ctx.db
        .select({
          id: ritualOccurrences.id,
          ritualId: ritualOccurrences.ritualId,
          scheduledFor: ritualOccurrences.scheduledFor,
          title: rituals.title,
          body: rituals.body,
        })
        .from(ritualOccurrences)
        .innerJoin(rituals, eq(rituals.id, ritualOccurrences.ritualId))
        .where(
          and(
            eq(ritualOccurrences.communityId, ctx.community.id),
            eq(ritualOccurrences.status, "pending"),
          ),
        )
        .orderBy(desc(ritualOccurrences.createdAt));
    }),

  approveOccurrence: communityProcedure
    .input(z.object({ slug: z.string(), occurrenceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      // CAS claim: only flip a still-pending occurrence in this community.
      const [occ] = await ctx.db
        .update(ritualOccurrences)
        .set({ status: "posted", postedAt: new Date() })
        .where(
          and(
            eq(ritualOccurrences.id, input.occurrenceId),
            eq(ritualOccurrences.communityId, ctx.community.id),
            eq(ritualOccurrences.status, "pending"),
          ),
        )
        .returning();
      if (!occ) throw new TRPCError({ code: "NOT_FOUND" });

      const [r] = await ctx.db
        .select()
        .from(rituals)
        .where(eq(rituals.id, occ.ritualId))
        .limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });

      const payload = await getPayloadClient();
      const slug = `${r.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)}-${Date.now()}`;
      const thread = await payload.create({
        collection: "forum-threads",
        data: {
          title: r.title,
          slug,
          content: plainTextToLexical(r.body),
          category: r.category,
          authorId: r.authorUserId,
          authorName: ctx.session.user.name ?? "organizer",
          authorRole: "member",
          isPinned: false,
          isLocked: false,
          replyCount: 0,
          lastActivityAt: new Date().toISOString(),
          communityId: r.communityId,
        },
      });
      await ctx.db
        .update(ritualOccurrences)
        .set({ threadId: Number(thread.id) })
        .where(eq(ritualOccurrences.id, occ.id));
      await logActivity(ctx.db, {
        actorId: r.authorUserId,
        actorType: "member",
        action: "thread.create",
        targetType: "forum-threads",
        targetId: String(thread.id),
        communityId: r.communityId,
        metadata: { title: r.title, ritualId: r.id, slug },
      });
      return { threadId: Number(thread.id) };
    }),

  skipOccurrence: communityProcedure
    .input(z.object({ slug: z.string(), occurrenceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      await ctx.db
        .update(ritualOccurrences)
        .set({ status: "skipped" })
        .where(
          and(
            eq(ritualOccurrences.id, input.occurrenceId),
            eq(ritualOccurrences.communityId, ctx.community.id),
            eq(ritualOccurrences.status, "pending"),
          ),
        );
      return { ok: true };
    }),

  // Agent proposed a ritual definition (advisory.suggestRitual draft). Approving
  // creates the ritual; the agent never creates rituals directly.
  reviewSuggestion: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        draftId: z.string(),
        action: z.enum(["approved", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      // CAS claim the pending draft.
      const [draft] = await ctx.db
        .update(agentDrafts)
        .set({ status: input.action })
        .where(
          and(
            eq(agentDrafts.id, input.draftId),
            eq(agentDrafts.type, "ritual_suggestion"),
            eq(agentDrafts.status, "pending"),
          ),
        )
        .returning();
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });

      const meta = (draft.metadata ?? {}) as {
        communityId?: string;
        title?: string;
        body?: string;
        category?: string;
        weekday?: number;
        mode?: string;
      };
      if (meta.communityId !== ctx.community.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (input.action === "rejected") return { ok: true, ritualId: null };

      const [r] = await ctx.db
        .insert(rituals)
        .values({
          communityId: ctx.community.id,
          authorUserId: ctx.session.user.id,
          suggestedByAgentId: draft.agentId,
          title: meta.title ?? draft.content,
          body: meta.body ?? draft.content,
          category: meta.category ?? "general",
          weekday: meta.weekday ?? 1,
          mode: meta.mode === "auto" ? "auto" : "review",
        })
        .returning({ id: rituals.id });
      return { ok: true, ritualId: r!.id };
    }),
});
```

> `dateKey` import may be unused here — drop it if so to satisfy lint. Keep `approveOccurrence`/cron thread-creation in sync; if you refactor the Payload create, extract a shared `createForumThread` helper (optional deepening).

- [ ] **Step 2: Register the router**

In `src/server/api/root.ts`: import `import { ritualsRouter } from "@/server/api/routers/rituals";` and add `rituals: ritualsRouter,` to `appRouter`.

- [ ] **Step 3: Add `suggestRitual` to the advisory router**

In `src/server/api/routers/advisory.ts`, add this procedure inside `advisoryRouter` (after `suggestRevival`):

```typescript
  /** Draft a ritual definition for an admin to approve (never created directly). */
  suggestRitual: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        title: z.string().min(3).max(255),
        body: z.string().min(1).max(10000),
        category: z
          .enum(["general", "question", "showcase", "job"])
          .default("general"),
        weekday: z.number().int().min(0).max(6),
        mode: z.enum(["auto", "review"]).default("review"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "write");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(ctx.db, input.slug, ownerId);
      const [d] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "ritual_suggestion",
          targetType: "community",
          targetId: community.id,
          content: input.title,
          metadata: {
            communityId: community.id,
            communitySlug: input.slug,
            title: input.title,
            body: input.body,
            category: input.category,
            weekday: input.weekday,
            mode: input.mode,
          },
        })
        .returning({ id: agentDrafts.id });
      return { draftId: d!.id };
    }),
```

> Confirm the exact scope string used for writes in `suggestRevival` (`requireScope(ctx.agent.scopes, "write")` vs `"read"`) — mirror `suggestRevival` exactly.

- [ ] **Step 4: Add the `propose-ritual` MCP tool**

In `src/app/api/mcp/advisory-tools.ts`, inside `registerAdvisoryTools`, add:

```typescript
server.registerTool(
  "propose-ritual",
  {
    description:
      "Draft a recurring community ritual (a weekly prompt thread) for an admin to review and approve. You never create rituals directly — the admin approves your draft.",
    inputSchema: {
      slug: z.string().describe("Slug of a community you organize."),
      title: z.string().describe("Thread title for the ritual prompt."),
      body: z.string().describe("Thread body / prompt copy."),
      category: z
        .enum(["general", "question", "showcase", "job"])
        .default("general")
        .describe("Forum category for the posted thread."),
      weekday: z
        .number()
        .min(0)
        .max(6)
        .describe("Day of week to post (0=Sunday .. 6=Saturday)."),
      mode: z
        .enum(["auto", "review"])
        .default("review")
        .describe(
          "auto = system posts each week automatically; review = an admin approves each occurrence.",
        ),
    },
  },
  async ({ slug, title, body, category, weekday, mode }) => {
    const result = await caller.advisory.suggestRitual({
      slug,
      title,
      body,
      category,
      weekday,
      mode,
    });
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(result, null, 2) },
      ],
    };
  },
);
```

- [ ] **Step 5: Typecheck + format + commit**

Run: `pnpm check` then `pnpm prettier --write` on the four files.

```bash
git add src/server/api/routers/rituals.ts src/server/api/root.ts src/server/api/routers/advisory.ts src/app/api/mcp/advisory-tools.ts
git commit -m "feat(engage): rituals tRPC router + suggestRitual advisory + propose-ritual MCP"
```

---

## Task 4: Ritual admin UI

**Files:**

- Create: `src/components/communities/rituals/rituals-manager.tsx`
- Create: `src/components/communities/rituals/ritual-form.tsx`
- Create: `src/components/communities/rituals/pending-occurrences.tsx`
- Modify: the community admin/insights surface to mount `RitualsManager` (mirror where `insights-dashboard.tsx` is mounted — grep `InsightsDashboard` usage and add a sibling tab/section).

Mirror styling/data patterns from `src/components/communities/insights/insights-dashboard.tsx` and existing `agent-drafts.tsx`. Use `api.rituals.*` (tRPC React hooks, `api` from `@/trpc/react`).

- [ ] **Step 1: Build the form component**

Create `src/components/communities/rituals/ritual-form.tsx` — a controlled form (title, body textarea, category select, weekday select 0–6 rendered with `weekdayLabel`, mode toggle auto/review) that calls `api.rituals.create.useMutation()` (or `update` when editing) and invalidates `api.rituals.list`. Follow the form idiom in `ritual-form` siblings (e.g. broadcast composer / event form). Pass `slug` through props.

```tsx
"use client";
import { useState } from "react";
import { api } from "@/trpc/react";
import { weekdayLabel } from "@/server/communities/rituals";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function RitualForm({
  slug,
  onDone,
}: {
  slug: string;
  onDone: () => void;
}) {
  const utils = api.useUtils();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<
    "general" | "question" | "showcase" | "job"
  >("general");
  const [weekday, setWeekday] = useState(1);
  const [mode, setMode] = useState<"auto" | "review">("review");
  const create = api.rituals.create.useMutation({
    onSuccess: async () => {
      await utils.rituals.list.invalidate({ slug });
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({ slug, title, body, category, weekday, mode });
      }}
      className="space-y-3"
    >
      {/* title input, body textarea, category <select>, weekday <select> mapping
          WEEKDAYS.map(d => <option value={d}>{weekdayLabel(d)}</option>),
          mode radio auto/review, submit button disabled while create.isPending.
          Match existing form styling (Tailwind classes used by insights/broadcast). */}
    </form>
  );
}
```

- [ ] **Step 2: Build the pending-occurrence approvals component**

Create `src/components/communities/rituals/pending-occurrences.tsx` — lists `api.rituals.pendingOccurrences.useQuery({ slug })`, each with Approve (`api.rituals.approveOccurrence`) and Skip (`api.rituals.skipOccurrence`) buttons; invalidate `pendingOccurrences` on success. Mirror `agent-drafts.tsx` approve/reject button layout.

- [ ] **Step 3: Build the manager shell**

Create `src/components/communities/rituals/rituals-manager.tsx` — renders the ritual list (`api.rituals.list.useQuery({ slug })`) with status badge, weekday label, mode, pause/resume (`api.rituals.setStatus`), an "Add ritual" button toggling `RitualForm`, and mounts `PendingOccurrences`. Gate the whole surface behind the caller being owner/admin/moderator (the tRPC procedures already enforce this; UI just hides if the query errors with FORBIDDEN).

- [ ] **Step 4: Mount it**

Add a "Rituals" section/tab next to Insights in the community admin surface (grep `InsightsDashboard` to find the parent; add `<RitualsManager slug={slug} />`).

- [ ] **Step 5: Verify + format + commit**

Run: `pnpm check`. Manually load the community admin page, create a `review`-mode ritual, confirm it appears.

```bash
pnpm prettier --write src/components/communities/rituals/*.tsx <parent file>
git add src/components/communities/rituals/ <parent file>
git commit -m "feat(engage): ritual admin UI — list, create/edit, pause, approve occurrences"
```

---

## Task 5: Digest recall — buildRitualItems + hub-digest wiring + config toggles

**Files:**

- Create: `src/server/notifications/ritual-items.ts`
- Test: `src/server/notifications/ritual-items.test.ts`
- Modify: `src/app/api/cron/hub-digest/route.ts`
- Create: `src/server/api/routers/engageConfig.ts`
- Modify: `src/server/api/root.ts`
- Create/Modify: community settings UI for the toggles (mirror notification-prefs UI).

- [ ] **Step 1: Write the failing test for `buildRitualItems`**

Create `src/server/notifications/ritual-items.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildRitualItems, type EngageConfig } from "./ritual-items";

const ALL_ON: EngageConfig = {
  ritualRecap: true,
  ritualReminder: true,
  atRiskLine: true,
};

describe("buildRitualItems", () => {
  it("returns recap + reminder + at-risk line in order when all enabled", () => {
    const items = buildRitualItems({
      config: ALL_ON,
      recap: [{ title: "Show your work", replyCount: 8 }],
      reminders: [{ title: "Weekly standup", weekdayLabel: "Mon" }],
      recipientIsAtRisk: true,
      recipientName: "Sam",
    });
    expect(items).toEqual([
      "Show your work — 8 replies this week",
      "Up next: Weekly standup (Mon)",
      "We've missed you, Sam — jump back in",
    ]);
  });

  it("singularizes one reply", () => {
    const items = buildRitualItems({
      config: { ritualRecap: true, ritualReminder: false, atRiskLine: false },
      recap: [{ title: "Intro thread", replyCount: 1 }],
      reminders: [],
      recipientIsAtRisk: false,
      recipientName: "X",
    });
    expect(items).toEqual(["Intro thread — 1 reply this week"]);
  });

  it("omits each item when its toggle is off", () => {
    const items = buildRitualItems({
      config: { ritualRecap: false, ritualReminder: true, atRiskLine: false },
      recap: [{ title: "Hidden", replyCount: 3 }],
      reminders: [{ title: "Standup", weekdayLabel: "Tue" }],
      recipientIsAtRisk: true,
      recipientName: "Sam",
    });
    expect(items).toEqual(["Up next: Standup (Tue)"]);
  });

  it("omits the at-risk line when the recipient is not at risk", () => {
    const items = buildRitualItems({
      config: ALL_ON,
      recap: [],
      reminders: [],
      recipientIsAtRisk: false,
      recipientName: "Sam",
    });
    expect(items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/server/notifications/ritual-items.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildRitualItems`**

Create `src/server/notifications/ritual-items.ts`:

```typescript
export type EngageConfig = {
  ritualRecap: boolean;
  ritualReminder: boolean;
  atRiskLine: boolean;
};

export type RitualRecapItem = { title: string; replyCount: number };
export type RitualReminderItem = { title: string; weekdayLabel: string };

/** Compose the digest `ritualItems` strings for one recipient. Pure. */
export function buildRitualItems(opts: {
  config: EngageConfig;
  recap: RitualRecapItem[];
  reminders: RitualReminderItem[];
  recipientIsAtRisk: boolean;
  recipientName: string;
}): string[] {
  const items: string[] = [];
  if (opts.config.ritualRecap) {
    for (const r of opts.recap) {
      const noun = r.replyCount === 1 ? "reply" : "replies";
      items.push(`${r.title} — ${r.replyCount} ${noun} this week`);
    }
  }
  if (opts.config.ritualReminder) {
    for (const r of opts.reminders) {
      items.push(`Up next: ${r.title} (${r.weekdayLabel})`);
    }
  }
  if (opts.config.atRiskLine && opts.recipientIsAtRisk) {
    items.push(`We've missed you, ${opts.recipientName} — jump back in`);
  }
  return items;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/server/notifications/ritual-items.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the engage-config router**

Create `src/server/api/routers/engageConfig.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import { communityEngageConfig } from "@/server/db/schema";

const DEFAULTS = { ritualRecap: true, ritualReminder: true, atRiskLine: false };

function requireConfigAdmin(role: string | null) {
  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const engageConfigRouter = createTRPCRouter({
  get: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireConfigAdmin(ctx.communityRole);
      const [row] = await ctx.db
        .select()
        .from(communityEngageConfig)
        .where(eq(communityEngageConfig.communityId, ctx.community.id))
        .limit(1);
      return row
        ? {
            ritualRecap: row.ritualRecap,
            ritualReminder: row.ritualReminder,
            atRiskLine: row.atRiskLine,
          }
        : DEFAULTS;
    }),

  set: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        ritualRecap: z.boolean(),
        ritualReminder: z.boolean(),
        atRiskLine: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireConfigAdmin(ctx.communityRole);
      await ctx.db
        .insert(communityEngageConfig)
        .values({
          communityId: ctx.community.id,
          ritualRecap: input.ritualRecap,
          ritualReminder: input.ritualReminder,
          atRiskLine: input.atRiskLine,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: communityEngageConfig.communityId,
          set: {
            ritualRecap: input.ritualRecap,
            ritualReminder: input.ritualReminder,
            atRiskLine: input.atRiskLine,
            updatedAt: new Date(),
          },
        });
      return { ok: true };
    }),
});
```

Register in `root.ts`: `import { engageConfigRouter } from "@/server/api/routers/engageConfig";` + `engageConfig: engageConfigRouter,`.

- [ ] **Step 6: Wire `ritualItems` into the hub-digest cron**

In `src/app/api/cron/hub-digest/route.ts`, after the existing `counts`/`countMap` block and before the per-user loop, add the recall data sources:

```typescript
import {
  communityEngageConfig,
  rituals,
  ritualOccurrences,
} from "@/server/db/schema";
import { buildRitualItems } from "@/server/notifications/ritual-items";
import { nextFireDate, weekdayLabel } from "@/server/communities/rituals";
import { selectAtRisk } from "@/server/communities/insights";
```

```typescript
// Engage config per community (absent => defaults).
const cfgRows = await db.select().from(communityEngageConfig);
const cfgByCommunity = new Map(cfgRows.map((c) => [c.communityId, c]));
const cfgOf = (communityId: string) =>
  cfgByCommunity.get(communityId) ?? {
    ritualRecap: true,
    ritualReminder: true,
    atRiskLine: false,
  };

// This week's posted ritual occurrences (recap), with thread reply counts.
const recapRows = await db
  .select({
    communityId: ritualOccurrences.communityId,
    title: rituals.title,
    threadId: ritualOccurrences.threadId,
  })
  .from(ritualOccurrences)
  .innerJoin(rituals, eq(rituals.id, ritualOccurrences.ritualId))
  .where(
    and(
      eq(ritualOccurrences.status, "posted"),
      gte(ritualOccurrences.postedAt, weekAgo),
    ),
  );
// Reply counts come from Payload forum_threads; fetch in one query if needed.
// (Use a payload.find on forum-threads by id-in, or a raw select on
//  public.forum_threads.reply_count — mirror however the digest reads counts.)
const recapByCommunity = new Map<
  string,
  { title: string; replyCount: number }[]
>();
for (const r of recapRows) {
  const list = recapByCommunity.get(r.communityId) ?? [];
  list.push({ title: r.title, replyCount: 0 /* fill from forum_threads */ });
  recapByCommunity.set(r.communityId, list);
}

// Upcoming rituals (reminder).
const activeRituals = await db
  .select()
  .from(rituals)
  .where(eq(rituals.status, "active"));
const remindersByCommunity = new Map<
  string,
  { title: string; weekdayLabel: string }[]
>();
for (const r of activeRituals) {
  const list = remindersByCommunity.get(r.communityId) ?? [];
  void nextFireDate(r.weekday, now); // computed if a date is desired in copy
  list.push({ title: r.title, weekdayLabel: weekdayLabel(r.weekday) });
  remindersByCommunity.set(r.communityId, list);
}

// At-risk member sets per community (only for communities with the toggle on).
const atRiskByCommunity = new Map<string, Set<string>>();
for (const c of cfgRows) {
  if (!c.atRiskLine) continue;
  // Reuse selectAtRisk — mirror advisory.atRiskMembers' membership+activity queries
  // for c.communityId, then store new Set(atRisk.map(m => m.userId)).
}
```

Then change the `ritualItems: []` line (currently `route.ts:109`) inside the per-user `summarizeCommunitySection` mapping to:

```typescript
        ritualItems: buildRitualItems({
          config: cfgOf(r.communityId),
          recap: recapByCommunity.get(r.communityId) ?? [],
          reminders: remindersByCommunity.get(r.communityId) ?? [],
          recipientIsAtRisk:
            atRiskByCommunity.get(r.communityId)?.has(userId) ?? false,
          recipientName: r.communityName /* prefer the member's name; see note */,
        }),
```

> **Implementation notes for the subagent:** (1) reply counts — read `public.forum_threads.reply_count` for the recap thread ids (one batched read), since `summarizeCommunitySection` only needs an integer; if the digest already has no Payload access in this cron, select reply_count via a raw drizzle query on the Payload table or via `getPayloadClient().find`. (2) `recipientName` should be the member's display name — the current `memberships` select only has `email`; add `name: user.name` to that select (line ~57-62) and thread it through `byUser`. (3) `selectAtRisk` needs the same `memberships`+`activityEvents` inputs as `advisory.atRiskMembers` (advisory.ts:91-144) — copy that query shape, scoped per at-risk-enabled community, computed once before the user loop. Keep all of this **before** the per-user loop so it runs once.

- [ ] **Step 7: Build the toggles UI**

Add a "Digest recall" settings panel in the community admin area (mirror `notification-prefs` toggle UI). Three switches bound to `api.engageConfig.get`/`set`. Gate to owner/admin (the procedure enforces; hide on FORBIDDEN). The at-risk switch carries a helper caption: "Shows a personal 'we miss you' line to members who've gone quiet."

- [ ] **Step 8: Typecheck, full test run, format, commit**

Run: `pnpm vitest run src/server/notifications/ritual-items.test.ts` (PASS) and `pnpm check`.

```bash
pnpm prettier --write <changed files>
git add src/server/notifications/ritual-items.ts src/server/notifications/ritual-items.test.ts src/app/api/cron/hub-digest/route.ts src/server/api/routers/engageConfig.ts src/server/api/root.ts <ui files>
git commit -m "feat(engage): digest recall — buildRitualItems + hub-digest wiring + config toggles"
```

---

## Task 6: Warm-welcome — DM helper, advisory, organizer-UI, reviewDraft branch, MCP

**Files:**

- Create: `src/server/inbox/dm.ts`
- Modify: `src/server/api/routers/agent-management.ts` (use helper in revival branch; add welcome branch; community-scoped auth)
- Modify: `src/server/api/routers/advisory.ts` (`unactivatedNewcomers`, `suggestWelcome`)
- Modify: `src/server/api/routers/insights.ts` (`sendWelcome`)
- Modify: `src/app/api/mcp/advisory-tools.ts` (`get-unactivated-newcomers`, `suggest-welcome`)
- Modify: `src/components/communities/insights/unactivated-list.tsx` (draft/send welcome button)

- [ ] **Step 1: Extract the shared DM helper**

Create `src/server/inbox/dm.ts`:

```typescript
import { and, eq, sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import {
  conversations,
  conversationParticipants,
  messages,
} from "@/server/db/schema";

type DB = typeof _db;

/** Send a direct message from one user to another, reusing an existing DM
 *  conversation if one exists (mirrors inbox.startConversation dedup). No
 *  transaction — claim/dedup pattern only. Returns the conversation id. */
export async function sendDirectMessage(
  db: DB,
  fromUserId: string,
  toUserId: string,
  content: string,
): Promise<string> {
  const [existing] = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .innerJoin(
      conversations,
      eq(conversations.id, conversationParticipants.conversationId),
    )
    .where(
      and(
        eq(conversations.type, "dm"),
        eq(conversationParticipants.userId, toUserId),
        sql`${conversationParticipants.conversationId} IN (
          SELECT ${conversationParticipants.conversationId} FROM ${conversationParticipants} WHERE ${conversationParticipants.userId} = ${fromUserId}
        )`,
      ),
    )
    .limit(1);

  let conversationId = existing?.conversationId;
  if (!conversationId) {
    const [conv] = await db
      .insert(conversations)
      .values({ type: "dm" })
      .returning();
    await db.insert(conversationParticipants).values([
      { conversationId: conv!.id, userId: fromUserId },
      { conversationId: conv!.id, userId: toUserId },
    ]);
    conversationId = conv!.id;
  }
  await db.insert(messages).values({
    conversationId,
    senderId: fromUserId,
    senderType: "human",
    content,
  });
  return conversationId;
}
```

- [ ] **Step 2: Refactor `reviewDraft` to use the helper + add community-scoped auth + welcome branch**

In `src/server/api/routers/agent-management.ts`:

(a) import `import { sendDirectMessage } from "@/server/inbox/dm";` and `import { communityMemberships } from "@/server/db/schema";` (if not already imported).

(b) Replace the body of `reviewDraft` (lines 666-770) so authorization happens **before** the CAS update, scoped by draft type. Read the draft first, authorize, then CAS:

```typescript
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [existing] = await ctx.db
        .select()
        .from(agentDrafts)
        .where(eq(agentDrafts.id, input.draftId))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      }

      // Authorize per draft type.
      const OWNER_SCOPED = ["thread_reply", "revival_nudge"];
      if (OWNER_SCOPED.includes(existing.type)) {
        if (existing.ownerId !== userId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      } else {
        // Community-scoped drafts (welcome_nudge, broadcast): any qualifying
        // admin of the draft's community may act.
        const communityId = (existing.metadata as { communityId?: string })
          ?.communityId;
        if (!communityId) throw new TRPCError({ code: "FORBIDDEN" });
        const allowedRoles =
          existing.type === "broadcast"
            ? ["owner", "admin"]
            : ["owner", "admin", "moderator"]; // welcome_nudge
        const [m] = await ctx.db
          .select({ role: communityMemberships.role })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, communityId),
              eq(communityMemberships.userId, userId),
              eq(communityMemberships.status, "active"),
            ),
          )
          .limit(1);
        if (!m || !allowedRoles.includes(m.role)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      // CAS claim.
      const [draft] = await ctx.db
        .update(agentDrafts)
        .set({ status: input.action })
        .where(
          and(
            eq(agentDrafts.id, input.draftId),
            eq(agentDrafts.status, "pending"),
          ),
        )
        .returning();
      if (!draft) {
        throw new TRPCError({ code: "CONFLICT", message: "Already reviewed" });
      }

      // ... existing thread_reply branch unchanged ...

      // Revival nudge → organizer DM (now via helper).
      if (
        input.action === "approved" &&
        draft.type === "revival_nudge" &&
        draft.targetId
      ) {
        await sendDirectMessage(ctx.db, userId, draft.targetId, draft.content ?? "");
      }

      // Welcome nudge → organizer DM to the newcomer.
      if (
        input.action === "approved" &&
        draft.type === "welcome_nudge" &&
        draft.targetId
      ) {
        await sendDirectMessage(ctx.db, userId, draft.targetId, draft.content ?? "");
      }

      // (broadcast branch added in Task 7)

      return draft;
    }),
```

> Keep the existing `thread_reply` Payload publish block verbatim (lines 688-722). Only the revival branch's inline DM code (lines 730-766) is replaced by the `sendDirectMessage` call.

- [ ] **Step 3: Add advisory `unactivatedNewcomers` + `suggestWelcome`**

In `src/server/api/routers/advisory.ts`, import `selectUnactivated` and `type UnactivatedNewcomer` from insights, and add:

```typescript
  /** Un-activated newcomers the agent can draft a welcome for. */
  unactivatedNewcomers: agentProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(ctx.db, input.slug, ownerId);

      const now = new Date();
      const since = windowStart(now, 30); // max newcomer age
      const [memberships, contributorRows] = await Promise.all([
        ctx.db
          .select({
            userId: communityMemberships.userId,
            role: communityMemberships.role,
            status: communityMemberships.status,
            joinedAt: communityMemberships.joinedAt,
          })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, community.id),
              eq(communityMemberships.status, "active"),
            ),
          ),
        ctx.db
          .selectDistinct({ actorId: activityEvents.actorId })
          .from(activityEvents)
          .where(
            and(
              eq(activityEvents.communityId, community.id),
              gte(activityEvents.createdAt, since),
              inArray(activityEvents.action, CONTRIBUTION_ACTION_LIST),
            ),
          ),
      ]);

      return selectUnactivated({
        memberships: memberships as MembershipRow[],
        contributorUserIds: contributorRows.map((r) => r.actorId),
        now,
        minAgeDays: 3,
        maxAgeDays: 30,
      });
    }),

  /** Draft a warm-welcome DM for an un-activated newcomer. */
  suggestWelcome: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        memberUserId: z.string(),
        message: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "write");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(ctx.db, input.slug, ownerId);
      const [d] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "welcome_nudge",
          targetType: "user",
          targetId: input.memberUserId,
          content: input.message,
          metadata: { communityId: community.id, communitySlug: input.slug },
        })
        .returning({ id: agentDrafts.id });
      return { draftId: d!.id };
    }),
```

> Confirm `selectUnactivated`'s exact `minAgeDays`/`maxAgeDays` against `src/server/api/routers/insights.ts` `unactivatedNewcomers` and match those values rather than hard-coding new ones if they differ. `windowStart` is already imported.

- [ ] **Step 4: Add organizer-UI `insights.sendWelcome`**

In `src/server/api/routers/insights.ts`, import `sendDirectMessage` and add (using the existing `requireAdmin` which allows owner/admin/moderator):

```typescript
  sendWelcome: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        memberUserId: z.string(),
        message: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.communityRole);
      // Confirm the target is an active member of this community.
      const [m] = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, ctx.community.id),
            eq(communityMemberships.userId, input.memberUserId),
            eq(communityMemberships.status, "active"),
          ),
        )
        .limit(1);
      if (!m) throw new TRPCError({ code: "NOT_FOUND" });
      await sendDirectMessage(
        ctx.db,
        ctx.session.user.id,
        input.memberUserId,
        input.message,
      );
      return { ok: true };
    }),
```

> Verify `insights.ts` already uses `communityProcedure` (it reads `ctx.communityRole`) and imports `communityMemberships`/`TRPCError`/`and`/`eq` — add any missing imports.

- [ ] **Step 5: Add the two MCP tools**

In `advisory-tools.ts` add `get-unactivated-newcomers` (wraps `caller.advisory.unactivatedNewcomers`) and `suggest-welcome` (wraps `caller.advisory.suggestWelcome`), mirroring the `get-at-risk-members`/`suggest-revival` shape from Task 3.

- [ ] **Step 6: Add the welcome action to the un-activated list UI**

In `src/components/communities/insights/unactivated-list.tsx`, add a "Send welcome" affordance per newcomer: a small composer (pre-filled template text) that calls `api.insights.sendWelcome.useMutation()`. Mirror the existing list's button/row styling.

- [ ] **Step 7: Typecheck + format + commit**

Run: `pnpm check` and existing tests `pnpm vitest run` (no regressions).

```bash
pnpm prettier --write <changed files>
git add src/server/inbox/dm.ts src/server/api/routers/agent-management.ts src/server/api/routers/advisory.ts src/server/api/routers/insights.ts src/app/api/mcp/advisory-tools.ts src/components/communities/insights/unactivated-list.tsx
git commit -m "feat(engage): warm-welcome — dm helper, advisory + organizer-UI, reviewDraft welcome branch, MCP"
```

---

## Task 7: Agent-drafted broadcast

**Files:**

- Create: `src/server/notifications/broadcast-send.ts`
- Modify: `src/server/api/routers/broadcast.ts` (call the extracted fn)
- Modify: `src/server/api/routers/advisory.ts` (`suggestBroadcast`)
- Modify: `src/server/api/routers/agent-management.ts` (`reviewDraft` broadcast branch)
- Modify: `src/app/api/mcp/advisory-tools.ts` (`suggest-broadcast`)

- [ ] **Step 1: Extract `sendCommunityBroadcast`**

Create `src/server/notifications/broadcast-send.ts` containing a function that takes `(db, { communityId, authorId, subject, body })` and performs **exactly** the body of `broadcastRouter.send` from `broadcast.ts:38-189` (insert broadcast, idempotency `sentAt`, member fetch, opt-out set, fair-share counts, prior sends, per-member notification + ceiling-gated email via `sendBroadcastEmail`, delivery rows). Return `{ broadcastId, emailed }`.

```typescript
import { and, eq, inArray, sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import {
  communityMemberships,
  notificationOptouts,
  notifications,
  broadcasts,
  broadcastDeliveries,
  user,
} from "@/server/db/schema";
import { allowPromotional } from "@/server/notifications/ceiling";
import {
  BROADCAST_CEILING,
  currentWindowKey,
} from "@/server/notifications/constants";
import { sendBroadcastEmail } from "@/server/email";

type DB = typeof _db;

export async function sendCommunityBroadcast(
  db: DB,
  opts: {
    communityId: string;
    authorId: string;
    subject: string;
    body: string;
  },
): Promise<{ broadcastId: string; emailed: number }> {
  // ...move the existing send() body here verbatim, replacing ctx.db -> db,
  // ctx.community.id -> opts.communityId, ctx.session.user.id -> opts.authorId,
  // input.subject/body -> opts.subject/body...
}
```

- [ ] **Step 2: Make `broadcastRouter.send` delegate**

Replace the body of `broadcast.ts` `send` (after the role check) with:

```typescript
if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
  throw new TRPCError({ code: "FORBIDDEN" });
}
return sendCommunityBroadcast(ctx.db, {
  communityId: ctx.community.id,
  authorId: ctx.session.user.id,
  subject: input.subject,
  body: input.body,
});
```

Run existing broadcast tests (grep `broadcast` under `*.test.ts`) — Expected: still PASS (pure refactor).

- [ ] **Step 3: Add `advisory.suggestBroadcast`**

In `advisory.ts` (mirror `suggestWelcome`):

```typescript
  /** Draft a broadcast for an admin to review and send. */
  suggestBroadcast: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "write");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(ctx.db, input.slug, ownerId);
      const [d] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "broadcast",
          targetType: "community",
          targetId: community.id,
          content: input.body,
          metadata: {
            communityId: community.id,
            communitySlug: input.slug,
            subject: input.subject,
          },
        })
        .returning({ id: agentDrafts.id });
      return { draftId: d!.id };
    }),
```

- [ ] **Step 4: Add the `reviewDraft` broadcast branch**

In `agent-management.ts` `reviewDraft`, after the welcome branch (the broadcast auth is already handled by Task 6's community-scoped block, which gates `broadcast` to owner/admin), add:

```typescript
// Broadcast → send via the Slice B pipeline (ceiling enforced).
if (input.action === "approved" && draft.type === "broadcast") {
  const meta = (draft.metadata ?? {}) as {
    communityId?: string;
    subject?: string;
  };
  if (meta.communityId && meta.subject) {
    await sendCommunityBroadcast(ctx.db, {
      communityId: meta.communityId,
      authorId: userId,
      subject: meta.subject,
      body: draft.content ?? "",
    });
  }
}
```

Import `sendCommunityBroadcast` at the top of `agent-management.ts`.

- [ ] **Step 5: Add the `suggest-broadcast` MCP tool**

In `advisory-tools.ts`, add `suggest-broadcast` wrapping `caller.advisory.suggestBroadcast` (inputs slug/subject/body), mirroring `suggest-revival`. Description: "Draft a time-sensitive announcement for an admin to review and send to the community. You never send it yourself; the broadcast ceiling applies on send."

- [ ] **Step 6: Typecheck, tests, format, commit**

Run: `pnpm check` and `pnpm vitest run`.

```bash
pnpm prettier --write <changed files>
git add src/server/notifications/broadcast-send.ts src/server/api/routers/broadcast.ts src/server/api/routers/advisory.ts src/server/api/routers/agent-management.ts src/app/api/mcp/advisory-tools.ts
git commit -m "feat(engage): agent-drafted broadcast — extract send + suggestBroadcast + reviewDraft branch + MCP"
```

---

## Task 8: Docs + integration verification

**Files:**

- Modify: `CONTEXT.md`
- (ADR-0016 already committed.)

- [ ] **Step 1: Update CONTEXT.md**

Augment the **Ritual** entry with the lifecycle (definition → weekly fire → occurrence `pending`/`posted`/`skipped` → thread → digest recap), note `auto`/`review` modes and the author-of-record. Add brief notes to **Community digest** that the `ritualItems` slot is filled from `community_engage_config` (recap/reminder/at-risk toggles, at-risk opt-in). Add a one-line glossary note that community-level agent drafts (ritual/welcome/broadcast) are community-scoped and role-gated (link ADR-0016).

- [ ] **Step 2: Full verification sweep**

Run, and confirm all green:

```bash
pnpm vitest run src/server/communities/rituals.test.ts src/server/notifications/ritual-items.test.ts
pnpm check
pnpm format:check
```

Expected: tests PASS; `check` clean; format clean (if not, `pnpm prettier --write` the offenders and re-run).

- [ ] **Step 3: MCP registration sanity**

Grep `src/app/api/mcp/advisory-tools.ts` for the four new tool names (`propose-ritual`, `get-unactivated-newcomers`, `suggest-welcome`, `suggest-broadcast`) — confirm each is registered and wraps the matching `caller.advisory.*`. Confirm `registerAdvisoryTools` is still called in `src/app/api/mcp/route.ts`.

- [ ] **Step 4: Commit**

```bash
pnpm prettier --write CONTEXT.md
git add CONTEXT.md
git commit -m "docs(engage): CONTEXT.md — ritual lifecycle, engage config, draft-queue scope"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** Rituals (T1–T4), digest recall incl. all three admin toggles + defaults (T5), warm-welcome dual-trigger (T6), agent-drafted broadcast (T7), ADR-0016 + CONTEXT (T8, ADR pre-committed). Permission model (owner/admin/moderator vs owner/admin; community-scoped draft queue) realized in T3/T5/T6/T7 guards. ✅
- **Type consistency:** `RitualSchedule`/`isRitualDue`/`nextFireDate`/`weekdayLabel` (T1) consumed unchanged in T2/T5; `EngageConfig`/`buildRitualItems` (T5) match the cron call site; `sendDirectMessage` (T6) and `sendCommunityBroadcast` (T7) signatures match every call site; draft `type` strings (`ritual_suggestion`/`welcome_nudge`/`broadcast`) consistent across advisory create, reviewDraft/reviewSuggestion auth, and MCP. ✅
- **Open implementation notes flagged inline** (reply-count source, recipient name threading, at-risk query reuse, exact newcomer window) rather than left as silent gaps. ✅
