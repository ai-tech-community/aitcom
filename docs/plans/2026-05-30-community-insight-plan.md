# Community Insight Dashboard (Slice A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a community admin/moderator an admin-only Insight dashboard showing community health (active/new/departed members, contribution velocity) and two action lists — at-risk members and un-activated newcomers.

**Architecture:** All classification logic lives in **pure functions** (`src/server/communities/insights.ts`) that take plain rows and a clock, unit-tested with vitest (no DB harness in this repo). A thin tRPC `insights` router fetches `activity_event` + `community_membership` rows scoped to one community and feeds them to the pure functions. The UI is an admin-gated sub-page reusing existing KPI/member-list/Recharts patterns. **Prerequisite:** `activity_event.community_id` is currently NULL on every row, so the plan first **instruments** the emit sites to populate it (and backfills membership events).

**Tech Stack:** Next.js App Router (RSC + client), tRPC v11, Drizzle ORM (Neon HTTP), vitest, shadcn/ui, Recharts, next-intl.

**GitHub:** Epic #54 (Slice A). Tasks below become `role:task` sub-issues. Governing decisions: `CONTEXT.md` (Community platform domain) and `docs/adr/0013-hub-invariant-vs-community-policy.md`.

---

## Background facts (verified during planning)

- **`communityProcedure`** (`src/server/api/trpc.ts:214-263`) resolves community by `slug`, loads the caller's membership, injects `ctx.community`, `ctx.membership`, `ctx.communityRole` (`"owner"|"admin"|"moderator"|"member"|null`). Admin gate idiom: `if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") throw new TRPCError({ code: "FORBIDDEN" })` (see `communities.ts:625`).
- **Router registration:** `src/server/api/root.ts` — add `insights: insightsRouter`.
- **Drizzle window idiom** (`src/server/challenge-engine/signals.ts:120-134`): `const since = new Date(); since.setDate(since.getDate() - days); ... .where(gte(activityEvents.createdAt, since))`.
- **`logActivity`** (`src/server/agent/activity.ts:14`) has an optional `communityId` field. **No router currently passes it** — every `activity_event` row has `community_id = NULL` today. Membership events set `targetId = community.id`, so those are trivially backfillable.
- **Nav** (`src/components/communities/community-nav.tsx:22-33`): `isAdminOrOwner` gate; add an `insights` entry.
- **Recharts** is installed (`package.json:43`); example usage in `src/components/datacenters/investigation-charts.tsx`. KPI strip pattern: `src/components/impact/kpi-strip.tsx:34-89`. Member-list pattern: `src/components/communities/settings/members-settings.tsx:142-232`.
- **Tests** are pure-function vitest (`describe/it/expect`, import the fn directly). No DB-hitting harness. Keep logic pure.

## Contribution actions (the heartbeat set — from CONTEXT.md)

```
feed.post_created, feed.comment_created, thread.create, thread.reply,
comment.created, idea.submitted, idea.voted, launchpad.project.published,
launchpad.project.voted, launchpad.update.posted, launchpad.comment.created,
event.register, event.intent, event.create, event.submit,
challenge.enrolled, challenge.solution_submitted, challenge.completed,
article.published, article.submitted
```
`article.*` is Hub-wide (the Articles collection has no `communityId`) — never community-attributed. Excludes likes/views/admin ops.

## File structure

- Create `src/server/communities/insights.ts` — pure logic (constants + classifiers).
- Create `src/server/communities/insights.test.ts` — vitest unit tests.
- Create `src/server/api/routers/insights.ts` — tRPC router (thin DB wrapper).
- Modify `src/server/api/root.ts` — register router.
- Modify emit sites in `communities.ts`, `agent-communities.ts`, `feed.ts`, `agent-feed.ts`, `forum.ts`, `comments.ts`, `launchpad.ts`, `events.ts`, `challenges.ts`, `agent.ts`, `agent/activity.ts` — pass `communityId`.
- Create `src/migrations/<ts>_backfill_activity_community_id.ts` — one-time membership backfill.
- Modify `src/components/communities/community-nav.tsx` — Insights tab.
- Create `src/app/[locale]/communities/[slug]/insights/page.tsx` + `layout.tsx`.
- Create `src/components/communities/insights/*` — dashboard components.
- Modify `messages/en.json` (+ other locales) — `communities.insights.*` keys.

---

## Task 1: Contribution-action constants + window helper (pure)

**Files:**
- Create: `src/server/communities/insights.ts`
- Test: `src/server/communities/insights.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/communities/insights.test.ts
import { describe, it, expect } from "vitest";
import { CONTRIBUTION_ACTIONS, isContribution, windowStart } from "./insights";

describe("isContribution", () => {
  it("treats a forum reply as a contribution", () => {
    expect(isContribution("thread.reply")).toBe(true);
  });
  it("excludes passive likes", () => {
    expect(isContribution("feed.post_liked")).toBe(false);
  });
  it("excludes admin ops", () => {
    expect(isContribution("community.role_changed")).toBe(false);
  });
  it("CONTRIBUTION_ACTIONS contains event.register and not feed.post_liked", () => {
    expect(CONTRIBUTION_ACTIONS).toContain("event.register");
    expect(CONTRIBUTION_ACTIONS).not.toContain("feed.post_liked");
  });
});

describe("windowStart", () => {
  it("returns N days before now", () => {
    const now = new Date("2026-05-30T12:00:00.000Z");
    expect(windowStart(now, 14).toISOString()).toBe("2026-05-16T12:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/communities/insights.test.ts`
Expected: FAIL — `Cannot find module './insights'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/communities/insights.ts

/** Activity-event `action` strings that count as a member contributing in a
 *  community. Hub-wide-only actions (article.*) are deliberately omitted from
 *  community attribution. See CONTEXT.md → Contribution action. */
export const CONTRIBUTION_ACTIONS = [
  "feed.post_created",
  "feed.comment_created",
  "thread.create",
  "thread.reply",
  "comment.created",
  "idea.submitted",
  "idea.voted",
  "launchpad.project.published",
  "launchpad.project.voted",
  "launchpad.update.posted",
  "launchpad.comment.created",
  "event.register",
  "event.intent",
  "event.create",
  "event.submit",
  "challenge.enrolled",
  "challenge.solution_submitted",
  "challenge.completed",
] as const;

const CONTRIBUTION_SET = new Set<string>(CONTRIBUTION_ACTIONS);

export function isContribution(action: string): boolean {
  return CONTRIBUTION_SET.has(action);
}

/** A `Date` `days` before `now` (non-mutating). */
export function windowStart(now: Date, days: number): Date {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() - days);
  return d;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/communities/insights.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/insights.ts src/server/communities/insights.test.ts
git commit -m "feat(insights): contribution-action constants + window helper (T1 / #54)"
```

---

## Task 2: `summarizeHealth` pure function

**Files:**
- Modify: `src/server/communities/insights.ts`
- Test: `src/server/communities/insights.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to insights.test.ts
import { summarizeHealth } from "./insights";

const at = (iso: string, actorId = "u1", action = "thread.reply") => ({
  actorId,
  action,
  createdAt: new Date(iso),
});

describe("summarizeHealth", () => {
  const now = new Date("2026-05-30T00:00:00.000Z");

  it("counts distinct active members in the current 14d window", () => {
    const res = summarizeHealth({
      contributions: [
        at("2026-05-29T00:00:00Z", "u1"),
        at("2026-05-28T00:00:00Z", "u1"), // same member, still 1 distinct
        at("2026-05-20T00:00:00Z", "u2"),
        at("2026-05-10T00:00:00Z", "u3"), // outside 14d window
      ],
      joins: [],
      departures: [],
      now,
      windowDays: 14,
    });
    expect(res.activeNow).toBe(2);
  });

  it("counts prior-window active members for comparison", () => {
    const res = summarizeHealth({
      contributions: [
        at("2026-05-29T00:00:00Z", "u1"), // current
        at("2026-05-10T00:00:00Z", "u2"), // prior (15-28d ago)
      ],
      joins: [],
      departures: [],
      now,
      windowDays: 14,
    });
    expect(res.activeNow).toBe(1);
    expect(res.activePrev).toBe(1);
  });

  it("counts joins and departures in the current window", () => {
    const res = summarizeHealth({
      contributions: [],
      joins: [at("2026-05-25T00:00:00Z", "u9", "community.joined")],
      departures: [at("2026-05-26T00:00:00Z", "u8", "community.left")],
      now,
      windowDays: 14,
    });
    expect(res.newJoins).toBe(1);
    expect(res.departures).toBe(1);
  });

  it("totals contributions in current vs prior window", () => {
    const res = summarizeHealth({
      contributions: [
        at("2026-05-29T00:00:00Z", "u1"),
        at("2026-05-28T00:00:00Z", "u2"),
        at("2026-05-10T00:00:00Z", "u3"), // prior
      ],
      joins: [],
      departures: [],
      now,
      windowDays: 14,
    });
    expect(res.contributionCount).toBe(2);
    expect(res.contributionPrev).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/communities/insights.test.ts`
Expected: FAIL — `summarizeHealth is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to insights.ts

export type ActivityRow = { actorId: string; action: string; createdAt: Date };

export type HealthPulse = {
  activeNow: number;
  activePrev: number;
  newJoins: number;
  departures: number;
  contributionCount: number;
  contributionPrev: number;
};

export function summarizeHealth(opts: {
  contributions: ActivityRow[];
  joins: ActivityRow[];
  departures: ActivityRow[];
  now: Date;
  windowDays: number;
}): HealthPulse {
  const { contributions, joins, departures, now, windowDays } = opts;
  const curStart = windowStart(now, windowDays);
  const prevStart = windowStart(now, windowDays * 2);

  const inCurrent = (r: ActivityRow) => r.createdAt >= curStart;
  const inPrev = (r: ActivityRow) =>
    r.createdAt >= prevStart && r.createdAt < curStart;

  const distinct = (rows: ActivityRow[]) =>
    new Set(rows.map((r) => r.actorId)).size;

  const cur = contributions.filter(inCurrent);
  const prev = contributions.filter(inPrev);

  return {
    activeNow: distinct(cur),
    activePrev: distinct(prev),
    newJoins: joins.filter(inCurrent).length,
    departures: departures.filter(inCurrent).length,
    contributionCount: cur.length,
    contributionPrev: prev.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/communities/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/insights.ts src/server/communities/insights.test.ts
git commit -m "feat(insights): summarizeHealth pure function (T2 / #54)"
```

---

## Task 3: `selectAtRisk` pure function

**Files:**
- Modify: `src/server/communities/insights.ts`
- Test: `src/server/communities/insights.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to insights.test.ts
import { selectAtRisk } from "./insights";

const mem = (userId: string, role = "member", status = "active") => ({
  userId,
  role,
  status,
  joinedAt: new Date("2026-01-01T00:00:00Z"),
});

describe("selectAtRisk", () => {
  const now = new Date("2026-05-30T00:00:00.000Z");

  it("flags a member active in the prior window but silent in the last 14d", () => {
    const res = selectAtRisk({
      memberships: [mem("u1")],
      contributions: [at("2026-05-10T00:00:00Z", "u1")], // 20d ago: prior, not current
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 50,
    });
    expect(res.map((m) => m.userId)).toEqual(["u1"]);
    expect(res[0]!.priorContributions).toBe(1);
  });

  it("does NOT flag a currently-active member", () => {
    const res = selectAtRisk({
      memberships: [mem("u1")],
      contributions: [at("2026-05-29T00:00:00Z", "u1")], // current
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 50,
    });
    expect(res).toEqual([]);
  });

  it("does NOT flag someone who never contributed (that's a newcomer, not at-risk)", () => {
    const res = selectAtRisk({
      memberships: [mem("u1")],
      contributions: [],
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 50,
    });
    expect(res).toEqual([]);
  });

  it("excludes banned/non-active memberships", () => {
    const res = selectAtRisk({
      memberships: [mem("u1", "member", "banned")],
      contributions: [at("2026-05-10T00:00:00Z", "u1")],
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 50,
    });
    expect(res).toEqual([]);
  });

  it("sorts by prior contribution volume desc and respects cap", () => {
    const res = selectAtRisk({
      memberships: [mem("u1"), mem("u2")],
      contributions: [
        at("2026-05-10T00:00:00Z", "u1"),
        at("2026-05-09T00:00:00Z", "u2"),
        at("2026-05-08T00:00:00Z", "u2"),
      ],
      now,
      windowDays: 14,
      priorWindowDays: 45,
      cap: 1,
    });
    expect(res.map((m) => m.userId)).toEqual(["u2"]); // u2 has 2 prior, capped to 1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/communities/insights.test.ts`
Expected: FAIL — `selectAtRisk is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to insights.ts

export type MembershipRow = {
  userId: string;
  role: string;
  status: string;
  joinedAt: Date;
};

export type AtRiskMember = {
  userId: string;
  role: string;
  priorContributions: number;
  lastContributionAt: Date | null;
};

const ROLE_RANK: Record<string, number> = {
  owner: 4,
  admin: 3,
  moderator: 2,
  member: 1,
};

export function selectAtRisk(opts: {
  memberships: MembershipRow[];
  contributions: ActivityRow[];
  now: Date;
  windowDays: number;
  priorWindowDays: number;
  cap: number;
}): AtRiskMember[] {
  const { memberships, contributions, now, windowDays, priorWindowDays, cap } =
    opts;
  const curStart = windowStart(now, windowDays);
  const priorStart = windowStart(now, priorWindowDays);

  const byUser = new Map<string, ActivityRow[]>();
  for (const c of contributions) {
    const list = byUser.get(c.actorId) ?? [];
    list.push(c);
    byUser.set(c.actorId, list);
  }

  const result: AtRiskMember[] = [];
  for (const m of memberships) {
    if (m.status !== "active") continue;
    const rows = byUser.get(m.userId) ?? [];
    const contributedRecently = rows.some((r) => r.createdAt >= curStart);
    if (contributedRecently) continue; // still active → not at risk
    const prior = rows.filter(
      (r) => r.createdAt >= priorStart && r.createdAt < curStart,
    );
    if (prior.length === 0) continue; // never engaged in prior window → newcomer, not at-risk
    const lastContributionAt = rows.reduce<Date | null>(
      (max, r) => (max === null || r.createdAt > max ? r.createdAt : max),
      null,
    );
    result.push({
      userId: m.userId,
      role: m.role,
      priorContributions: prior.length,
      lastContributionAt,
    });
  }

  result.sort(
    (a, b) =>
      b.priorContributions - a.priorContributions ||
      (ROLE_RANK[b.role] ?? 0) - (ROLE_RANK[a.role] ?? 0),
  );
  return result.slice(0, cap);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/communities/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/insights.ts src/server/communities/insights.test.ts
git commit -m "feat(insights): selectAtRisk pure function (T3 / #54)"
```

---

## Task 4: `selectUnactivated` pure function

**Files:**
- Modify: `src/server/communities/insights.ts`
- Test: `src/server/communities/insights.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to insights.test.ts
import { selectUnactivated } from "./insights";

const memJoined = (userId: string, joinedIso: string, status = "active") => ({
  userId,
  role: "member",
  status,
  joinedAt: new Date(joinedIso),
});

describe("selectUnactivated", () => {
  const now = new Date("2026-05-30T00:00:00.000Z");

  it("flags a member who joined >=3d ago and never contributed", () => {
    const res = selectUnactivated({
      memberships: [memJoined("u1", "2026-05-20T00:00:00Z")],
      contributions: [],
      now,
      minAgeDays: 3,
    });
    expect(res.map((m) => m.userId)).toEqual(["u1"]);
  });

  it("does NOT flag a member who joined too recently (<3d)", () => {
    const res = selectUnactivated({
      memberships: [memJoined("u1", "2026-05-29T00:00:00Z")],
      contributions: [],
      now,
      minAgeDays: 3,
    });
    expect(res).toEqual([]);
  });

  it("does NOT flag a member who has contributed at all", () => {
    const res = selectUnactivated({
      memberships: [memJoined("u1", "2026-05-20T00:00:00Z")],
      contributions: [at("2026-05-21T00:00:00Z", "u1")],
      now,
      minAgeDays: 3,
    });
    expect(res).toEqual([]);
  });

  it("excludes non-active memberships", () => {
    const res = selectUnactivated({
      memberships: [memJoined("u1", "2026-05-20T00:00:00Z", "banned")],
      contributions: [],
      now,
      minAgeDays: 3,
    });
    expect(res).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/communities/insights.test.ts`
Expected: FAIL — `selectUnactivated is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to insights.ts

export type UnactivatedNewcomer = { userId: string; joinedAt: Date };

export function selectUnactivated(opts: {
  memberships: MembershipRow[];
  contributions: ActivityRow[];
  now: Date;
  minAgeDays: number;
}): UnactivatedNewcomer[] {
  const { memberships, contributions, now, minAgeDays } = opts;
  const cutoff = windowStart(now, minAgeDays); // joined on/before cutoff = old enough
  const everContributed = new Set(contributions.map((c) => c.actorId));

  return memberships
    .filter(
      (m) =>
        m.status === "active" &&
        m.joinedAt <= cutoff &&
        !everContributed.has(m.userId),
    )
    .map((m) => ({ userId: m.userId, joinedAt: m.joinedAt }))
    .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/communities/insights.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/insights.ts src/server/communities/insights.test.ts
git commit -m "feat(insights): selectUnactivated pure function (T4 / #54)"
```

---

## Task 5: Instrument membership lifecycle events + backfill

This is the **highest-priority data fix**: `community.joined` / `community.left` must carry `communityId` so active/at-risk/un-activated derivation works. The id is already in scope at every site (it's `community.id` / `invite.communityId`, also used as `targetId`).

**Files:**
- Modify: `src/server/api/routers/communities.ts` (joins at ~334, ~503; leave at ~568)
- Modify: `src/server/api/routers/agent-communities.ts` (`community.joined` ~240, ~508; `community.left` ~380)
- Create: `src/migrations/<timestamp>_backfill_activity_community_id.ts`

- [ ] **Step 1: Add `communityId` to membership `logActivity` calls**

For each `logActivity(... { action: "community.joined" | "community.left" | "community.join_requested", ... })` call in the two files, add `communityId` set to the community id already in scope. Worked example — `communities.ts` `leave` (the `community.left` call near line 568):

```ts
// BEFORE
await logActivity(ctx.db, {
  actorId: ctx.session.user.id,
  actorType: "member",
  action: "community.left",
  targetType: "community",
  targetId: community.id,
});

// AFTER — add communityId
await logActivity(ctx.db, {
  actorId: ctx.session.user.id,
  actorType: "member",
  action: "community.left",
  targetType: "community",
  targetId: community.id,
  communityId: community.id,
});
```

Apply the same one-line addition (`communityId: <id-in-scope>`) at:
- `communities.ts:~334` (`community.joined`, id = `community.id`)
- `communities.ts:~503` (`community.joined` via acceptInvite, id = `invite.communityId`)
- `communities.ts:~413` (`community.join_requested`, id = `community.id`)
- `agent-communities.ts:~240`, `~508` (`community.joined`)
- `agent-communities.ts:~380` (`community.left`)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean (no new errors).

- [ ] **Step 3: Write the backfill migration**

Membership events already store `target_id = community.id`, so historical rows are recoverable. Follow the existing migration shape in `src/migrations/` (look at `20260326_community_feed_schema.ts` for the `sql` + export pattern).

```ts
// src/migrations/<timestamp>_backfill_activity_community_id.ts
import { sql } from "drizzle-orm";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Membership lifecycle events stored the community id in target_id.
  await db.execute(sql`
    UPDATE "app"."activity_event"
    SET "community_id" = "target_id"
    WHERE "community_id" IS NULL
      AND "target_type" = 'community'
      AND "action" IN ('community.joined', 'community.left', 'community.join_requested')
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op: backfill is not safely reversible (cannot distinguish backfilled
  // rows from natively-populated ones).
}
```

> Confirm the exact migration registration pattern by matching a sibling file in `src/migrations/` and adding the new file to `src/migrations/index.ts` if that index enumerates migrations.

- [ ] **Step 4: Verify migration registration + dry build**

Run: `pnpm typecheck`
Expected: clean. (Migration runs via `pnpm db:migrate` in the deploy flow; do not run against prod here.)

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/communities.ts src/server/api/routers/agent-communities.ts src/migrations/
git commit -m "feat(insights): populate community_id on membership events + backfill (T5 / #54)"
```

---

## Task 6: Instrument content contribution events

Forward-only instrumentation so contribution actions are attributable. Within 14 days of deploy the dashboard windows are fully accurate; no content backfill (joining `target_id` across many collections is not worth it — note this limitation in the epic).

**Files (one-line `communityId` addition per `logActivity` site):**
- `feed.ts:~207` (`feed.post_created`), `~462` (`feed.comment_created`) — id = `community.id` / `post.communityId`
- `agent-feed.ts:~259`, `~358` — same
- `forum.ts:~273` (`idea.submitted`), `~338` (`idea.voted`), `~507` (`thread.create`), `~565` (`thread.reply`) — id = in-scope `communityId` / `thread.communityId` / `idea.communityId` (may be `undefined` for Hub-wide threads — correct, leaves NULL)
- `agent.ts:~1117` (`thread.reply`)
- `comments.ts:~144` (`comment.created`) — id = parent's `communityId` if available
- `launchpad.ts:~311` (`project.published`), `~456` (`update.posted`), `~522` (`project.voted`), `~588` (`comment.created`) — id = `project.communityId`
- `events.ts:~176` (`event.register`), `~356` (`event.intent`), `~599` (`event.create`), `~902` (`event.submit`) — id = `event.communityId` / `community.id` (NULL-safe for Hub events)
- `challenges.ts:~285` (`challenge.enrolled`), `~903` (`challenge.solution_submitted`); `agent.ts:~1730` (`challenge.enrolled`)
- `agent/activity.ts:~282` (`challenge.completed`), `~162` (`challenge.objective_completed`) — thread `challenge.communityId` through `checkEnrollmentCompletion`

Worked example — `forum.ts` `thread.reply` (~565):

```ts
// AFTER
await logActivity(ctx.db, {
  actorId: ctx.session.user.id,
  actorType: "member",
  action: "thread.reply",
  targetType: "thread",
  targetId: thread.id,
  communityId: thread.communityId ?? undefined, // NULL for Hub-wide threads — correct
});
```

- [ ] **Step 1: Apply the `communityId` addition at every site listed above.** Use the in-scope community id; where the surface can be Hub-wide (forum threads, ideas, events register/intent), pass the content row's `communityId` which is `undefined`/null for Hub content (correct — those stay Hub-wide and aren't attributed to a community).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Spot-check one path in the running app**

Run: `pnpm dev`, post a reply in a community forum thread, then in `db:studio` (or a query) confirm the new `activity_event` row has `community_id` set. (Manual verification — no unit test, this is DB-side wiring.)

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/ src/server/agent/activity.ts
git commit -m "feat(insights): populate community_id on contribution events (T6 / #54)"
```

---

## Task 7: `insights` tRPC router (thin DB wrapper)

**Files:**
- Create: `src/server/api/routers/insights.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Write the router**

```ts
// src/server/api/routers/insights.ts
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import {
  activityEvents,
  communityMemberships,
  memberProfiles,
  user,
} from "@/server/db/schema";
import {
  CONTRIBUTION_ACTIONS,
  summarizeHealth,
  selectAtRisk,
  selectUnactivated,
  windowStart,
  type ActivityRow,
  type MembershipRow,
} from "@/server/communities/insights";

const WINDOW_DAYS = 14;
const PRIOR_WINDOW_DAYS = 45;
const NEWCOMER_MIN_AGE_DAYS = 3;
const AT_RISK_CAP = 50;

function requireAdmin(role: string | null) {
  if (role !== "owner" && role !== "admin" && role !== "moderator") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

/** Hydrate user ids to display name + avatar for list rendering. */
async function hydrate(
  db: (typeof import("@/server/db"))["db"],
  userIds: string[],
) {
  if (userIds.length === 0) return new Map<string, { displayName: string | null; image: string | null }>();
  const rows = await db
    .select({
      userId: memberProfiles.userId,
      displayName: memberProfiles.displayName,
      image: user.image,
    })
    .from(memberProfiles)
    .innerJoin(user, eq(memberProfiles.userId, user.id))
    .where(inArray(memberProfiles.userId, userIds));
  return new Map(rows.map((r) => [r.userId, { displayName: r.displayName, image: r.image }]));
}

export const insightsRouter = createTRPCRouter({
  healthPulse: communityProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.communityRole);
    const now = new Date();
    const since = windowStart(now, PRIOR_WINDOW_DAYS); // widest needed window

    const events = await ctx.db
      .select({
        actorId: activityEvents.actorId,
        action: activityEvents.action,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.communityId, ctx.community.id),
          gte(activityEvents.createdAt, since),
        ),
      );

    const contributions = events.filter((e) =>
      (CONTRIBUTION_ACTIONS as readonly string[]).includes(e.action),
    ) as ActivityRow[];
    const joins = events.filter((e) => e.action === "community.joined") as ActivityRow[];
    const departures = events.filter((e) => e.action === "community.left") as ActivityRow[];

    return summarizeHealth({ contributions, joins, departures, now, windowDays: WINDOW_DAYS });
  }),

  atRiskMembers: communityProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.communityRole);
    const now = new Date();
    const since = windowStart(now, PRIOR_WINDOW_DAYS);

    const [memberships, events] = await Promise.all([
      ctx.db
        .select({
          userId: communityMemberships.userId,
          role: communityMemberships.role,
          status: communityMemberships.status,
          joinedAt: communityMemberships.joinedAt,
        })
        .from(communityMemberships)
        .where(eq(communityMemberships.communityId, ctx.community.id)),
      ctx.db
        .select({
          actorId: activityEvents.actorId,
          action: activityEvents.action,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            gte(activityEvents.createdAt, since),
            inArray(activityEvents.action, CONTRIBUTION_ACTIONS as unknown as string[]),
          ),
        ),
    ]);

    const atRisk = selectAtRisk({
      memberships: memberships as MembershipRow[],
      contributions: events as ActivityRow[],
      now,
      windowDays: WINDOW_DAYS,
      priorWindowDays: PRIOR_WINDOW_DAYS,
      cap: AT_RISK_CAP,
    });
    const profiles = await hydrate(ctx.db, atRisk.map((m) => m.userId));
    return atRisk.map((m) => ({ ...m, ...(profiles.get(m.userId) ?? { displayName: null, image: null }) }));
  }),

  unactivatedNewcomers: communityProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.communityRole);
    const now = new Date();

    const [memberships, events] = await Promise.all([
      ctx.db
        .select({
          userId: communityMemberships.userId,
          role: communityMemberships.role,
          status: communityMemberships.status,
          joinedAt: communityMemberships.joinedAt,
        })
        .from(communityMemberships)
        .where(eq(communityMemberships.communityId, ctx.community.id)),
      ctx.db
        .select({
          actorId: activityEvents.actorId,
          action: activityEvents.action,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            inArray(activityEvents.action, CONTRIBUTION_ACTIONS as unknown as string[]),
          ),
        ),
    ]);

    const newcomers = selectUnactivated({
      memberships: memberships as MembershipRow[],
      contributions: events as ActivityRow[],
      now,
      minAgeDays: NEWCOMER_MIN_AGE_DAYS,
    });
    const profiles = await hydrate(ctx.db, newcomers.map((m) => m.userId));
    return newcomers.map((m) => ({ ...m, ...(profiles.get(m.userId) ?? { displayName: null, image: null }) }));
  }),
});
```

> Note the `inArray(activityEvents.action, CONTRIBUTION_ACTIONS ...)` casts — `CONTRIBUTION_ACTIONS` is a readonly tuple; Drizzle wants `string[]`. If the cast is awkward, declare a local `const ACTIONS: string[] = [...CONTRIBUTION_ACTIONS]` and pass that. Verify `ctx.db` type import path against `src/server/db/index.ts`.

- [ ] **Step 2: Register the router**

```ts
// src/server/api/root.ts — import block
import { insightsRouter } from "@/server/api/routers/insights";
// ... inside createTRPCRouter({ ... })
  insights: insightsRouter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/insights.ts src/server/api/root.ts
git commit -m "feat(insights): community insights tRPC router (T7 / #54)"
```

---

## Task 8: Insights nav tab + page + role gate

**Files:**
- Modify: `src/components/communities/community-nav.tsx`
- Create: `src/app/[locale]/communities/[slug]/insights/page.tsx`
- Create: `src/app/[locale]/communities/[slug]/insights/layout.tsx`

- [ ] **Step 1: Add the nav tab (admin/mod only)**

In `community-nav.tsx`, extend `navItems` (after the `members` entry, before/after `settings`):

```tsx
...(isAdminOrOwner || memberRole === "moderator"
  ? [{ key: "insights", href: `${basePath}/insights` }]
  : []),
```

Add `"insights"` to the nav-key TypeScript union/type used in the file, and add a label key `communities.nav.insights` to `messages/en.json` (mirror the existing nav label keys; copy the structure of `members`).

- [ ] **Step 2: Add the role-gated layout** (mirror `settings/layout.tsx:19-40`)

```tsx
// src/app/[locale]/communities/[slug]/insights/layout.tsx
"use client";
import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

export default function InsightsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.insights");
  const { data: myCommunities, isLoading } =
    api.communities.getMyCommunities.useQuery();

  const m = myCommunities?.find((c) => c.slug === slug);
  const allowed =
    m?.status === "active" &&
    (m.role === "owner" || m.role === "admin" || m.role === "moderator");

  if (isLoading) {
    return <div className="flex items-center justify-center py-16" />;
  }
  if (!allowed) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground text-sm">{t("accessDenied")}</p>
      </div>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 3: Add the page shell**

```tsx
// src/app/[locale]/communities/[slug]/insights/page.tsx
"use client";
import { use } from "react";
import { InsightsDashboard } from "@/components/communities/insights/insights-dashboard";

export default function InsightsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <InsightsDashboard slug={slug} />;
}
```

- [ ] **Step 4: Verify the route + gate manually**

Run: `pnpm dev`. As an admin, visit `/communities/<slug>/insights` → see the (empty) dashboard. As a plain member, the tab is hidden and direct navigation shows "access denied".

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/community-nav.tsx "src/app/[locale]/communities/[slug]/insights" messages/
git commit -m "feat(insights): insights nav tab + role-gated route (T8 / #54)"
```

---

## Task 9: Health-pulse dashboard UI

**Files:**
- Create: `src/components/communities/insights/insights-dashboard.tsx`
- Create: `src/components/communities/insights/health-pulse.tsx`

- [ ] **Step 1: Health-pulse KPI strip** (mirror `impact/kpi-strip.tsx` grid pattern)

```tsx
// src/components/communities/insights/health-pulse.tsx
"use client";
import { api } from "@/trpc/react";

function delta(now: number, prev: number) {
  if (prev === 0) return now === 0 ? "—" : "+∞";
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

export function HealthPulse({ slug }: { slug: string }) {
  const { data, isLoading } = api.insights.healthPulse.useQuery({ slug });
  if (isLoading || !data) {
    return <div className="h-24 animate-pulse rounded-lg border" />;
  }
  const cards = [
    { label: "Active (14d)", value: data.activeNow, sub: delta(data.activeNow, data.activePrev) },
    { label: "New joins", value: data.newJoins, sub: "" },
    { label: "Departed", value: data.departures, sub: "" },
    { label: "Contributions", value: data.contributionCount, sub: delta(data.contributionCount, data.contributionPrev) },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <article key={c.label} className="rounded-lg border bg-white/80 p-4">
          <p className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
            {c.label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            {c.value}
          </p>
          {c.sub ? <p className="text-muted-foreground mt-1 text-xs">{c.sub} vs prior</p> : null}
        </article>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Dashboard container**

```tsx
// src/components/communities/insights/insights-dashboard.tsx
"use client";
import { HealthPulse } from "./health-pulse";
import { AtRiskList } from "./at-risk-list";
import { UnactivatedList } from "./unactivated-list";

export function InsightsDashboard({ slug }: { slug: string }) {
  return (
    <div className="space-y-8 py-4">
      <HealthPulse slug={slug} />
      <div className="grid gap-6 lg:grid-cols-2">
        <AtRiskList slug={slug} />
        <UnactivatedList slug={slug} />
      </div>
    </div>
  );
}
```

(`AtRiskList`/`UnactivatedList` are created in Task 10 — this file imports them; expect a transient TS error until Task 10 lands. If executing strictly task-by-task, stub them as `export function AtRiskList() { return null }` first, then flesh out in Task 10.)

- [ ] **Step 3: Verify in app**

Run: `pnpm dev`, visit the insights route as admin — KPI strip renders real numbers.

- [ ] **Step 4: Commit**

```bash
git add src/components/communities/insights/
git commit -m "feat(insights): health-pulse KPI dashboard (T9 / #54)"
```

---

## Task 10: At-risk + un-activated lists UI

**Files:**
- Create: `src/components/communities/insights/at-risk-list.tsx`
- Create: `src/components/communities/insights/unactivated-list.tsx`

- [ ] **Step 1: At-risk list** (reuse the avatar+name+badge member-row pattern from `members-settings.tsx:152-171`)

```tsx
// src/components/communities/insights/at-risk-list.tsx
"use client";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export function AtRiskList({ slug }: { slug: string }) {
  const { data, isLoading } = api.insights.atRiskMembers.useQuery({ slug });
  return (
    <div className="rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">At-risk members</h3>
        <p className="text-muted-foreground text-xs">
          Active before, silent the last 14 days
        </p>
      </div>
      {isLoading ? (
        <div className="h-24 animate-pulse" />
      ) : !data || data.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">
          No at-risk members 🎉
        </p>
      ) : (
        <div className="divide-y">
          {data.map((m) => (
            <div key={m.userId} className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <Avatar>
                  {m.image ? <AvatarImage src={m.image} alt={m.displayName ?? ""} /> : null}
                  <AvatarFallback>{(m.displayName ?? "?")[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{m.displayName ?? "Member"}</p>
                  <p className="text-muted-foreground text-xs">
                    {m.priorContributions} prior contribution{m.priorContributions === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">{m.role}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Un-activated newcomers list** (same shape, different copy)

```tsx
// src/components/communities/insights/unactivated-list.tsx
"use client";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function UnactivatedList({ slug }: { slug: string }) {
  const { data, isLoading } = api.insights.unactivatedNewcomers.useQuery({ slug });
  return (
    <div className="rounded-lg border">
      <div className="border-b p-4">
        <h3 className="text-sm font-semibold">Un-activated newcomers</h3>
        <p className="text-muted-foreground text-xs">Joined 3+ days ago, never contributed</p>
      </div>
      {isLoading ? (
        <div className="h-24 animate-pulse" />
      ) : !data || data.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">Everyone’s activated 🎉</p>
      ) : (
        <div className="divide-y">
          {data.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 p-4">
              <Avatar>
                {m.image ? <AvatarImage src={m.image} alt={m.displayName ?? ""} /> : null}
                <AvatarFallback>{(m.displayName ?? "?")[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{m.displayName ?? "Member"}</p>
                <p className="text-muted-foreground text-xs">
                  Joined {new Date(m.joinedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2.5: Replace the Task-9 stubs** in `insights-dashboard.tsx` imports with these real components (if stubbed).

- [ ] **Step 3: Full verification**

Run: `pnpm check` (lint + typecheck) → clean. Then `pnpm dev`: as admin, the insights page shows the KPI strip + both lists with real data. As a plain member, the tab is hidden and the route is access-denied.

- [ ] **Step 4: Commit**

```bash
git add src/components/communities/insights/
git commit -m "feat(insights): at-risk + un-activated member lists (T10 / #54)"
```

---

## Self-review notes

- **Spec coverage:** Health pulse (T2/T9), at-risk list (T3/T7/T10), un-activated list (T4/T7/T10), admin-only gate (T7 `requireAdmin` + T8 layout), data foundation (T5/T6). All `CONTEXT.md` Insight terms are implemented.
- **Known limitation (surface in epic #54):** content contribution events are **forward-only** instrumented (no historical content backfill); the dashboard's 14-day windows become fully accurate within 14 days of deploying T6. Only membership events are backfilled (T5). `log()` this in the epic so it isn't read as "fully historical."
- **Type consistency:** `ActivityRow`/`MembershipRow`/`AtRiskMember`/`UnactivatedNewcomer` defined in T1-T4 are the same types imported in T7. `CONTRIBUTION_ACTIONS` is the single source of the contribution set, used in T7 queries.
- **Deferred (not this slice):** `daily_community_metrics` rollups (only if live aggregation gets slow — see epic), per-row "nudge" actions (that's Slice C / Engage), tunable per-community windows (constants here; ADR-0013 says tunable later).
```
