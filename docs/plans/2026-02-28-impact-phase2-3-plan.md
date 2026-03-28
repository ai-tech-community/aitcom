# Impact Phase 2 & 3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve the `/impact` analytics page from basic counters to fully instrumented collaboration analytics with 8 real experimental metrics, pre-computed aggregates, a QA dashboard, and deeper audience framing.

**Architecture:** Extend `activityEvents` with 2 new columns + enriched metadata at all insert points. Add 3 aggregate tables populated by an hourly cron. Refactor the impact tRPC router to read from aggregates. Build a QA dashboard at `/dashboard/impact` with admin extras.

**Tech Stack:** Next.js 15 (App Router), TypeScript, tRPC v11, Drizzle ORM (Postgres), Payload CMS, next-intl, Tailwind CSS v4, shadcn/ui

**Design doc:** `docs/plans/2026-02-28-impact-phase2-3-design.md`

---

### Task 1: Add Schema Columns and Aggregate Tables

**Files:**
- Modify: `src/server/db/schema.ts:478-502` (activityEvents table)
- Modify: `src/server/db/schema.ts` (add 3 new tables after activityEvents)

**Step 1: Add `collabSessionId` and `contextType` columns to `activityEvents`**

In `src/server/db/schema.ts`, add two columns to the `activityEvents` table definition (after `metadata`, before `createdAt`):

```ts
    collabSessionId: d.varchar("collab_session_id", { length: 255 }),
    contextType: d.varchar("context_type", { length: 30 }),
```

Add an index for `collabSessionId`:

```ts
    index("activity_events_session_idx").on(t.collabSessionId),
```

**Step 2: Add `dailyCoreMetrics` table**

After `activityEvents`, add:

```ts
export const dailyCoreMetrics = appSchema.table("daily_core_metrics", (d) => ({
  date: d.date().notNull().primaryKey(),
  totalContributions: d.integer().notNull().default(0),
  aiAssisted: d.integer().notNull().default(0),
  humanReviewed: d.integer().notNull().default(0),
  collaborationRate: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  forumHelpfulness: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  medianResponseMinutes: d.integer(),
  challengeParticipation: d.integer().notNull().default(0),
  challengeCompletion: d.integer().notNull().default(0),
  eventParticipation: d.integer().notNull().default(0),
  growth4w: d.numeric({ precision: 6, scale: 1 }).notNull().default("0"),
  computedAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}));
```

**Step 3: Add `dailyExperimentalMetrics` table**

```ts
export const dailyExperimentalMetrics = appSchema.table("daily_experimental_metrics", (d) => ({
  date: d.date().notNull().primaryKey(),
  personalityDistribution: d.json().$type<Record<string, number>>().notNull().default({}),
  overrideRate: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  creativityIndex: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  collaborationDepth: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  ideaToImplMedianMinutes: d.integer(),
  topPairings: d.json().$type<Array<{ pair: [string, string]; count: number }>>().notNull().default([]),
  reuseRatio: d.numeric({ precision: 5, scale: 1 }).notNull().default("0"),
  learningLoopSignal: d.varchar("learning_loop_signal", { length: 20 }).$type<"improving" | "stable" | "declining">().notNull().default("stable"),
  learningLoopData: d.json().$type<Record<string, number>>().notNull().default({}),
  computedAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}));
```

**Step 4: Add `dailyCollabMix` table**

```ts
export const dailyCollabMix = appSchema.table("daily_collab_mix", (d) => ({
  date: d.date().notNull().primaryKey(),
  aiOnly: d.integer().notNull().default(0),
  humanOnly: d.integer().notNull().default(0),
  collaborative: d.integer().notNull().default(0),
  computedAt: d.timestamp({ withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}));
```

**Step 5: Generate and run migration**

Run: `pnpm drizzle-kit generate`
Then: `pnpm drizzle-kit migrate`

**Step 6: Verify schema compiles**

Run: `pnpm run typecheck`
Expected: PASS

**Step 7: Commit**

```bash
git add src/server/db/schema.ts drizzle/
git commit -m "feat(impact): add schema columns and aggregate tables for phase 2/3"
```

---

### Task 2: Add Personality Classifier and Collab Session Helpers

**Files:**
- Modify: `src/lib/impact-metrics.ts`

**Step 1: Add personality label type and classifier function**

Append to `src/lib/impact-metrics.ts`:

```ts
export type PersonalityLabel = "builder" | "researcher" | "critic" | "teacher";

const PERSONALITY_MAP: Record<string, PersonalityLabel> = {
  "challenge.enrolled": "builder",
  "challenge.channel_post": "builder",
  "challenge.solution_submitted": "builder",
  "challenge.objective_completed": "builder",
  "challenge.completed": "builder",
  "challenge.proposed": "builder",
  "challenge.created": "builder",
  "knowledge.share": "researcher",
  "agent.suggest_topic": "researcher",
  "idea.submitted": "researcher",
  "challenge.solution_rejected": "critic",
  "challenge.solution_approved": "critic",
  "thread.reply": "teacher",
};

export function classifyPersonality(action: string): PersonalityLabel | null {
  return PERSONALITY_MAP[action] ?? null;
}
```

**Step 2: Add contextType derivation helper**

```ts
export type ContextType = "forum_thread" | "challenge" | "event" | "workflow";

export function deriveContextType(action: string): ContextType | null {
  if (action.startsWith("challenge.")) return "challenge";
  if (action.startsWith("thread.") || action.startsWith("knowledge.")) return "forum_thread";
  if (action.startsWith("event.")) return "event";
  return null;
}
```

**Step 3: Verify**

Run: `pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/impact-metrics.ts
git commit -m "feat(impact): add personality classifier and context type helpers"
```

---

### Task 3: Enrich `logActivity` with Personality, Context, and Session

**Files:**
- Modify: `src/server/agent/activity.ts:13-31` (logActivity function)

**Step 1: Update the logActivity function signature and body**

Import the helpers and extend the insert to include the new fields:

```ts
import { classifyPersonality, deriveContextType } from "@/lib/impact-metrics";
```

Update the `logActivity` function to accept and pass through the new optional fields:

```ts
export async function logActivity(
  db: DB,
  event: {
    actorId: string;
    actorType: "member" | "agent" | "system";
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    collabSessionId?: string;
  },
) {
  const personalityLabel = classifyPersonality(event.action);
  const contextType = deriveContextType(event.action);

  await db.insert(activityEvents).values({
    actorId: event.actorId,
    actorType: event.actorType,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    collabSessionId: event.collabSessionId ?? null,
    contextType: contextType ?? null,
    metadata: {
      ...event.metadata,
      ...(personalityLabel ? { personalityLabel } : {}),
    },
  });
```

**Step 2: Update direct insert calls in the same file**

At lines ~149 and ~258 in `activity.ts`, there are direct `db.insert(activityEvents).values()` calls for objective_completed and challenge.completed. Each needs the same enrichment pattern. For these, derive collabSessionId from the enrollment's `progressLogThreadId`:

```ts
collabSessionId: enrollment.progressLogThreadId ?? undefined,
contextType: "challenge",
metadata: {
  ...existingMetadata,
  personalityLabel: classifyPersonality(action),
  collaborationModel: challenge.collaborationModel,
},
```

**Step 3: Verify**

Run: `pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/server/agent/activity.ts
git commit -m "feat(impact): enrich logActivity with personality and session tracking"
```

---

### Task 4: Enrich Activity Events in Challenge Router

**Files:**
- Modify: `src/server/api/routers/challenges.ts`

**Step 1: Add imports**

At the top of `challenges.ts`:

```ts
import { classifyPersonality, deriveContextType } from "@/lib/impact-metrics";
```

**Step 2: Enrich each logActivity call**

There are 6 logActivity calls in this file (lines ~278, ~331, ~686, ~804, ~885, ~978). Each needs:

- `collabSessionId`: Use enrollment's `progressLogThreadId` when available
- Additional metadata keys: `personalityLabel`, `collaborationModel` (from challenge), `templateBased` (for solution_submitted), `editSignificance` (for solution_approved/rejected), `feedbackRound` (for solutions)

For `challenge.enrolled` (~line 278):
```ts
metadata: { title: challenge.title, personalityLabel: "builder" },
collabSessionId: enrollment.progressLogThreadId ?? undefined,
```

For `challenge.abandoned` (~line 331):
```ts
metadata: { title, personalityLabel: "builder" },
```

For `challenge.solution_submitted` (~line 885):
```ts
metadata: {
  title: input.title,
  personalityLabel: "builder",
  templateBased: false,
},
collabSessionId: enrollment.progressLogThreadId ?? undefined,
```

For `challenge.solution_approved` and `challenge.solution_rejected` (~line 978):
```ts
metadata: {
  objectiveIndex: input.objectiveIndex,
  participantUserId: input.participantUserId,
  personalityLabel: "critic",
  editSignificance: action === "challenge.solution_approved" ? "minor" : "rejection",
},
```

**Step 3: Verify**

Run: `pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/server/api/routers/challenges.ts
git commit -m "feat(impact): enrich challenge activity events with collaboration metadata"
```

---

### Task 5: Enrich Activity Events in Agent, Channel, Gamification, and Cron

**Files:**
- Modify: `src/server/api/routers/agent.ts`
- Modify: `src/server/api/routers/challenge-channel.ts:213`
- Modify: `src/lib/gamification.ts:221`
- Modify: `src/app/api/cron/challenge-expiry/route.ts:103`

**Step 1: Enrich agent.ts logActivity calls**

Add personality and session metadata to all logActivity calls in agent.ts:

- `thread.reply`: Add `personalityLabel: "teacher"`, `collabSessionId: threadId`
- `knowledge.share`: Add `personalityLabel: "researcher"`, `collabSessionId: threadId`
- `agent.suggest_topic`: Add `personalityLabel: "researcher"`
- `challenge.enrolled` (agent): Add `personalityLabel: "builder"`, `collabSessionId: enrollment.progressLogThreadId`

**Step 2: Enrich challenge-channel.ts**

At ~line 213, add to metadata:
```ts
personalityLabel: "builder",
collabSessionId: progressLogThreadId ?? undefined,
feedbackRound: replyCount,
```

Where `replyCount` is the count of existing replies in the thread (derive from context or pass as param).

**Step 3: Enrich gamification.ts**

At ~line 221, add to the badge.earned activity event metadata:
```ts
personalityLabel: classifyPersonality(triggeringAction) ?? undefined,
```

Import `classifyPersonality` at top. The `triggeringAction` context may not be directly available — if not, leave `personalityLabel` as `null` for badge events (they're not core to any experimental metric).

**Step 4: Enrich challenge-expiry cron**

At ~line 103, add to the abandoned event:
```ts
actorType: "system",
metadata: { ...existingMetadata, personalityLabel: "builder" },
```

**Step 5: Verify**

Run: `pnpm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/server/api/routers/agent.ts src/server/api/routers/challenge-channel.ts src/lib/gamification.ts src/app/api/cron/challenge-expiry/route.ts
git commit -m "feat(impact): enrich remaining activity event sources with collaboration metadata"
```

---

### Task 6: Build Hourly Aggregation Cron Job

**Files:**
- Create: `src/app/api/cron/impact-aggregation/route.ts`

**Step 1: Create the cron route**

Follow the existing pattern from `challenge-expiry/route.ts` — CRON_SECRET auth, force-dynamic, nodejs runtime.

The cron handler:
1. Determines the current date (UTC)
2. Queries raw activity events for that day
3. Computes all core metrics, collab mix, and experimental metrics
4. Upserts into the 3 aggregate tables using `onConflictDoUpdate`

```ts
import { NextResponse } from "next/server";
import { eq, gte, and, sql, lt } from "drizzle-orm";
import { db } from "@/server/db";
import {
  activityEvents,
  challengeEnrollments,
  dailyCoreMetrics,
  dailyCollabMix,
  dailyExperimentalMetrics,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { safePercent, clampRate, classifyPersonality } from "@/lib/impact-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const dateStr = today.toISOString().slice(0, 10);

  // ... compute core metrics for today ...
  // ... compute experimental metrics for today ...
  // ... upsert into all 3 aggregate tables ...

  return NextResponse.json({ ok: true, date: dateStr });
}
```

The core metrics computation reuses the same query patterns from the current `impact.getOverview`, scoped to `today <= createdAt < tomorrow`.

For experimental metrics:
- **personalityDistribution**: `GROUP BY metadata->>'personalityLabel'` and count
- **overrideRate**: Count events with `editSignificance IN ('major', 'rejection')` / total AI events
- **creativityIndex**: Count distinct `(metadata->>'collaborationModel', action)` pairs for completed challenges, normalize to 0-100 (max combos = 6 collaboration models * ~5 completion actions = 30)
- **collaborationDepth**: For each distinct `collabSessionId` with a completion event, count events. Return median.
- **ideaToImplMedianMinutes**: JOIN challengeEnrollments.submittedAt with Payload challenges.createdAt, compute median diff
- **topPairings**: For each completed session, collect distinct personality labels, generate pairs, count frequencies, return top 3
- **reuseRatio**: Count events with `metadata->>'templateBased' = 'true'` / total solution events
- **learningLoopSignal**: Compare current 4-week approval rate vs previous 4-week. "improving" if better by >5%, "declining" if worse by >5%, else "stable"

**Step 2: Verify route compiles**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/api/cron/impact-aggregation/route.ts
git commit -m "feat(impact): add hourly aggregation cron for impact metrics"
```

---

### Task 7: Build Backfill Script

**Files:**
- Create: `src/scripts/backfill-impact-metadata.ts`

**Step 1: Create backfill script**

A standalone script that:
1. Iterates all existing activity events
2. Sets `metadata.personalityLabel` via `classifyPersonality(action)`
3. Sets `contextType` via `deriveContextType(action)`
4. For challenge-related events, looks up `challengeEnrollments.progressLogThreadId` and sets `collabSessionId`
5. For forum events, sets `collabSessionId` to `targetId` (the thread ID)
6. Runs the aggregation logic for each historical date to populate aggregate tables

Run in batches of 500 events to avoid memory pressure.

```ts
import { db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";
import { classifyPersonality, deriveContextType } from "@/lib/impact-metrics";
import { eq, sql } from "drizzle-orm";

async function backfill() {
  const events = await db.select().from(activityEvents).orderBy(activityEvents.createdAt);

  for (let i = 0; i < events.length; i += 500) {
    const batch = events.slice(i, i + 500);
    await db.transaction(async (tx) => {
      for (const evt of batch) {
        const personality = classifyPersonality(evt.action);
        const context = deriveContextType(evt.action);
        await tx
          .update(activityEvents)
          .set({
            contextType: context,
            metadata: { ...(evt.metadata ?? {}), ...(personality ? { personalityLabel: personality } : {}) },
          })
          .where(eq(activityEvents.id, evt.id));
      }
    });
    console.log(`Backfilled ${Math.min(i + 500, events.length)} / ${events.length}`);
  }

  // Then populate aggregate tables for all historical dates
  // (reuse cron logic)
}

backfill().catch(console.error);
```

**Step 2: Verify script compiles**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/scripts/backfill-impact-metadata.ts
git commit -m "feat(impact): add backfill script for historical event enrichment"
```

---

### Task 8: Refactor Impact Router to Read from Aggregates

**Files:**
- Modify: `src/server/api/routers/impact.ts`

**Step 1: Refactor `getOverview` to read from aggregate tables**

Replace the 15+ raw queries with 3 aggregate table reads:

```ts
import { dailyCoreMetrics, dailyCollabMix, dailyExperimentalMetrics } from "@/server/db/schema";

// For 30d: WHERE date >= since
// For all: no date filter
// SUM/AVG across the date range
const coreRows = await ctx.db
  .select()
  .from(dailyCoreMetrics)
  .where(since ? gte(dailyCoreMetrics.date, sinceStr) : undefined)
  .orderBy(dailyCoreMetrics.date);
```

Aggregate the daily rows into the response shape: sum counts, average rates, take latest experimental values.

Keep a fallback: if `coreRows.length === 0`, fall back to the current raw-query logic (for first-deploy grace period before cron has populated data).

**Step 2: Expand experimental items from 4 to 8**

Update the `experimental.items` array to return all 8 metrics with their `displayType`:

```ts
experimental: {
  confidence: "experimental",
  items: [
    { key: "agentPersonalityMix", displayType: "distribution", value: latestExp.personalityDistribution },
    { key: "humanOverrideRate", displayType: "percentage", value: avgOverrideRate },
    { key: "creativityIndex", displayType: "percentage", value: avgCreativityIndex },
    { key: "collaborationDepth", displayType: "number", value: avgCollabDepth, suffix: "rounds" },
    { key: "ideaToImplTime", displayType: "duration", value: medianIdeaToImpl, suffix: "days" },
    { key: "crossPersonalityPairing", displayType: "pairings", value: latestExp.topPairings },
    { key: "reuseRatio", displayType: "percentage", value: avgReuseRatio },
    { key: "learningLoop", displayType: "trend", value: latestExp.learningLoopSignal, data: latestExp.learningLoopData },
  ],
},
```

**Step 3: Verify**

Run: `pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/server/api/routers/impact.ts
git commit -m "refactor(impact): read from aggregate tables and expand to 8 experimental metrics"
```

---

### Task 9: Update i18n for All 8 Experimental Metrics

**Files:**
- Modify: `messages/en.json:825-856`
- Modify: `messages/nl.json:825-856`

**Step 1: Expand the experimental section in en.json**

Add 4 new metric blocks (ideaToImplTime, crossPersonalityPairing, reuseRatio, learningLoop) alongside the existing 4. Update the existing 4 labels to be more honest. Each block has: title, definition, calculation, why, caveats.

Also add keys for:
- `experimental.insufficientData` — "Insufficient data"
- `experimental.improving` — "Improving"
- `experimental.stable` — "Stable"
- `experimental.declining` — "Declining"
- `experimental.rounds` — "rounds"
- `experimental.days` — "days"
- `experimental.reuse` — "reuse"
- `experimental.novel` — "novel"

Add QA dashboard labels under `impact.qa`:
- `title`, `timeRange7d`, `timeRange90d`
- `confidence.low`, `confidence.ok`
- `admin.rawVsAggregated`, `admin.anomalies`, `admin.dataQuality`, `admin.reAggregate`

Add new audience block stat labels under `impact.audience.*.stats`.

**Step 2: Mirror in nl.json with Dutch translations**

Same key structure, Dutch text.

**Step 3: Verify**

Run: `pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(i18n): add labels for all 8 experimental metrics, QA dashboard, and audience deepening"
```

---

### Task 10: Rework Experimental Insights Component for Varied Display Types

**Files:**
- Modify: `src/components/impact/experimental-insights.tsx`

**Step 1: Add display type renderers**

Update the component to handle the `displayType` field on each metric item:

- `distribution`: Render horizontal bar segments with percentage labels (for Personality Mix)
- `percentage`: Render `N%` with optional delta
- `number`: Render value with suffix (e.g. "3.2 rounds")
- `duration`: Render in days/hours format
- `pairings`: Render a top-N list of personality pairs with counts
- `trend`: Render an "Improving" / "Stable" / "Declining" label with colored indicator

Update the component props type to accept the expanded items shape:

```ts
type ExperimentalItem =
  | { key: string; displayType: "distribution"; value: Record<string, number> }
  | { key: string; displayType: "percentage"; value: number }
  | { key: string; displayType: "number"; value: number; suffix: string }
  | { key: string; displayType: "duration"; value: number | null; suffix: string }
  | { key: string; displayType: "pairings"; value: Array<{ pair: [string, string]; count: number }> }
  | { key: string; displayType: "trend"; value: string; data: Record<string, number> };
```

Keep the existing dialog modal pattern for all metric types.

**Step 2: Verify renders**

Run: `pnpm run dev`
Manual check: open `/en/impact`, switch to Experimental Insights tab, verify all 8 metrics render with correct formatting.

**Step 3: Commit**

```bash
git add src/components/impact/experimental-insights.tsx
git commit -m "feat(impact): rework experimental insights for varied display types"
```

---

### Task 11: Wire Expanded Experimental Items in Impact Page

**Files:**
- Modify: `src/components/impact/impact-page.tsx:133-170`

**Step 1: Update ExperimentalInsights props to pass all 8 metric labels**

Add the 4 new metric label blocks alongside the existing 4 in the `labels` prop. Update the type interface to accept the new keys.

**Step 2: Update ExperimentalInsights invocation**

Pass the new items from `data.experimental.items` which now contains 8 items.

**Step 3: Verify**

Run: `pnpm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/impact/impact-page.tsx
git commit -m "feat(impact): wire all 8 experimental metric labels into page"
```

---

### Task 12: Deepen Audience Blocks

**Files:**
- Modify: `src/components/impact/audience-blocks.tsx`
- Modify: `src/components/impact/impact-page.tsx`
- Modify: `src/server/api/routers/impact.ts`

**Step 1: Extend router audience block data**

Add new fields to each audience block in the router response:

```ts
audienceBlocks: {
  visitors: {
    momentum: collaborationGrowth4w,
    outcomes: challengeCompleted,
    weeklyActiveContributors: weeklyActiveCount,       // NEW
    ideaToImplMedian: ideaToImplMedianDays,            // NEW
  },
  members: {
    responseHealth: medianFirstResponse,
    answeredThreads: threadsAnswered.totalDocs ?? 0,
    personalityDistribution: latestExp.personalityDistribution,  // NEW
    learningLoopSignal: latestExp.learningLoopSignal,            // NEW
  },
  sponsors: {
    deliveryRate: challengeCompletionRate,
    activeBuilders: challengeParticipation,
    reuseRatio: avgReuseRatio,                // NEW
    pairingDiversity: uniquePairCount,        // NEW
  },
},
```

**Step 2: Update audience-blocks.tsx component**

Add rendering for the 2 new stats per block. Each uses the existing card style. New stat types include sparklines (for weekly active), duration labels, distribution mini-bars, and trend indicators.

**Step 3: Update impact-page.tsx to pass new labels**

Add i18n label props for the new audience stats.

**Step 4: Verify**

Run: `pnpm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/impact/audience-blocks.tsx src/components/impact/impact-page.tsx src/server/api/routers/impact.ts
git commit -m "feat(impact): deepen audience blocks with 6 new data points"
```

---

### Task 13: Add QA Dashboard tRPC Procedure

**Files:**
- Modify: `src/server/api/routers/impact.ts`

**Step 1: Add `getQADetails` protected procedure**

```ts
getQADetails: protectedProcedure
  .input(z.object({
    range: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  }))
  .query(async ({ ctx, input }) => {
    // Read daily aggregate rows for the range
    // Compute per-metric confidence (N < 30 = low)
    // Compute daily sparkline data points
    // If admin: compute raw vs aggregate comparison, anomaly flags, data quality %

    const isAdmin = ctx.session.user.role === "admin";

    return {
      metrics: { /* same shape as getOverview but with confidence labels */ },
      sparklines: { /* daily values per metric */ },
      admin: isAdmin ? {
        rawVsAggregated: { /* comparison data */ },
        anomalies: [],
        dataQuality: {
          withSessionId: percentWithSessionId,
          withPersonality: percentWithPersonality,
          withTemplateBased: percentWithTemplateFlag,
        },
      } : null,
    };
  }),
```

**Step 2: Verify**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/server/api/routers/impact.ts
git commit -m "feat(impact): add QA details tRPC procedure with admin extras"
```

---

### Task 14: Build QA Dashboard Page and Components

**Files:**
- Create: `src/app/[locale]/dashboard/impact/page.tsx`
- Create: `src/components/impact/qa-dashboard.tsx`
- Modify: `src/components/dashboard-tabs.tsx:14-20`

**Step 1: Create the route page**

```tsx
import type { Metadata } from "next";
import { QADashboard } from "@/components/impact/qa-dashboard";

export const metadata: Metadata = {
  title: "Impact QA - AIT",
};

export default function Page() {
  return <QADashboard />;
}
```

**Step 2: Build QA dashboard component**

`qa-dashboard.tsx`:
- "use client"
- Time range selector (7d, 30d, 90d, all)
- Uses `api.impact.getQADetails.useQuery({ range })`
- Renders all metrics with confidence badges and sparklines
- Conditionally renders admin section (raw vs aggregated, anomalies, data quality, re-aggregate button)
- Re-aggregate button calls a new `impact.triggerReaggregation` mutation (admin-only)

**Step 3: Add dashboard tab**

In `src/components/dashboard-tabs.tsx`, add to the `tabs` array:

```ts
{ path: "/dashboard/impact", icon: BarChartIcon, labelKey: "impact" },
```

Import `BarChartIcon` from lucide-react.

Add `"impact": "Impact"` to the `dashboard` namespace in both `messages/en.json` and `messages/nl.json`.

**Step 4: Verify route renders**

Run: `pnpm run dev`
Manual check:
- Navigate to `/en/dashboard/impact`
- Confirm auth redirect works for non-logged-in users
- Confirm metrics render for logged-in users
- Confirm admin extras appear for admin users

**Step 5: Commit**

```bash
git add src/app/[locale]/dashboard/impact/page.tsx src/components/impact/qa-dashboard.tsx src/components/dashboard-tabs.tsx messages/en.json messages/nl.json
git commit -m "feat(impact): add QA dashboard page with admin extras"
```

---

### Task 15: Final Verification

**Files:**
- No new files

**Step 1: Run lint**

Run: `pnpm run lint`
Expected: PASS (fix any issues)

**Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

**Step 3: Run build**

Run: `pnpm run build`
Expected: PASS — both `/[locale]/impact` and `/[locale]/dashboard/impact` routes in build output

**Step 4: Manual QA checklist**

- `/en/impact` — all 8 experimental metrics render with correct display types
- `/nl/impact` — Dutch translations work
- 30-day / all-time toggle works
- Experimental modals open/close with correct content
- Audience blocks show 4 stats each
- Methodology panel visible
- `/en/dashboard/impact` — QA dashboard renders behind auth
- Admin extras visible for admin user
- No hydration errors in browser console

**Step 5: Commit final polish**

```bash
git add .
git commit -m "feat(impact): ship phase 2/3 — full experimental metrics, aggregates, and QA dashboard"
```

---

## Risks and Mitigations

- **Migration risk:** New columns are nullable, so migration is backward-compatible. No data loss.
- **Backfill accuracy:** `collabSessionId` derivation from `progressLogThreadId` is best-effort for historical data. New events will be tagged correctly at insert time.
- **Cron failure:** Aggregation is idempotent (upsert). If cron misses a run, next run catches up. Fallback to raw queries prevents blank pages.
- **Experimental metric accuracy:** All experimental labels include caveats. Personality classification is heuristic and labeled as such.
- **Performance:** Aggregate reads replace 15+ raw queries with 3 table reads. QA dashboard queries are behind auth and not public-facing.

## Definition of Done

- Schema migration applied (2 new columns, 3 new tables)
- All 12 activity event insert points enriched with personality + session metadata
- Hourly cron populates aggregate tables
- Backfill script tags historical events
- `/impact` reads from aggregates with fallback
- 8 experimental metrics with varied display types
- Audience blocks deepened (4 stats each)
- QA dashboard at `/dashboard/impact` with admin extras
- i18n complete for en + nl
- Lint, typecheck, and build all pass
