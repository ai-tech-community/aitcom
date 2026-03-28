# Webhook Event Isolation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix security breach where private message events are broadcast to all agent webhooks by adding a `recipientId` column to `activityEvents` and filtering in both the webhook dispatch (push) and notifications (pull) paths.

**Architecture:** Add nullable `recipientId` to `activityEvents` table. When set, only dispatch to webhooks whose `ownerId` matches. Update `logActivity` to accept `recipientId`. Update the two `message.sent` callers in `inbox.ts` to pass the message recipient. Add defense-in-depth filter in `getNotifications`.

**Tech Stack:** Drizzle ORM (Neon), TypeScript, tRPC 11, Next.js 15

---

### Task 1: Add `recipientId` Column to Schema

**Files:**
- Modify: `src/server/db/schema.ts:478-504`

**Step 1: Add the column to `activityEvents` table**

In `src/server/db/schema.ts`, inside the `activityEvents` table definition, add `recipientId` after the `contextType` column (line 493):

```typescript
recipientId: d.varchar("recipient_id", { length: 255 }),
```

**Step 2: Add index for efficient filtering**

In the index array (lines 499-504), add a partial index:

```typescript
index("activity_events_recipient_idx").on(t.recipientId),
```

**Step 3: Push schema to database**

Run: `pnpm db:push`
Expected: Schema synced with new nullable column + index. No data loss.

**Step 4: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(schema): add recipientId to activityEvents for event isolation"
```

---

### Task 2: Update `logActivity` to Accept `recipientId`

**Files:**
- Modify: `src/server/agent/activity.ts:14-41`

**Step 1: Add `recipientId` to the event parameter type**

In `src/server/agent/activity.ts`, update the `event` parameter type (line 16-24) to include:

```typescript
recipientId?: string;
```

Add it after `collabSessionId`:

```typescript
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
    recipientId?: string;
  },
) {
```

**Step 2: Pass `recipientId` through to the insert**

In the `db.insert(activityEvents).values(...)` call (lines 29-41), add:

```typescript
recipientId: event.recipientId ?? null,
```

After `contextType: contextType ?? null,`.

**Step 3: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors (column is nullable, all existing callers don't pass it, defaults to null = public).

**Step 4: Commit**

```bash
git add src/server/agent/activity.ts
git commit -m "feat(activity): accept optional recipientId in logActivity"
```

---

### Task 3: Update Webhook Dispatch to Filter Private Events

**Files:**
- Modify: `src/server/agent/webhook-dispatch.ts:73-83`

**Step 1: Add recipientId filter to the event matching logic**

In `src/server/agent/webhook-dispatch.ts`, inside the `matchingEvents` filter function (line 73-83), add a new check **before** the existing `actorId` check:

```typescript
const matchingEvents = events.filter((evt) => {
  // Skip private events not meant for this webhook's owner
  if (evt.recipientId && evt.recipientId !== webhook.ownerId) return false;
  if (evt.actorId === webhook.agentId) return false;
  if (!prefixes.some((prefix) => evt.action.startsWith(prefix))) return false;

  // Dampen cross-agent ping-pong
  if (evt.actorType === "agent" && consecutiveAgentEvents >= 2) {
    return false;
  }

  return true;
});
```

The key new line is:
```typescript
if (evt.recipientId && evt.recipientId !== webhook.ownerId) return false;
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors. The `evt` object from the `activityEvents` select now includes `recipientId` (nullable).

**Step 3: Commit**

```bash
git add src/server/agent/webhook-dispatch.ts
git commit -m "fix(security): filter private events in webhook dispatch by recipientId"
```

---

### Task 4: Add Defense-in-Depth Filter in `getNotifications`

**Files:**
- Modify: `src/server/api/routers/agent.ts:408-419`

**Step 1: Add WHERE clause to exclude private events for other owners**

In `src/server/api/routers/agent.ts`, in the `getNotifications` query (lines 408-419), add a third condition to the `and()`:

```typescript
const events = await ctx.db
  .select()
  .from(activityEvents)
  .where(
    and(
      sql`${activityEvents.createdAt} > ${sinceDate}`,
      // Exclude this agent's own actions
      sql`NOT (${activityEvents.actorId} = ${ctx.agent.agentId} AND ${activityEvents.actorType} = 'agent')`,
      // Exclude private events not meant for this agent's owner
      sql`(${activityEvents.recipientId} IS NULL OR ${activityEvents.recipientId} = ${ctx.agent.ownerId})`,
    ),
  )
  .orderBy(desc(activityEvents.createdAt))
  .limit(input.limit * 2);
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "fix(security): filter private events in getNotifications by recipientId"
```

---

### Task 5: Pass `recipientId` in Human `sendMessage`

**Files:**
- Modify: `src/server/api/routers/inbox.ts:283-329`

**Step 1: Query the other participant to get the recipient userId**

In `src/server/api/routers/inbox.ts`, in the `sendMessage` mutation, after the participant verification (line 303) and before the message insert (line 306), add a query to find the other participant:

```typescript
// Find the other participant (recipient) for event isolation
const [recipient] = await ctx.db
  .select({ userId: conversationParticipants.userId })
  .from(conversationParticipants)
  .where(
    and(
      eq(conversationParticipants.conversationId, input.conversationId),
      sql`${conversationParticipants.userId} != ${userId}`,
    ),
  )
  .limit(1);
```

**Step 2: Pass `recipientId` to `logActivity`**

Update the existing `logActivity` call (lines 322-329) to include `recipientId`:

```typescript
void logActivity(ctx.db, {
  actorId: userId,
  actorType: "member",
  action: "message.sent",
  targetType: "conversations",
  targetId: input.conversationId,
  recipientId: recipient?.userId,
});
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/server/api/routers/inbox.ts
git commit -m "fix(security): pass recipientId when logging human message.sent events"
```

---

### Task 6: Pass `recipientId` in Agent `agentSendMessage`

**Files:**
- Modify: `src/server/api/routers/inbox.ts:582-589`

**Step 1: Pass `recipientId` to `logActivity`**

In `src/server/api/routers/inbox.ts`, update the agent's `logActivity` call (lines 582-589). The agent always messages its owner, so `recipientId` is `ctx.agent.ownerId`:

```typescript
void logActivity(ctx.db, {
  actorId: ctx.agent.agentId,
  actorType: "agent",
  action: "message.sent",
  targetType: "conversations",
  targetId: convId,
  recipientId: ctx.agent.ownerId,
});
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/server/api/routers/inbox.ts
git commit -m "fix(security): pass recipientId when logging agent message.sent events"
```

---

### Task 7: Verify End-to-End

**Step 1: Run full TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors across the entire project.

**Step 2: Run build**

Run: `pnpm build`
Expected: Clean build, no errors.

**Step 3: Commit any remaining changes and verify git status is clean**

```bash
git status
```

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `src/server/db/schema.ts` | Add `recipientId` column + index | Data model for event privacy |
| `src/server/agent/activity.ts` | Accept optional `recipientId` | Pass-through in `logActivity` |
| `src/server/agent/webhook-dispatch.ts` | Add `recipientId` filter | Block private events to wrong webhooks |
| `src/server/api/routers/agent.ts` | Add WHERE clause in `getNotifications` | Defense-in-depth for pull path |
| `src/server/api/routers/inbox.ts` | Pass `recipientId` in 2 `logActivity` calls | Tag message events with recipient |
