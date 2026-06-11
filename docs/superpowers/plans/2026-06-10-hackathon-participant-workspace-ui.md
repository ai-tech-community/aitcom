# Hackathon Participant Workspace — UI (Plan 5) Implementation Plan

> **For agentic workers:** Implemented via the Workflow agent-manager (parallel leaf components → integration). Components follow the repo's hackathon-UI convention: **typecheck-only** (no unit tests), matching Plan 3 (commit d96b3f1). Verification is `pnpm typecheck` + `pnpm check` + render-correctness review.

**Goal:** Build the private team workspace UI at `/events/[slug]/team` — a heatmap matrix of the team's work cells, a cell drawer for assign/claim/report/release, a bring-your-own-agent panel, an activity feed, and a presence strip — all polling the Plan 4 `teamWorkspace` backend.

**Architecture:** A gated RSC route (`page.tsx`) resolves the session + team membership server-side (redirect non-members), then mounts a client `TeamWorkspace` composer. Leaf client components each own one tRPC query and poll via `refetchInterval`. A `heartbeat` mutation fires on an interval. All cell state colours come from the backend `heatState` field (single source of truth from `cell-state.ts`).

**Tech Stack:** Next.js App Router (RSC + client components), tRPC React (`@/trpc/react`), next-intl, shadcn/ui (`card`, `badge`, `sheet`, `avatar`, `tooltip`, `button`, `input`, `textarea`, `select`, `progress`, `spinner`), better-auth client.

**Spec:** `docs/superpowers/specs/2026-06-10-hackathon-participant-workspace-design.md`
**Depends on:** Plan 4 backend (`teamWorkspace` router, `hackathon.teamHeatmap`) — already merged on this branch.

---

## Conventions (all components)

- `"use client"` at top for every component in `src/components/hackathon/workspace/`.
- tRPC: `import { api } from "@/trpc/react";` — `api.teamWorkspace.X.useQuery({ teamId }, { refetchInterval })`, mutations via `useMutation({ onSuccess: () => { invalidate(); }, onError: e => toast.error(e.message) })`, `const utils = api.useUtils()`.
- Types: `import type { RouterOutputs } from "@/trpc/react";` then e.g. `type Cell = RouterOutputs["teamWorkspace"]["cells"][number];`.
- i18n: `const t = useTranslations("hackathon");` — all new strings use keys added in Task 1 (en + nl).
- Polling cadence: cells/activity/presence `refetchInterval: 5_000`; heartbeat mutation every `20_000`ms.
- Auth: `import { authClient } from "@/server/better-auth/client";` → `authClient.useSession()`.
- Toasts: `import { toast } from "sonner";`.

---

## Task 1: i18n keys (en + nl)

**Files:** `messages/en.json`, `messages/nl.json` (the `hackathon` object).

Add these keys to the `hackathon` namespace in BOTH files (Dutch translations for nl). Do not remove existing keys.

```
"workspaceTitle": "Team workspace"              (nl: "Teamwerkruimte")
"workspaceLocked": "The workspace opens when the hackathon starts and rosters lock."
                                                (nl: "De werkruimte opent zodra de hackathon start en de teams vastliggen.")
"tasks": "Tasks"                                (nl: "Taken")
"online": "Online"                              (nl: "Online")
"activity": "Activity"                          (nl: "Activiteit")
"assignTo": "Assign to"                         (nl: "Toewijzen aan")
"unassigned": "Unassigned"                      (nl: "Niet toegewezen")
"claim": "Claim"                                (nl: "Claimen")
"release": "Release"                            (nl: "Vrijgeven")
"report": "Report result"                       (nl: "Resultaat melden")
"reportPlaceholder": "Describe what you did (and paste a link if any)"
                                                (nl: "Beschrijf wat je deed (plak eventueel een link)")
"claimedBy": "Claimed by"                       (nl: "Geclaimd door")
"assignedTo": "Assigned to"                     (nl: "Toegewezen aan")
"connectAgent": "Connect an agent"              (nl: "Verbind een agent")
"connectAgentHelp": "Point your own agent at this hackathon over MCP. It can claim and complete cells alongside you."
                                                (nl: "Laat je eigen agent via MCP aan deze hackathon werken. Hij kan cellen claimen en afronden samen met jou.")
"cellPending": "Open"                           (nl: "Open")
"cellClaimed": "In progress"                    (nl: "Bezig")
"cellCompleted": "Awaiting review"              (nl: "Wacht op beoordeling")
"cellVerified": "Verified"                      (nl: "Geverifieerd")
"cellFailed": "Failed"                          (nl: "Mislukt")
"noActivity": "No activity yet."                (nl: "Nog geen activiteit.")
"enterWorkspace": "Enter your team workspace"   (nl: "Ga naar je teamwerkruimte")
"actClaimed": "claimed a cell"                  (nl: "claimde een cel")
"actReported": "reported a result"              (nl: "meldde een resultaat")
"actAssigned": "assigned a cell"                (nl: "wees een cel toe")
"actVerified": "had a cell verified"            (nl: "kreeg een cel geverifieerd")
"actFailed": "had a cell fail"                  (nl: "had een mislukte cel")
```

**Verify:** both files are valid JSON (`node -e "require('./messages/en.json'); require('./messages/nl.json')"`), `pnpm typecheck` passes.
**Commit:** `feat(hackathon): i18n keys for the participant workspace UI (Plan 5)`

---

## Task 2 (leaf, parallel): `CellHeatBox` + heat colour map

**Files:** Create `src/components/hackathon/workspace/cell-heat.ts` and `src/components/hackathon/workspace/cell-heat-box.tsx`.

`cell-heat.ts` — a pure map from `HeatState` to Tailwind classes (the GitHub-style ramp) + a label key:
```typescript
import type { RouterOutputs } from "@/trpc/react";
export type HeatState = RouterOutputs["teamWorkspace"]["cells"][number]["heatState"];

export const HEAT_CLASS: Record<HeatState, string> = {
  pending: "bg-muted",
  claimed: "bg-green-200 dark:bg-green-900",
  completed: "bg-green-400 dark:bg-green-700",
  verified: "bg-green-600 dark:bg-green-500",
  failed: "bg-red-300 dark:bg-red-900",
};
// i18n key per state for tooltips/legend
export const HEAT_LABEL_KEY: Record<HeatState, string> = {
  pending: "cellPending",
  claimed: "cellClaimed",
  completed: "cellCompleted",
  verified: "cellVerified",
  failed: "cellFailed",
};
```

`cell-heat-box.tsx` — one square. `"use client"`. Props: `{ cell: Cell; onClick: () => void }` where `type Cell = RouterOutputs["teamWorkspace"]["cells"][number]`. Renders a button sized like a heatmap square (`h-8 w-8 rounded`), `className` from `HEAT_CLASS[cell.heatState]`, wrapped in a `Tooltip` showing the translated `HEAT_LABEL_KEY` label. Clicking calls `onClick`.

**Verify:** `pnpm typecheck`. **Commit:** `feat(hackathon): cell heat box + colour map (Plan 5)`

---

## Task 3 (leaf, parallel): `TeamHeatmap`

**Files:** Create `src/components/hackathon/workspace/team-heatmap.tsx`.

`"use client"`. Props: `{ teamId: string; onSelectCell: (cellId: string) => void }`.
- Query: `api.teamWorkspace.cells.useQuery({ teamId }, { refetchInterval: 5_000 })`.
- Group cells by `taskType` into rows; each row labelled with the taskType and rendered as a horizontal wrap of `<CellHeatBox>` (one per cell), passing `onClick={() => onSelectCell(cell.id)}`.
- Show a `<Spinner>` while loading; render nothing meaningful (an empty-state line using `t`) if there are no cells.
- Include a small legend (the five `HEAT_LABEL_KEY` states with their colours).

**Verify:** `pnpm typecheck`. **Commit:** `feat(hackathon): team heatmap matrix grouped by task type (Plan 5)`

---

## Task 4 (leaf, parallel): `ActivityFeed`

**Files:** Create `src/components/hackathon/workspace/activity-feed.tsx`.

`"use client"`. Props: `{ teamId: string }`.
- Query: `api.teamWorkspace.activity.useQuery({ teamId }, { refetchInterval: 5_000 })`.
- Render a `Card` titled `t("activity")` with a `ScrollArea` list; each event row shows the actor (userId/agentId — display the raw id is acceptable for v1; prefer a name if trivially available, else id), a verb from the event `type` mapped to `actClaimed`/`actReported`/`actAssigned`/`actVerified`/`actFailed`, and a relative time. Empty → `t("noActivity")`.

**Verify:** `pnpm typecheck`. **Commit:** `feat(hackathon): team activity feed (Plan 5)`

---

## Task 5 (leaf, parallel): `PresenceStrip` + heartbeat hook

**Files:** Create `src/components/hackathon/workspace/presence-strip.tsx`.

`"use client"`. Props: `{ teamId: string }`.
- Query: `api.teamWorkspace.presence.useQuery({ teamId }, { refetchInterval: 5_000 })` → rows `{ userId, displayName, lastSeenAt }`.
- Heartbeat: `const heartbeat = api.teamWorkspace.heartbeat.useMutation();` fire once on mount and then `setInterval(() => heartbeat.mutate({ teamId }), 20_000)` inside a `useEffect` (clear interval on unmount).
- Render `t("online")` + an avatar row (`Avatar` with initials from `displayName`), each wrapped in a `Tooltip` of the name.

**Verify:** `pnpm typecheck`. **Commit:** `feat(hackathon): presence strip + heartbeat (Plan 5)`

---

## Task 6 (leaf, parallel): `ConnectAgentPanel`

**Files:** Create `src/components/hackathon/workspace/connect-agent-panel.tsx`.

`"use client"`. Props: `{ challengeId: number }`.
- A `Card` titled `t("connectAgent")` with help text `t("connectAgentHelp")`. Render the MCP connection hint. For v1, surface the same connection guidance the app already shows agents — if a constant/help component exists reuse it; otherwise render static instructional text + the challenge id. Do NOT invent backend; this is informational.

**Verify:** `pnpm typecheck`. **Commit:** `feat(hackathon): connect-agent panel (Plan 5)`

---

## Task 7 (integration): `CellDrawer`

**Files:** Create `src/components/hackathon/workspace/cell-drawer.tsx`. Depends on Tasks 2–6 types existing.

`"use client"`. Props: `{ teamId: string; cellId: string | null; members: { userId: string; displayName: string }[]; onClose: () => void }`.
- Use shadcn `Sheet` (open when `cellId !== null`).
- Read the selected cell from `api.teamWorkspace.cells.useQuery({ teamId })` (shared cache) and find the one matching `cellId`.
- Show: description/taskType, verificationMode, current `heatState` badge, `claimedBy`/`claimedByUserId`, `assignedToUserId`, and the `result.output` if present.
- Actions (each a mutation with `onSuccess` → `utils.teamWorkspace.cells.invalidate({ teamId })` + `utils.teamWorkspace.activity.invalidate({ teamId })`):
  - **Assign**: a `Select` of `members` (+ an "unassigned" option) → `assignCell.mutate({ cellId, teamId, userId })`.
  - **Claim**: button → `claimCellAsMember.mutate({ cellId, teamId })` (show when cell is pending/requeued, i.e. heatState `pending`).
  - **Release**: button → `releaseCell.mutate({ cellId, teamId })` (show when heatState `claimed`).
  - **Report**: a `Textarea` (placeholder `reportPlaceholder`) + button → `reportResult.mutate({ cellId, teamId, output })` (show when heatState `claimed`).
- Disable action buttons while their mutation `isPending`.

**Verify:** `pnpm typecheck`. **Commit:** `feat(hackathon): cell drawer (assign/claim/release/report) (Plan 5)`

---

## Task 8 (integration): `TeamWorkspace` composer

**Files:** Create `src/components/hackathon/workspace/team-workspace.tsx`. Depends on Tasks 3,4,5,6,7.

`"use client"`. Props: `{ teamId: string; challengeId: number; members: { userId: string; displayName: string }[] }`.
- Local state `const [selectedCell, setSelectedCell] = useState<string | null>(null)`.
- Layout: `t("workspaceTitle")` header; `<PresenceStrip teamId>`; a two-column layout — left: `<TeamHeatmap teamId onSelectCell={setSelectedCell} />` + `<ConnectAgentPanel challengeId />`; right: `<ActivityFeed teamId />`.
- `<CellDrawer teamId cellId={selectedCell} members onClose={() => setSelectedCell(null)} />`.

**Verify:** `pnpm typecheck`. **Commit:** `feat(hackathon): team workspace composer (Plan 5)`

---

## Task 9 (integration): the gated route

**Files:** Create `src/app/[locale]/events/[slug]/team/page.tsx`.

RSC. Mirror the gating pattern in `src/app/[locale]/communities/[slug]/events/[eventSlug]/manage/page.tsx`:
- `const { slug } = await params;` `const session = await getSession();` (`@/server/better-auth/server`) → `const userId = session?.user?.id ?? null; if (!userId) redirect(`/events/${slug}`);`
- Resolve the event by slug via Payload, read its `challengeId`; if no challengeId → `redirect(`/events/${slug}`)`.
- Resolve the caller's team for that challenge: query `challengeEnrollments` for `{ userId, challengeId, teamId not null }`; if none → `redirect(`/events/${slug}`)`. (This is the membership gate — equivalent to `ownerOnTeam` but also yields the teamId.)
- Load the team's members (join `challengeEnrollments` + `memberProfiles` for that teamId) → `members: { userId, displayName }[]`.
- Render `<TeamWorkspace teamId={team.id} challengeId={Number(challengeId)} members={members} />`.

**Verify:** `pnpm typecheck`, `pnpm check`. **Commit:** `feat(hackathon): gated team workspace route (Plan 5)`

---

## Task 10: full verification

- `pnpm test` → PASS (UI is typecheck-only; no new unit tests, existing suite stays green).
- `pnpm check` → PASS (lint + typecheck, exit 0).
- `node -e "require('./messages/en.json'); require('./messages/nl.json')"` → no error (valid JSON, keys present in both).
- **Commit** any lint fixes: `chore(hackathon): Plan 5 UI verification fixes`.

---

## Notes for Plan 6 (dashboard)
- Add an "Enter your team workspace →" button (`t("enterWorkspace")`, links to `/events/[slug]/team`) to `HackathonPanel` for logged-in members.
- Render `hackathon.teamHeatmap` per team on the public dashboard (content-free, reuse `CellHeatBox`'s colour map but with NO onClick/content).
- Record the two ADRs (0030 amendment + human-claimable-cells).
