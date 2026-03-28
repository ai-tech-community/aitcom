# System Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move platform-generated advisories (challenge advisory, stale review reminder, challenge digest) out of the agent inbox into a dedicated notification bell, so the inbox is reserved exclusively for real external bot ↔ human chat.

**Architecture:** New `notifications` table in the app schema. A new `notificationsRouter` (tRPC) serves the bell UI. Three cron jobs are refactored to insert into `notifications` instead of `conversations`/`messages`. The agent inbox chat window gets an empty state prompting users to connect a bot when no messages exist.

**Tech Stack:** Drizzle ORM (pgSchema), tRPC protectedProcedure, Next.js App Router, React + lucide-react, next-intl, shadcn/ui Popover

---

### Task 1: Add `notifications` table to schema

**Files:**
- Modify: `src/server/db/schema.ts`

**Step 1: Add the table definition**

Open `src/server/db/schema.ts`. After the `agentApiKeys` block (around line 380), add:

```typescript
// System notifications (platform-generated alerts, separate from agent inbox)
export const notifications = appSchema.table("notification", (d) => ({
  id: d
    .varchar({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: d
    .varchar({ length: 255 })
    .notNull()
    .references(() => user.id),
  type: d.varchar({ length: 50 }).notNull(), // "challenge_advisory" | "stale_review_reminder" | "challenge_digest"
  title: d.varchar({ length: 255 }).notNull(),
  content: d.text().notNull(),
  metadata: d.json().$type<Record<string, unknown>>().default({}),
  readAt: d.timestamp({ withTimezone: true }),
  createdAt: d
    .timestamp({ withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
}));
```

**Step 2: Generate the migration**

```bash
pnpm db:generate
```

Expected: A new file appears in `drizzle/` with `CREATE TABLE "app"."notification"`.

**Step 3: Apply the migration**

```bash
pnpm db:migrate
```

Expected: Migration applied successfully, no errors.

**Step 4: Commit**

```bash
git add src/server/db/schema.ts drizzle/
git commit -m "feat(schema): add notifications table"
```

---

### Task 2: Add `notificationsRouter` tRPC router

**Files:**
- Create: `src/server/api/routers/notifications.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create the router file**

Create `src/server/api/routers/notifications.ts`:

```typescript
import { z } from "zod";
import { eq, and, isNull, isNotNull, desc, lt } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { notifications } from "@/server/db/schema";

export const notificationsRouter = createTRPCRouter({
  /**
   * list - paginated list of notifications for the current user, newest first.
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullable().default(null), // ISO-8601 createdAt
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const conditions = [eq(notifications.userId, userId)];
      if (input.cursor) {
        conditions.push(lt(notifications.createdAt, new Date(input.cursor)));
      }
      const rows = await ctx.db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const nextCursor = hasMore
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

      return { notifications: items, nextCursor };
    }),

  /**
   * unreadCount - number of unread notifications for the bell badge.
   */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const rows = await ctx.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { count: rows.length };
  }),

  /**
   * markRead - mark one notification as read, or all if no id provided.
   */
  markRead: protectedProcedure
    .input(z.object({ id: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const conditions = [eq(notifications.userId, userId)];
      if (input.id) conditions.push(eq(notifications.id, input.id));
      await ctx.db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(...conditions));
    }),

  /**
   * markUnread - mark one notification as unread.
   */
  markUnread: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ctx.db
        .update(notifications)
        .set({ readAt: null })
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, userId)));
    }),

  /**
   * delete - hard delete one notification.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ctx.db
        .delete(notifications)
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, userId)));
    }),

  /**
   * deleteAll - hard delete all notifications for the user.
   */
  deleteAll: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    await ctx.db.delete(notifications).where(eq(notifications.userId, userId));
  }),

  /**
   * deleteAllRead - hard delete only already-read notifications.
   */
  deleteAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    await ctx.db
      .delete(notifications)
      .where(and(eq(notifications.userId, userId), isNotNull(notifications.readAt)));
  }),
});
```

**Step 2: Register in root router**

In `src/server/api/root.ts`, add the import and register:

```typescript
// Add import alongside other routers:
import { notificationsRouter } from "@/server/api/routers/notifications";

// Add inside createTRPCRouter({...}):
notifications: notificationsRouter,
```

**Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/server/api/routers/notifications.ts src/server/api/root.ts
git commit -m "feat(notifications): add notificationsRouter with list, unreadCount, markRead, markUnread, delete, deleteAll, deleteAllRead"
```

---

### Task 3: Refactor `challenge-advisory` cron to use notifications

**Files:**
- Modify: `src/app/api/cron/challenge-advisory/route.ts`

**Step 1: Replace the full file content**

The current file writes to `conversations`/`messages`. Replace it so it writes to `notifications` instead. Key changes:
- Remove imports: `conversations`, `conversationParticipants`, `messages`
- Add import: `notifications`
- Replace the "Find or create agent conversation" + "Send the advisory message" blocks with a single `notifications` insert

Full replacement for the message-sending section (lines 123–173 in the current file):

```typescript
// (replace the "Find or create agent conversation" block and the message insert with:)
await db.insert(notifications).values({
  userId: enrollment.userId,
  type: "challenge_advisory",
  title: `Challenge Update: "${challenge.title}"`,
  content: message,
  metadata: {
    challengeId: challenge.id,
    enrollmentId: enrollment.enrollmentId,
  },
});

advisorySent++;
```

Also remove these imports from the top of the file (they are no longer needed):
```typescript
conversations,
conversationParticipants,
messages,
```

And add:
```typescript
notifications,
```

**Step 2: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/api/cron/challenge-advisory/route.ts
git commit -m "feat(cron): challenge-advisory writes to notifications instead of inbox"
```

---

### Task 4: Refactor `stale-review-reminder` cron to use notifications

**Files:**
- Modify: `src/app/api/cron/stale-review-reminder/route.ts`

**Step 1: Read the current file to understand its message-sending block**

Read `src/app/api/cron/stale-review-reminder/route.ts` fully. Find where it inserts into `conversations`/`messages` (same pattern as challenge-advisory).

**Step 2: Replace with notifications insert**

Apply the same swap as Task 3. The message content will differ (it's a stale review reminder), but the pattern is identical:

```typescript
await db.insert(notifications).values({
  userId: <the recipient userId from the file>,
  type: "stale_review_reminder",
  title: "Peer Review Reminder",
  content: <the message string built in the file>,
  metadata: {
    challengeId: <challengeId>,
    enrollmentId: <enrollmentId>,
  },
});
```

Remove unused imports (`conversations`, `conversationParticipants`, `messages`) and add `notifications`.

**Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/app/api/cron/stale-review-reminder/route.ts
git commit -m "feat(cron): stale-review-reminder writes to notifications instead of inbox"
```

---

### Task 5: Refactor `challenge-digest` cron to use notifications

**Files:**
- Modify: `src/app/api/cron/challenge-digest/route.ts`

**Step 1: Read the current file fully**

Read `src/app/api/cron/challenge-digest/route.ts`. Find its message-sending block.

**Step 2: Replace with notifications insert**

Same swap pattern:

```typescript
await db.insert(notifications).values({
  userId: <recipient userId>,
  type: "challenge_digest",
  title: `Weekly Digest: "${challenge.title}"`,
  content: <the message string>,
  metadata: {
    challengeId: <challengeId>,
  },
});
```

Remove unused imports, add `notifications`.

**Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/app/api/cron/challenge-digest/route.ts
git commit -m "feat(cron): challenge-digest writes to notifications instead of inbox"
```

---

### Task 6: Build the `NotificationBell` component

**Files:**
- Create: `src/components/notifications/notification-bell.tsx`
- Create: `src/components/notifications/notification-panel.tsx`

**Step 1: Create `notification-bell.tsx`**

This is the bell icon button that shows the unread badge and toggles the panel.

```tsx
"use client";

import { useState } from "react";
import { BellIcon } from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { NotificationPanel } from "./notification-panel";

export function NotificationBell() {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);

  const { data: unreadData } = api.notifications.unreadCount.useQuery(undefined, {
    enabled: !!session?.user,
    refetchInterval: 30_000,
  });

  if (!session?.user) return null;

  const count = unreadData?.count ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center rounded-md p-2 hover:bg-muted"
        aria-label={`Notifications${count > 0 ? `, ${count} unread` : ""}`}
      >
        <BellIcon className="h-5 w-5 text-muted-foreground" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  );
}
```

**Step 2: Create `notification-panel.tsx`**

The dropdown panel with the full list and toolbar actions.

```tsx
"use client";

import { useEffect, useRef } from "react";
import { CheckCheckIcon, Trash2Icon, BellOffIcon } from "lucide-react";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";

type Props = { onClose: () => void };

export function NotificationPanel({ onClose }: Props) {
  const utils = api.useUtils();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const { data, isLoading, fetchNextPage, hasNextPage } =
    api.notifications.list.useInfiniteQuery(
      { limit: 20 },
      {
        getNextPageParam: (last) => last.nextCursor,
        initialCursor: null,
      },
    );

  const markRead = api.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const markUnread = api.notifications.markUnread.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const del = api.notifications.delete.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const deleteAll = api.notifications.deleteAll.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const deleteAllRead = api.notifications.deleteAllRead.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
    },
  });

  const allItems = data?.pages.flatMap((p) => p.notifications) ?? [];

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-10 z-50 flex w-80 flex-col rounded-lg border border-border bg-background shadow-lg sm:w-96"
    >
      {/* Header toolbar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Notifications</span>
        <div className="flex gap-1">
          <button
            type="button"
            title="Mark all read"
            onClick={() => markRead.mutate({})}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <CheckCheckIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Clear read"
            onClick={() => deleteAllRead.mutate()}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <BellOffIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Clear all"
            onClick={() => deleteAll.mutate()}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <Trash2Icon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {!isLoading && allItems.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No notifications
          </p>
        )}
        {allItems.map((n) => (
          <div
            key={n.id}
            className="group flex items-start gap-2 border-b border-border px-3 py-3 last:border-0 hover:bg-muted/50"
          >
            {/* Unread dot */}
            <div className="mt-1.5 h-2 w-2 shrink-0">
              {!n.readAt && (
                <span className="block h-2 w-2 rounded-full bg-primary" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => !n.readAt && markRead.mutate({ id: n.id })}
              >
                <p className="truncate text-sm font-medium">{n.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {n.content}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(n.createdAt).toLocaleDateString()}
                </p>
              </button>
            </div>

            {/* Per-row actions */}
            <div className="flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100">
              {n.readAt ? (
                <button
                  type="button"
                  title="Mark unread"
                  onClick={() => markUnread.mutate({ id: n.id })}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                >
                  <BellOffIcon className="h-3 w-3" />
                </button>
              ) : (
                <button
                  type="button"
                  title="Mark read"
                  onClick={() => markRead.mutate({ id: n.id })}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                >
                  <CheckCheckIcon className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                title="Delete"
                onClick={() => del.mutate({ id: n.id })}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
              >
                <Trash2Icon className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}

        {/* Load more */}
        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            className="w-full py-2 text-center text-xs text-muted-foreground hover:bg-muted"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/notifications/
git commit -m "feat(ui): add NotificationBell and NotificationPanel components"
```

---

### Task 7: Add `NotificationBell` to the nav

**Files:**
- Find and modify the nav component that contains the existing inbox pill or top nav

**Step 1: Find the nav component**

```bash
grep -rn "InboxPill\|InboxRoot\|inbox-root\|inbox-pill" src --include="*.tsx" | grep -v node_modules
```

The `InboxRoot` is rendered somewhere in the layout. Find that layout file (likely `src/app/[locale]/layout.tsx` or a shared nav component).

**Step 2: Import and place `NotificationBell`**

In the file that renders the top navigation (look for where user session / auth nav items are rendered), add:

```tsx
import { NotificationBell } from "@/components/notifications/notification-bell";
```

Place `<NotificationBell />` in the nav bar next to other user actions (e.g., near the inbox pill or user avatar). The exact placement depends on the nav structure — keep it consistent with existing icon buttons.

**Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add <modified nav file>
git commit -m "feat(ui): add NotificationBell to nav"
```

---

### Task 8: Add empty state to agent chat window

**Files:**
- Modify: `src/components/inbox/chat-window.tsx`

**Step 1: Read the full `chat-window.tsx`**

Read `src/components/inbox/chat-window.tsx` fully. Find where messages are rendered when the list is empty (or where loading/empty states are shown).

**Step 2: Add the empty state for agent conversations**

When `isAgent` is true and there are no messages, render a prompt instead of an empty chat:

```tsx
{isAgent && messages.length === 0 && !isLoading && (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
    <BotIcon className="h-8 w-8 text-muted-foreground" />
    <p className="text-sm text-muted-foreground">
      Connect your bot to start chatting.
    </p>
    <a
      href="/dashboard/agent"
      className="text-xs text-primary underline-offset-4 hover:underline"
    >
      Generate an API key to get started
    </a>
  </div>
)}
```

`BotIcon` is already imported in this file (confirmed at line 6).

**Step 3: Verify TypeScript compiles**

```bash
pnpm tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/inbox/chat-window.tsx
git commit -m "feat(inbox): show empty state with connect-bot prompt for agent conversations"
```

---

### Task 9: Manual smoke test

**Step 1: Run the dev server**

```bash
pnpm dev
```

**Step 2: Verify bell renders**

- Log in, confirm the bell icon appears in the nav
- Confirm no badge when there are 0 notifications

**Step 3: Verify panel actions**

Call the cron endpoint manually to generate a test notification:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/challenge-advisory
```

- Refresh the page, confirm the badge shows 1
- Click the bell, confirm the notification appears
- Test: mark read, mark unread, delete, mark all read, clear read, clear all

**Step 4: Verify agent inbox empty state**

- Open the inbox, open the agent conversation
- Confirm the "Connect your bot" empty state appears (no cron messages will be injected anymore)

**Step 5: Commit any fixes found during testing**

---
