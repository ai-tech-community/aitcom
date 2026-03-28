# Dashboard Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the member dashboard from the agent dashboard so each has its own focused layout, navigation entry point, and tab structure.

**Architecture:** Use Next.js App Router route groups `(member)` and `(agent)` under `src/app/[locale]/dashboard/` to give each dashboard its own layout while sharing the same URL prefix. The shared parent layout handles auth + outer container. Navigation adds a top-level `[A] MY AGENT` link.

**Tech Stack:** Next.js 15 App Router, React, next-intl, tRPC, Tailwind CSS, lucide-react icons

---

## File Structure

```
src/app/[locale]/dashboard/
├── layout.tsx                          ← MODIFY: strip to shared auth + container wrapper
├── (member)/
│   ├── layout.tsx                      ← CREATE: member title, welcome, tabs, quick links
│   ├── page.tsx                        ← MOVE from dashboard/page.tsx (unchanged)
│   ├── communities/
│   │   └── page.tsx                    ← MOVE from dashboard/communities/page.tsx (unchanged)
│   ├── events/
│   │   └── page.tsx                    ← MOVE from dashboard/events/page.tsx (unchanged)
│   ├── settings/
│   │   └── page.tsx                    ← MOVE from dashboard/settings/page.tsx (unchanged)
│   ├── notifications/
│   │   └── page.tsx                    ← MOVE from dashboard/notifications/page.tsx (unchanged)
│   └── onboarding/
│       └── page.tsx                    ← MOVE from dashboard/onboarding/page.tsx (unchanged)
├── (agent)/
│   ├── layout.tsx                      ← CREATE: agent title, back link, no tabs
│   └── agent/
│       ├── page.tsx                    ← MOVE from dashboard/agent/page.tsx (update import path)
│       └── content.tsx                 ← MOVE from dashboard/agent/content.tsx (add QA section)
src/components/
├── dashboard-tabs.tsx                  ← MODIFY: remove agent/challenges/notifications/QA tabs, add communities
├── navbar.tsx                          ← MODIFY: add [A] MY AGENT link + keyboard shortcut
messages/
├── en.json                             ← MODIFY: add nav.myAgent key
├── nl.json                             ← MODIFY: add nav.myAgent key
```

---

### Task 1: Update dashboard-tabs.tsx — remove old tabs, add communities

**Files:**
- Modify: `src/components/dashboard-tabs.tsx`

- [ ] **Step 1: Update the tabs array and imports**

Replace the entire file content. Remove `BotIcon`, `BarChartIcon`, `BellIcon`, `TrophyIcon` imports. Add `UsersIcon`. Update the tabs array to only include feed, communities, events, settings:

```typescript
"use client";

import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ActivityIcon,
  CalendarIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

const tabs = [
  { path: "/dashboard", icon: ActivityIcon, labelKey: "feed" },
  { path: "/dashboard/communities", icon: UsersIcon, labelKey: "communities" },
  { path: "/dashboard/events", icon: CalendarIcon, labelKey: "events" },
  { path: "/dashboard/settings", icon: SettingsIcon, labelKey: "settings" },
] as const;

export function DashboardTabs() {
  const pathname = usePathname();
  const t = useTranslations("dashboard");

  // Strip locale prefix: /en/dashboard/events -> /dashboard/events
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
            className={`flex items-center gap-1.5 rounded px-3 py-2 font-mono text-xs font-medium uppercase tracking-wider transition-colors ${
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

- [ ] **Step 2: Add the `communities` i18n key to the dashboard namespace**

In `messages/en.json`, inside the `"dashboard"` object (around line 476-484), add the `"communities"` key. The current keys are:
```json
"feed": "Feed",
"agent": "Agent",
"events": "Events",
"challenges": "Challenges",
"onboarding": "Onboarding",
"notifications": "Notifications",
"settings": "Settings",
"impact": "Impact",
"qa": "QA"
```

Add `"communities": "Communities"` after `"feed"`. The existing unused keys (`agent`, `challenges`, `notifications`, `impact`, `qa`) can stay — removing them is optional cleanup.

In `messages/nl.json`, in the same location, add `"communities": "Community's"`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to dashboard-tabs.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard-tabs.tsx messages/en.json messages/nl.json
git commit -m "refactor: update dashboard tabs — remove agent/challenges/notifications/QA, add communities"
```

---

### Task 2: Create route group structure and shared layout

**Files:**
- Modify: `src/app/[locale]/dashboard/layout.tsx`
- Create: `src/app/[locale]/dashboard/(member)/layout.tsx`

- [ ] **Step 1: Strip the shared dashboard layout to auth + container only**

Replace `src/app/[locale]/dashboard/layout.tsx` with:

```typescript
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-12">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create the member-specific layout**

Create `src/app/[locale]/dashboard/(member)/layout.tsx`:

```typescript
import { getSession } from "@/server/better-auth/server";
import { DashboardTabs } from "@/components/dashboard-tabs";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function MemberDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, t] = await Promise.all([
    getSession(),
    getTranslations("dashboard"),
  ]);

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome back, {session!.user.name ?? session!.user.email}
      </p>

      <div className="mt-8">
        <DashboardTabs />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-[11px] tracking-wider text-muted-foreground">
        <span>{t("quickLinks")}:</span>
        <Link href="/dashboard/onboarding" className="hover:text-foreground">
          {t("onboarding")}
        </Link>
        <Link href="/dashboard/notifications" className="hover:text-foreground">
          {t("notifications")}
        </Link>
      </div>

      <div className="mt-8">{children}</div>
    </>
  );
}
```

Note: The session is guaranteed non-null here because the parent layout already redirects unauthenticated users. We use `session!` to assert this.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors. The member layout and shared layout should compile cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/dashboard/layout.tsx src/app/[locale]/dashboard/(member)/layout.tsx
git commit -m "refactor: split dashboard layout into shared wrapper + member-specific layout"
```

---

### Task 3: Move member pages into (member) route group

**Files:**
- Move: `src/app/[locale]/dashboard/page.tsx` → `src/app/[locale]/dashboard/(member)/page.tsx`
- Move: `src/app/[locale]/dashboard/communities/page.tsx` → `src/app/[locale]/dashboard/(member)/communities/page.tsx`
- Move: `src/app/[locale]/dashboard/events/page.tsx` → `src/app/[locale]/dashboard/(member)/events/page.tsx`
- Move: `src/app/[locale]/dashboard/settings/page.tsx` → `src/app/[locale]/dashboard/(member)/settings/page.tsx`
- Move: `src/app/[locale]/dashboard/notifications/page.tsx` → `src/app/[locale]/dashboard/(member)/notifications/page.tsx`
- Move: `src/app/[locale]/dashboard/onboarding/page.tsx` → `src/app/[locale]/dashboard/(member)/onboarding/page.tsx`

- [ ] **Step 1: Create directories and move files**

```bash
# Create directories
mkdir -p "src/app/[locale]/dashboard/(member)/communities"
mkdir -p "src/app/[locale]/dashboard/(member)/events"
mkdir -p "src/app/[locale]/dashboard/(member)/settings"
mkdir -p "src/app/[locale]/dashboard/(member)/notifications"
mkdir -p "src/app/[locale]/dashboard/(member)/onboarding"

# Move files (git mv preserves history)
git mv "src/app/[locale]/dashboard/page.tsx" "src/app/[locale]/dashboard/(member)/page.tsx"
git mv "src/app/[locale]/dashboard/communities/page.tsx" "src/app/[locale]/dashboard/(member)/communities/page.tsx"
git mv "src/app/[locale]/dashboard/events/page.tsx" "src/app/[locale]/dashboard/(member)/events/page.tsx"
git mv "src/app/[locale]/dashboard/settings/page.tsx" "src/app/[locale]/dashboard/(member)/settings/page.tsx"
git mv "src/app/[locale]/dashboard/notifications/page.tsx" "src/app/[locale]/dashboard/(member)/notifications/page.tsx"
git mv "src/app/[locale]/dashboard/onboarding/page.tsx" "src/app/[locale]/dashboard/(member)/onboarding/page.tsx"
```

No file content changes needed — all imports use `@/` aliases which are path-independent.

- [ ] **Step 2: Remove empty old directories**

```bash
rmdir "src/app/[locale]/dashboard/communities" 2>/dev/null
rmdir "src/app/[locale]/dashboard/events" 2>/dev/null
rmdir "src/app/[locale]/dashboard/settings" 2>/dev/null
rmdir "src/app/[locale]/dashboard/notifications" 2>/dev/null
rmdir "src/app/[locale]/dashboard/onboarding" 2>/dev/null
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors. URLs remain unchanged because `(member)` is invisible in the URL.

- [ ] **Step 4: Commit**

```bash
git add -A "src/app/[locale]/dashboard/"
git commit -m "refactor: move member dashboard pages into (member) route group"
```

---

### Task 4: Create agent layout and move agent pages into (agent) route group

**Files:**
- Create: `src/app/[locale]/dashboard/(agent)/layout.tsx`
- Move: `src/app/[locale]/dashboard/agent/page.tsx` → `src/app/[locale]/dashboard/(agent)/agent/page.tsx`
- Move: `src/app/[locale]/dashboard/agent/content.tsx` → `src/app/[locale]/dashboard/(agent)/agent/content.tsx`

- [ ] **Step 1: Create the agent-specific layout**

Create `src/app/[locale]/dashboard/(agent)/layout.tsx`:

```typescript
import { Link } from "@/i18n/navigation";
import { ArrowLeftIcon } from "lucide-react";

export default function AgentDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="h-3 w-3" />
        DASHBOARD
      </Link>
      <div className="mt-6">{children}</div>
    </>
  );
}
```

- [ ] **Step 2: Move agent files into (agent) route group**

```bash
mkdir -p "src/app/[locale]/dashboard/(agent)/agent"
git mv "src/app/[locale]/dashboard/agent/page.tsx" "src/app/[locale]/dashboard/(agent)/agent/page.tsx"
git mv "src/app/[locale]/dashboard/agent/content.tsx" "src/app/[locale]/dashboard/(agent)/agent/content.tsx"
rmdir "src/app/[locale]/dashboard/agent" 2>/dev/null
```

- [ ] **Step 3: Update the relative import in agent/page.tsx**

The agent `page.tsx` imports `./content` — this relative import still works because both files moved together into the same directory. Verify the import is correct:

```typescript
import { AgentDashboardContent } from "./content";
```

No change needed — the relative path is preserved.

- [ ] **Step 4: Remove duplicate layout from agent page.tsx**

The current `agent/page.tsx` has its own container/title/subtitle because it was designed as a standalone page inside the tabbed dashboard. Now that it has its own layout, update it to remove the redundant wrapper. Replace the content of `src/app/[locale]/dashboard/(agent)/agent/page.tsx` with:

```typescript
import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { api, HydrateClient } from "@/trpc/server";
import { AgentDashboardContent } from "./content";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AgentDashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  const agent = await api.agentManagement.getMyAgent();

  return (
    <HydrateClient>
      <h1 className="text-3xl font-extrabold tracking-tight">
        {agent ? agent.name : "My Agent"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {agent
          ? "Manage your AI agent for the AIT community."
          : "Set up your AI agent to participate in the community."}
      </p>

      <div className="mt-12 space-y-8">
        <AgentDashboardContent initialAgent={agent} />
      </div>
    </HydrateClient>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add -A "src/app/[locale]/dashboard/"
git commit -m "refactor: move agent dashboard into (agent) route group with dedicated layout"
```

---

### Task 5: Add Impact/QA section to agent dashboard content

**Files:**
- Modify: `src/app/[locale]/dashboard/(agent)/agent/content.tsx`
- Move: `src/app/[locale]/dashboard/impact/page.tsx` → `src/app/[locale]/dashboard/(agent)/agent/impact/page.tsx` (optional — or embed inline)

- [ ] **Step 1: Add QA dashboard import and section to agent content**

In `src/app/[locale]/dashboard/(agent)/agent/content.tsx`, add the import at the top alongside the other imports:

```typescript
import { QADashboard } from "@/components/impact/qa-dashboard";
```

Then add the QA section between the `AgentConnectSection` and the ghost-mode drafts section. Find this block:

```tsx
      {/* Connect Your Agent */}
      <AgentConnectSection agentName={agent.name} agentId={agent.id} isVerified={agent.isVerified} xHandle={agent.xHandle} />

      {/* Drafts (ghost mode) */}
```

And insert the Impact/QA section between them:

```tsx
      {/* Connect Your Agent */}
      <AgentConnectSection agentName={agent.name} agentId={agent.id} isVerified={agent.isVerified} xHandle={agent.xHandle} />

      {/* Impact / QA */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / IMPACT QA
          </span>
        </div>
        <div className="mt-4">
          <QADashboard />
        </div>
      </div>

      {/* Drafts (ghost mode) */}
```

- [ ] **Step 2: Remove the old standalone impact page**

```bash
rm "src/app/[locale]/dashboard/impact/page.tsx"
rmdir "src/app/[locale]/dashboard/impact" 2>/dev/null
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add -A "src/app/[locale]/dashboard/"
git commit -m "feat: add Impact/QA section to agent dashboard, remove standalone impact page"
```

---

### Task 6: Add [A] MY AGENT to navbar

**Files:**
- Modify: `src/components/navbar.tsx`
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Add i18n keys for the new nav item**

In `messages/en.json`, inside the `"nav"` object (line 2-18), add:

```json
"myAgent": "My Agent"
```

In `messages/nl.json`, in the same location, add:

```json
"myAgent": "Mijn Agent"
```

- [ ] **Step 2: Add [A] MY AGENT link to desktop nav (right side)**

In `src/components/navbar.tsx`, find the desktop authenticated section (around line 112-125). Currently it has the `[D] DASHBOARD` link followed by `NotificationBell` and sign-out button. Add the `[A] MY AGENT` link between `[D] DASHBOARD` and `<NotificationBell />`:

Find:
```tsx
              <Link
                href="/dashboard"
                className={cn(
                  "hover:text-foreground font-mono text-xs transition-colors",
                  pathname === "/dashboard"
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                [D] DASHBOARD
              </Link>
              <NotificationBell />
```

Replace with:
```tsx
              <Link
                href="/dashboard"
                className={cn(
                  "hover:text-foreground font-mono text-xs transition-colors",
                  pathname === "/dashboard"
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                [D] DASHBOARD
              </Link>
              <Link
                href="/dashboard/agent"
                className={cn(
                  "hover:text-foreground font-mono text-xs transition-colors",
                  pathname.startsWith("/dashboard/agent")
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                [A] {t("myAgent").toUpperCase()}
              </Link>
              <NotificationBell />
```

- [ ] **Step 3: Add [A] MY AGENT link to mobile nav**

Find the mobile menu authenticated section (around line 177-188). Currently it has `[D] DASHBOARD` link followed by sign-out button. Add `[A] MY AGENT` between them:

Find:
```tsx
                      <Link
                        href="/dashboard"
                        onClick={() => setOpen(false)}
                        className={cn(
                          "hover:text-foreground font-mono text-sm transition-colors",
                          pathname === "/dashboard"
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        [D] DASHBOARD
                      </Link>
                      <button
```

Replace with:
```tsx
                      <Link
                        href="/dashboard"
                        onClick={() => setOpen(false)}
                        className={cn(
                          "hover:text-foreground font-mono text-sm transition-colors",
                          pathname === "/dashboard"
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        [D] DASHBOARD
                      </Link>
                      <Link
                        href="/dashboard/agent"
                        onClick={() => setOpen(false)}
                        className={cn(
                          "hover:text-foreground font-mono text-sm transition-colors",
                          pathname.startsWith("/dashboard/agent")
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        [A] {t("myAgent").toUpperCase()}
                      </Link>
                      <button
```

- [ ] **Step 4: Add keyboard shortcut `A` for agent dashboard**

Find the keyboard shortcut section in `handleKeyDown` (around line 64-70):

```typescript
      // Additional shortcuts
      if (key === "D" && session?.user) {
        e.preventDefault();
        router.push("/dashboard");
      } else if (key === "J" && !session?.user) {
```

Replace with:
```typescript
      // Additional shortcuts
      if (key === "D" && session?.user) {
        e.preventDefault();
        router.push("/dashboard");
      } else if (key === "A" && session?.user) {
        e.preventDefault();
        router.push("/dashboard/agent");
      } else if (key === "J" && !session?.user) {
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/navbar.tsx messages/en.json messages/nl.json
git commit -m "feat: add [A] MY AGENT top-nav link with keyboard shortcut"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run dev server and verify routes**

Run: `pnpm dev`

Verify these URLs work:
- `/dashboard` — shows member dashboard with feed tab, profile card, 4 tabs (Feed, Communities, Events, Settings)
- `/dashboard/communities` — shows my communities page with member layout (tabs visible)
- `/dashboard/events` — shows my events page with member layout
- `/dashboard/settings` — shows settings page with member layout
- `/dashboard/notifications` — shows notifications page with member layout
- `/dashboard/onboarding` — shows onboarding page with member layout
- `/dashboard/agent` — shows agent dashboard with back link to dashboard, NO member tabs

Verify navbar:
- `[A] MY AGENT` appears next to `[D] DASHBOARD` in top nav when logged in
- Clicking it navigates to `/dashboard/agent`
- Pressing `A` key navigates to `/dashboard/agent`
- Mobile menu shows `[A] MY AGENT` below `[D] DASHBOARD`

- [ ] **Step 3: Commit any remaining fixes if needed**
