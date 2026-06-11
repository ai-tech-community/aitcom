# Hackathon Participant Workspace — Design

**Date:** 2026-06-10
**Status:** Approved (brainstorming) — ready for implementation planning
**Related ADRs:** 0023 (work-grid), 0022 (commission envelope), 0029 (team binding), 0030 (spectator view shows the race, not the work), 0031 (role-scoped operation), 0032 (objectives optional)

## Problem

The hackathon layer today covers spectators, team formation, and organizer
management — but there is **no space where the people on a team actually work**.
Participants can create/join a team and the captain can submit one artifact, but
there is no view of the team's tasks, no way for a human to claim and report a
cell, and no way to bring an agent onto the team's grid through the product.

Today the work grid is **agent-only**: `claimCell` / `submitCellResult` are
`agentProcedure`s requiring an active commission, and `workCells.claimedBy` is a
foreign key to `agentProfiles.id`. Humans cannot act on a cell at all.

## Goal

Give each team a private **workspace** where members see their tasks, split the
work, and progress them — with humans and their own agents contributing as peers
to the same cells (a human reports a physical robotics build; an agent runs tests
or research; both move the same board). Pair it with a public **dashboard** where
everyone watches every team's progress and the leaderboard.

## Core decisions

1. **Humans and agents are peers on the same cells** (chosen over a synthetic
   "human-proxy agent" or a parallel human-submission table). A cell is claimed
   by *either* an agent *or* a user; a result is authored by *either*. Organizer
   verification and team scoring are unchanged — they count *verified results*
   regardless of author.
2. **Two surfaces:** a private team-only workspace route and the existing public
   event page upgraded into a dashboard.
3. **Polling, not realtime subscriptions** — "live enough" via interval refetch;
   no new websocket/SSE infra.

## Surface A — Team Workspace

**Route:** `/events/[slug]/team` (new, private).

- **Access:** members only, gated by team membership (`ownerOnTeam`: an active
  `challengeEnrollment` carrying the team's `teamId`). Non-members are redirected
  to the public event page.
- **Lifecycle:** cells exist only after `lockRosters` spawns the team's
  competitive grid. Before lock, the route shows "team forming — workspace opens
  when the hackathon starts."
- Contains: the cell heatmap, the activity feed, the presence strip, and a
  "Connect an agent" panel.

### Cell board (heatmap matrix)

The grid is literally made of cells, so the visual is a GitHub-contribution-style
heatmap matrix.

- Each square = one work cell. **Color encodes state**, not volume:
  - grey/empty = `pending` (unclaimed)
  - light green = `claimed` (a human or agent is on it)
  - medium green = `completed`, awaiting organizer verification
  - dark green = `verified` (counts toward score)
  - red/amber accent = `failed` / `requeued`
- A legend reads "Pending → Verified".
- Squares are **grouped into rows by `taskType`** (e.g. a robotics row, a research
  row, a testing row) so the matrix reads as *tasks × their cells*.
- **Click a square → cell detail drawer:** description, task type, verification
  mode, assignee + claimant (human avatar or agent badge), the report/submit
  field, the current result, and the cell's recent activity.

### Collaboration model

- **Assign (soft):** any member can assign a cell to a teammate
  (`assignedToUserId`). Planning only, no lock — this is how the team splits work.
- **Claim (hard):** when work starts, a member or their agent claims the cell,
  locking it to one worker so it isn't double-done. Reuses existing claim
  semantics via a human path (`claimedByUserId`).
- **Report:** a human enters a result (text + optional URL, e.g. "robot arm
  assembled, video here"); the cell flips `claimed → completed` with a
  human-authored `workCellResult`. Identical shape to an agent's
  `submitCellResult`.
- **Verify:** organizer verifies via the unchanged `verifyCellResult` →
  `verified` → scored.

### Bring your own agent

- A "Connect an agent" panel surfaces the team's MCP connection info + per-cell
  task list. A member points their own agent (Claude, a robotics controller, a
  test runner) at it via the existing MCP flow; the agent claims cells and reports
  results exactly as today.
- No new agent plumbing. The agent's commission already source-scopes to the team
  (`ownerOnTeam` competitive gate, ADR-0029), so an agent can only touch its
  owner's team's cells.

**Example cell lifecycle:** assigned to Maya → Maya's robot agent claims it → does
the build steps → Maya reports the physical result → organizer verifies.

## Surface B — Hackathon Dashboard

**Route:** the existing public event page `/events/[slug]`, enhanced (current
`HackathonPanel` + `TeamLeaderboard`).

- Public (spectators + participants). Shows the leaderboard with live
  ranks/scores and, for each team, a **content-free status heatmap** — the same
  matrix shape, colored by per-cell state, with **no labels, descriptions, or
  outputs**.
- Logged-in team members see a prominent "Enter your team workspace →" button.
- **Privacy line:** the dashboard shows *how far* each team has gotten; the
  workspace shows *what* the cells are. Rivals never see another team's cell
  content.
- **ADR-0030 update:** ADR-0030 currently grants spectators *counts only*. A
  per-cell status heatmap is slightly richer — it reveals individual cell *states*
  (never content). This is a deliberate, approved loosening; record it as an
  ADR-0030 amendment (or a new ADR superseding the counts-only clause).

## Data model & backend

### Schema (additive migration; hand-written Payload-style migration applied via `db:apply`, per project convention — drizzle is vestigial)

- `workCells`:
  - add `assignedToUserId` (FK → user, nullable)
  - add `claimedByUserId` (FK → user, nullable); keep agent `claimedBy`
  - invariant (app-level): claimed by an agent **or** a user, never both
- `workCellResults`:
  - add `userId` (FK → user, nullable); make `agentId` nullable
  - a result is authored by an agent **or** a user
  - rework `unique(cellId, agentId)` so a human result does not collide on null —
    likely `unique(cellId)` (competitive grids are single-claimer; the
    `finalizeHackathon` scoring already assumes one result per cell)
- New `teamActivityEvents` table:
  `(id, teamId, cellId, actorUserId | actorAgentId, type, createdAt)` where
  `type ∈ assigned | claimed | reported | verified | failed`. Append-only.
- New `teamPresence` table: `(teamId, userId, lastSeenAt)`, upserted by heartbeat.

### Shared gating

Extract the existing private `ownerOnTeam` helper from `work-grid.ts` into a
shared module (e.g. `src/server/hackathon/team-membership.ts`) so the workspace
router and work-grid router share one source of truth.

### New `teamWorkspace` tRPC router (all `protectedProcedure`, team-membership gated)

- `cells(teamId)` — the team's grid cells **with content** + results +
  assignee/claimant. (Today's admin-only `getGrid` and content-free
  `teamGridStatus` don't provide a participant read.)
- `assignCell({ cellId, userId | null })` — soft assignment; appends activity.
- `claimCellAsMember({ cellId })` — atomic claim mirroring agent `claimCell`
  (same competitive team-scope guard, same fresh-deadline arming via
  `deadlineMinutes`); appends activity.
- `reportResult({ cellId, output })` — human analogue of `submitCellResult`
  (flips `claimed → completed`, inserts a user-authored result); appends activity.
- `releaseCell({ cellId })` (optional) — unclaim a mistakenly-claimed cell.
- `heartbeat({ teamId })` — upsert presence.
- `activity(teamId)` — recent `teamActivityEvents` for the feed.

### Dashboard procedure

- `teamHeatmap(teamId)` — `publicProcedure`, per-cell **status array** (no
  content) for the spectator heatmap; extends the existing `teamGridStatus`.

### Touch-ups to existing code

- `requeueExpiredCells` must also clear `claimedByUserId` (today it only clears
  the agent `claimedBy`) when a human-claimed cell's deadline lapses.
- `verifyCellResult` appends a `verified` / `failed` activity event.

### Unchanged

- `verifyCellResult` authorization (organizer/grid-admin scoped).
- All of `finalizeHackathon` scoring — it counts *verified results* regardless of
  author, so human-produced work scores identically.

## Live updates, activity, presence (polling)

- **Workspace:** `cells(teamId)` and `activity(teamId)` refetch (~5s); the heatmap
  recolors as cells change state. `heartbeat` fires (~20s).
- **Dashboard:** `teamLeaderboard` + `teamHeatmap` poll (~5s) so spectators watch
  the race move.
- **Presence:** a member is "online" if `lastSeenAt` is within ~45s; the workspace
  shows active-member avatars. Agents are not shown as present — their *activity*
  shows in the feed.
- **Why an activity table rather than deriving from timestamps:** assignment and
  agent actions don't all leave timestamps on the cell, and a single ordered log
  is far simpler to render than reconstructing order from scattered columns.

## Testing

- **Backend (heaviest coverage):** claim races (human-vs-human, human-vs-agent),
  team-scope rejection of non-members and rivals, the report → verify → score path
  with a human author, requeue clearing the human claim column, the
  agent-or-user (never both) invariants.
- **Components:** typecheck + light interaction tests (heatmap render, drawer
  actions), matching how the existing hackathon UI was built.

## Out of scope (deferred)

- Realtime websocket/SSE upgrades for specific surfaces (presence/cell status).
- In-app agent invocation (the app owning agent execution) — agents stay external
  MCP clients.
- Cron-driven roster lock at event start time (already a noted follow-up on
  `lockRosters`).
- Team-internal review/approval before organizer verification (verification stays
  organizer-scoped).

## New ADRs to record during implementation

- ADR-0030 amendment: spectator view may show a **content-free per-cell status
  heatmap**, not only counts.
- New ADR: **a work cell may be claimed/authored by a human team member, not only
  a commissioned agent** (humans and agents as peers on a competitive grid).
