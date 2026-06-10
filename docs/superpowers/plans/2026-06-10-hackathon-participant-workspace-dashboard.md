# Hackathon Participant Workspace — Public Dashboard (Plan 6) Implementation Plan

> **For agentic workers:** Built via the Workflow agent-manager. UI is typecheck-only (Plan 3/5 convention). Verification: `pnpm check` + valid JSON. Agents create files; the orchestrator commits.

**Goal:** Finish the spectator/dashboard layer on the public event page: a content-free per-team status heatmap (the "watch the race" view), an "Enter your team workspace →" entry point for logged-in members, and the two ADRs recording the decisions this feature made.

**Architecture:** A new read-only `TeamHeatmapPublic` client component renders `hackathon.teamHeatmap` (content-free `{ heatState }[]`) reusing the Plan 5 colour map — no click, no content. It is shown per team in the leaderboard. `HackathonPanel` gains an `eventSlug` prop so it can link members to `/events/[slug]/team`. ADR-0030 is amended; a new ADR records human-claimable cells.

**Spec:** `docs/superpowers/specs/2026-06-10-hackathon-participant-workspace-design.md`
**Depends on:** Plan 4 (`hackathon.teamHeatmap`) + Plan 5 (`cell-heat` colour map, the workspace route) — both on this branch.

---

## Task A (parallel): `TeamHeatmapPublic` — content-free spectator heatmap

**Files:** Create `src/components/hackathon/team-heatmap-public.tsx`.

`"use client"`. Props: `{ teamId: string }`.
- Query: `api.hackathon.teamHeatmap.useQuery({ teamId }, { refetchInterval: 5_000 })` → `{ heatState }[]` (NO ids, NO content).
- Render a compact flex-wrap row of small squares (e.g. `h-3 w-3 rounded-sm`), colour from the shared `HEAT_CLASS` map in `src/components/hackathon/workspace/cell-heat.ts`. No tooltip text beyond the state label is required; **no onClick, no content** — this is the spectator projection.
- Render nothing if the array is empty.
- This is read-only and public-safe: it only ever receives `{ heatState }`.

**Verify:** `pnpm typecheck`.

---

## Task C (parallel): ADRs

**Files:** Amend `docs/adr/0030-spectator-view-shows-the-race-not-the-work.md`; create `docs/adr/0033-a-work-cell-may-be-claimed-by-a-human-team-member.md`.

Read `docs/adr/0030-*.md` and `docs/adr/0032-*.md` first for the exact ADR format/headers used in this repo, then:

1. **Amend ADR-0030**: add a dated amendment section noting that the spectator view may now show a **content-free per-cell status heatmap** (the colour/shape of each cell's progress), not only aggregate counts — cell *content/output* remains private to the team. Keep the original decision text; append the amendment.
2. **New ADR-0033** ("A work cell may be claimed by a human team member"): record that work cells, originally agent-only (claimable only by a commissioned agent, ADR-0022/0023), may now be claimed and have results authored by a **human team member** as a peer to agents on a competitive grid. Note the consequences: `workCells.claimedByUserId` / `workCellResults.userId` (agent OR user, never both); the atomic claim prevents human/agent double-claim; organizer verification + scoring count verified results regardless of author. Match the repo's ADR template (status: accepted, date 2026-06-10, context/decision/consequences).

**Verify:** markdown only; no build impact.

---

## Task B (integration): wire into `HackathonPanel` + event page

**Files:** Modify `src/components/hackathon/hackathon-panel.tsx`; `src/components/hackathon/team-leaderboard.tsx` (if that's where teams are listed); `src/app/[locale]/events/[slug]/page.tsx` (pass `eventSlug`). Depends on Task A.

1. **`HackathonPanel`**: add an `eventSlug: string` prop. When the caller has a team (`myTeam` is non-null), render an "Enter your team workspace →" link/button (`t("enterWorkspace")`) pointing to `/events/${eventSlug}/team` (use the app's locale-aware `Link` from the same import other panel links use). Place it in the member's team card.
2. **Per-team progress on the dashboard**: in `TeamLeaderboard` (which already lists teams with `teamId`), render `<TeamHeatmapPublic teamId={t.teamId} />` for each team row so spectators see each team's progress shape. (If `TeamLeaderboard` doesn't expose teamId per row, add it from the existing `teamLeaderboard` query data.)
3. **Event page**: where `<HackathonPanel challengeId=... />` is mounted in `events/[slug]/page.tsx`, pass `eventSlug={slug}` (the route already has `slug`).

**Verify:** `pnpm typecheck`, `pnpm check`.

---

## Task D: full verification

- `pnpm check` → PASS.
- `node -e "require('./messages/en.json'); require('./messages/nl.json')"` → valid (the `enterWorkspace` key already exists from Plan 5; add it only if missing).
- Commit any fixes.

---

## Done = the full feature
After Plan 6: participants get a private workspace (Plan 5) over a backend where humans and agents are peers (Plan 4); spectators get a live, content-free dashboard (Plan 6); decisions are recorded (ADRs). Ready for `finishing-a-development-branch`.
