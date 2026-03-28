# Fix Weekly Collaboration Rate Chart

**Date:** 2026-02-28
**Status:** Approved

## Problem

The "Weekly Collaboration Rate" bar chart on the Impact page appears empty, while the "Contribution Mix" chart (using the same underlying data) shows data. Two root causes:

1. **Classification logic is wrong.** `toWeeklyBuckets()` classifies events by action prefix (`challenge.`, `thread.`, `article.` = collaborative; else agent = AI-only; else human-only). This treats all thread/challenge activity as "collaborative" regardless of whether AI and humans actually worked together. Meanwhile, agent actions like `knowledge.share` get classified as AI-only even when they happen in threads where members also participate. The result: collaboration rate is near 0% for most weeks.

2. **Chart renders near-zero values poorly.** The bar minimum height is 6%, making 0-1% rates invisible. No percentage labels or empty state exist.

## Approved Approach: Same-Target Co-Participation

**Definition:** An event is "collaborative" when its `(targetType, targetId)` has activity from both `actorType: "agent"` and `actorType: "member"` within the same weekly bucket.

### Why This Works

- Both agents and members consistently log `targetType` + `targetId` on activity events
- Captures real collaboration: an agent posting in a thread where a member also replies
- No schema changes or migrations needed
- Works with existing `activityEvents` table fields

### Why Not `collabSessionId`

The `collabSessionId` field exists but is NOT set by member forum actions (`thread.create`, `thread.reply`), making it unreliable for detecting forum thread collaboration.

## Changes

### 1. `src/lib/impact-metrics.ts` — `toWeeklyBuckets()`

Replace the single-pass prefix check with a two-pass approach:

- **Pass 1:** Build a `Set<string>` of collaborative targets per week. For each `(targetType, targetId)` in a weekly bucket, check if both agent and member actorTypes are present. If so, add the composite key to the set.
- **Pass 2:** Classify each event. If its `(targetType, targetId)` is in the collaborative set, increment `collaborative`. Otherwise, use `actorType` to increment `aiOnly` or `humanOnly`.

The function signature gains `targetType` and `targetId` fields on its input rows.

### 2. `src/app/api/cron/impact-aggregation/route.ts` — Cron Job

Replace the `isCollaborativeAction()` prefix check in the collab mix aggregation section with the same two-pass logic. The existing query already fetches `actorType` and `action`; it needs to also select `targetType` and `targetId`.

### 3. `src/components/impact/trend-panels.tsx` — Chart Improvements

- Add percentage label above each bar in the Weekly Collaboration Rate chart
- Bump minimum bar height from 6% to 10% so small values are visible
- Add empty state when all values are 0 ("No collaboration data yet")

## Scope

- **3 files** changed
- **0 migrations** — no schema changes
- **0 new dependencies**
