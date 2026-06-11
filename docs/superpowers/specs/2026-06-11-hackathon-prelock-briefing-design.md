# Hackathon pre-lock briefing — the digital opening ceremony

**Date:** 2026-06-11
**Status:** approved
**Builds on:** [ADR-0029](../../adr/0029-team-is-a-grouping-over-enrollments-and-the-binding-is-the-discriminator.md) (team/grid shapes), the 2026-06-10 participant-workspace design, and the `feat/agents-tool-catalog` registry-derived tool catalog.

## Problem

Between joining a team and roster lock, the team workspace shows a single line
("The workspace opens when the hackathon starts and rosters lock."). Members
arrive at the lock moment unprepared: they don't know what the task grid is,
how scoring works, how to connect an agent, or — the silent failure — that
their agent's commission `taskTypeAllowlist` must cover this challenge's task
types before the agent can claim anything.

Deep research on hackathon practice (MLH organizer guide, MLH standard rules,
Devpost/Bolt 2025, AAAI 2025, AEC Tech; claims adversarially verified) says the
kickoff/opening ceremony is the canonical onboarding moment: schedule with
deadlines highlighted, rules, published judging rubric, help channels — all
before hacking starts. AI-use disclosure is now a standard rule; our per-cell
human/agent attribution satisfies it by construction and should be said out
loud. The pre-lock workspace should be that opening ceremony, ending in a
per-member readiness checklist.

## Design

### Detection (server-side)

`src/app/[locale]/events/[slug]/team/page.tsx` already authenticates, resolves
the event → `challengeId`, gates on a non-abandoned enrollment carrying a
`teamId`, and loads members. It additionally checks whether a competitive grid
exists for the team (the same condition `requireTeamGridId` enforces):

- **No grid (pre-lock):** render `<HackathonBriefing …/>` instead of
  `<TeamWorkspace …/>`.
- **Grid exists:** render `<TeamWorkspace …/>` unchanged.

The heatmap's existing NOT_FOUND fallback stays as a race guard (lock can
happen between page render and the first cells poll).

### `HackathonBriefing` (new, `src/components/hackathon/briefing/`)

A mostly server-rendered component; props assembled in the page from data we
already have (Payload challenge doc, `cellTemplateSchema.parse`,
`getToolCatalog()` + `groupBySurface()`, team row, members). Four sections,
mapped to the MLH kickoff checklist:

1. **The plan** — the challenge's `cellTemplate` rendered as a preview of the
   grid every team will race: per task its description, `taskType`,
   verification mode, and deadline minutes. The team roster. A lock explainer:
   when the organizer locks rosters this becomes the team's live grid,
   identical for every team. Empty template ⇒ "the organizer is still
   preparing the task grid" instead of an empty list.
2. **How you win** — scoring derived from the challenge: each *verified* cell
   contributes a weight determined by its verification mode
   (`teamScore`/`computeCommissionedCellXp`); `rankingMode` tiebreak; prize
   (`xpReward`, `badgeReward`) split equally among the winning team's members.
3. **Work with your agent** — the `AgentReadinessChecklist` (below), the
   existing `ConnectAgentPanel`, and a `ToolCatalogList` (extracted from
   `/agents` page rendering into a shared component) filtered to the
   `commissions`, `challenges`, and `inbox` surfaces with gate badges. States
   explicitly: agents are optional (humans claim cells too) and attribution is
   automatic — every cell records whether a human or a commissioned agent did
   it. Links to `/agents` for the full catalog.
4. **Get help** — links to the challenge channel and the event page.

### `AgentReadinessChecklist` (client island)

Per-member readiness composed from **existing** queries — no new tRPC:

- `agentManagement.getMyAgent` → agent registered and `active`?
- `commissions.listMine` → an active (non-revoked) commission?
- commission `taskTypeAllowlist` ⊇ this challenge's `cellTemplate` task types?
  Missing types are named, with a CTA to `/dashboard/agent`.

The derivation is a pure function
`deriveAgentReadiness(agent, commissions, requiredTaskTypes) → checklist state`
so it unit-tests without a DB. No agent ⇒ the checklist renders as a
getting-started path, not an error.

### i18n

New `hackathon.briefing.*` keys in `messages/en.json` and `messages/nl.json`.
Tool names/descriptions come from the registry and are not translated (same as
`/agents`).

## Out of scope (follow-ups)

- **Post-lock persistence** of the briefing as a collapsible "How this works"
  section in the live workspace (same component, collapsed rendering).
- The broader in-event awareness workstream: deadline countdowns, announcement
  feed, persistent help affordance, per-cell attribution surfacing in the
  leaderboard (AAAI contribution-verification pattern).
- Automating roster lock at event start (deferred follow-up noted in
  `hackathon.ts` `lockRosters`).

## Testing

- Unit: `deriveAgentReadiness` (no agent / inactive agent / no commission /
  revoked commission / partial allowlist / full coverage); catalog surface
  filter.
- The existing `catalog.integration.test.ts` drift test already guards
  `TOOL_META` against the registry.
- Existing team-page gate integration tests are unaffected (the gate is
  unchanged; only the rendered branch differs).
