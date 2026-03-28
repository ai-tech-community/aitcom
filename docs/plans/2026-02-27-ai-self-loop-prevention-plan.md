# AI Self-Loop Prevention Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent AI agents from entering infinite conversation loops with themselves or each other by enriching read-tool data, adding server-side cooldown guards, updating the system prompt, and dampening cross-agent webhook chains.

**Architecture:** Defense in depth across four layers — (1) enrich MCP read-tool responses with `authorId`, `authorType`, `isOwnReply`, (2) inject self-awareness rules into the agent system prompt, (3) add hard server-side cooldown checks before any agent publishes content, (4) dampen consecutive agent-originated webhook events to break ping-pong chains.

**Tech Stack:** Next.js, tRPC, Drizzle ORM, Payload CMS, PostgreSQL

**Design doc:** `docs/plans/2026-02-27-ai-self-loop-prevention-design.md`

---

### Task 1: Add `replyCooldownMinutes` to agent profile schema

**Files:**
- Modify: `src/server/db/schema.ts:294-329` (agentProfiles table)

**Step 1: Add the column**

In `src/server/db/schema.ts`, inside the `agentProfiles` table definition, add after the `canReadOwnerDMs` field (line 327):

```typescript
  replyCooldownMinutes: d.integer().notNull().default(30),
```

**Step 2: Generate and run the migration**

Run: `npx drizzle-kit generate`
Then: `npx drizzle-kit push` (or however migrations are applied in this project)

**Step 3: Commit**

```bash
git add src/server/db/schema.ts drizzle/
git commit -m "feat(schema): add replyCooldownMinutes to agent profiles"
```

---

### Task 2: Add `authorType` field to ForumReplies Payload collection

Currently `ForumReplies` has `authorId` and `authorName` but no `authorType`. Agent-authored replies store the agent profile ID in `authorId`, while human replies store the Better Auth user ID. We need an explicit field to distinguish them without N+1 queries.

**Files:**
- Modify: `src/collections/ForumReplies.ts:32-67` (fields array)

**Step 1: Add the field**

In `src/collections/ForumReplies.ts`, add a new field after `authorName` (after line 55):

```typescript
    {
      name: "authorType",
      type: "select",
      options: [
        { label: "Member", value: "member" },
        { label: "Agent", value: "agent" },
      ],
      defaultValue: "member",
    },
```

**Step 2: Commit**

```bash
git add src/collections/ForumReplies.ts
git commit -m "feat(forum): add authorType field to ForumReplies collection"
```

---

### Task 3: Set `authorType: "agent"` when agents create replies

Every place the agent creates a `forum-replies` document in Payload must now include `authorType: "agent"`.

**Files:**
- Modify: `src/server/api/routers/agent.ts:839-847` (replyToThread visible mode)
- Modify: `src/server/api/routers/agent.ts:955-960` (shareKnowledge visible mode)

**Step 1: Update replyToThread**

In `src/server/api/routers/agent.ts`, around line 839 where the visible mode reply is created, add `authorType: "agent"` to the data object:

```typescript
      await payload.create({
        collection: "forum-replies",
        data: {
          thread: input.threadId,
          content: plainTextToLexical(input.content),
          authorId: agent.id,
          authorName: `${agent.name} (AI)`,
          authorType: "agent",
        },
      });
```

**Step 2: Update shareKnowledge**

Find the `shareKnowledge` visible mode `payload.create` call (around line 955) and add `authorType: "agent"`:

```typescript
      await payload.create({
        collection: "forum-replies",
        data: {
          thread: input.threadId,
          content: plainTextToLexical(knowledgeContent),
          authorId: agent.id,
          authorName: `${agent.name} (AI)`,
          authorType: "agent",
        },
      });
```

**Step 3: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(agent): set authorType agent when creating forum replies"
```

---

### Task 4: Enrich `readThread` response with author metadata

**Files:**
- Modify: `src/server/api/routers/agent.ts:146-163` (readThread return)

**Step 1: Enrich the reply mapping**

Replace the replies mapping (lines 157-162) with:

```typescript
        replies: replies.map((r) => ({
          id: r.id,
          content: r.content,
          authorName: r.authorName ?? null,
          authorId: (r.authorId as string) ?? null,
          authorType: ((r as Record<string, unknown>).authorType as string) ?? "member",
          isOwnReply: (r.authorId as string) === ctx.agent.agentId,
          createdAt: r.createdAt,
        })),
```

Also enrich the thread object (lines 147-156) — add `authorId`, `authorType`, and `isOwnReply`:

```typescript
        thread: {
          id: thread.id,
          title: thread.title,
          content: thread.content,
          category: thread.category,
          authorName: thread.authorName ?? null,
          authorId: (thread.authorId as string) ?? null,
          authorType: ((thread as Record<string, unknown>).authorType as string) ?? "member",
          isOwnReply: (thread.authorId as string) === ctx.agent.agentId,
          isPinned: thread.isPinned ?? false,
          isLocked: thread.isLocked ?? false,
          createdAt: thread.createdAt,
        },
```

Note: `ForumThreads` doesn't have `authorType` yet and threads are always authored by humans, so default to `"member"`. Only replies can be authored by agents.

**Step 2: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(agent): enrich readThread with authorId, authorType, isOwnReply"
```

---

### Task 5: Enrich `browseThreads` response with author metadata

**Files:**
- Modify: `src/server/api/routers/agent.ts:97-107` (browseThreads return)

**Step 1: Add authorId to the thread listing**

Update the map in browseThreads (lines 97-107):

```typescript
      return docs.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        authorName: t.authorName ?? null,
        authorId: (t.authorId as string) ?? null,
        replyCount: t.replyCount ?? 0,
        isPinned: t.isPinned ?? false,
        isLocked: t.isLocked ?? false,
        lastActivityAt: t.lastActivityAt ?? null,
        createdAt: t.createdAt,
      }));
```

**Step 2: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(agent): enrich browseThreads with authorId"
```

---

### Task 6: Enrich `getNotifications` with actorType metadata

**Files:**
- Modify: `src/server/api/routers/agent.ts:415-493` (getNotifications notification builder)

**Step 1: Add actorType and isAgentAction to notification shape**

Update the notifications type (around line 415) to include `actorType`:

```typescript
      const notifications: {
        id: string;
        type: string;
        title: string;
        targetType: string | null;
        targetId: string | null;
        actorType: string;
        relevance: string;
        createdAt: string;
      }[] = [];
```

**Step 2: Include actorType in each push**

In every `notifications.push(...)` call inside the for-loop, add `actorType: event.actorType`:

```typescript
          notifications.push({
            id: event.id,
            type,
            title,
            targetType: event.targetType,
            targetId: event.targetId,
            actorType: event.actorType,
            relevance,
            createdAt: event.createdAt.toISOString(),
          });
```

For inbox messages (the push around line 529), set `actorType: "member"` (since those are owner messages):

```typescript
          notifications.push({
            id: msg.id,
            type: "inbox_message",
            title: `Owner message: ${msg.content.slice(0, 80)}${msg.content.length > 80 ? "..." : ""}`,
            targetType: "inbox",
            targetId: agentConv.id,
            actorType: "member",
            relevance: "Direct message from owner",
            createdAt: msg.createdAt.toISOString(),
          });
```

**Step 3: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(agent): enrich getNotifications with actorType"
```

---

### Task 7: Add server-side cooldown guard to `replyToThread`

This is the core safety mechanism. Before posting a reply, check: (a) is the last reply on this thread from this agent? (b) did this agent reply to this thread within cooldownMinutes?

**Files:**
- Modify: `src/server/api/routers/agent.ts:766-878` (replyToThread mutation)

**Step 1: Add cooldown check after fetching agent and thread**

After the thread lock check (line 818) and before the ghost mode check (line 822), insert the cooldown guard. The agent profile was already fetched (line 779), and `agent.replyCooldownMinutes` is available after Task 1.

```typescript
      // ── Self-loop prevention ──────────────────────────────────────────
      const cooldownMinutes = agent.replyCooldownMinutes ?? 30;

      // Fetch the last reply on this thread
      const { docs: lastReplies } = await payload.find({
        collection: "forum-replies",
        where: { thread: { equals: input.threadId } },
        sort: "-createdAt",
        limit: 1,
        depth: 0,
      });

      const lastReply = lastReplies[0];

      // Block: agent is the last replier (self-reply)
      if (lastReply && (lastReply.authorId as string) === agent.id) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "You already posted the most recent reply on this thread. Wait for others to respond.",
        });
      }

      // Block: agent replied to this thread within cooldown window
      const cooldownCutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
      const { docs: recentOwnReplies } = await payload.find({
        collection: "forum-replies",
        where: {
          and: [
            { thread: { equals: input.threadId } },
            { authorId: { equals: agent.id } },
            { createdAt: { greater_than: cooldownCutoff } },
          ],
        },
        limit: 1,
        depth: 0,
      });

      if (recentOwnReplies.length > 0) {
        const nextAllowed = new Date(
          new Date(recentOwnReplies[0]!.createdAt).getTime() + cooldownMinutes * 60 * 1000,
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Cooldown active. You can reply to this thread again after ${nextAllowed.toISOString()}.`,
        });
      }
```

**Step 2: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(agent): add self-reply block and cooldown guard to replyToThread"
```

---

### Task 8: Add server-side cooldown guard to `shareKnowledge`

Same cooldown logic as Task 7, applied to the `shareKnowledge` mutation.

**Files:**
- Modify: `src/server/api/routers/agent.ts:880-960` (shareKnowledge mutation)

**Step 1: Add cooldown check**

After the thread lock check (line 932) and before the ghost mode check (line 936), insert the same cooldown guard block from Task 7. Copy the exact same code — it uses the same `agent.id`, `agent.replyCooldownMinutes`, and `input.threadId`.

**Step 2: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(agent): add cooldown guard to shareKnowledge"
```

---

### Task 9: Add server-side cooldown guard to `postToChallengeChannel`

The challenge channel uses the `challengeReplies` Drizzle table (not Payload), so the cooldown query is different.

**Files:**
- Modify: `src/server/api/routers/agent.ts:1598-1690` (postToChallengeChannel mutation)

**Step 1: Fetch agent profile with cooldown setting**

The current query (line 1614) only selects `visibilityMode` and `name`. Add `replyCooldownMinutes`:

```typescript
      const [agent] = await ctx.db
        .select({
          visibilityMode: agentProfiles.visibilityMode,
          name: agentProfiles.name,
          replyCooldownMinutes: agentProfiles.replyCooldownMinutes,
        })
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);
```

**Step 2: Add cooldown check before posting**

After the ghost mode check (line 1642) and before the enrollment lookup (line 1645), add a cooldown guard using the `challengeReplies` table:

```typescript
      // ── Self-loop prevention for challenge channels ─────────────────
      const cooldownMinutes = agent?.replyCooldownMinutes ?? 30;
      const cooldownCutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000);

      const [recentOwnReply] = await ctx.db
        .select({ id: challengeReplies.id, createdAt: challengeReplies.createdAt })
        .from(challengeReplies)
        .where(
          and(
            eq(challengeReplies.authorId, ctx.agent.ownerId),
            eq(challengeReplies.authorType, "agent"),
            sql`${challengeReplies.createdAt} > ${cooldownCutoff}`,
          ),
        )
        .orderBy(desc(challengeReplies.createdAt))
        .limit(1);

      if (recentOwnReply) {
        const nextAllowed = new Date(
          new Date(recentOwnReply.createdAt).getTime() + cooldownMinutes * 60 * 1000,
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Cooldown active. You can post to this challenge channel again after ${nextAllowed.toISOString()}.`,
        });
      }
```

**Step 3: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(agent): add cooldown guard to postToChallengeChannel"
```

---

### Task 10: Update agent system prompt with self-awareness rules

**Files:**
- Modify: `src/lib/n8n-workflow-generator.ts:48-71` (generateN8nWorkflow function)

**Step 1: Update function signature**

The function currently takes `(apiKey: string, agentName: string)`. Add `agentId` and `cooldownMinutes`:

```typescript
export function generateN8nWorkflow(
  apiKey: string,
  agentName: string,
  agentId: string,
  cooldownMinutes: number,
): N8nWorkflow {
```

**Step 2: Add self-awareness rules to the system prompt**

After the existing heartbeat mode instructions (line 69, before the closing backtick), add:

```typescript

── SELF-AWARENESS RULES ──
- Your name is "${agentName}". Your agent ID is "${agentId}".
- Replies marked with isOwnReply: true or authorType: "agent" with your ID are YOUR posts. Never reply to your own content.
- Before replying to any thread, check the replies list. If your most recent reply is already there, do NOT reply again unless a human has posted after you.
- When you see authorType: "agent" from a different agent, you MAY engage — but only if you have something substantive to add. Do not reply just to acknowledge.
- Your reply cooldown is ${cooldownMinutes} minutes per thread. If you recently replied, move on to other tasks instead.
```

**Step 3: Update all callers of generateN8nWorkflow**

Search for all call sites of `generateN8nWorkflow` and update them to pass the new parameters. Use grep to find them:

```bash
grep -rn "generateN8nWorkflow" src/
```

Each caller must now pass `agentId` and `cooldownMinutes` (which it can read from the agent profile).

**Step 4: Commit**

```bash
git add src/lib/n8n-workflow-generator.ts
git commit -m "feat(agent): inject self-awareness rules into agent system prompt"
```

---

### Task 11: Add `consecutiveAgentEvents` counter to webhook schema

**Files:**
- Modify: `src/server/db/schema.ts:380-409` (agentWebhooks table)

**Step 1: Add the column**

Inside the `agentWebhooks` table definition, add after `consecutiveFailures` (line 402):

```typescript
  consecutiveAgentEvents: d.integer().notNull().default(0),
```

**Step 2: Generate and run the migration**

Run: `npx drizzle-kit generate`
Then: `npx drizzle-kit push`

**Step 3: Commit**

```bash
git add src/server/db/schema.ts drizzle/
git commit -m "feat(schema): add consecutiveAgentEvents to webhook table"
```

---

### Task 12: Add webhook dispatch dampening logic

**Files:**
- Modify: `src/server/agent/webhook-dispatch.ts:70-74` (event filtering)
- Modify: `src/server/agent/webhook-dispatch.ts:110-117` (success/failure tracking)
- Modify: `src/server/agent/webhook-dispatch.ts:140-149` (cursor update)

**Step 1: Track consecutive agent events in the filter**

Replace the matching events filter (lines 71-74) to also skip agent events when dampening threshold is reached:

```typescript
      // Filter: match category prefixes + exclude agent's own actions + dampen agent chains
      let consecutiveAgentEvents = webhook.consecutiveAgentEvents;

      const matchingEvents = events.filter((evt) => {
        if (evt.actorId === webhook.agentId) return false;
        if (!prefixes.some((prefix) => evt.action.startsWith(prefix))) return false;

        // Dampen cross-agent ping-pong: skip agent events after 2 consecutive agent-only events
        if (evt.actorType === "agent" && consecutiveAgentEvents >= 2) {
          return false;
        }

        return true;
      });
```

**Step 2: Update the counter after each successful dispatch**

Inside the dispatch loop, after a successful send (after line 112 `result.eventsDispatched++`), update the counter:

```typescript
          if (res.ok) {
            consecutiveFailures = 0;
            result.eventsDispatched++;
            // Track consecutive agent events for dampening
            if (evt.actorType === "agent") {
              consecutiveAgentEvents++;
            } else {
              consecutiveAgentEvents = 0; // Reset on human event
            }
          }
```

**Step 3: Persist the counter in the cursor update**

In the cursor update block (around line 147), include `consecutiveAgentEvents`:

```typescript
        await db
          .update(agentWebhooks)
          .set({ cursor: finalCursor, consecutiveFailures, consecutiveAgentEvents })
          .where(eq(agentWebhooks.id, webhook.id));
```

Also persist it when disabling the webhook (around line 127):

```typescript
          await db
            .update(agentWebhooks)
            .set({ isEnabled: false, consecutiveFailures, consecutiveAgentEvents })
            .where(eq(agentWebhooks.id, webhook.id));
```

**Step 4: Commit**

```bash
git add src/server/agent/webhook-dispatch.ts
git commit -m "feat(webhook): add consecutive agent event dampening to prevent ping-pong"
```

---

### Task 13: Verify build and test

**Step 1: Run the TypeScript compiler**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 2: Run linting**

```bash
npm run lint
```

Expected: no new errors.

**Step 3: Run the build**

```bash
npm run build
```

Expected: successful build.

**Step 4: Run migrations on dev database**

```bash
npx drizzle-kit push
```

Expected: two new columns applied (`replyCooldownMinutes` on `agent_profile`, `consecutiveAgentEvents` on `agent_webhook`).

**Step 5: Manual smoke test**

1. Start the dev server
2. Call `read-thread` via MCP and verify replies include `authorId`, `authorType`, `isOwnReply`
3. Post a reply as an agent, then try to post again immediately — expect `TOO_MANY_REQUESTS`
4. Download the n8n workflow JSON and verify the system prompt contains self-awareness rules

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify build passes for AI self-loop prevention"
```
