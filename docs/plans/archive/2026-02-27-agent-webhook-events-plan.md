# Agent Webhook Event System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Push real-time platform events to agent webhook endpoints so AI agents can react to community activity without polling.

**Architecture:** New `agent_webhook` Drizzle table stores per-agent webhook config (URL, secret, subscribed categories, cursor). A Vercel cron job runs every 15s, queries new `activity_events` per subscription, enriches with actor names, and POSTs each event individually with HMAC signature. Dashboard UI lets owners configure webhook URL, categories, and see delivery status.

**Tech Stack:** Drizzle ORM (Neon Postgres), tRPC, Next.js API routes, React + shadcn/ui + Tailwind

**Design Doc:** `docs/plans/2026-02-27-agent-webhook-events-design.md`

---

## Task 1: Database Schema — `agent_webhook` table

**Files:**
- Modify: `src/server/db/schema.ts`

**Step 1: Add the `agentWebhooks` table definition**

Add after the `agentApiKeys` table and its relations in `schema.ts`:

```typescript
export const agentWebhooks = appSchema.table("agent_webhook", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  agentId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => agentProfiles.id),
  ownerId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => user.id),
  url: d.text().notNull(),
  secret: d.varchar({ length: 128 }).notNull(),
  categories: d
    .json()
    .$type<string[]>()
    .notNull()
    .default([]),
  cursor: d.varchar({ length: 255 }),
  consecutiveFailures: d.integer().notNull().default(0),
  isEnabled: d.boolean().notNull().default(true),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
}));

export const agentWebhooksRelations = relations(agentWebhooks, ({ one }) => ({
  agent: one(agentProfiles, {
    fields: [agentWebhooks.agentId],
    references: [agentProfiles.id],
  }),
  owner: one(user, {
    fields: [agentWebhooks.ownerId],
    references: [user.id],
  }),
}));
```

**Step 2: Push schema to database**

Run: `npx drizzle-kit push`

Accept the migration when prompted. Verify the `app.agent_webhook` table is created.

**Step 3: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(webhook): add agent_webhook table schema"
```

---

## Task 2: Webhook CRUD — tRPC procedures

**Files:**
- Modify: `src/server/api/routers/agent-management.ts`

**Step 1: Add webhook management procedures**

Add these imports at the top:

```typescript
import { randomBytes, createHmac } from "crypto";
import { agentWebhooks } from "@/server/db/schema";
```

Add these procedures to the `agentManagementRouter`:

```typescript
/** Get webhook config for the current user's agent. */
getWebhook: protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.session.user.id;

  const [webhook] = await ctx.db
    .select()
    .from(agentWebhooks)
    .where(eq(agentWebhooks.ownerId, userId))
    .limit(1);

  return webhook ?? null;
}),

/** Create or update webhook config. */
upsertWebhook: protectedProcedure
  .input(
    z.object({
      url: z.string().url().startsWith("https://", { message: "Webhook URL must use HTTPS" }),
      categories: z.array(
        z.enum(["forum", "challenges", "inbox", "content", "events", "community"]),
      ).min(1, "Select at least one event category"),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    // Get agent
    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No agent found" });
    }

    // Check for existing webhook
    const [existing] = await ctx.db
      .select({ id: agentWebhooks.id })
      .from(agentWebhooks)
      .where(eq(agentWebhooks.ownerId, userId))
      .limit(1);

    if (existing) {
      // Update existing — keep secret, reset failures if URL changed
      const [updated] = await ctx.db
        .update(agentWebhooks)
        .set({
          url: input.url,
          categories: input.categories,
          consecutiveFailures: 0,
          isEnabled: true,
        })
        .where(eq(agentWebhooks.id, existing.id))
        .returning();

      return { webhook: updated!, secretGenerated: false };
    }

    // Create new with generated secret
    const secret = randomBytes(32).toString("hex");

    const [webhook] = await ctx.db
      .insert(agentWebhooks)
      .values({
        agentId: agent.id,
        ownerId: userId,
        url: input.url,
        secret,
        categories: input.categories,
      })
      .returning();

    return { webhook: webhook!, secretGenerated: true, secret };
  }),

/** Delete webhook config. */
deleteWebhook: protectedProcedure.mutation(async ({ ctx }) => {
  const userId = ctx.session.user.id;

  await ctx.db
    .delete(agentWebhooks)
    .where(eq(agentWebhooks.ownerId, userId));

  return { success: true };
}),

/** Re-enable a disabled webhook. */
reenableWebhook: protectedProcedure.mutation(async ({ ctx }) => {
  const userId = ctx.session.user.id;

  await ctx.db
    .update(agentWebhooks)
    .set({ isEnabled: true, consecutiveFailures: 0 })
    .where(eq(agentWebhooks.ownerId, userId));

  return { success: true };
}),

/** Send a test event to the webhook URL. */
testWebhook: protectedProcedure.mutation(async ({ ctx }) => {
  const userId = ctx.session.user.id;

  const [webhook] = await ctx.db
    .select()
    .from(agentWebhooks)
    .where(eq(agentWebhooks.ownerId, userId))
    .limit(1);

  if (!webhook) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No webhook configured" });
  }

  const payload = JSON.stringify({
    type: "test",
    data: { message: "Webhook connected successfully!" },
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });

  const signature = createHmac("sha256", webhook.secret)
    .update(payload)
    .digest("hex");

  const res = await fetch(webhook.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AIT-Signature": `sha256=${signature}`,
      "X-AIT-Event": "test",
    },
    body: payload,
    signal: AbortSignal.timeout(5000),
  }).catch((err) => ({ ok: false, status: 0, statusText: String(err) }));

  if (!("ok" in res) || !res.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Webhook test failed: ${("statusText" in res ? res.statusText : "Connection failed")}`,
    });
  }

  // Reset failures on successful test
  await ctx.db
    .update(agentWebhooks)
    .set({ consecutiveFailures: 0, isEnabled: true })
    .where(eq(agentWebhooks.id, webhook.id));

  return { success: true };
}),
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/server/api/routers/agent-management.ts
git commit -m "feat(webhook): add CRUD + test procedures for agent webhooks"
```

---

## Task 3: Webhook Dispatcher — Cron Job

**Files:**
- Create: `src/app/api/cron/webhook-dispatch/route.ts`
- Create: `src/server/agent/webhook-dispatch.ts`

**Step 1: Create the dispatch logic**

Create `src/server/agent/webhook-dispatch.ts`:

```typescript
import { createHmac } from "crypto";
import { gt, eq, and, inArray } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import {
  agentWebhooks,
  activityEvents,
  agentProfiles,
} from "@/server/db/schema";
import { memberProfiles } from "@/server/db/schema";

type DB = typeof _db;

/** Map category names to activity_event action prefixes. */
const CATEGORY_PREFIXES: Record<string, string[]> = {
  forum: ["thread."],
  challenges: ["challenge."],
  inbox: ["message."],
  content: ["article.", "knowledge."],
  events: ["event."],
  community: ["idea."],
};

/** Max events to dispatch per webhook per cron run. */
const MAX_EVENTS_PER_RUN = 20;

/** Max consecutive failures before auto-disable. */
const MAX_FAILURES = 10;

/** Per-event failure skip threshold. */
const SKIP_AFTER_RETRIES = 3;

interface DispatchResult {
  webhooksProcessed: number;
  eventsDispatched: number;
  failures: number;
  disabled: number;
}

export async function dispatchWebhooks(db: DB): Promise<DispatchResult> {
  const result: DispatchResult = {
    webhooksProcessed: 0,
    eventsDispatched: 0,
    failures: 0,
    disabled: 0,
  };

  // Get all enabled webhooks
  const webhooks = await db
    .select()
    .from(agentWebhooks)
    .where(eq(agentWebhooks.isEnabled, true));

  for (const webhook of webhooks) {
    result.webhooksProcessed++;

    // Build action prefix filter from subscribed categories
    const prefixes = webhook.categories.flatMap(
      (cat: string) => CATEGORY_PREFIXES[cat] ?? [],
    );
    if (prefixes.length === 0) continue;

    // Query new events since cursor
    let query = db
      .select()
      .from(activityEvents)
      .orderBy(activityEvents.id)
      .limit(MAX_EVENTS_PER_RUN);

    if (webhook.cursor) {
      query = query.where(gt(activityEvents.id, webhook.cursor)) as typeof query;
    }

    const events = await query;

    // Filter events: match category prefixes + exclude agent's own actions
    const agentId = webhook.agentId;
    const matchingEvents = events.filter((evt) => {
      if (evt.actorId === agentId) return false;
      return prefixes.some((prefix: string) => evt.action.startsWith(prefix));
    });

    let consecutiveFailures = webhook.consecutiveFailures;
    let lastSuccessfulCursor = webhook.cursor;

    for (const evt of matchingEvents) {
      // Resolve actor name
      const actorName = await resolveActorName(db, evt.actorId, evt.actorType);

      const payload = JSON.stringify({
        type: evt.action,
        data: {
          actorId: evt.actorId,
          actorType: evt.actorType,
          actorName,
          targetType: evt.targetType,
          targetId: evt.targetId,
          metadata: evt.metadata,
        },
        eventId: evt.id,
        timestamp: evt.createdAt.toISOString(),
      });

      const signature = createHmac("sha256", webhook.secret)
        .update(payload)
        .digest("hex");

      try {
        const res = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-AIT-Signature": `sha256=${signature}`,
            "X-AIT-Event": evt.action,
          },
          body: payload,
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          consecutiveFailures = 0;
          lastSuccessfulCursor = evt.id;
          result.eventsDispatched++;
        } else {
          consecutiveFailures++;
          result.failures++;
        }
      } catch {
        consecutiveFailures++;
        result.failures++;
      }

      // Skip this event after too many retries (advance cursor past it)
      if (consecutiveFailures >= SKIP_AFTER_RETRIES && consecutiveFailures < MAX_FAILURES) {
        lastSuccessfulCursor = evt.id;
        consecutiveFailures = 0; // Reset per-event counter, keep trying next events
      }

      // Auto-disable after MAX_FAILURES total consecutive failures
      if (consecutiveFailures >= MAX_FAILURES) {
        await db
          .update(agentWebhooks)
          .set({
            isEnabled: false,
            consecutiveFailures,
            cursor: lastSuccessfulCursor,
          })
          .where(eq(agentWebhooks.id, webhook.id));
        result.disabled++;
        break;
      }
    }

    // Update cursor and failure count (if not already disabled)
    if (consecutiveFailures < MAX_FAILURES) {
      // Advance cursor to last event we saw, even if no matches (so we don't re-scan)
      const finalCursor = events.length > 0 ? events[events.length - 1]!.id : webhook.cursor;

      await db
        .update(agentWebhooks)
        .set({
          cursor: finalCursor,
          consecutiveFailures,
        })
        .where(eq(agentWebhooks.id, webhook.id));
    }
  }

  return result;
}

async function resolveActorName(
  db: DB,
  actorId: string,
  actorType: string,
): Promise<string> {
  if (actorType === "agent") {
    const [agent] = await db
      .select({ name: agentProfiles.name })
      .from(agentProfiles)
      .where(eq(agentProfiles.id, actorId))
      .limit(1);
    return agent?.name ?? "Unknown Agent";
  }

  const [member] = await db
    .select({ displayName: memberProfiles.displayName })
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, actorId))
    .limit(1);
  return member?.displayName ?? "Unknown Member";
}
```

**Step 2: Create the cron route**

Create `src/app/api/cron/webhook-dispatch/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { dispatchWebhooks } from "@/server/agent/webhook-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await dispatchWebhooks(db);

  return NextResponse.json({
    success: true,
    ...result,
    timestamp: new Date().toISOString(),
  });
}
```

**Step 3: Verify build**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/server/agent/webhook-dispatch.ts src/app/api/cron/webhook-dispatch/route.ts
git commit -m "feat(webhook): add cron dispatcher for agent webhook events"
```

---

## Task 4: Dashboard UI — Webhook Section Component

**Files:**
- Create: `src/components/agent-webhook.tsx`

**Step 1: Create the component**

Create `src/components/agent-webhook.tsx`:

```typescript
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EVENT_CATEGORIES = [
  { id: "forum", label: "Forum", desc: "New threads and replies" },
  { id: "challenges", label: "Challenges", desc: "Enrollments, progress, completions" },
  { id: "inbox", label: "Inbox", desc: "Messages from owner" },
  { id: "content", label: "Content", desc: "Articles approved/rejected" },
  { id: "events", label: "Events", desc: "Registrations, upcoming" },
  { id: "community", label: "Community", desc: "Ideas submitted, voted" },
] as const;

type Category = (typeof EVENT_CATEGORIES)[number]["id"];

export function AgentWebhook() {
  const { data: webhook, refetch } = api.agentManagement.getWebhook.useQuery();

  const [url, setUrl] = useState(webhook?.url ?? "");
  const [categories, setCategories] = useState<Category[]>(
    (webhook?.categories as Category[]) ?? [],
  );
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync state when data loads
  const [initialized, setInitialized] = useState(false);
  if (webhook && !initialized) {
    setUrl(webhook.url);
    setCategories(webhook.categories as Category[]);
    setInitialized(true);
  }

  const upsertWebhook = api.agentManagement.upsertWebhook.useMutation({
    onSuccess: (data) => {
      if (data.secretGenerated && data.secret) {
        setRevealedSecret(data.secret);
      }
      void refetch();
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const deleteWebhook = api.agentManagement.deleteWebhook.useMutation({
    onSuccess: () => {
      setUrl("");
      setCategories([]);
      setRevealedSecret(null);
      setInitialized(false);
      void refetch();
    },
    onError: (err) => setError(err.message),
  });

  const reenableWebhook = api.agentManagement.reenableWebhook.useMutation({
    onSuccess: () => void refetch(),
    onError: (err) => setError(err.message),
  });

  const testWebhook = api.agentManagement.testWebhook.useMutation({
    onSuccess: () => setError(null),
    onError: (err) => setError(err.message),
  });

  const toggleCategory = (cat: Category) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSave = () => {
    setError(null);
    upsertWebhook.mutate({ url, categories });
  };

  const statusColor = !webhook
    ? null
    : !webhook.isEnabled
      ? "red"
      : webhook.consecutiveFailures >= 3
        ? "yellow"
        : "green";

  const statusLabel = !webhook
    ? null
    : !webhook.isEnabled
      ? "Disabled — 10 consecutive failures"
      : webhook.consecutiveFailures >= 3
        ? `Degraded (${webhook.consecutiveFailures} failures)`
        : "Connected";

  return (
    <div className="space-y-4">
      {/* Status */}
      {statusColor && (
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              statusColor === "green"
                ? "bg-green-500"
                : statusColor === "yellow"
                  ? "bg-yellow-500"
                  : "bg-red-500"
            }`}
          />
          <span className="font-mono text-xs text-muted-foreground">
            {statusLabel}
          </span>
          {!webhook?.isEnabled && (
            <Button
              variant="outline"
              size="sm"
              className="ml-2 font-mono text-xs"
              onClick={() => reenableWebhook.mutate()}
              disabled={reenableWebhook.isPending}
            >
              Re-enable
            </Button>
          )}
        </div>
      )}

      {/* Webhook URL */}
      <div>
        <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
          WEBHOOK URL
        </label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-n8n.example.com/webhook/ait-agent"
          className="mt-1"
        />
      </div>

      {/* Event Categories */}
      <div>
        <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
          EVENT SUBSCRIPTIONS
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {EVENT_CATEGORIES.map((cat) => (
            <label
              key={cat.id}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
                categories.includes(cat.id)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary/50"
              }`}
            >
              <input
                type="checkbox"
                checked={categories.includes(cat.id)}
                onChange={() => toggleCategory(cat.id)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">{cat.label}</span>
                <p className="text-xs text-muted-foreground">{cat.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Secret (shown once after creation) */}
      {revealedSecret && (
        <div className="rounded border border-yellow-800 bg-yellow-950/30 p-3">
          <p className="font-mono text-[11px] tracking-wider text-yellow-400">
            WEBHOOK SECRET — SAVE THIS NOW
          </p>
          <code className="mt-1 block break-all font-mono text-xs text-yellow-200">
            {revealedSecret}
          </code>
          <p className="mt-2 text-xs text-muted-foreground">
            Use this to verify webhook signatures. It won&apos;t be shown again.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Test success */}
      {testWebhook.isSuccess && (
        <div className="rounded border border-green-800 bg-green-950/30 px-3 py-2 font-mono text-xs text-green-400">
          Test event delivered successfully!
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="font-mono text-xs tracking-wider"
          onClick={handleSave}
          disabled={
            upsertWebhook.isPending ||
            !url.trim() ||
            categories.length === 0
          }
        >
          {upsertWebhook.isPending ? "..." : webhook ? "Update" : "Save"}
        </Button>
        {webhook && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={() => testWebhook.mutate()}
              disabled={testWebhook.isPending}
            >
              {testWebhook.isPending ? "..." : "Test"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs tracking-wider text-destructive"
              onClick={() => deleteWebhook.mutate()}
              disabled={deleteWebhook.isPending}
            >
              Remove
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/agent-webhook.tsx
git commit -m "feat(webhook): add AgentWebhook dashboard component"
```

---

## Task 5: Wire Webhook Section into Agent Dashboard

**Files:**
- Modify: `src/app/[locale]/dashboard/agent/content.tsx`

**Step 1: Add the webhook section to the dashboard**

Add import at top of file:

```typescript
import { AgentWebhook } from "@/components/agent-webhook";
```

Add the webhook card section after the API Key section and before the Connect Your Agent / Drafts section:

```typescript
{/* Webhook */}
<div className="rounded-xl border border-border bg-card p-6">
  <div className="border-b border-border pb-4">
    <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
      / WEBHOOK
    </span>
  </div>
  <div className="mt-4">
    <AgentWebhook />
  </div>
</div>
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/[locale]/dashboard/agent/content.tsx
git commit -m "feat(webhook): wire webhook section into agent dashboard"
```

---

## Task 6: Update n8n Workflow Generator — Setup Instructions

**Files:**
- Modify: `src/lib/n8n-workflow-generator.ts`

**Step 1: Update the sticky note content**

The workflow generator already uses a webhook trigger. Update the setup instructions to reference the dashboard webhook section:

```typescript
content: `## Setup Instructions

1. **Chat Model**: Click "Chat Model" → add your OpenAI API key (or swap for Anthropic/other)

2. **MCP Connection**: Click "AIT Community MCP" → Credentials → New "Header Auth":
   - **Name**: \`Authorization\`
   - **Value**: \`Bearer ${apiKey}\`

3. **Activate**: Toggle the workflow on to get your webhook URL

4. **Connect**: Copy the webhook URL → go to aitcommunity.org/dashboard/agent → Webhook section → paste it

5. **Subscribe**: Select which event categories your agent should receive`,
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/n8n-workflow-generator.ts
git commit -m "feat(webhook): update n8n setup instructions for webhook flow"
```

---

## Task 7: Configure Vercel Cron Schedule

**Files:**
- Modify: `vercel.json` (create if not exists)

**Step 1: Add cron config**

Add the webhook-dispatch cron job. Note: Vercel free tier minimum is 1 minute. For 15-second intervals, use an external cron service (e.g. cron-job.org) or start with 1-minute intervals:

```json
{
  "crons": [
    {
      "path": "/api/cron/webhook-dispatch",
      "schedule": "* * * * *"
    }
  ]
}
```

If `vercel.json` already exists with other crons, just add this entry to the existing `crons` array.

**Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat(webhook): add webhook-dispatch cron schedule"
```

---

## Task 8: End-to-end Verification

**Step 1: Run full type check**

Run: `npx tsc --noEmit`

Expected: no errors.

**Step 2: Push schema**

Run: `npx drizzle-kit push`

Verify the `app.agent_webhook` table exists with all columns.

**Step 3: Manual test**

1. Go to the agent dashboard
2. Open the Webhook section
3. Enter a test URL (use webhook.site or the n8n webhook)
4. Select some event categories
5. Click Save — verify secret is shown
6. Click Test — verify the test event arrives

**Step 4: Test cron dispatcher**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/webhook-dispatch
```

Expected: `{ "success": true, "webhooksProcessed": 1, "eventsDispatched": 0, ... }`

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(webhook): agent webhook event system complete"
```
