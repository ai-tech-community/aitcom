# Notebook Panel & Dashboard Tabs Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dashboard Notebook tab with a LinkedIn-style persistent floating chat panel available site-wide, and restyle the dashboard tabs to match the brutalist monospace design.

**Architecture:** New `NotebookPanel` client component rendered at the root locale layout level. Panel uses existing ai-elements chat components and tRPC notebook procedures. Dashboard tabs restyled with 4 remaining items. Old notebook page deleted.

**Tech Stack:** Next.js 15, React 19, tRPC 11, ai-elements (Conversation, Message, PromptInput), Tailwind CSS 4, next-intl, lucide-react, better-auth

---

## Context for Implementer

### Key Conventions

- **Path alias:** `@/` maps to `./src/*`
- **Design tokens (OKLCH):** `bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-secondary`, `bg-primary`, `text-primary-foreground`
- **Section headers:** `/ SECTION NAME` with `font-mono text-xs font-medium tracking-wider text-muted-foreground`
- **Dialog styling:** `rounded-lg border border-border bg-background shadow-lg`, header `font-mono text-sm tracking-wider`, close button `opacity-70 hover:opacity-100`
- **i18n:** `useTranslations("namespace")` with keys in `messages/en.json` and `messages/nl.json`
- **Auth client-side:** `authClient.useSession()` from `@/server/better-auth/client`
- **tRPC client:** `api` from `@/trpc/react`, e.g. `api.notebook.unreadCount.useQuery()`

### Existing tRPC Notebook Procedures (human-facing)

- `notebook.getMessages({ cursor, limit })` → `{ messages, nextCursor, hasAgent }`
- `notebook.sendMessage({ content })` → message row
- `notebook.markRead()` → `{ count }`
- `notebook.unreadCount()` → `{ count }`

### Files Referenced

- Root layout: `src/app/[locale]/layout.tsx`
- Dashboard layout: `src/app/[locale]/dashboard/layout.tsx`
- Dashboard tabs: `src/components/dashboard-tabs.tsx`
- Notebook page (to delete): `src/app/[locale]/dashboard/notebook/page.tsx`
- Auth client: `src/server/better-auth/client.ts`
- i18n EN: `messages/en.json`
- i18n NL: `messages/nl.json`

---

### Task 1: Create the NotebookPanel component

**Files:**
- Create: `src/components/notebook-panel.tsx`

**Step 1: Create the component**

Create `src/components/notebook-panel.tsx` with the full implementation:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  MessageSquareIcon,
  ChevronDownIcon,
  XIcon,
  BotIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";

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
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";

export function NotebookPanel() {
  const { data: session } = authClient.useSession();
  const t = useTranslations("notebook");

  const [expanded, setExpanded] = useState(false);

  // Only fetch when signed in
  const { data: unreadData } = api.notebook.unreadCount.useQuery(undefined, {
    enabled: !!session?.user,
    refetchInterval: 30000,
  });

  const { data, isLoading } = api.notebook.getMessages.useQuery(
    { limit: 50 },
    { enabled: !!session?.user && expanded },
  );

  const utils = api.useUtils();

  const sendMessage = api.notebook.sendMessage.useMutation({
    onSuccess: () => {
      void utils.notebook.getMessages.invalidate();
      void utils.notebook.unreadCount.invalidate();
    },
  });

  const markRead = api.notebook.markRead.useMutation({
    onSuccess: () => {
      void utils.notebook.unreadCount.invalidate();
    },
  });

  // Mark messages as read when panel is expanded
  useEffect(() => {
    if (expanded && data?.hasAgent) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, data?.hasAgent]);

  const unreadCount = unreadData?.count ?? 0;
  const messages = data?.messages ?? [];
  const hasAgent = data?.hasAgent ?? false;

  // Don't render if not signed in or no agent
  if (!session?.user) return null;

  function handleSubmit(message: { text: string }) {
    const content = message.text.trim();
    if (!content) return;
    sendMessage.mutate({ content });
  }

  // Collapsed state
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 shadow-lg transition-colors hover:bg-secondary/50"
      >
        <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          NOTEBOOK
        </span>
        {unreadCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    );
  }

  // Expanded state
  return (
    <div className="fixed right-4 bottom-4 z-40 flex h-[500px] w-[380px] flex-col rounded-lg border border-border bg-background shadow-lg max-sm:inset-x-4 max-sm:top-20 max-sm:h-auto max-sm:w-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / NOTEBOOK
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(false)}
            className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Chat area */}
      {!hasAgent && !isLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <BotIcon className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("noAgent")}</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : messages.length === 0 ? (
        <Conversation className="flex-1">
          <ConversationContent className="flex h-full items-center justify-center">
            <ConversationEmptyState
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              icon={<BotIcon className="h-8 w-8" />}
            />
          </ConversationContent>
        </Conversation>
      ) : (
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.map((msg) => (
              <Message
                key={msg.id}
                from={msg.role === "human" ? "user" : "assistant"}
              >
                <MessageContent>
                  {msg.role === "human" ? (
                    <p>{msg.content}</p>
                  ) : (
                    <MessageResponse>{msg.content}</MessageResponse>
                  )}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {/* Input area */}
      <div className="border-t border-border p-3">
        <PromptInput
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-background"
        >
          <PromptInputTextarea
            placeholder={t("placeholder")}
            disabled={!hasAgent || sendMessage.isPending}
          />
          <PromptInputFooter>
            <div />
            <PromptInputSubmit
              disabled={!hasAgent || sendMessage.isPending}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in `notebook-panel.tsx`

**Step 3: Commit**

```bash
git add src/components/notebook-panel.tsx
git commit -m "feat: create NotebookPanel component (LinkedIn-style floating chat)"
```

---

### Task 2: Wire NotebookPanel into root layout

**Files:**
- Modify: `src/app/[locale]/layout.tsx:60-65`

**Step 1: Add the NotebookPanel import and render**

In `src/app/[locale]/layout.tsx`, add import at the top:

```tsx
import { NotebookPanel } from "@/components/notebook-panel";
```

Then add `<NotebookPanel />` after `<Footer />` and before `<Toaster />`. The JSX inside `<TRPCReactProvider>` should become:

```tsx
<TRPCReactProvider>
  <Navbar />
  <main className="min-h-screen to-background bg-linear-to-b from-orange-50/60 via-amber-50/30">{children}</main>
  <Footer />
  <NotebookPanel />
  <Toaster position="bottom-right" />
</TRPCReactProvider>
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in `layout.tsx`

**Step 3: Smoke test in browser**

Run dev server if not running: `npm run dev`
- Visit `http://localhost:3000/en` (not signed in) — no panel should appear
- Sign in and visit any page — collapsed "NOTEBOOK" pill should appear bottom-right
- Click to expand — chat panel opens with messages or empty state
- Click minimize/close — panel collapses back

**Step 4: Commit**

```bash
git add src/app/[locale]/layout.tsx
git commit -m "feat: add NotebookPanel to root layout (site-wide)"
```

---

### Task 3: Restyle dashboard tabs

**Files:**
- Modify: `src/components/dashboard-tabs.tsx`

**Step 1: Rewrite the DashboardTabs component**

Replace the entire content of `src/components/dashboard-tabs.tsx` with:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ActivityIcon,
  BotIcon,
  CalendarIcon,
  SettingsIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

const tabs = [
  { path: "/dashboard", icon: ActivityIcon, labelKey: "feed" },
  { path: "/dashboard/agent", icon: BotIcon, labelKey: "agent" },
  { path: "/dashboard/events", icon: CalendarIcon, labelKey: "events" },
  { path: "/dashboard/settings", icon: SettingsIcon, labelKey: "settings" },
] as const;

export function DashboardTabs() {
  const pathname = usePathname();
  const t = useTranslations("dashboard");

  // Strip locale prefix: /en/dashboard/agent -> /dashboard/agent
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, "");

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {tabs.map(({ path, icon: Icon, labelKey }) => {
        const isActive =
          path === "/dashboard"
            ? pathWithoutLocale === "/dashboard"
            : pathWithoutLocale.startsWith(path);

        return (
          <Link
            key={path}
            href={path}
            className={`flex items-center gap-1.5 rounded px-3 py-2 font-mono text-xs font-medium tracking-wider uppercase transition-colors ${
              isActive
                ? "bg-secondary/50 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

Key changes from the old version:
- Removed `MessageSquareIcon` import (no notebook tab)
- Removed notebook tab from `tabs` array
- Removed `api` import and `unreadCount` query (moved to NotebookPanel)
- Removed `sticky top-0 z-10 border-b border-border bg-background` wrapper
- Changed to `flex gap-1 overflow-x-auto` (no border-bottom, no sticky)
- Active state: `bg-secondary/50 text-foreground rounded` instead of `border-b-2 border-primary`
- Inactive: `text-muted-foreground hover:text-foreground` (no border-transparent)
- Added `uppercase` to labels
- Tighter padding: `px-3 py-2` instead of `px-4 py-3`
- Tighter gap: `gap-1.5` instead of `gap-2`

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Smoke test**

Visit `http://localhost:3000/en/dashboard` — tabs should show 4 items (Feed, Agent, Events, Settings) in monospace uppercase with no bottom border. Active tab has subtle background.

**Step 4: Commit**

```bash
git add src/components/dashboard-tabs.tsx
git commit -m "style: restyle dashboard tabs to brutalist monospace design"
```

---

### Task 4: Delete the notebook page

**Files:**
- Delete: `src/app/[locale]/dashboard/notebook/page.tsx`

**Step 1: Delete the file**

```bash
rm src/app/[locale]/dashboard/notebook/page.tsx
```

If the `notebook` directory is now empty, delete it too:

```bash
rmdir src/app/[locale]/dashboard/notebook
```

**Step 2: Verify no broken imports**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (nothing else imports the notebook page)

**Step 3: Verify the route 404s**

Visit `http://localhost:3000/en/dashboard/notebook` — should return 404 or redirect to dashboard.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove dashboard notebook page (replaced by floating panel)"
```

---

### Task 5: Update i18n keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Remove the notebook tab key from dashboard namespace**

In `messages/en.json`, in the `"dashboard"` object, remove the line:
```json
"notebook": "Notebook",
```

In `messages/nl.json`, in the `"dashboard"` object, remove the line:
```json
"notebook": "Notitieboek",
```

The `"notebook"` namespace (separate from `"dashboard"`) stays — it's used by the panel.

**Step 2: Verify no runtime i18n errors**

Visit `http://localhost:3000/en/dashboard` — no missing translation warnings in the console.

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "chore(i18n): remove unused dashboard.notebook key"
```

---

### Task 6: Verify everything end-to-end

**Step 1: TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No new errors (pre-existing ai-elements errors are fine)

**Step 2: Browser walkthrough**

1. Visit homepage (not signed in) — no panel visible
2. Sign in → any page — collapsed "NOTEBOOK" pill bottom-right with unread badge
3. Click pill — panel expands with chat UI
4. Send a message — appears in chat, input clears
5. Click minimize — collapses back, badge updates
6. Navigate to `/dashboard` — 4 tabs (Feed, Agent, Events, Settings) in mono uppercase
7. Navigate to `/dashboard/notebook` — 404
8. Navigate to `/members`, `/events`, etc. — panel still visible bottom-right
9. On mobile viewport (<640px) — expanded panel goes near-full-screen

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address review feedback for notebook panel"
```
