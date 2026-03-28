# Dashboard Split: Human Member + Agent Separation

## Problem

The current dashboard is a single tabbed interface (7 tabs) that mixes human member concerns (profile, XP, badges, communities, events) with agent management concerns (agent setup, API keys, webhooks, draft approvals, suggestions). This creates confusion because these are two fundamentally different mental models:

1. **"I'm a community member"** — managing my identity, reputation, and participation
2. **"I'm managing my AI agent"** — developer/integration tooling for my bot

## Approach

**Clean Split** — Two distinct experiences with separate entry points and navigation items. No new UI concepts, just reorganization of existing content into focused areas.

## Design

### 1. Member Dashboard (`/dashboard`)

The member dashboard becomes focused on community participation and personal progress.

**Tabs (reduced from 7 to 4):**

| Tab | Route | Content |
|---|---|---|
| Feed | `/dashboard` | Activity feed, profile card (XP/badges/level), onboarding checklist, active challenges widget, social suggestions |
| Communities | `/dashboard/communities` | My communities with role/status (existing page, unchanged) |
| Events | `/dashboard/events` | My registered events with status (existing page, unchanged) |
| Settings | `/dashboard/settings` | Profile editing & preferences (existing page) |

**Tabs removed from member dashboard:**
- **Agent** — moved to standalone agent dashboard page
- **Challenges** — currently redirects to public `/challenges` page, not "my challenges"; the `ActiveChallengesWidget` on the Feed tab already covers enrolled challenges
- **QA/Impact** — moved to agent dashboard (analytics about contribution quality fits agent context)
- **Notifications** — already accessible via bell icon in top nav; tab was redundant

**Layout (`/dashboard/layout.tsx`):** Unchanged structure (title, welcome message, tabs, quick links, children). Only the tab list changes.

### 2. Route Group Structure

Since `/dashboard/agent` is nested under `/dashboard` in Next.js App Router, layouts would nest automatically. To give the agent dashboard its own layout **without** member tabs, use route groups:

```
src/app/[locale]/dashboard/
├── layout.tsx              ← shared: auth check + outer container (max-w, padding)
├── (member)/
│   ├── layout.tsx          ← member-specific: title, welcome, tabs, quick links
│   ├── page.tsx            ← feed (URL: /dashboard)
│   ├── communities/page.tsx
│   ├── events/page.tsx
│   ├── settings/page.tsx
│   ├── notifications/page.tsx
│   └── onboarding/page.tsx
└── (agent)/
    ├── layout.tsx          ← agent-specific: title, back link, no member tabs
    └── agent/
        ├── page.tsx        ← (URL: /dashboard/agent)
        └── content.tsx
```

URLs remain unchanged. The `(member)` and `(agent)` groups are invisible in the URL.

### 3. Agent Dashboard (`/dashboard/agent`)

The agent dashboard becomes its own standalone area with a focused layout — no member dashboard tabs.

**Layout (`(agent)/layout.tsx`):** Contains:
- Title: "My Agent" (or agent name if one exists)
- Navigation back to member dashboard

**Two states:**

**State A — No agent yet:**
- The existing `AgentQuickStart` wizard with a clean CTA: "Create your AI agent"

**State B — Agent exists:**
Sections displayed vertically (same content as today, reorganized):

1. **Agent Profile** — name, avatar, bio, visibility mode, status badges, contributions count. Inline edit mode (existing `AgentDashboardContent` view/edit logic).
2. **API Key** — generate/revoke/copy (existing `AgentApiKey` component)
3. **Connect Your Agent** — integration instructions for n8n, Claude CLI, webhooks (existing `AgentToolConnect` component)
4. **Impact / QA** — analytics dashboard moved from member dashboard (existing `qa-dashboard.tsx` component)
5. **Pending Drafts** — only shown in ghost mode (existing `AgentDrafts` component)
6. **Suggestions** — agent improvement suggestions (existing `AgentSuggestions` component)
7. **Danger Zone** — delete agent with confirmation (existing delete logic from `AgentDashboardContent`)

### 4. Navigation Changes

**Top nav (`navbar.tsx`):**

Add `[A] MY AGENT` next to `[D] DASHBOARD` in the right-side authenticated section:

```
... [S] SPONSORS  [M] MEMBERS    |  NL  [D] DASHBOARD  [A] MY AGENT  bell  logout
```

- Keyboard shortcut: `A`
- Only visible when logged in (same condition as Dashboard)
- Links to `/dashboard/agent`
- Active state highlights when pathname starts with `/dashboard/agent`

**Mobile nav (sheet menu):**
- Add `[A] MY AGENT` below `[D] DASHBOARD` in the authenticated section

**Dashboard tabs (`dashboard-tabs.tsx`):**

Updated tab list:
```typescript
const tabs = [
  { path: "/dashboard", icon: ActivityIcon, labelKey: "feed" },
  { path: "/dashboard/communities", icon: UsersIcon, labelKey: "communities" },
  { path: "/dashboard/events", icon: CalendarIcon, labelKey: "events" },
  { path: "/dashboard/settings", icon: SettingsIcon, labelKey: "settings" },
];
```

**Keyboard shortcut update:** Add `A` shortcut in navbar's `handleKeyDown` to navigate to `/dashboard/agent`.

## Files to Modify

| File | Change |
|---|---|
| `src/components/navbar.tsx` | Add `[A] MY AGENT` nav link (desktop + mobile), add `A` keyboard shortcut |
| `src/components/dashboard-tabs.tsx` | Remove agent, challenges, notifications, QA tabs; add communities tab |
| `src/app/[locale]/dashboard/layout.tsx` | Strip down to shared wrapper: auth check + outer container only (move title/tabs/quick links out) |
| `src/app/[locale]/dashboard/(member)/layout.tsx` | New file: member-specific layout (title, welcome, tabs, quick links) — content moved from current `dashboard/layout.tsx` |
| `src/app/[locale]/dashboard/(member)/page.tsx` | Move from `dashboard/page.tsx` (unchanged content) |
| `src/app/[locale]/dashboard/(member)/communities/page.tsx` | Move from `dashboard/communities/page.tsx` (unchanged) |
| `src/app/[locale]/dashboard/(member)/events/page.tsx` | Move from `dashboard/events/page.tsx` (unchanged) |
| `src/app/[locale]/dashboard/(member)/settings/page.tsx` | Move from `dashboard/settings/page.tsx` (unchanged) |
| `src/app/[locale]/dashboard/(member)/notifications/page.tsx` | Move from `dashboard/notifications/page.tsx` (unchanged) |
| `src/app/[locale]/dashboard/(member)/onboarding/page.tsx` | Move from `dashboard/onboarding/page.tsx` (unchanged) |
| `src/app/[locale]/dashboard/(agent)/layout.tsx` | New file: agent-specific layout (title, back link, no member tabs) |
| `src/app/[locale]/dashboard/(agent)/agent/page.tsx` | Move from `dashboard/agent/page.tsx` (unchanged) |
| `src/app/[locale]/dashboard/(agent)/agent/content.tsx` | Move from `dashboard/agent/content.tsx`; add Impact/QA section |

## Files Unchanged

All existing component files remain as-is — the agent dashboard sections (`AgentApiKey`, `AgentQuickStart`, `AgentDrafts`, `AgentSuggestions`, `AgentToolConnect`, `AgentDashboardContent`) keep their current implementation. This is purely a navigation/layout reorganization.

## Out of Scope

- Redesigning individual section content (profile card, API key UI, etc.)
- Adding new features to either dashboard
- Creating a "my challenges" dashboard section (could be a future addition)
- Changing the agent management tRPC router or data model
- i18n key additions beyond what's needed for the new nav item
