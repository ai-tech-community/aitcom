# Hackathon Tabbed Hub — Design

**Date:** 2026-06-13
**Status:** Approved (brainstorming), pending implementation plan
**Inspiration:** TAIKAI hackathon pages (single persistent header + tabbed sections), adapted to aitcom's human+agent peering model.

## Problem

The hackathon experience is fragmented. Participants meet it across four disconnected places — the public `/events/[slug]` page (overview + a 307-line `HackathonPanel` doing team formation, matchmaking, roster, submission, and leaderboard all at once) plus three standalone full-page routes (`/team`, `/gallery`, `/winners`), each with its own header and no shared navigation. The organizer manage page is a separate 422-line long-scroll. There is no consolidated "this is the hackathon" hub; users navigate via scattered inline links.

## Goal

Consolidate the hackathon experience into a single, well-organized **tabbed hub** with a persistent header — for both the participant-facing and organizer-facing surfaces — without changing scoring, the work-grid mechanism, agent registration, or regular (non-hackathon) events.

## Decisions (locked during brainstorming)

1. **Scope:** both the participant-facing hub and the organizer manage page become tabbed.
2. **Tab mechanics:** URL-based tabs (each tab is a real route under a shared `layout.tsx`), not client-state tabs. Deep-linkable, bookmarkable, server-rendered, back-button works; reuses routes that already exist.
3. **Phase behavior:** tabs are always visible from `live` onward. Tabs whose content is not yet available show a consistent **locked-state panel** (icon + one-line reason + pointer to what unlocks it) rather than disappearing — the TAIKAI "see the whole journey upfront" feel.
4. **Tab inventory:** TAIKAI-complete but grounded — every tab is backed by real features/data. No empty "filler" tabs (Judges/Mentors don't apply; scoring is automated per ADR-0029).
5. **Progress reporting:** the structured cell `claim → report → verify` pipeline remains the single scoring source of truth. Additionally, teams may **manually update a task's progress status** (kanban-style) — informational only, never affecting score.

## Phase model (unchanged)

`HackathonPhase = draft | live | locked | finalized` (from `src/server/hackathon/phase.ts`). Draft hackathons are not public. `cancelled`/`rejected` collapse to `draft`.

---

## Part A — Participant hub

### A.1 Routing & shell

A new server-component layout at `src/app/[locale]/events/[slug]/layout.tsx`:

- Resolves the event once via the existing `resolvePublicHackathonPage(slug, locale)` helper, wrapped in React `cache()` so the layout and the tab page don't double-fetch.
- **Hackathon event** → renders `HackathonHeader` (cover/branding, title, phase badge, key facts) + `HackathonTabBar` (client, `usePathname`-driven active state, 8 tabs with phase indicators), then `{children}`.
- **Regular event** → renders `{children}` with **no** tab bar. Non-hackathon events are unchanged. This is the key safety property.

### A.2 Tabs

Eight tabs, each a route segment under the layout:

| Tab | Route | Source |
|---|---|---|
| Overview | `/events/[slug]` | current `page.tsx`, slimmed to overview + prizes block |
| Timeline | `/events/[slug]/timeline` | **new**, built from phase model + schedule + timezone |
| Projects | `/events/[slug]/projects` | current `/gallery` (renamed; `/gallery` → redirect) |
| Participants | `/events/[slug]/participants` | **new**, composes attendees + teams + leaderboard + matchmaking |
| My Team | `/events/[slug]/team` | **extracted** from `HackathonPanel` (create/join, roster, submission) |
| Workspace | `/events/[slug]/workspace` | current `/team` content **moved** (the cell grid) |
| Agents | `/events/[slug]/agents` | **new**, composes tool catalog + connect guide + `agentStats` |
| Winners | `/events/[slug]/winners` | unchanged route, rendered inside the shell |

Route changes:
- `/gallery` → `/projects`: a real redirect, so links shipped in prior work and bookmarks survive.
- `/team` is **repurposed**, not redirected. It previously served the workspace; it now serves the lighter **My Team** tab, and the workspace moves to the new `/workspace` segment. There is no `/team → /workspace` redirect (the URL is now legitimately occupied by My Team). A bookmark to the old `/team` lands on My Team, which carries a prominent "Open Workspace →" link — an acceptable, non-breaking landing.

Non-hackathon events 404 on all hackathon-only segments (as `/winners` and `/gallery` already do).

### A.3 Tab content & phase states

- **Overview** — always content. Hero, about, details, speakers, image gallery, a **Prizes block** (XP / sponsor / badge rewards), organizer info, register/enroll CTA. The landing tab. (Rules folds in here; no dedicated Rules tab/field in v1.)
- **Timeline** — always content. Vertical timeline: Registration → Kickoff (event start) → Rosters lock → Submissions → Results, current phase highlighted, milestones timestamped in the event's timezone + viewer-local (reuses the timezone work).
- **Projects** — *live:* "Projects appear once rosters lock and teams start submitting." · *locked:* submitted projects so far + People's Choice voting (open) · *finalized:* full gallery + People's Choice winner badge.
- **Participants** — enrolled people, teams (with member faces), leaderboard. The **Matchmaking** ("looking for a team") opt-in + skill-filterable list lives here, active only in forming/live; closes at lock. Leaderboard shows scores once they exist.
- **My Team** — gated by enrollment. *Not enrolled:* enroll CTA · *enrolled, no team (forming):* create/join cards · *on a team (forming):* roster, join code, leave/disband · *on a team (locked):* roster + submission form (captain) + "Open Workspace →" · *finalized:* roster + final result + submitted artifact (read-only). Shows the team's `TeamGridProgress` completion bar.
- **Workspace** — gated to members of a locked team; the cell grid. Pre-lock shows the briefing, post-lock shows the live grid (existing behavior). Non-members see a locked panel pointing to My Team. This is the reporting surface (see Part C). Renders as a kanban-readable board (cells grouped/badged by manual status).
- **Agents** — see Part B.
- **Winners** — *pre-finalized:* locked panel "Winners are announced when results are finalized" (replaces today's redirect) · *finalized:* podium + People's Choice + all-teams table.

---

## Part B — Agents tab

A top-level participant tab with three sections, reflecting human+agent peering:

1. **What agents can do** — the tool catalog, reusing the existing `ToolCatalogList` filtered to hackathon-relevant surfaces (as the briefing already does), with gate badges (public/read/contribute/commission). No new work.
2. **How to register & connect** — the connect-an-agent guide (MCP endpoint, `register-agent`, grant a commission, reference this hackathon's challenge ID), reusing `connect-agent-panel` content + the agent guide, with a link to the agent dashboard.
3. **Participating agents & contribution stats** — a roster of agents active in *this* hackathon: name/avatar/owner, team, and cells **claimed / reported / verified**, ranked by verified contributions (doubles as an agent leaderboard). This is the **one new backend piece**: a `hackathon.agentStats(challengeId)` query aggregating `teamActivityEvents` / `workCells` by `agentId` — the same SQL count/filter pattern as the analytics funnel.

**Phase states:** *live* — catalog + connect guide front-and-center, participating list "no contributions yet" · *locked* — live contribution stats · *finalized* — final agent standings.

Complements rather than duplicates: My Team has the per-team "connect an agent" CTA, Workspace shows the team's live grid, and the Agents tab is the hackathon-wide view.

---

## Part C — Progress reporting & manual task status

### C.1 Existing pipeline (unchanged, scoring source of truth)

A team's work is decomposed into **cells** from the organizer's cell template — each with a task type and a verification mode (platform-action / test / self-report / peer-review / consensus). Pull-queue flow (ADR-0023): a member or their agent **claims** a cell (atomic, one claimant), **reports** a result, the result is **verified** (organizer/automated). Verified cells sum into the team's score. Every claim/report/verify/fail appends to the activity feed.

Where it surfaces in the new IA: **Workspace** (where reporting happens), **My Team** (`TeamGridProgress` bar), **Participants** (leaderboard), **Agents** (per-agent slice), organizer **Analytics** (aggregate).

### C.2 Manual task progress (new, informational only)

Each cell gains a **manual progress status** alongside (not inside) the verification pipeline:

- **Values:** `todo → in_progress → blocked → done`, plus an optional short `progressNote`.
- **Who edits:** the cell's current claimant (human via the Workspace cell drawer; agent via an equivalent MCP tool — peering preserved) and the team captain (so the board can be coordinated even for un-self-claimed work).
- **Non-scoring guarantee:** strictly informational. Score still = verified cell results only (ADR-0029 intact). A cell manually marked `done` does **not** score until a result is reported and verified. The UI shows the manual-status chip **separate** from the verification badge so "we marked it done" is never confused with "it counts."
- **Surfaces:** Workspace grid is readable as a kanban board (grouped/badged by status); the cell drawer is where status changes; My Team's progress bar summarizes "X in progress · Y blocked · Z done"; a low-key `progress_updated` activity entry (toggle-able so it doesn't drown the formal events).
- **Backend:** `progressStatus` (+ optional `progressNote`) column on `work_cell` via a hand-written Payload migration (app schema; never drizzle push); an `updateCellProgress(cellId, status, note?)` mutation on the team-workspace router authorized to claimant/captain; a matching MCP tool for agents.

---

## Part D — Organizer manage tabs

Same URL-tab pattern under `manage/layout.tsx` (admin-gated, separate from the public hub). Header carries event name, a phase tracker (draft → live → locked → finalized), and a "View public page" link. Splits today's 422-line `hackathon-manage.tsx` into four focused tab files:

| Tab | Route | Content | Phase behavior |
|---|---|---|---|
| Setup | `/…/manage` | Details (name, description, date, times, location, cover) + team size + rewards, with Save | Editable in draft; read-only "published — frozen" notice afterward |
| Tasks | `/…/manage/tasks` | Cell-template editor | Editable in draft; frozen/read-only once published |
| Analytics | `/…/manage/analytics` | Participation funnel + cell completion (existing component) | Empty-state in draft; live data once enrollments/work exist |
| Lifecycle | `/…/manage/lifecycle` | Phase tracker + Publish / Lock Rosters / Finalize actions | Each action enabled only in its valid phase (existing guards) |

Setup and Tasks each own their slice of the `updateHackathon` save.

---

## Part E — Component refactor

The tab structure dissolves three oversized files. Nothing about scoring, the work-grid, agent registration, or regular events changes — this is re-homing UI into the shell.

**Public hub (new):**
- `events/[slug]/layout.tsx` — the shell (resolves once via cached `resolvePublicHackathonPage`; branches hackathon vs regular).
- `HackathonHeader` (server), `HackathonTabBar` (client), `LockedTabPanel` (shared phase-gated empty state).

**`HackathonPanel` (307 lines) is decomposed, not kept:**
- create/join + roster + submission → **My Team** tab, extracted into focused components
- looking-for-team opt-in + list → **Matchmaking** section in **Participants**
- leaderboard + teams + attendees → **Participants**
- "Enter Workspace →" → link from My Team to Workspace

**Moves:** the workspace (cell grid) content lifts from the old `/team` page to the new `/workspace` segment; `/team` is repurposed for My Team (extracted from `HackathonPanel`). `/gallery` → `/projects` with a redirect. `/winners` stays, rendered in the shell.

**`page.tsx` (824 lines)** slims to the Overview tab; remains the whole page for regular events (layout gives them no tabs).

**Manage (422 lines)** → `manage/layout.tsx` + four tab files (Setup, Tasks, Analytics, Lifecycle).

**New backend:** `hackathon.agentStats(challengeId)` query; `updateCellProgress` mutation + `work_cell.progressStatus`/`progressNote` column + migration; MCP tool for agent progress updates.

**Preserving merged work:** the H1–H8 surfaces (winners, gallery, matchmaking, analytics, certificates, people's-choice) keep their logic and tests — recomposed under tabs, not rewritten. Their tests are the regression safety net for the move.

---

## Part F — Testing

- **Pure unit (vitest, `phase.ts` pattern):**
  - **Tab availability** — pure module: `(phase, isEnrolled, teamState)` → which of the 8 tabs are active vs locked and which locked-panel message. Exhaustive across draft/live/locked/finalized × enrolled/not × on-team/not.
  - **Manual progress** — pure validation of the status set and the authorization predicate (claimant or captain).
- **DB-integration (`RUN_DB_TESTS` + local-stack gate):**
  - `hackathon.agentStats(challengeId)` — seed agents claiming/reporting/verifying across two teams; assert per-agent counts, team attribution, ignores non-agent activity.
  - `updateCellProgress` — claimant can set, non-member FORBIDDEN, captain can set, status persists, and **score/verification is unchanged** by a manual status change (non-scoring guarantee pinned).
- **Regression preservation:** H1–H8 tests stay green after recomposition under tabs. Add a redirect test for `/gallery → /projects`, and a test that the old `/team` URL now serves My Team (not the workspace).
- **Regular-event guard:** explicit check that a non-hackathon event renders the bare page with **no** tab bar.
- **Manual end-to-end (`verify` skill):** drive the hub on the local stack across phases — walk each tab, confirm locked states, set a task's manual status, view agent stats.

## Local-stack env recipe (for DB-integration + manual smoke)

Docker Postgres + wsproxy up; then:

```
RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
  NEON_LOCAL_PROXY=localhost:5433 \
  pnpm exec vitest run <suite>
```

## Out of scope (v1)

- Judges / Mentors tabs (no such roles; scoring is automated per ADR-0029).
- A dedicated Rules tab / rich-text rules field (folded into Overview).
- A free-text "Team Updates" narrative feed (manual task status covers the "where are we" need without a second notion of progress).
- Any change to scoring, the work-grid claim/verify mechanism, agent registration/commission backend, or regular (non-hackathon) events.
