# Hackathon Hub — Plan 2: Participant Shell + Route Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for the sequential Foundation phase (Tasks 1–6), then a dynamic Workflow may fan out the independent Tab-page builds (Tasks 7–13). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the fragmented hackathon experience into a single URL-tabbed hub — a shared `layout.tsx` that renders a persistent header + tab bar for hackathon events (and leaves regular events untouched), with each tab a route segment.

**Architecture:** A server `layout.tsx` resolves the event once (cached `resolvePublicHackathonPage`) and branches: hackathon → `HackathonHeader` + `HackathonTabBar` (client, `usePathname`-driven) + `{children}`; regular event → bare `{children}`. A pure, unit-tested `hubTabStates` module decides which tabs are content-ready vs. show a `LockedTabPanel`. The 307-line `HackathonPanel` decomposes into the My Team and Participants tab pages; the workspace moves `/team → /workspace`; the gallery moves `/gallery → /projects` (with redirect).

**Tech Stack:** Next.js App Router (server layouts + segments) · next-intl `@/i18n/navigation` (`Link`/`usePathname`/`redirect`) · tRPC v11 · Tailwind/shadcn · vitest.

Second of four plans, from `docs/superpowers/specs/2026-06-13-hackathon-tabbed-hub-design.md`. Plan 1 (committed) provides `work_cell.progress_status` + `hackathon.agentStats`, consumed by the Workspace and Agents tabs.

**Local-stack note (carried from Plan 1):** host→container Postgres fails for Payload-backed integration suites on this Docker Desktop/macOS setup; run those inside the compose network. UI work here is unit-tested + manually verified, so it does not hit that path.

---

## Phase A — Foundation (sequential, subagent-driven)

### Task 1: Pure `hubTabStates` module

Decides, for a viewer in a given phase/role, which of the 8 tabs are content-ready and which show a locked panel (and with what reason). Db-free, the single source of truth for tab gating, mirrored by the tab bar (Task 3) and each tab page.

**Files:**
- Create: `src/server/hackathon/hub-tabs.ts`
- Test: `src/server/hackathon/hub-tabs.test.ts`

- [ ] **Step 1: Write the failing test** — `src/server/hackathon/hub-tabs.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { HUB_TAB_ORDER, hubTabStates, type HubViewerContext } from "./hub-tabs";

function ctx(overrides: Partial<HubViewerContext> = {}): HubViewerContext {
  return {
    phase: "live",
    isEnrolled: false,
    isOnLockedTeam: false,
    ...overrides,
  };
}

function state(key: string, states = hubTabStates(ctx())) {
  return states.find((s) => s.key === key)!;
}

describe("HUB_TAB_ORDER", () => {
  it("lists the 8 tabs in display order", () => {
    expect(HUB_TAB_ORDER).toEqual([
      "overview",
      "timeline",
      "projects",
      "participants",
      "team",
      "workspace",
      "agents",
      "winners",
    ]);
  });
});

describe("hubTabStates", () => {
  it("returns one entry per tab, in order", () => {
    expect(hubTabStates(ctx()).map((s) => s.key)).toEqual(HUB_TAB_ORDER);
  });

  it("always makes overview, timeline, participants, agents available", () => {
    for (const phase of ["live", "locked", "finalized"] as const) {
      const states = hubTabStates(ctx({ phase }));
      for (const key of ["overview", "timeline", "participants", "agents"]) {
        expect(state(key, states).available).toBe(true);
        expect(state(key, states).lockedReasonKey).toBeNull();
      }
    }
  });

  it("locks projects in live with a pre-lock reason, opens it at lock", () => {
    expect(state("projects", hubTabStates(ctx({ phase: "live" }))).available).toBe(false);
    expect(state("projects", hubTabStates(ctx({ phase: "live" }))).lockedReasonKey).toBe(
      "lockedProjectsPreLock",
    );
    expect(state("projects", hubTabStates(ctx({ phase: "locked" }))).available).toBe(true);
    expect(state("projects", hubTabStates(ctx({ phase: "finalized" }))).available).toBe(true);
  });

  it("locks My Team for a non-enrolled viewer, opens it once enrolled", () => {
    expect(state("team", hubTabStates(ctx({ isEnrolled: false }))).available).toBe(false);
    expect(state("team", hubTabStates(ctx({ isEnrolled: false }))).lockedReasonKey).toBe(
      "lockedTeamNotEnrolled",
    );
    expect(state("team", hubTabStates(ctx({ isEnrolled: true }))).available).toBe(true);
  });

  it("locks Workspace unless the viewer is on a locked team", () => {
    expect(state("workspace", hubTabStates(ctx({ isOnLockedTeam: false }))).available).toBe(false);
    expect(state("workspace", hubTabStates(ctx({ isOnLockedTeam: false }))).lockedReasonKey).toBe(
      "lockedWorkspaceNotReady",
    );
    expect(state("workspace", hubTabStates(ctx({ isOnLockedTeam: true }))).available).toBe(true);
  });

  it("locks Winners until finalized", () => {
    expect(state("winners", hubTabStates(ctx({ phase: "locked" }))).available).toBe(false);
    expect(state("winners", hubTabStates(ctx({ phase: "locked" }))).lockedReasonKey).toBe(
      "lockedWinnersPending",
    );
    expect(state("winners", hubTabStates(ctx({ phase: "finalized" }))).available).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify it fails** — `pnpm exec vitest run src/server/hackathon/hub-tabs.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/server/hackathon/hub-tabs.ts`:

```typescript
// Decides which hub tabs are content-ready vs. show a LockedTabPanel, given the
// viewer's phase and role. Db-free + deterministic so it can be unit-tested and
// shared by the tab bar and each tab page. "available: false" means render the
// locked panel keyed by lockedReasonKey (an i18n key under the `hackathon`
// namespace); the tab itself stays visible and clickable (TAIKAI-style).

import type { HackathonPhase } from "@/server/hackathon/phase";

export type HubTabKey =
  | "overview"
  | "timeline"
  | "projects"
  | "participants"
  | "team"
  | "workspace"
  | "agents"
  | "winners";

export const HUB_TAB_ORDER: HubTabKey[] = [
  "overview",
  "timeline",
  "projects",
  "participants",
  "team",
  "workspace",
  "agents",
  "winners",
];

export interface HubViewerContext {
  phase: HackathonPhase;
  isEnrolled: boolean;
  isOnLockedTeam: boolean;
}

export interface HubTabState {
  key: HubTabKey;
  available: boolean;
  lockedReasonKey: string | null;
}

function decide(key: HubTabKey, ctx: HubViewerContext): HubTabState {
  const open = (): HubTabState => ({ key, available: true, lockedReasonKey: null });
  const lock = (reason: string): HubTabState => ({
    key,
    available: false,
    lockedReasonKey: reason,
  });

  switch (key) {
    case "overview":
    case "timeline":
    case "participants":
    case "agents":
      return open();
    case "projects":
      return ctx.phase === "live" ? lock("lockedProjectsPreLock") : open();
    case "team":
      return ctx.isEnrolled ? open() : lock("lockedTeamNotEnrolled");
    case "workspace":
      return ctx.isOnLockedTeam ? open() : lock("lockedWorkspaceNotReady");
    case "winners":
      return ctx.phase === "finalized" ? open() : lock("lockedWinnersPending");
  }
}

export function hubTabStates(ctx: HubViewerContext): HubTabState[] {
  return HUB_TAB_ORDER.map((key) => decide(key, ctx));
}
```

- [ ] **Step 4: Run, verify pass** — `pnpm exec vitest run src/server/hackathon/hub-tabs.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/hackathon/hub-tabs.ts src/server/hackathon/hub-tabs.test.ts
git commit -m "feat(hackathon): pure hub-tabs availability module (#hub)"
```

---

### Task 2: i18n keys for the hub

Add the tab labels + locked-panel reasons to both locale files (the project keeps `en.json` and `nl.json` key-symmetric).

**Files:** Modify `messages/en.json` and `messages/nl.json` (under the existing `hackathon` namespace).

- [ ] **Step 1:** Add these keys to the `hackathon` object in `messages/en.json` (and Dutch equivalents in `messages/nl.json` — translate the values, keep keys identical):

```jsonc
"tabOverview": "Overview",
"tabTimeline": "Timeline",
"tabProjects": "Projects",
"tabParticipants": "Participants",
"tabTeam": "My Team",
"tabWorkspace": "Workspace",
"tabAgents": "Agents",
"tabWinners": "Winners",
"lockedProjectsPreLock": "Projects appear once rosters lock and teams start submitting.",
"lockedTeamNotEnrolled": "Register for this hackathon to form or join a team.",
"lockedWorkspaceNotReady": "Your workspace opens when your team's roster is locked.",
"lockedWinnersPending": "Winners are announced when the results are finalized."
```

- [ ] **Step 2:** Verify key symmetry — both files parse and have identical key sets:

```bash
node -e "const e=require('./messages/en.json'),n=require('./messages/nl.json');const k=o=>{const s=new Set();(function w(x,p=''){for(const[a,b]of Object.entries(x)){s.add(p+a);if(b&&typeof b==='object')w(b,p+a+'.')}})(o);return s};const ek=k(e),nk=k(n);const d=[...ek].filter(x=>!nk.has(x)).concat([...nk].filter(x=>!ek.has(x)));console.log('asymmetric:',d.length, d.slice(0,10))"
```
Expected: `asymmetric: 0 []`.

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "i18n(hackathon): hub tab labels + locked-panel reasons (#hub)"
```

---

### Task 3: `LockedTabPanel` + `HackathonTabBar` components

The shared locked-state panel and the URL-driven tab bar (mirrors the `CommunityNav` `usePathname` pattern; styled with the existing `tabsListVariants` line variant).

**Files:**
- Create: `src/components/hackathon/hub/locked-tab-panel.tsx`
- Create: `src/components/hackathon/hub/hackathon-tab-bar.tsx`

- [ ] **Step 1: `LockedTabPanel`** — `src/components/hackathon/hub/locked-tab-panel.tsx`:

```tsx
import { Lock } from "lucide-react";

/** Empty-state shown for a hub tab whose content is not yet available. */
export function LockedTabPanel({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <Lock className="text-muted-foreground size-6" aria-hidden />
      <p className="text-muted-foreground max-w-sm text-sm">{message}</p>
    </div>
  );
}
```

- [ ] **Step 2: `HackathonTabBar`** — `src/components/hackathon/hub/hackathon-tab-bar.tsx`. A client component: given the slug, the tab states, and the localized labels, render a horizontal nav of `Link`s, highlighting the active segment via `usePathname`. Each tab maps to a route segment; the index (overview) has an empty segment.

```tsx
"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { HubTabKey, HubTabState } from "@/server/hackathon/hub-tabs";

const SEGMENTS: Record<HubTabKey, string> = {
  overview: "",
  timeline: "timeline",
  projects: "projects",
  participants: "participants",
  team: "team",
  workspace: "workspace",
  agents: "agents",
  winners: "winners",
};

export function HackathonTabBar({
  slug,
  tabs,
  labels,
}: {
  slug: string;
  tabs: HubTabState[];
  labels: Record<HubTabKey, string>;
}) {
  const pathname = usePathname();
  const base = `/events/${slug}`;

  return (
    <nav
      aria-label="Hackathon sections"
      className="flex gap-1 overflow-x-auto border-b"
    >
      {tabs.map((tab) => {
        const seg = SEGMENTS[tab.key];
        const href = seg ? `${base}/${seg}` : base;
        const active =
          seg === ""
            ? pathname === base
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "border-foreground text-foreground"
                : "text-foreground/60 hover:text-foreground border-transparent",
              !tab.available && "opacity-70",
            )}
          >
            {labels[tab.key]}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Typecheck** — `pnpm typecheck` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/hackathon/hub/locked-tab-panel.tsx src/components/hackathon/hub/hackathon-tab-bar.tsx
git commit -m "feat(hackathon): LockedTabPanel + URL-driven HackathonTabBar (#hub)"
```

---

### Task 4: `HackathonHeader` (server component)

The persistent header: cover image, title, phase badge, key facts (date/location). Composes the already-resolved `event` + `phase`. Reuse the existing event date/time display (`EventTimeDisplay`) and phase-badge styling from `hackathon-manage.tsx`.

**Files:**
- Create: `src/components/hackathon/hub/hackathon-header.tsx`

- [ ] **Step 1:** Implement a server component `HackathonHeader({ event, phase })` rendering: the cover image (if `event.media`), the title (`event.title`), a phase badge (map `phase` → label/colour, reuse the same mapping the manage page uses for its status badge), and a compact facts row (date via `EventTimeDisplay`, location). Keep it under ~70 lines; pull the phase-badge label/colour into a tiny local map. Follow the markup conventions of the existing `EventHero` (read `src/components/events/` for the hero component to match styling).

- [ ] **Step 2: Typecheck**, then **Commit**:

```bash
git add src/components/hackathon/hub/hackathon-header.tsx
git commit -m "feat(hackathon): HackathonHeader for the hub shell (#hub)"
```

> Implementer note: read `EventHero` and the manage-page status badge first; match their Tailwind/shadcn idiom. The header takes already-resolved props (no fetching) so the layout owns the single fetch.

---

### Task 5: The hub `layout.tsx`

The shell. Server component; resolves the event once (cached) and branches hackathon vs. regular.

**Files:**
- Create: `src/app/[locale]/events/[slug]/layout.tsx`
- Modify: `src/server/hackathon/resolve-public-hackathon.ts` (wrap the event fetch in React `cache()` so layout + page don't double-fetch — only if not already cached)

- [ ] **Step 1:** In `resolve-public-hackathon.ts`, wrap `findPublicEvent` (and/or `resolvePublicHackathonPage`) in React `cache()` (`import { cache } from "react"`) so repeated calls in one request (layout + page) hit once. Keep the exported names/signatures identical.

- [ ] **Step 2:** Create `src/app/[locale]/events/[slug]/layout.tsx` (server component):

```tsx
import { getTranslations } from "next-intl/server";

import { resolvePublicHackathonPage } from "@/server/hackathon/resolve-public-hackathon";
import { hubTabStates, type HubTabKey } from "@/server/hackathon/hub-tabs";
import { HackathonHeader } from "@/components/hackathon/hub/hackathon-header";
import { HackathonTabBar } from "@/components/hackathon/hub/hackathon-tab-bar";
import { getHubViewerContext } from "@/server/hackathon/hub-viewer";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: "en" | "nl"; slug: string }>;
}) {
  const { locale, slug } = await params;
  const resolved = await resolvePublicHackathonPage(slug, locale);

  // Regular event (or not found here) → no hub chrome; the page renders alone.
  if (!resolved.found) return <>{children}</>;

  const t = await getTranslations("hackathon");
  const viewer = await getHubViewerContext(resolved.challengeId, resolved.phase);
  const tabs = hubTabStates(viewer);
  const labels: Record<HubTabKey, string> = {
    overview: t("tabOverview"),
    timeline: t("tabTimeline"),
    projects: t("tabProjects"),
    participants: t("tabParticipants"),
    team: t("tabTeam"),
    workspace: t("tabWorkspace"),
    agents: t("tabAgents"),
    winners: t("tabWinners"),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <HackathonHeader event={resolved.event} phase={resolved.phase} />
      <div className="mt-6">
        <HackathonTabBar slug={slug} tabs={tabs} labels={labels} />
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3:** Create `src/server/hackathon/hub-viewer.ts` — `getHubViewerContext(challengeId, phase)`: resolves the current session user (via the server auth helper used elsewhere — check how server components read the session, e.g. `auth()` / `getServerSession`), then computes `{ phase, isEnrolled, isOnLockedTeam }` from `challengeEnrollments` (enrolled = a row for this user+challenge; onLockedTeam = that enrollment has a `teamId` whose team `status = "locked"`). Anonymous viewer → `{ phase, isEnrolled: false, isOnLockedTeam: false }`. Keep it server-only.

> Implementer note: find how an existing server component reads the logged-in user (grep for the session helper used in `src/app/[locale]/events/[slug]/page.tsx` or the members page). Mirror it. The enrollment/team queries mirror the ones in the hackathon router.

- [ ] **Step 4: Typecheck**, run `pnpm test`, then **Commit**:

```bash
git add "src/app/[locale]/events/[slug]/layout.tsx" src/server/hackathon/hub-viewer.ts src/server/hackathon/resolve-public-hackathon.ts
git commit -m "feat(hackathon): hub layout shell (hackathon vs regular event) (#hub)"
```

- [ ] **Step 5: Manual check** — start the dev server against the local stack and confirm: a hackathon event shows header + tab bar; a regular event shows the plain page with no tab bar; the active tab highlights as you navigate. (Use the lifecycle smoke approach from the project's `verify` flow.)

---

### Task 6: Route moves + redirects

Relocate the workspace and gallery to their new segments, add the gallery redirect, and update internal links. (Overview stays at the index; Winners stays at `/winners`.)

**Files:**
- Move: `src/app/[locale]/events/[slug]/team/page.tsx` content → `src/app/[locale]/events/[slug]/workspace/page.tsx`
- Move: `src/app/[locale]/events/[slug]/gallery/page.tsx` → `src/app/[locale]/events/[slug]/projects/page.tsx`
- Create: `src/app/[locale]/events/[slug]/gallery/page.tsx` (redirect to `/projects`)
- Modify: links pointing at `/team` (workspace) and `/gallery` (e.g. in `TeamLeaderboard`, `HackathonPanel`)

- [ ] **Step 1:** Move the workspace page file to `workspace/page.tsx` (same content; update any self-referential paths). The old `/team` segment will be re-created as the My Team tab in Task 9 — do NOT leave a stale workspace at `/team`.
- [ ] **Step 2:** Move the gallery page to `projects/page.tsx`. Create `gallery/page.tsx` as a redirect:

```tsx
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

export default async function GalleryRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  redirect({ href: `/events/${slug}/projects`, locale });
}
```

- [ ] **Step 3:** Grep for `/team` and `/gallery` link references in `src/components/hackathon/` and update: workspace links → `/events/[slug]/workspace`; gallery links → `/events/[slug]/projects`.
- [ ] **Step 4:** Typecheck + `pnpm test`. **Commit**:

```bash
git add -A
git commit -m "refactor(hackathon): move workspace→/workspace, gallery→/projects (+redirect) (#hub)"
```

---

## Phase B — Tab pages (fan-out; Workflow-eligible)

Each task below builds one tab's `page.tsx` under `src/app/[locale]/events/[slug]/<segment>/`. They share the contract from Phase A: the layout already renders the header + tab bar; each page renders only its tab body, and when its `hubTabStates` entry is `available: false` it renders `<LockedTabPanel message={t(reasonKey)} />` instead of its content. All are server components using `resolvePublicHackathonPage` (cached) + `getHubViewerContext`. These are independent (different files) and can run in parallel.

> Per-task contract (applies to all): resolve the event (cached); if `!found` → `notFound()`; compute `viewer`/`tabs`; find this tab's state; if not `available`, render `LockedTabPanel` with `t(state.lockedReasonKey)`; else render the body described. Add a focused test only where there is non-trivial pure logic (most tab bodies are composition of already-tested components/queries).

### Task 7: Overview tab (slim `page.tsx`)
Slim the existing `src/app/[locale]/events/[slug]/page.tsx` to the overview body: hero details/about/speakers/image-gallery (keep the regular-event rendering intact — this file still serves non-hackathon events, which get no tab bar from the layout), plus a **Prizes block** (challenge `rewards`: xp/sponsor/badge) for hackathons, and the register/enroll CTA. Remove the `HackathonPanel` mount (its pieces move to Tasks 8–9). Acceptance: regular events render unchanged; hackathon overview shows details + prizes + CTA; no leftover team-formation UI here.

### Task 8: Participants tab (`/participants`)
Compose: enrolled people / attendees (reuse `EventAttendees`), teams with member faces + the leaderboard (reuse `TeamLeaderboard`), and the **Matchmaking** section (the looking-for-team opt-in + skill-filterable list extracted from `HackathonPanel`, active only in forming/live via the existing `hackathon.lookingForTeamList` gating). Acceptance: people + teams + leaderboard render; matchmaking opt-in/list shows in live and is absent/closed at lock+.

### Task 9: My Team tab (`/team`)
Extract from `HackathonPanel` the create/join cards, roster + join code + leave/disband, and the captain submission form, plus the `TeamGridProgress` bar and an "Open Workspace →" link to `/workspace`. Gate via the `team` tab state: non-enrolled → `LockedTabPanel(lockedTeamNotEnrolled)` with an enroll CTA. Acceptance: matches today's HackathonPanel team behavior across forming/locked/finalized, now on its own route; `HackathonPanel` is deleted once Tasks 8–9 absorb it.

### Task 10: Workspace tab (`/workspace`)
Already moved in Task 6. Wrap its render in the `workspace` tab-state gate: not on a locked team → `LockedTabPanel(lockedWorkspaceNotReady)`. Keep the existing pre-lock briefing / post-lock grid behavior. (When Plan 1's manual-progress UI lands, the board renders `progressStatus`; that's a later UI task, not here.) Acceptance: members of a locked team see the grid; others see the locked panel.

### Task 11: Projects tab (`/projects`)
Already moved in Task 6. Wrap in the `projects` tab-state gate: live → `LockedTabPanel(lockedProjectsPreLock)`; locked/finalized → the existing `ProjectGallery` (+ People's Choice voting as today). Acceptance: live shows the locked panel; locked shows submitted projects + voting; finalized shows the People's Choice badge.

### Task 12: Winners tab (`/winners`)
Adapt the existing winners page to render inside the shell and use the `winners` tab-state gate: pre-finalized → `LockedTabPanel(lockedWinnersPending)` (replacing today's `redirect`); finalized → the existing podium + People's Choice + all-teams table. Acceptance: pre-finalized shows the locked panel (no redirect); finalized shows the winners content.

### Task 13: Timeline tab (`/timeline`)
New. Render a vertical timeline of milestones — Registration (live), Kickoff (event start), Rosters lock, Submissions, Results — with the current `phase` highlighted, each timestamp shown in the event's timezone + viewer-local (reuse `EventTimeDisplay` / the H5 timezone helpers). Extract the "phase → milestone status" mapping into a small pure helper `src/server/hackathon/timeline.ts` with unit tests (it's the only non-trivial logic here). Acceptance: milestones render in order with the right one marked current for each phase.

(The **Agents tab** `/agents` is built in Plan 3, which composes the tool catalog + connect guide + the `agentStats` roster from Plan 1.)

---

## Self-Review

**Spec coverage (design Part A + E):** layout shell + hackathon/regular branch (Task 5) ✓; 8 tabs always-visible with locked states (Task 1 module + per-tab gates) ✓; URL-based tabs under shared layout (Tasks 3, 5) ✓; route moves + redirect, `/team` repurposed (Task 6 + 9) ✓; HackathonPanel decomposed into My Team + Participants (Tasks 8–9) ✓; Overview slimmed, regular events untouched (Task 7) ✓; Timeline from phase + timezone (Task 13) ✓; cached resolver to avoid double-fetch (Task 5) ✓. Agents tab → Plan 3 (noted).

**Placeholder scan:** Phase A (Tasks 1–6) is complete copy-paste code, except Tasks 4 and 5-Step-3 (`HackathonHeader`, `getHubViewerContext`) which give precise specs + a named existing pattern to mirror rather than inventing markup/session-plumbing blind — flagged as implementer notes, not silent gaps. Phase B tasks are deliberately specified as composition-of-existing-components contracts (route, components to reuse, gate, acceptance) because their bodies are existing, already-tested UI being re-homed; each names exactly what to compose and its gate. The one piece of genuinely new logic (Timeline's phase→milestone map) is carved out as a unit-tested pure helper.

**Type consistency:** `HubTabKey` / `HubTabState` / `HubViewerContext` / `hubTabStates` / `HUB_TAB_ORDER` (Task 1) are used identically in the tab bar (Task 3) and layout (Task 5). `lockedReasonKey` values (`lockedProjectsPreLock`, `lockedTeamNotEnrolled`, `lockedWorkspaceNotReady`, `lockedWinnersPending`) match the i18n keys added in Task 2 and consumed via `t(reasonKey)` in Phase B. `resolvePublicHackathonPage` return shape (`{found, event, challenge, challengeId, phase}`) is used consistently in the layout and every tab page.
