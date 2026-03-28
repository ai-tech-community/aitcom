# Phase 2: Activity Feed, Agent Notebook & Dashboard Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the dashboard into a tabbed hub with activity feed, agent notebook, edit/delete agent, and agent indicators on the members page.

**Architecture:** Dashboard gets a shared layout with horizontal tab bar. Activity events are wired into existing routers via `logActivity()`. A new `notebook_messages` table + tRPC router powers the agent notebook chat UI built on ai-elements components. Three new MCP tools let agents interact with the notebook.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, tRPC 11, Drizzle ORM (Neon), ai-elements, next-intl, Lucide icons

---

### Task 1: Database — Add `notebookMessages` Table

**Files:**
- Modify: `src/server/db/schema.ts` (after `activityEvents` table, around line 427)

**Step 1: Add the table definition**

Add the following after the `activityEvents` table and its index block (after line 427):

```typescript
// Notebook messages (human ↔ agent async conversation)
export const notebookMessages = appSchema.table(
  "notebook_message",
  (d) => ({
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
    role: d.varchar({ length: 10 }).notNull(), // "human" | "agent"
    content: d.text().notNull(),
    metadata: d.json().$type<Record<string, unknown>>(),
    readAt: d.timestamp({ withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("notebook_messages_agent_created_idx").on(t.agentId, t.createdAt),
  ],
);
```

**Step 2: Push schema to database**

Run: `cd /c/projects/customers/aitcom && npx drizzle-kit push`

Expected: Table `app.notebook_message` created successfully.

**Step 3: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(db): add notebook_messages table for agent-human communication"
```

---

### Task 2: Activity Router — `activity.getFeed`

**Files:**
- Create: `src/server/api/routers/activity.ts`
- Modify: `src/server/api/root.ts` (register the router)

**Step 1: Create the activity router**

Create `src/server/api/routers/activity.ts`:

```typescript
import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";

import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  activityEvents,
  memberProfiles,
  agentProfiles,
  user,
} from "@/server/db/schema";

export const activityRouter = createTRPCRouter({
  getFeed: protectedProcedure
    .input(
      z.object({
        mode: z.enum(["personal", "community"]).default("personal"),
        cursor: z.string().nullish(), // createdAt ISO string cursor
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const events = await ctx.db
        .select()
        .from(activityEvents)
        .where(
          input.mode === "personal"
            ? eq(activityEvents.actorId, userId)
            : undefined,
        )
        .orderBy(desc(activityEvents.createdAt))
        .limit(input.limit + 1)
        ...(input.cursor
          ? [sql`${activityEvents.createdAt} < ${input.cursor}`]
          : []);

      // The above won't work with Drizzle's fluent API for cursor.
      // Correct approach: build conditions array.
      // Let's redo with proper cursor support:
      return []; // placeholder — see corrected code below
    }),
});
```

Actually, let me write this properly:

```typescript
import { z } from "zod";
import { eq, desc, lt, and } from "drizzle-orm";

import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  activityEvents,
  memberProfiles,
  agentProfiles,
  user,
} from "@/server/db/schema";

export const activityRouter = createTRPCRouter({
  getFeed: protectedProcedure
    .input(
      z.object({
        mode: z.enum(["personal", "community"]).default("personal"),
        cursor: z.string().nullish(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const conditions = [];

      if (input.mode === "personal") {
        conditions.push(eq(activityEvents.actorId, userId));
      }

      if (input.cursor) {
        conditions.push(lt(activityEvents.createdAt, new Date(input.cursor)));
      }

      const events = await ctx.db
        .select()
        .from(activityEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(activityEvents.createdAt))
        .limit(input.limit + 1);

      const hasMore = events.length > input.limit;
      const items = hasMore ? events.slice(0, input.limit) : events;

      // Collect unique actor IDs and resolve names/avatars
      const actorIds = [...new Set(items.map((e) => e.actorId))];

      const memberActors =
        actorIds.length > 0
          ? await ctx.db
              .select({
                userId: memberProfiles.userId,
                displayName: memberProfiles.displayName,
                image: user.image,
              })
              .from(memberProfiles)
              .innerJoin(user, eq(memberProfiles.userId, user.id))
              .where(
                // Use inArray for multiple IDs
                memberProfiles.userId.in(actorIds),
              )
          : [];

      // Note: Drizzle doesn't have .in() method on columns.
      // Use the inArray import instead.

      // We'll resolve actors in a simpler way below.
      return { items, hasMore, nextCursor: hasMore ? items.at(-1)?.createdAt?.toISOString() : null };
    }),
});
```

I realize writing pseudo-code won't work well. Let me write the exact final code:

Create `src/server/api/routers/activity.ts`:

```typescript
import { z } from "zod";
import { eq, desc, lt, and, inArray } from "drizzle-orm";

import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  activityEvents,
  memberProfiles,
  agentProfiles,
  user,
} from "@/server/db/schema";

export const activityRouter = createTRPCRouter({
  getFeed: protectedProcedure
    .input(
      z.object({
        mode: z.enum(["personal", "community"]).default("personal"),
        cursor: z.string().nullish(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const conditions = [];

      if (input.mode === "personal") {
        conditions.push(eq(activityEvents.actorId, userId));
      }

      if (input.cursor) {
        conditions.push(lt(activityEvents.createdAt, new Date(input.cursor)));
      }

      const events = await ctx.db
        .select()
        .from(activityEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(activityEvents.createdAt))
        .limit(input.limit + 1);

      const hasMore = events.length > input.limit;
      const items = hasMore ? events.slice(0, input.limit) : events;

      // Resolve actor display info
      const actorIds = [...new Set(items.map((e) => e.actorId))];

      const memberMap = new Map<string, { name: string; image: string | null }>();
      const agentMap = new Map<string, { name: string; avatar: string | null }>();

      if (actorIds.length > 0) {
        const members = await ctx.db
          .select({
            userId: memberProfiles.userId,
            displayName: memberProfiles.displayName,
            image: user.image,
          })
          .from(memberProfiles)
          .innerJoin(user, eq(memberProfiles.userId, user.id))
          .where(inArray(memberProfiles.userId, actorIds));

        for (const m of members) {
          memberMap.set(m.userId, { name: m.displayName, image: m.image });
        }

        const agents = await ctx.db
          .select({
            id: agentProfiles.id,
            name: agentProfiles.name,
            avatar: agentProfiles.avatar,
          })
          .from(agentProfiles)
          .where(inArray(agentProfiles.id, actorIds));

        for (const a of agents) {
          agentMap.set(a.id, { name: a.name, avatar: a.avatar });
        }
      }

      return {
        items: items.map((event) => {
          const actor =
            event.actorType === "agent"
              ? agentMap.get(event.actorId)
              : memberMap.get(event.actorId);

          return {
            ...event,
            actor: actor ?? { name: "Unknown", image: null, avatar: null },
          };
        }),
        nextCursor: hasMore
          ? items.at(-1)!.createdAt.toISOString()
          : null,
      };
    }),
});
```

**Step 2: Register in root router**

In `src/server/api/root.ts`, add:

```typescript
import { activityRouter } from "@/server/api/routers/activity";
```

And add to the router object:

```typescript
activity: activityRouter,
```

**Step 3: Commit**

```bash
git add src/server/api/routers/activity.ts src/server/api/root.ts
git commit -m "feat(api): add activity feed router with cursor pagination"
```

---

### Task 3: Wire `logActivity()` into Existing Routers

**Files:**
- Modify: `src/server/api/routers/community.ts` (createThread, ~line 175–202)
- Modify: `src/server/api/routers/events.ts` (register, ~line 148–158)
- Modify: `src/server/api/routers/agent.ts` (suggestTopic, ~line 600–616)

**Step 1: Wire into `community.createThread`**

In `src/server/api/routers/community.ts`, add the import at the top:

```typescript
import { logActivity } from "@/server/agent/activity";
```

Then after the `payload.create(...)` call in `createThread` (after line 200, before `return thread;`), add:

```typescript
      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "thread.create",
        targetType: "forum-threads",
        targetId: String(thread.id),
        metadata: { title: input.title, category: input.category },
      });
```

**Step 2: Wire into `events.register`**

In `src/server/api/routers/events.ts`, add the import:

```typescript
import { logActivity } from "@/server/agent/activity";
```

Inside the `register` mutation, after the XP awarding block (after line 158, inside the `if (status === "registered")` block, after the `awardXp` call), add:

```typescript
        await logActivity(ctx.db, {
          actorId: userId,
          actorType: "member",
          action: "event.register",
          targetType: "event",
          targetId: String(input.eventId),
          metadata: { eventTitle: event.title },
        });
```

**Step 3: Wire into `agent.suggestTopic`**

In `src/server/api/routers/agent.ts`, in the `suggestTopic` mutation (after line 613, before `return`), add:

```typescript
      await logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "agent.suggest_topic",
        targetType: "agent_suggestion",
        targetId: suggestion!.id,
        metadata: { title: input.title },
      });
```

**Step 4: Commit**

```bash
git add src/server/api/routers/community.ts src/server/api/routers/events.ts src/server/api/routers/agent.ts
git commit -m "feat(activity): wire logActivity into thread, event, and agent routers"
```

---

### Task 4: Notebook Router — tRPC Procedures

**Files:**
- Create: `src/server/api/routers/notebook.ts`
- Modify: `src/server/api/root.ts` (register)

**Step 1: Create notebook router**

Create `src/server/api/routers/notebook.ts`:

```typescript
import { z } from "zod";
import { eq, and, desc, lt, isNull, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  agentProcedure,
  requireScope,
} from "@/server/api/trpc";
import { notebookMessages, agentProfiles } from "@/server/db/schema";

export const notebookRouter = createTRPCRouter({
  // ── Human-facing procedures ───────────────────────────────────────────

  /** Get conversation messages (human dashboard) */
  getMessages: protectedProcedure
    .input(
      z.object({
        cursor: z.string().nullish(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Find the user's agent
      const [agent] = await ctx.db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) {
        return { messages: [], nextCursor: null, hasAgent: false };
      }

      const conditions = [eq(notebookMessages.agentId, agent.id)];

      if (input.cursor) {
        conditions.push(lt(notebookMessages.createdAt, new Date(input.cursor)));
      }

      const messages = await ctx.db
        .select()
        .from(notebookMessages)
        .where(and(...conditions))
        .orderBy(desc(notebookMessages.createdAt))
        .limit(input.limit + 1);

      const hasMore = messages.length > input.limit;
      const items = hasMore ? messages.slice(0, input.limit) : messages;

      // Return in chronological order (oldest first) for chat display
      items.reverse();

      return {
        messages: items,
        nextCursor: hasMore
          ? items[0]!.createdAt.toISOString()
          : null,
        hasAgent: true,
      };
    }),

  /** Send a message from the human to the agent */
  sendMessage: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [agent] = await ctx.db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No agent found. Create an agent first.",
        });
      }

      const [message] = await ctx.db
        .insert(notebookMessages)
        .values({
          agentId: agent.id,
          ownerId: userId,
          role: "human",
          content: input.content,
        })
        .returning();

      return message!;
    }),

  /** Mark agent messages as read (human opened notebook) */
  markRead: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) return { count: 0 };

    const result = await ctx.db
      .update(notebookMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notebookMessages.agentId, agent.id),
          eq(notebookMessages.role, "agent"),
          isNull(notebookMessages.readAt),
        ),
      );

    return { count: result.rowCount ?? 0 };
  }),

  /** Get unread agent message count (for badge) */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) return { count: 0 };

    const [result] = await ctx.db
      .select({
        count: notebookMessages.id,
      })
      .from(notebookMessages)
      .where(
        and(
          eq(notebookMessages.agentId, agent.id),
          eq(notebookMessages.role, "agent"),
          isNull(notebookMessages.readAt),
        ),
      );

    // The above returns rows, not a count. Fix:
    return { count: 0 }; // placeholder
  }),

  // ── Agent-facing procedures (MCP) ────────────────────────────────────

  /** Agent checks for new human messages */
  checkInbox: agentProcedure.query(async ({ ctx }) => {
    requireScope(ctx.agent.scopes, "read");

    const messages = await ctx.db
      .select()
      .from(notebookMessages)
      .where(
        and(
          eq(notebookMessages.agentId, ctx.agent.agentId),
          eq(notebookMessages.role, "human"),
          isNull(notebookMessages.readAt),
        ),
      )
      .orderBy(asc(notebookMessages.createdAt));

    // Mark as read
    if (messages.length > 0) {
      await ctx.db
        .update(notebookMessages)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notebookMessages.agentId, ctx.agent.agentId),
            eq(notebookMessages.role, "human"),
            isNull(notebookMessages.readAt),
          ),
        );
    }

    return {
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }),

  /** Agent sends a message to the human */
  sendNotebookMessage: agentProcedure
    .input(
      z.object({
        content: z.string().min(1).max(10000),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      const [message] = await ctx.db
        .insert(notebookMessages)
        .values({
          agentId: ctx.agent.agentId,
          ownerId: ctx.agent.ownerId,
          role: "agent",
          content: input.content,
          metadata: input.metadata,
        })
        .returning();

      return { messageId: message!.id };
    }),

  /** Agent fetches conversation history */
  getConversationHistory: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        before: z.string().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const conditions = [eq(notebookMessages.agentId, ctx.agent.agentId)];

      if (input.before) {
        conditions.push(lt(notebookMessages.createdAt, new Date(input.before)));
      }

      const messages = await ctx.db
        .select()
        .from(notebookMessages)
        .where(and(...conditions))
        .orderBy(desc(notebookMessages.createdAt))
        .limit(input.limit + 1);

      const hasMore = messages.length > input.limit;
      const items = hasMore ? messages.slice(0, input.limit) : messages;
      items.reverse();

      return {
        messages: items.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
        hasMore,
      };
    }),
});
```

**Step 2: Fix the `unreadCount` procedure**

Replace the placeholder with proper SQL count:

```typescript
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) return { count: 0 };

    const [result] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(notebookMessages)
      .where(
        and(
          eq(notebookMessages.agentId, agent.id),
          eq(notebookMessages.role, "agent"),
          isNull(notebookMessages.readAt),
        ),
      );

    return { count: result?.count ?? 0 };
  }),
```

Note: you'll need to import `sql` from `drizzle-orm` at the top.

**Step 3: Register in root router**

In `src/server/api/root.ts`:

```typescript
import { notebookRouter } from "@/server/api/routers/notebook";
```

Add to the router:

```typescript
notebook: notebookRouter,
```

**Step 4: Commit**

```bash
git add src/server/api/routers/notebook.ts src/server/api/root.ts
git commit -m "feat(api): add notebook router for human-agent messaging"
```

---

### Task 5: Dashboard Layout with Horizontal Tabs

**Files:**
- Create: `src/app/[locale]/dashboard/layout.tsx`
- Create: `src/components/dashboard-tabs.tsx`
- Modify: `src/app/[locale]/dashboard/page.tsx` (remove header, simplify to feed-only)

**Step 1: Create the tabs component**

Create `src/components/dashboard-tabs.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ActivityIcon,
  BotIcon,
  MessageSquareIcon,
  CalendarIcon,
  SettingsIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

const tabs = [
  { path: "/dashboard", icon: ActivityIcon, labelKey: "feed" },
  { path: "/dashboard/agent", icon: BotIcon, labelKey: "agent" },
  { path: "/dashboard/notebook", icon: MessageSquareIcon, labelKey: "notebook" },
  { path: "/dashboard/events", icon: CalendarIcon, labelKey: "events" },
  { path: "/dashboard/settings", icon: SettingsIcon, labelKey: "settings" },
] as const;

interface DashboardTabsProps {
  unreadNotebook?: number;
}

export function DashboardTabs({ unreadNotebook = 0 }: DashboardTabsProps) {
  const pathname = usePathname();
  const t = useTranslations("dashboard");

  // Strip locale prefix for comparison: /en/dashboard/agent → /dashboard/agent
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, "");

  return (
    <nav className="sticky top-0 z-10 overflow-x-auto border-b border-border bg-background">
      <div className="mx-auto flex max-w-4xl gap-0 px-4 sm:px-8">
        {tabs.map(({ path, icon: Icon, labelKey }) => {
          const isActive =
            path === "/dashboard"
              ? pathWithoutLocale === "/dashboard"
              : pathWithoutLocale.startsWith(path);

          return (
            <Link
              key={path}
              href={path}
              className={`relative flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 font-mono text-xs tracking-wider transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{t(labelKey)}</span>
              {labelKey === "notebook" && unreadNotebook > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unreadNotebook > 99 ? "99+" : unreadNotebook}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

**Step 2: Create the dashboard layout**

Create `src/app/[locale]/dashboard/layout.tsx`:

```tsx
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { DashboardTabs } from "@/components/dashboard-tabs";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome back, {session.user.name ?? session.user.email}
      </p>

      <div className="mt-8">
        <DashboardTabs />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
```

**Step 3: Simplify dashboard page to be feed-only**

Rewrite `src/app/[locale]/dashboard/page.tsx` to only show the activity feed (the events and profile are now in their own tabs or stay as they are for now):

```tsx
import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { DashboardProfile } from "@/components/dashboard-profile";
import { ActivityFeed } from "@/components/activity-feed";
import { HydrateClient } from "@/trpc/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return (
    <HydrateClient>
      <div className="space-y-12">
        {/* Profile summary stays on the feed tab */}
        <DashboardProfile
          userEmail={session.user.email}
          userImage={session.user.image}
          userName={session.user.name}
        />

        {/* Activity Feed */}
        <ActivityFeed />
      </div>
    </HydrateClient>
  );
}
```

Note: We keep `DashboardProfile` on the feed tab since it's a quick overview. The full profile editing stays where it is.

Remove the old heading, events, and agent section from this page — the layout now provides the heading, and events/agent have their own tabs.

**Step 4: Commit**

```bash
git add src/components/dashboard-tabs.tsx src/app/[locale]/dashboard/layout.tsx src/app/[locale]/dashboard/page.tsx
git commit -m "feat(dashboard): add layout with horizontal tab bar navigation"
```

---

### Task 6: Activity Feed UI Component

**Files:**
- Create: `src/components/activity-feed.tsx`

**Step 1: Create the ActivityFeed component**

Create `src/components/activity-feed.tsx`:

```tsx
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const ACTION_VERBS: Record<string, string> = {
  "thread.create": "created a thread",
  "thread.reply": "replied to a thread",
  "event.register": "registered for an event",
  "knowledge.share": "shared knowledge",
  "agent.created": "set up an AI agent",
  "agent.suggest_topic": "suggested a topic",
  "agent.profile_updated": "updated their agent profile",
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ActivityFeed() {
  const [mode, setMode] = useState<"personal" | "community">("personal");
  const t = useTranslations("activity");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    api.activity.getFeed.useInfiniteQuery(
      { mode, limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / ACTIVITY
        </span>
      </div>

      {/* Toggle */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setMode("personal")}
          className={`rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
            mode === "personal"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("personal")}
        </button>
        <button
          onClick={() => setMode("community")}
          className={`rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
            mode === "community"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("community")}
        </button>
      </div>

      {/* Feed items */}
      <div className="mt-4">
        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </p>
        )}

        {!isLoading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 border-b border-border px-1 py-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-medium text-muted-foreground">
              {item.actor.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 text-sm">
              <span className="font-medium text-foreground">
                {item.actor.name}
              </span>{" "}
              <span className="text-muted-foreground">
                {ACTION_VERBS[item.action] ?? item.action}
              </span>
              {(item.metadata as Record<string, unknown>)?.title && (
                <span className="text-foreground">
                  {" "}
                  &ldquo;
                  {String((item.metadata as Record<string, unknown>).title)}
                  &rdquo;
                </span>
              )}
            </div>
            <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
              {timeAgo(item.createdAt.toISOString?.() ?? String(item.createdAt))}
            </span>
          </div>
        ))}

        {hasNextPage && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="font-mono text-xs tracking-wider"
            >
              {isFetchingNextPage ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/activity-feed.tsx
git commit -m "feat(ui): add ActivityFeed component with personal/community toggle"
```

---

### Task 7: Notebook Page with ai-elements

**Files:**
- Create: `src/app/[locale]/dashboard/notebook/page.tsx`

**Step 1: Create the notebook page**

Create `src/app/[locale]/dashboard/notebook/page.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { api } from "@/trpc/react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { useTranslations } from "next-intl";

export default function NotebookPage() {
  const t = useTranslations("notebook");
  const utils = api.useUtils();

  const { data, isLoading } = api.notebook.getMessages.useQuery({
    limit: 50,
  });

  const markRead = api.notebook.markRead.useMutation();

  const sendMessage = api.notebook.sendMessage.useMutation({
    onSuccess: () => {
      void utils.notebook.getMessages.invalidate();
    },
  });

  // Mark agent messages as read when page loads
  useEffect(() => {
    if (data?.hasAgent && data.messages.length > 0) {
      markRead.mutate();
      void utils.notebook.unreadCount.invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.messages.length]);

  const messages = data?.messages ?? [];

  const handleSend = (formData: FormData) => {
    const content = formData.get("input") as string;
    if (!content?.trim()) return;
    sendMessage.mutate({ content: content.trim() });
  };

  if (!data?.hasAgent && !isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("noAgent")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-280px)] flex-col rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / {t("title").toUpperCase()}
        </span>
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="p-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            />
          ) : (
            messages.map((msg) => (
              <Message
                key={msg.id}
                from={msg.role === "human" ? "user" : "assistant"}
              >
                <MessageContent>
                  {msg.role === "agent" ? (
                    <MessageResponse>{msg.content}</MessageResponse>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
        <div className="border-t border-border p-4">
          <PromptInput onSubmit={handleSend}>
            <PromptInputTextarea placeholder={t("placeholder")} />
            <PromptInputSubmit disabled={sendMessage.isPending} />
          </PromptInput>
        </div>
      </Conversation>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/dashboard/notebook/page.tsx
git commit -m "feat(notebook): add agent notebook page using ai-elements chat UI"
```

---

### Task 8: MCP Server — Add Notebook Tools

**Files:**
- Modify: `mcp-server/src/index.ts`

**Step 1: Register three new tools**

Add the following tool registrations in `mcp-server/src/index.ts` after the existing `update-own-profile` tool:

```typescript
// ── Notebook tools ──────────────────────────────────────────────────────

server.registerTool(
  "check-inbox",
  {
    description: "Check for new unread messages from your human owner in the notebook",
    inputSchema: {},
  },
  async () => {
    const result = await client.query("notebook.checkInbox");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  "send-message",
  {
    description: "Send a message to your human owner via the notebook",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "The message to send" },
        metadata: {
          type: "object",
          description: "Optional metadata",
          additionalProperties: true,
        },
      },
      required: ["content"],
    },
  },
  async (args) => {
    const result = await client.mutate("notebook.sendNotebookMessage", args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  "get-conversation-history",
  {
    description: "Get the conversation history from your notebook with your human owner",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: { type: "number", description: "Number of messages (default 50)" },
        before: { type: "string", description: "ISO date cursor for pagination" },
      },
    },
  },
  async (args) => {
    const result = await client.query("notebook.getConversationHistory", args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);
```

**Step 2: Rebuild MCP server**

Run: `cd /c/projects/customers/aitcom/mcp-server && npm run build`

Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add mcp-server/src/index.ts
git commit -m "feat(mcp): add notebook tools (check-inbox, send-message, get-conversation-history)"
```

---

### Task 9: i18n — Add Translation Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add English translations**

Add these new namespaces to `messages/en.json`:

```json
"dashboard": {
  "feed": "Feed",
  "agent": "Agent",
  "notebook": "Notebook",
  "events": "Events",
  "settings": "Settings"
},
"activity": {
  "personal": "My Activity",
  "community": "Community",
  "empty": "No activity yet. Start participating to see your feed!",
  "threadCreate": "created a thread",
  "threadReply": "replied to a thread",
  "eventRegister": "registered for an event",
  "knowledgeShare": "shared knowledge",
  "agentCreated": "set up an AI agent",
  "agentSuggestTopic": "suggested a topic",
  "agentProfileUpdated": "updated their agent profile"
},
"notebook": {
  "title": "Notebook",
  "noAgent": "Create an agent first to use the notebook.",
  "emptyTitle": "No messages yet",
  "emptyDescription": "Your agent will appear here when it has something to share. You can also start the conversation!",
  "placeholder": "Message your agent...",
  "send": "Send"
}
```

**Step 2: Add Dutch translations**

Add the equivalent to `messages/nl.json`:

```json
"dashboard": {
  "feed": "Feed",
  "agent": "Agent",
  "notebook": "Notitieboek",
  "events": "Evenementen",
  "settings": "Instellingen"
},
"activity": {
  "personal": "Mijn Activiteit",
  "community": "Community",
  "empty": "Nog geen activiteit. Begin met deelnemen om je feed te zien!",
  "threadCreate": "heeft een topic aangemaakt",
  "threadReply": "heeft gereageerd op een topic",
  "eventRegister": "heeft zich aangemeld voor een evenement",
  "knowledgeShare": "heeft kennis gedeeld",
  "agentCreated": "heeft een AI agent aangemaakt",
  "agentSuggestTopic": "heeft een onderwerp voorgesteld",
  "agentProfileUpdated": "heeft het agentprofiel bijgewerkt"
},
"notebook": {
  "title": "Notitieboek",
  "noAgent": "Maak eerst een agent aan om het notitieboek te gebruiken.",
  "emptyTitle": "Nog geen berichten",
  "emptyDescription": "Je agent verschijnt hier wanneer hij iets te delen heeft. Je kunt ook zelf het gesprek starten!",
  "placeholder": "Bericht je agent...",
  "send": "Verstuur"
}
```

Also add the edit/delete keys to the existing `agent` namespace in both files:

English (add to `agent` object):
```json
"editAgent": "Edit",
"saveAgent": "Save",
"cancelEdit": "Cancel",
"deleteAgent": "Delete Agent",
"confirmDelete": "Are you sure? This will deactivate your agent and revoke all API keys.",
"confirmDeleteButton": "Yes, Delete",
"hasAgent": "Has AI Agent"
```

Dutch (add to `agent` object):
```json
"editAgent": "Bewerken",
"saveAgent": "Opslaan",
"cancelEdit": "Annuleren",
"deleteAgent": "Agent Verwijderen",
"confirmDelete": "Weet je het zeker? Dit deactiveert je agent en trekt alle API-sleutels in.",
"confirmDeleteButton": "Ja, Verwijderen",
"hasAgent": "Heeft AI Agent"
```

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(i18n): add translations for dashboard tabs, activity feed, and notebook"
```

---

### Task 10: Edit Agent Form + Delete Agent

**Files:**
- Modify: `src/app/[locale]/dashboard/agent/content.tsx`
- Modify: `src/server/api/routers/agent-management.ts` (add deleteAgent)

**Step 1: Add `deleteAgent` mutation**

In `src/server/api/routers/agent-management.ts`, add a new procedure after `updateAgent`:

```typescript
  deleteAgent: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No agent profile found",
      });
    }

    // Soft delete: deactivate agent
    await ctx.db
      .update(agentProfiles)
      .set({ status: "inactive" })
      .where(eq(agentProfiles.id, agent.id));

    // Revoke all API keys
    await ctx.db
      .update(agentApiKeys)
      .set({ isActive: false })
      .where(eq(agentApiKeys.agentId, agent.id));

    return { success: true };
  }),
```

Make sure `agentApiKeys` is imported at the top of the file.

**Step 2: Add edit mode to `AgentDashboardContent`**

Rewrite `src/app/[locale]/dashboard/agent/content.tsx` to add an edit toggle and delete button. The edit mode reuses the same fields as the setup form (name, avatar, bio, visibility mode). On save, calls `agentManagement.updateAgent`. On delete, calls `agentManagement.deleteAgent` with a confirmation dialog.

Key changes to the existing agent profile card:
- Add "Edit" button in the header
- When editing: show editable fields (name input, avatar picker, bio textarea, visibility radio)
- Add "Save" / "Cancel" buttons
- Add "Delete Agent" button (red, with confirmation)

This is a larger UI change — the implementer should read the existing `content.tsx` and `agent-setup-form.tsx` to understand the component patterns, then add the edit/delete functionality inline.

**Step 3: Commit**

```bash
git add src/app/[locale]/dashboard/agent/content.tsx src/server/api/routers/agent-management.ts
git commit -m "feat(agent): add edit and delete agent functionality"
```

---

### Task 11: Agent Indicator on Members Page

**Files:**
- Modify: `src/server/api/routers/members.ts` (join agentProfiles in listMembers)
- Modify: `src/app/[locale]/members/page.tsx` (show bot icon)

**Step 1: Update `listMembers` query**

In `src/server/api/routers/members.ts`, import `agentProfiles`:

```typescript
import { memberProfiles, memberBadges, user, eventRegistrations, agentProfiles } from "@/server/db/schema";
```

In the `listMembers` query, add a left join to check for agent existence. Modify the select to include:

```typescript
.leftJoin(
  agentProfiles,
  and(
    eq(agentProfiles.ownerId, memberProfiles.userId),
    eq(agentProfiles.status, "active"),
  ),
)
```

And add to the select fields:

```typescript
hasAgent: agentProfiles.id,
```

Then in the return, map each item to include `hasAgent: !!m.hasAgent`.

**Step 2: Update members page**

In `src/app/[locale]/members/page.tsx`, add a `BotIcon` (from lucide-react) next to member names where `hasAgent` is true.

**Step 3: Commit**

```bash
git add src/server/api/routers/members.ts src/app/[locale]/members/page.tsx
git commit -m "feat(members): show agent indicator badge on members list"
```

---

### Task 12: Dashboard Events Tab

**Files:**
- Create: `src/app/[locale]/dashboard/events/page.tsx`

**Step 1: Create the events tab page**

Move the "My Events" section from the old dashboard page into its own page. This is largely a copy of the events portion from the original `dashboard/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { eventRegistrations } from "@/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getPayload } from "payload";
import config from "@payload-config";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const typeLabels: Record<string, string> = {
  workshop: "WORKSHOP",
  hackathon: "HACKATHON",
  deep_dive: "DEEP-DIVE",
  meetup: "MEETUP",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

interface PayloadEvent {
  id: number;
  title: string;
  slug: string;
  date: string;
  type: string;
  [key: string]: unknown;
}

export default async function DashboardEventsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  const locale = await getLocale();

  const registrations = await db
    .select()
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.userId, session.user.id),
        inArray(eventRegistrations.status, ["registered", "waitlisted", "attended"]),
      ),
    );

  const payload = await getPayload({ config });
  const eventsWithReg = (
    await Promise.all(
      registrations.map(async (reg) => {
        const { docs } = await payload.find({
          collection: "events",
          where: { id: { equals: reg.eventId } },
          locale: locale as "en" | "nl",
          limit: 1,
        });
        const event = docs[0] as PayloadEvent | undefined;
        if (!event) return null;
        return { registration: reg, event };
      }),
    )
  ).filter(Boolean) as { registration: typeof eventRegistrations.$inferSelect; event: PayloadEvent }[];

  const myEvents = eventsWithReg.sort((a, b) =>
    new Date(a.event.date).getTime() - new Date(b.event.date).getTime(),
  );

  return (
    <div>
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / MY EVENTS
        </span>
      </div>

      {myEvents.length === 0 ? (
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">No upcoming events.</p>
          <Link
            href="/events"
            className="mt-2 inline-block font-mono text-xs tracking-wider text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Browse events
          </Link>
        </div>
      ) : (
        <div className="mt-2">
          {myEvents.map(({ registration, event }) => (
            <Link
              key={registration.id}
              href={`/events/${event.slug}`}
              className="flex items-center border-b border-border px-4 py-3.5 transition-colors hover:bg-secondary/50"
            >
              <div className="flex w-32 items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="font-mono text-[13px]">{formatDate(event.date)}</span>
              </div>
              <span className="flex-1 font-medium">{event.title}</span>
              <span className="rounded border border-border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
                {typeLabels[event.type] ?? event.type}
              </span>
              <span className="ml-3 rounded border border-dashed border-border px-2 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                {registration.status.toUpperCase()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/dashboard/events/page.tsx
git commit -m "feat(dashboard): add events tab page"
```

---

### Task 13: Dashboard Settings Placeholder

**Files:**
- Create: `src/app/[locale]/dashboard/settings/page.tsx`

**Step 1: Create a settings placeholder page**

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardSettingsPage() {
  return (
    <div>
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / SETTINGS
        </span>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Settings coming soon.
      </p>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/dashboard/settings/page.tsx
git commit -m "feat(dashboard): add settings placeholder page"
```

---

### Task 14: Unread Badge in Tab Bar

**Files:**
- Modify: `src/app/[locale]/dashboard/layout.tsx` (pass unreadCount)
- Modify: `src/components/dashboard-tabs.tsx` (if not already done)

**Step 1: Wire unread count into layout**

The layout is a server component. To pass the unread count, we can either:
- Make the tabs a client component that fetches its own count (cleaner)
- Or prefetch on the server

Best approach: Make `DashboardTabs` fetch its own unread count via tRPC hook. It's already a client component.

Update `src/components/dashboard-tabs.tsx` to self-fetch:

```tsx
// Inside DashboardTabs, add:
const { data: unreadData } = api.notebook.unreadCount.useQuery(undefined, {
  refetchInterval: 30000, // poll every 30s
});
const unreadNotebook = unreadData?.count ?? 0;
```

Remove the `unreadNotebook` prop since it self-fetches.

Add the import: `import { api } from "@/trpc/react";`

**Step 2: Commit**

```bash
git add src/components/dashboard-tabs.tsx
git commit -m "feat(dashboard): add unread notebook badge to tab bar"
```

---

### Task 15: Verification & Schema Push

**Step 1: Push schema to database**

Run: `cd /c/projects/customers/aitcom && npx drizzle-kit push`

Verify the `notebook_message` table is created.

**Step 2: Build check**

Run: `cd /c/projects/customers/aitcom && npx tsc --noEmit`

Fix any type errors.

**Step 3: Dev server smoke test**

Run: `cd /c/projects/customers/aitcom && pnpm dev`

Navigate to:
- `/dashboard` — should show tab bar with Feed active, profile + activity feed
- `/dashboard/agent` — should show agent card with Edit/Delete
- `/dashboard/notebook` — should show chat UI
- `/dashboard/events` — should show my events
- `/dashboard/settings` — should show placeholder
- `/members` — should show bot icon for members with agents

**Step 4: Test MCP notebook tools**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node mcp-server/dist/index.js
```

Verify `check-inbox`, `send-message`, `get-conversation-history` appear in the tools list.

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: Phase 2 verification fixes"
```
