# Agent MCP Trigger Mechanism — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add orientation MCP tools (`get-notifications`, `get-briefing`) and a "Connect Your Agent" dashboard UI section so externally-hosted agents can catch up on platform activity whenever they connect.

**Architecture:** Two new `read`-scope tRPC procedures in the agent router, registered as MCP tools. One new React component (`AgentConnectGuide`) inserted into the existing agent dashboard. No new DB tables — queries use existing `activity_events`, `agent_drafts`, `agent_suggestions`, `messages`, and `challenge_enrollments` tables.

**Tech Stack:** Next.js 15 (App Router), tRPC, Drizzle ORM, PostgreSQL, React 19, Tailwind CSS, MCP SDK

---

### Task 1: Add `getNotifications` tRPC procedure

**Files:**
- Modify: `src/server/api/routers/agent.ts`

**Step 1: Add the `getNotifications` query to the agent router**

Add this after the `myProfile` procedure (around line 354), before the contribution tools section:

```typescript
getNotifications: agentProcedure
  .input(
    z.object({
      since: z.string().optional(), // ISO-8601 timestamp
      limit: z.number().min(1).max(50).default(25),
    }),
  )
  .query(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "read");

    // Get agent profile for expertise tags and lastActiveAt cursor
    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.id, ctx.agent.agentId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Agent profile not found" });
    }

    const sinceDate = input.since
      ? new Date(input.since)
      : agent.lastActiveAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // default: last 24h

    const expertiseTags = (agent.expertiseTags as string[] | null) ?? [];

    // Query activity events since the cursor
    const events = await ctx.db
      .select()
      .from(activityEvents)
      .where(
        and(
          sql`${activityEvents.createdAt} > ${sinceDate}`,
          // Exclude this agent's own actions
          sql`NOT (${activityEvents.actorId} = ${ctx.agent.agentId} AND ${activityEvents.actorType} = 'agent')`,
        ),
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(input.limit * 2); // over-fetch, then filter for relevance

    // Build notifications with relevance filtering
    const notifications: {
      id: string;
      type: string;
      title: string;
      targetType: string | null;
      targetId: string | null;
      relevance: string;
      createdAt: string;
    }[] = [];

    for (const event of events) {
      const meta = (event.metadata as Record<string, unknown>) ?? {};
      let type: string | null = null;
      let title = "";
      let relevance = "";

      switch (event.action) {
        case "thread.created": {
          type = "new_thread";
          title = `New thread: ${meta.title ?? "Untitled"}`;
          // Check if thread category/tags match agent expertise
          const category = meta.category as string | undefined;
          if (expertiseTags.length > 0 && category) {
            const match = expertiseTags.find((t) =>
              category.toLowerCase().includes(t.toLowerCase()),
            );
            if (match) {
              relevance = `Matches expertise: ${match}`;
            }
          }
          if (!relevance) relevance = "New community thread";
          break;
        }
        case "thread.reply": {
          type = "thread_reply";
          title = `New reply in thread ${event.targetId ?? ""}`;
          relevance = meta.agentName
            ? `Reply by ${meta.agentName}`
            : "New reply in thread";
          break;
        }
        case "challenge.objective_completed": {
          if (event.actorId === ctx.agent.ownerId) {
            type = "challenge_update";
            title = `Challenge progress: ${meta.title ?? ""}`;
            relevance = "Owner completed a challenge objective";
          }
          break;
        }
        case "challenge.completed": {
          if (event.actorId === ctx.agent.ownerId) {
            type = "challenge_update";
            title = `Challenge completed: ${meta.title ?? ""}`;
            relevance = "Owner completed a challenge";
          }
          break;
        }
        case "idea.created": {
          type = "idea_posted";
          title = `New idea: ${meta.title ?? "Untitled"}`;
          relevance = "New community idea";
          break;
        }
        default:
          // Skip actions we don't surface as notifications
          continue;
      }

      if (type) {
        notifications.push({
          id: event.id,
          type,
          title,
          targetType: event.targetType,
          targetId: event.targetId,
          relevance,
          createdAt: event.createdAt.toISOString(),
        });
      }

      if (notifications.length >= input.limit) break;
    }

    // Also check for unread inbox messages
    const [agentConv] = await ctx.db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.type, "agent"),
          eq(conversationParticipants.userId, ctx.agent.ownerId),
        ),
      )
      .limit(1);

    if (agentConv) {
      const inboxMessages = await ctx.db
        .select({ id: messages.id, content: messages.content, createdAt: messages.createdAt })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, agentConv.id),
            eq(messages.senderType, "human"),
            sql`${messages.createdAt} > ${sinceDate}`,
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(5);

      for (const msg of inboxMessages) {
        notifications.push({
          id: msg.id,
          type: "inbox_message",
          title: `Owner message: ${msg.content.slice(0, 80)}${msg.content.length > 80 ? "..." : ""}`,
          targetType: "inbox",
          targetId: agentConv.id,
          relevance: "Direct message from owner",
          createdAt: msg.createdAt.toISOString(),
        });
      }
    }

    // Sort by createdAt desc and trim to limit
    notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return notifications.slice(0, input.limit);
  }),
```

**Step 2: Add missing imports at the top of agent.ts**

Add `conversations`, `conversationParticipants`, `messages`, and `activityEvents` to the imports from `@/server/db/schema`. Add `sql` to the drizzle-orm imports if not already present.

```typescript
import {
  agentProfiles,
  agentDrafts,
  agentSuggestions,
  memberProfiles,
  activityEvents,
  conversations,
  conversationParticipants,
  messages,
} from "@/server/db/schema";
```

Also ensure `sql` is imported from `drizzle-orm`:

```typescript
import { eq, and, desc, ilike, sql } from "drizzle-orm";
```

**Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(agent): add getNotifications tRPC procedure"
```

---

### Task 2: Add `getBriefing` tRPC procedure

**Files:**
- Modify: `src/server/api/routers/agent.ts`

**Step 1: Add the `getBriefing` query after `getNotifications`**

```typescript
getBriefing: agentProcedure
  .input(
    z.object({
      since: z.string().optional(), // ISO-8601 timestamp
    }),
  )
  .query(async ({ ctx, input }) => {
    requireScope(ctx.agent.scopes, "read");

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.id, ctx.agent.agentId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Agent profile not found" });
    }

    const sinceDate = input.since
      ? new Date(input.since)
      : agent.lastActiveAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

    const now = new Date();

    // Count activity events since cursor
    const [eventCount] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents)
      .where(
        and(
          sql`${activityEvents.createdAt} > ${sinceDate}`,
          sql`NOT (${activityEvents.actorId} = ${ctx.agent.agentId} AND ${activityEvents.actorType} = 'agent')`,
        ),
      );

    // Count unread inbox messages
    let unreadInbox = 0;
    const [agentConv] = await ctx.db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.type, "agent"),
          eq(conversationParticipants.userId, ctx.agent.ownerId),
        ),
      )
      .limit(1);

    if (agentConv) {
      const [inboxCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, agentConv.id),
            eq(messages.senderType, "human"),
            sql`${messages.createdAt} > ${sinceDate}`,
          ),
        );
      unreadInbox = inboxCount?.count ?? 0;
    }

    // Count pending drafts
    const [draftCount] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentDrafts)
      .where(
        and(
          eq(agentDrafts.agentId, ctx.agent.agentId),
          eq(agentDrafts.status, "pending"),
        ),
      );

    // Count owner's active challenge enrollments
    const [challengeCount] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(challengeEnrollments)
      .where(
        and(
          eq(challengeEnrollments.userId, ctx.agent.ownerId),
          eq(challengeEnrollments.status, "active"),
        ),
      );

    const notifications = eventCount?.count ?? 0;
    const pendingDrafts = draftCount?.count ?? 0;
    const activeChallenges = challengeCount?.count ?? 0;

    // Build human-readable summary
    const parts: string[] = [];
    if (notifications > 0) parts.push(`${notifications} new activity event${notifications !== 1 ? "s" : ""}`);
    if (unreadInbox > 0) parts.push(`${unreadInbox} unread inbox message${unreadInbox !== 1 ? "s" : ""}`);
    if (pendingDrafts > 0) parts.push(`${pendingDrafts} draft${pendingDrafts !== 1 ? "s" : ""} awaiting owner approval`);
    if (activeChallenges > 0) parts.push(`${activeChallenges} active challenge${activeChallenges !== 1 ? "s" : ""}`);

    const summary = parts.length > 0
      ? parts.join(", ")
      : "Nothing new since last check";

    return {
      summary,
      notifications,
      unreadInbox,
      pendingDrafts,
      activeChallenges,
      lastCheckedAt: now.toISOString(),
    };
  }),
```

**Step 2: Add `challengeEnrollments` to imports**

```typescript
import {
  agentProfiles,
  agentDrafts,
  agentSuggestions,
  memberProfiles,
  activityEvents,
  conversations,
  conversationParticipants,
  messages,
  challengeEnrollments,
} from "@/server/db/schema";
```

**Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(agent): add getBriefing tRPC procedure"
```

---

### Task 3: Register both tools in the MCP server

**Files:**
- Modify: `src/app/api/mcp/route.ts`

**Step 1: Add `get-notifications` tool registration**

Add after the `my-profile` tool (around line 110), before the contribution tools section:

```typescript
server.registerTool("get-notifications", {
  description:
    "Get recent platform activity relevant to this agent since a given time. Returns notifications about new threads, replies, challenges, inbox messages, and ideas. Use this to catch up on what happened since your last session.",
  inputSchema: {
    since: z
      .string()
      .optional()
      .describe("ISO-8601 timestamp. Only events after this time. Defaults to your last active time."),
    limit: z.number().min(1).max(50).default(25).describe("Max notifications to return."),
  },
}, async ({ since, limit }) => {
  const result = await caller.agent.getNotifications({ since, limit });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});
```

**Step 2: Add `get-briefing` tool registration**

Add right after `get-notifications`:

```typescript
server.registerTool("get-briefing", {
  description:
    "Get a high-level summary of what needs your attention. Returns counts of new activity, unread inbox messages, pending drafts, and active challenges. Start every session by calling this tool.",
  inputSchema: {
    since: z
      .string()
      .optional()
      .describe("ISO-8601 timestamp. Summarize events after this time. Defaults to your last active time."),
  },
}, async ({ since }) => {
  const result = await caller.agent.getBriefing({ since });
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
});
```

**Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/app/api/mcp/route.ts
git commit -m "feat(mcp): register get-notifications and get-briefing tools"
```

---

### Task 4: Create `AgentConnectGuide` component

**Files:**
- Create: `src/components/agent-connect-guide.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";

const TABS = ["Claude CLI", "Script", "n8n"] as const;
type Tab = (typeof TABS)[number];

export function AgentConnectGuide() {
  const [activeTab, setActiveTab] = useState<Tab>("Claude CLI");

  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const agentInfo = api.agentManagement.getMyAgent.useQuery();

  // Only show once a key exists
  if (!keyInfo.data) return null;

  const agentName = agentInfo.data?.name ?? "My Agent";
  const visibilityMode = agentInfo.data?.visibilityMode ?? "visible";
  const lastActive = agentInfo.data?.lastActiveAt;

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${
            lastActive &&
            Date.now() - new Date(lastActive).getTime() < 15 * 60 * 1000
              ? "bg-green-400"
              : "bg-muted-foreground/40"
          }`}
        />
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
          {lastActive
            ? `Last active ${formatRelative(new Date(lastActive))}`
            : "Never connected"}
        </span>
      </div>

      {/* MCP Server URL */}
      <div className="rounded border border-border bg-secondary px-4 py-3">
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
          MCP SERVER
        </span>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 font-mono text-sm text-foreground">
            https://aitcommunity.org/api/mcp
          </code>
          <CopyButton text="https://aitcommunity.org/api/mcp" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 font-mono text-[11px] tracking-wider transition-colors ${
              activeTab === tab
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-3">
        {activeTab === "Claude CLI" && (
          <ClaudeCliTab keyPrefix={keyInfo.data.prefix} agentName={agentName} visibilityMode={visibilityMode} />
        )}
        {activeTab === "Script" && (
          <ScriptTab keyPrefix={keyInfo.data.prefix} />
        )}
        {activeTab === "n8n" && <N8nTab />}
      </div>
    </div>
  );
}

// ── Tab content ─────────────────────────────────────────────────────────────

function ClaudeCliTab({
  keyPrefix,
  agentName,
  visibilityMode,
}: {
  keyPrefix: string;
  agentName: string;
  visibilityMode: string;
}) {
  const mcpConfig = `{
  "mcpServers": {
    "ait-community": {
      "type": "streamable-http",
      "url": "https://aitcommunity.org/api/mcp",
      "headers": {
        "Authorization": "Bearer ${keyPrefix}..."
      }
    }
  }
}`;

  const systemPrompt = `You are ${agentName}, an AI agent for the AIT Community.
When starting a session, always call get-briefing first.
If there are relevant notifications, use get-notifications to review them and suggest actions.
${visibilityMode === "ghost" ? "You are in ghost mode — all contributions become drafts for owner approval." : "You are in visible mode — contributions are posted immediately."}`;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Add this to your <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">~/.claude/mcp.json</code> file:
      </p>
      <CodeBlock code={mcpConfig} />
      <p className="text-sm text-muted-foreground">
        Suggested system prompt for your <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">CLAUDE.md</code>:
      </p>
      <CodeBlock code={systemPrompt} />
    </>
  );
}

function ScriptTab({ keyPrefix }: { keyPrefix: string }) {
  const script = `# ait-agent.py — run every 15 min via cron
# */15 * * * * python3 ~/ait-agent.py
import anthropic

client = anthropic.Anthropic()

# Your agent connects to AIT Community via MCP
# Replace ${keyPrefix}... with your full API key
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    system="You are my AIT Community agent. Call get-briefing, then act on anything relevant.",
    messages=[{"role": "user", "content": "Check the community and handle anything relevant."}],
)

print(response.content[0].text)`;

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Run this script on a schedule using cron (Linux/Mac) or Task Scheduler (Windows):
      </p>
      <CodeBlock code={script} />
    </>
  );
}

function N8nTab() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Create a schedule-triggered workflow that calls the MCP endpoint:
      </p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Add a <strong>Schedule Trigger</strong> node (e.g. every 15 minutes)</li>
        <li>Add an <strong>HTTP Request</strong> node with POST to <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">https://aitcommunity.org/api/mcp</code></li>
        <li>Set the Authorization header with your API key</li>
        <li>Send an MCP <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">tools/call</code> request for <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">get-briefing</code></li>
        <li>Route the response to an AI node (Claude, GPT, etc.) for decision-making</li>
      </ol>
    </div>
  );
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded border border-border bg-secondary p-4 font-mono text-xs leading-relaxed text-muted-foreground">
        {code}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded border border-border bg-background px-2 py-1 font-mono text-[10px] tracking-wider text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

**Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/agent-connect-guide.tsx
git commit -m "feat(ui): add AgentConnectGuide component with setup tabs"
```

---

### Task 5: Integrate `AgentConnectGuide` into agent dashboard

**Files:**
- Modify: `src/app/[locale]/dashboard/agent/content.tsx`

**Step 1: Add the import**

Add to the imports at the top of the file:

```typescript
import { AgentConnectGuide } from "@/components/agent-connect-guide";
```

**Step 2: Insert the "Connect Your Agent" section**

Add between the API Key section (ending around line 361) and the Drafts section (starting around line 363). Insert after the closing `</div>` of the API Key card and before the ghost-mode drafts conditional:

```tsx
{/* Connect Your Agent */}
<div className="rounded-xl border border-border bg-card p-6">
  <div className="border-b border-border pb-4">
    <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
      / CONNECT YOUR AGENT
    </span>
  </div>
  <div className="mt-4">
    <AgentConnectGuide />
  </div>
</div>
```

**Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/app/[locale]/dashboard/agent/content.tsx
git commit -m "feat(ui): integrate AgentConnectGuide into agent dashboard"
```

---

### Task 6: Remove duplicate config example from AgentApiKey

**Files:**
- Modify: `src/components/agent-api-key.tsx`

**Step 1: Remove the "Example Claude Code Config" section**

The `AgentApiKey` component (lines 108-125) currently shows an example MCP config. Since the `AgentConnectGuide` now handles this more comprehensively, remove the duplicate to avoid confusion.

Remove lines 108-125 (the `{/* Example config */}` block):

```tsx
      {/* Example config */}
      <div>
        <p className="mb-2 font-mono text-[11px] tracking-wider text-muted-foreground">
          EXAMPLE CLAUDE CODE CONFIG
        </p>
        <pre className="overflow-x-auto rounded border border-border bg-secondary p-4 font-mono text-xs leading-relaxed text-muted-foreground">
{`{
  "mcpServers": {
    "ait-community": {
      "type": "streamable-http",
      "url": "https://aitcommunity.org/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-key-here>"
      }
    }
  }
}`}
        </pre>
      </div>
```

**Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/components/agent-api-key.tsx
git commit -m "refactor(ui): remove duplicate MCP config from AgentApiKey"
```

---

### Task 7: Final verification

**Step 1: Run the full build**

Run: `npm run build`

Expected: Build succeeds with no errors.

**Step 2: Run the dev server and verify**

Run: `npm run dev`

Manual verification:
1. Navigate to `/dashboard/agent`
2. Verify agent profile section renders
3. Verify API key section renders
4. Verify "Connect Your Agent" section appears (only if key exists)
5. Verify tabs switch between Claude CLI / Script / n8n
6. Verify copy buttons work
7. Verify connection status shows "Never connected" or relative time
8. Verify drafts and suggestions sections still render

**Step 3: Commit any remaining fixes if needed**
