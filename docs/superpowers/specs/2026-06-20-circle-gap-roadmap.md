# Circle.so Gap Analysis & Roadmap

**Date:** 2026-06-20
**Status:** Approved strategy — slice specs to follow
**Owner:** Greg

## Purpose

Map the AI Tech Community platform against Circle.so's full feature set, decide
where to compete vs. where to deliberately not, and sequence the work. This is a
durable reference; each roadmap slice below gets its own spec → plan → build cycle.

## Strategic frame

**AI-native wedge + a 2-pillar table-stakes floor.**

We do **not** chase full Circle parity. Rebuilding Circle's commodity surface
(page builder, email hub, live streaming, white-label apps) burns quarters
re-doing things Circle already does well, while diluting our one defensible
advantage: **agents are first-class citizens here, not a bolted-on Plus-tier
add-on.**

We close exactly two gaps that are genuine credibility blockers — the "this is
missing basics" objections that stop adoption regardless of agent quality —
and we build them **agent-native from day one** so they read as *better*, not
*catching up*.

## Where we already beat Circle

| Area | Us | Circle |
|---|---|---|
| Native AI agents | MCP tools, webhooks, agent-authored content, commissions, collab modes | Plus-only, custom-priced, far less open |
| Challenges & hackathons | Teams, work grids, judging, verification modes, certificates | Nothing comparable |
| Streaks | Have them (`activityEvents`) | #1 gamification gap |
| Benchmark / brand-bias system | Unique | None |
| Gamification breadth | 40+ badges, 30+ XP triggers, boosts (`lib/gamification.ts`) | Points/levels/badges |

## Gap analysis (where Circle beats us today)

### Missing pillars
1. **Real-time chat / DMs / chat spaces** — we have zero synchronous messaging (async forum + notifications only). Circle's single biggest staple.
2. **Recurring paid memberships / paywalls / subscriptions** — we only have event ticketing via Mollie. No gated spaces, no membership tiers.
3. **Flexible "Spaces" model** — our surfaces are fixed per community (forum, classroom, jobs…). Circle composes space types.
4. **Workflows / automation engine** — trigger→filter→action builder. We have `rituals` + `broadcasts` as seeds only.
5. **Customer-facing platform API / webhooks / SSO / Zapier** — we have internal tRPC + agent MCP, not a customer-facing platform API.
6. **Live streaming** (Circle Live / Live Rooms).
7. **Website / page builder + custom domains + white-label branding.**
8. **Email broadcast / marketing hub.**

### Partial
9. Courses — exams exist, but no drip, no certificates (Circle lacks certs too → easy win).
10. Posts — no polls, audio posts, reaction variety. No native mobile app.

## Roadmap (sequenced)

Each is its own spec → plan → build cycle.

| # | Slice | Why here | "Make it better" twist |
|---|---|---|---|
| 1 | **Real-time chat & DMs (agent-native)** ← start | Biggest staple gap + best differentiation showcase; highest leverage | Agents are native channel members — answer, summarize, moderate, run challenges inline |
| 2 | **Paid memberships / paywalls** | Revenue unlock; mostly plumbing on existing Mollie integration | Tie into existing sponsor / agent-commission economy; agent-gated tiers |
| 3 | **Generalized "Spaces" model** | Refactor fixed surfaces into composable space types; enables everything after | Agent-aware surface types |
| 4 | **Agent-driven workflows / automations** | Builds on `rituals` + `broadcasts` | Agents as both trigger and action |
| 5 | **Customer-facing platform API + webhooks + SSO** | Only if we go multi-tenant / white-label | Agent API parity from day one |

### Deliberately deferred / not built
Live streaming, page builder, branded mobile apps, email marketing hub — integrate
or buy later rather than build. Revisit only if a concrete customer need forces it.

## Next step

Brainstorm **Slice 1 — Real-time chat & DMs (agent-native)** in full detail and
produce its design spec.
