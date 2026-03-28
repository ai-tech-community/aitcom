# Collaboration Rate Chart Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the empty Weekly Collaboration Rate chart by replacing prefix-based classification with same-target co-participation logic, and improve chart visuals.

**Architecture:** Two-pass classification in `toWeeklyBuckets()`: first identify targets with both agent+member activity, then classify each event. Same logic replicated in the cron aggregation job. Chart component gets percentage labels and empty state.

**Tech Stack:** TypeScript, React, Drizzle ORM, Next.js API routes, Tailwind CSS

---

### Task 1: Update `toWeeklyBuckets()` classification logic

**Files:**
- Modify: `src/lib/impact-metrics.ts:35-79`

**Step 1: Update the function signature to accept `targetType` and `targetId`**

Replace lines 35-41 with:

```typescript
export function toWeeklyBuckets(
  rows: Array<{
    createdAt: Date;
    actorType: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
  }>,
  weeks = 8,
): Bucket[] {
```

**Step 2: Replace the single-pass classification loop (lines 59-76) with two-pass logic**

Replace the `for (const row of rows)` loop (lines 59-76) with:

```typescript
  // --- Pass 1: find collaborative targets per weekly bucket ---
  // A target is collaborative if both "agent" and "member" acted on it in the same week.
  const weekTargetActors = new Map<string, Map<string, Set<string>>>();
  for (const row of rows) {
    if (!row.targetType || !row.targetId) continue;
    const wk = startOfWeek(new Date(row.createdAt)).toISOString();
    if (!map.has(wk)) continue;

    let targets = weekTargetActors.get(wk);
    if (!targets) {
      targets = new Map();
      weekTargetActors.set(wk, targets);
    }

    const targetKey = `${row.targetType}:${row.targetId}`;
    let actors = targets.get(targetKey);
    if (!actors) {
      actors = new Set();
      targets.set(targetKey, actors);
    }
    actors.add(row.actorType);
  }

  // Build set of collaborative target keys per week
  const collabTargets = new Map<string, Set<string>>();
  for (const [wk, targets] of weekTargetActors) {
    const collabSet = new Set<string>();
    for (const [targetKey, actors] of targets) {
      if (actors.has("agent") && actors.has("member")) {
        collabSet.add(targetKey);
      }
    }
    if (collabSet.size > 0) collabTargets.set(wk, collabSet);
  }

  // --- Pass 2: classify each event ---
  for (const row of rows) {
    const wk = startOfWeek(new Date(row.createdAt));
    const wkKey = wk.toISOString();
    const bucket = map.get(wkKey);
    if (!bucket) continue;

    const targetKey = row.targetType && row.targetId
      ? `${row.targetType}:${row.targetId}`
      : null;

    const isCollab = targetKey
      ? collabTargets.get(wkKey)?.has(targetKey) ?? false
      : false;

    if (isCollab) {
      bucket.collaborative += 1;
    } else if (row.actorType === "agent") {
      bucket.aiOnly += 1;
    } else {
      bucket.humanOnly += 1;
    }
  }
```

**Step 3: Verify the build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: Type error in `src/server/api/routers/impact.ts` because the caller doesn't pass `targetType`/`targetId` yet. This is expected and fixed in Task 2.

**Step 4: Commit**

```bash
git add src/lib/impact-metrics.ts
git commit -m "feat(impact): replace prefix-based collab classification with same-target co-participation in toWeeklyBuckets"
```

---

### Task 2: Update the tRPC router to pass `targetType` and `targetId`

**Files:**
- Modify: `src/server/api/routers/impact.ts:239-247`

**Step 1: Add `targetType` and `targetId` to the trend query select**

Replace lines 239-247:

```typescript
  const trendRows = await ctx.db
    .select({
      createdAt: activityEvents.createdAt,
      actorType: activityEvents.actorType,
      action: activityEvents.action,
    })
    .from(activityEvents)
    .where(gte(activityEvents.createdAt, trendSince))
    .orderBy(activityEvents.createdAt);
```

With:

```typescript
  const trendRows = await ctx.db
    .select({
      createdAt: activityEvents.createdAt,
      actorType: activityEvents.actorType,
      action: activityEvents.action,
      targetType: activityEvents.targetType,
      targetId: activityEvents.targetId,
    })
    .from(activityEvents)
    .where(gte(activityEvents.createdAt, trendSince))
    .orderBy(activityEvents.createdAt);
```

**Step 2: Verify the build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No type errors (the function signature now matches).

**Step 3: Commit**

```bash
git add src/server/api/routers/impact.ts
git commit -m "feat(impact): pass targetType and targetId to toWeeklyBuckets in tRPC router"
```

---

### Task 3: Update cron job collab mix classification

**Files:**
- Modify: `src/app/api/cron/impact-aggregation/route.ts:43-49` (remove `isCollaborativeAction`)
- Modify: `src/app/api/cron/impact-aggregation/route.ts:304-324` (collab mix section)

**Step 1: Remove the `isCollaborativeAction` helper (lines 43-49)**

Delete these lines entirely:

```typescript
function isCollaborativeAction(action: string): boolean {
  return (
    action.startsWith("challenge.") ||
    action.startsWith("thread.") ||
    action.startsWith("article.")
  );
}
```

**Step 2: Update the collab mix query to also select `targetType` and `targetId`**

Replace lines 304-310:

```typescript
    const todayEvents = await db
      .select({
        actorType: activityEvents.actorType,
        action: activityEvents.action,
      })
      .from(activityEvents)
      .where(todayWhere);
```

With:

```typescript
    const todayEvents = await db
      .select({
        actorType: activityEvents.actorType,
        action: activityEvents.action,
        targetType: activityEvents.targetType,
        targetId: activityEvents.targetId,
      })
      .from(activityEvents)
      .where(todayWhere);
```

**Step 3: Replace the classification loop (lines 312-324)**

Replace:

```typescript
    let aiOnly = 0;
    let humanOnly = 0;
    let collaborative = 0;

    for (const ev of todayEvents) {
      if (isCollaborativeAction(ev.action)) {
        collaborative++;
      } else if (ev.actorType === "agent") {
        aiOnly++;
      } else {
        humanOnly++;
      }
    }
```

With:

```typescript
    // Pass 1: find targets with both agent + member activity
    const targetActors = new Map<string, Set<string>>();
    for (const ev of todayEvents) {
      if (!ev.targetType || !ev.targetId) continue;
      const key = `${ev.targetType}:${ev.targetId}`;
      let actors = targetActors.get(key);
      if (!actors) {
        actors = new Set();
        targetActors.set(key, actors);
      }
      actors.add(ev.actorType);
    }

    const collabTargetKeys = new Set<string>();
    for (const [key, actors] of targetActors) {
      if (actors.has("agent") && actors.has("member")) {
        collabTargetKeys.add(key);
      }
    }

    // Pass 2: classify
    let aiOnly = 0;
    let humanOnly = 0;
    let collaborative = 0;

    for (const ev of todayEvents) {
      const key = ev.targetType && ev.targetId
        ? `${ev.targetType}:${ev.targetId}`
        : null;
      if (key && collabTargetKeys.has(key)) {
        collaborative++;
      } else if (ev.actorType === "agent") {
        aiOnly++;
      } else {
        humanOnly++;
      }
    }
```

**Step 4: Verify the build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/app/api/cron/impact-aggregation/route.ts
git commit -m "feat(impact): use same-target co-participation for collab mix in cron aggregation"
```

---

### Task 4: Improve Weekly Collaboration Rate chart visualization

**Files:**
- Modify: `src/components/impact/trend-panels.tsx:26-43`

**Step 1: Add percentage labels, bump min bar height, add empty state**

Replace the entire first `<article>` block (lines 28-43):

```typescript
      <article className="rounded-lg border border-zinc-200 bg-white/80 p-4">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-zinc-600">
          {labels.collaborationRateWeekly}
        </h3>
        <div className="mt-4 flex h-40 items-end gap-2">
          {weeklyCollaboration.map((entry) => (
            <div key={entry.label} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="w-full rounded-sm bg-zinc-900/70"
                style={{ height: `${Math.max(6, (entry.value / maxCollab) * 100)}%` }}
              />
              <span className="font-mono text-[9px] uppercase text-zinc-500">{entry.label}</span>
            </div>
          ))}
        </div>
      </article>
```

With:

```tsx
      <article className="rounded-lg border border-zinc-200 bg-white/80 p-4">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-zinc-600">
          {labels.collaborationRateWeekly}
        </h3>
        {weeklyCollaboration.every((entry) => entry.value === 0) ? (
          <div className="mt-4 flex h-40 items-center justify-center">
            <p className="font-mono text-xs text-zinc-400">No collaboration data yet</p>
          </div>
        ) : (
          <div className="mt-4 flex h-40 items-end gap-2">
            {weeklyCollaboration.map((entry) => (
              <div key={entry.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[9px] text-zinc-500">
                  {entry.value > 0 ? `${Math.round(entry.value)}%` : ""}
                </span>
                <div
                  className="w-full rounded-sm bg-zinc-900/70"
                  style={{
                    height: `${entry.value === 0 ? 0 : Math.max(10, (entry.value / maxCollab) * 100)}%`,
                  }}
                />
                <span className="font-mono text-[9px] uppercase text-zinc-500">
                  {entry.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </article>
```

Key changes:
- Empty state when all values are 0
- Percentage label above each bar (only when > 0)
- Minimum bar height bumped from 6% to 10%
- Bars with value 0 render at 0% height (invisible) instead of forced 6%
- Gap between label and bar reduced from `gap-2` to `gap-1` to fit the percentage label

**Step 2: Verify the build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/components/impact/trend-panels.tsx
git commit -m "feat(impact): add percentage labels, empty state, and better min height to Weekly Collaboration Rate chart"
```

---

### Task 5: Verify everything works end-to-end

**Step 1: Run the full build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors.

**Step 2: Run lint**

Run: `npm run lint 2>&1 | tail -20`
Expected: No new lint errors.

**Step 3: Final commit (if any lint fixes needed)**

Only if lint issues surface. Otherwise skip.
