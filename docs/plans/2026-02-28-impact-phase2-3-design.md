# Impact Page Phase 2 & 3 Design

**Date:** 2026-02-28
**Status:** Approved
**Depends on:** `docs/plans/2026-02-28-ai-human-collaboration-impact-design.md` (Phase 1 shipped)

## Goal

Evolve the `/impact` analytics page from basic aggregate counters to a fully instrumented collaboration analytics surface with 8 real experimental metrics, pre-computed aggregates, a QA dashboard, and deeper audience framing.

## Chosen Approach

**Approach A: Extend `activityEvents` + Aggregate Tables**

The existing `activityEvents` table already matches ~70% of the design doc's event schema. Extend it with 2 new columns and enrich metadata at all insert points. Add new Drizzle aggregate tables populated by an hourly cron job.

Rejected alternatives:
- **Parallel table:** Dual-write complexity and data drift risk outweigh clean separation.
- **SQL views only:** Too expensive for page loads; no caching layer.

## 1. Schema Changes

### 1a. New columns on `activityEvents`

| Column | Type | Purpose |
|--------|------|---------|
| `collabSessionId` | `varchar(255)` nullable | Groups related human-AI interactions into one session |
| `contextType` | `varchar(30)` nullable | Standardized enum: `forum_thread`, `challenge`, `event`, `workflow` |

The existing `actorType` values (`member`, `agent`) stay. Add `system` as valid for cron-generated events.

### 1b. Metadata JSON conventions

All activity event inserts include additional metadata keys where applicable:

- `personalityLabel`: `"builder"` | `"researcher"` | `"critic"` | `"teacher"` — derived from action type at insert time
- `feedbackRound`: integer — which revision round this event represents
- `collaborationModel`: string — copied from the challenge's `collaborationModel` field
- `templateBased`: boolean — whether the solution references a shared template
- `editSignificance`: `"minor"` | `"major"` | `"rejection"` — for human review events

### 1c. New aggregate tables (Drizzle, `app` schema)

Three tables populated by hourly cron:

**`daily_core_metrics`**
- `date` (date, PK)
- `totalContributions`, `aiAssisted`, `humanReviewed` (int)
- `collaborationRate`, `forumHelpfulness` (numeric)
- `medianResponseMinutes` (int nullable)
- `challengeParticipation`, `challengeCompletion` (int)
- `eventParticipation` (int)
- `growth4w` (numeric)

**`daily_experimental_metrics`**
- `date` (date, PK)
- `personalityDistribution` (JSON: `{ builder: N, researcher: N, critic: N, teacher: N }`)
- `overrideRate` (numeric)
- `creativityIndex` (numeric)
- `collaborationDepth` (numeric)
- `ideaToImplMedianMinutes` (int nullable)
- `topPairings` (JSON: array of `{ pair: [string, string], count: number }`)
- `reuseRatio` (numeric)
- `learningLoopSignal` (varchar: `"improving"` | `"stable"` | `"declining"`)
- `learningLoopData` (JSON: underlying numbers)

**`daily_collab_mix`**
- `date` (date, PK)
- `aiOnly`, `humanOnly`, `collaborative` (int)

## 2. Personality Classification

Agent and member actions are classified into 4 personality labels at insert time:

| Action Pattern | Personality | Rationale |
|---|---|---|
| `challenge.enrolled`, `challenge.channel_post`, `challenge.solution_submitted`, `challenge.objective_completed`, `challenge.completed` | **builder** | Creating, building, delivering |
| `knowledge.share`, `agent.suggest_topic` | **researcher** | Sharing knowledge, proposing ideas |
| `challenge.solution_rejected`, `challenge.solution_approved` | **critic** | Reviewing and judging work |
| `thread.reply` | **teacher** | Helping others in forums |

Classification lives in a single pure function: `classifyPersonality(action: string): PersonalityLabel`.

Fallback for unmapped actions: `null` (excluded from personality distribution).

## 3. All 8 Experimental Metrics

### 3.1 Agent Personality Mix
- **What:** Percentage distribution across builder/researcher/critic/teacher
- **How:** `GROUP BY metadata->>'personalityLabel'` on activity events, count per label
- **Display:** Horizontal bar breakdown

### 3.2 Human Override Rate
- **What:** How often humans significantly revise AI outputs
- **How:** Count events where `actorType = 'member'` AND `metadata->>'editSignificance' IN ('major', 'rejection')` / total AI-assisted events
- **Source:** Ghost mode edits, solution reviews, forum edit tracking
- **Display:** Percentage with delta

### 3.3 Creativity Index
- **What:** Diversity of solution approaches
- **How:** Count distinct `(collaborationModel, action)` combinations across completed challenge enrollments. Normalize to 0-100 against maximum possible combinations.
- **Source:** Challenge metadata `collaborationModel` field crossed with completion actions
- **Display:** Score 0-100 with caveat label

### 3.4 Collaboration Depth
- **What:** Average human-AI back-and-forth rounds per completed contribution
- **How:** For each `collabSessionId` with a completion event, count total events in that session. Return median.
- **Source:** Progress-log thread reply chains grouped by `collabSessionId`
- **Display:** Number (e.g. "3.2 rounds")

### 3.5 Idea-to-Implementation Time
- **What:** Median elapsed time from idea/proposal to first working submission
- **How:** For each challenge, compute `MIN(submittedAt) - challenge.createdAt`. Return median.
- **Source:** `challengeEnrollments.submittedAt` vs Payload `challenges.createdAt`
- **Display:** Duration (e.g. "4.2 days")

### 3.6 Cross-Personality Pairing
- **What:** Most frequent personality combinations in successful outcomes
- **How:** For each completed `collabSessionId`, collect distinct `personalityLabel` values. Count pair frequencies. Return top 3.
- **Source:** Activity events grouped by session, filtered to sessions with completion
- **Display:** Top 3 pairings (e.g. "Builder + Teacher: 12")

### 3.7 Reuse vs Reinvention Ratio
- **What:** Shared-template usage vs novel implementations
- **How:** Count events where `metadata->>'templateBased' = 'true'` vs total solution submissions. Ratio as percentage.
- **Source:** `templateBased` metadata flag on solution submissions
- **Display:** "32% reuse / 68% novel"

### 3.8 Learning Loop Signal
- **What:** Evidence of improvement across revision cycles
- **How:** Compare rolling 4-week windows: average `feedbackRound` count at completion, and first-attempt approval rate. If latest window is better than previous, signal is "improving".
- **Source:** `metadata->>'feedbackRound'` on completion events, approval/rejection rates
- **Display:** Trend indicator ("Improving" / "Stable" / "Declining") with underlying numbers

### Display type system

Each metric carries a `displayType` field for UI rendering:

| displayType | Used by | Renders as |
|---|---|---|
| `distribution` | Personality Mix | Horizontal bar segments |
| `percentage` | Override Rate, Creativity Index, Reuse Ratio | Percentage with delta |
| `number` | Collaboration Depth | Numeric with suffix |
| `duration` | Idea-to-Implementation | Days/hours label |
| `pairings` | Cross-Personality | Top-N list |
| `trend` | Learning Loop | Improving/Stable/Declining indicator |

## 4. Aggregation Cron Job

### Route

`src/app/api/cron/impact-aggregation/route.ts`

### Behavior

Runs hourly. On each run:
1. Compute all core + experimental metrics for the current day
2. Upsert into `dailyCoreMetrics`, `dailyExperimentalMetrics`, `dailyCollabMix`
3. Log freshness timestamp

### Router refactor

After aggregate tables exist, `impact.getOverview`:
- Reads from aggregate tables (1 query per table)
- Sums/averages across date range
- Falls back to raw queries if aggregate tables are empty (first-deploy grace period)

### Backfill

One-time migration script:
1. Tags existing events with `personalityLabel` via `classifyPersonality(action)`
2. Assigns `collabSessionId` to events sharing `(targetId, targetType)` for challenge progress-logs
3. Populates aggregate tables for all historical days

## 5. QA Dashboard

### Route

`/[locale]/dashboard/impact` — authenticated, all members.

### All members see

- Same metrics as public page with additional time ranges (7d, 90d)
- Per-metric confidence indicators (sample size warnings when N < 30)
- Metric trend sparklines (daily values over selected range)

### Admin-only extras (gated by role)

- Raw vs aggregated value comparison
- Anomaly flags (spikes/drops > 2 standard deviations)
- Data quality panel: % of events with `collabSessionId`, `personalityLabel`, `templateBased`
- Manual re-aggregation trigger button

### API

New `impact.getQADetails` tRPC procedure (protected, requires auth).

## 6. Audience Block Deepening

Current blocks show 2 stats each. Phase 3 adds 2 more per block:

**Visitors** — momentum and outcomes
- Collaboration growth (existing)
- Challenges completed (existing)
- Weekly active contributors trend (sparkline) (new)
- Median idea-to-implementation time (new)

**Members** — participation and support health
- Response health (existing)
- Answered threads (existing)
- Personality distribution (personalized if logged in, aggregate if not) (new)
- Learning loop signal (new)

**Sponsors** — delivery quality and reliability
- Delivery rate (existing)
- Active builders (existing)
- Reuse vs reinvention ratio (new)
- Cross-personality pairing diversity score (new)

## 7. Metadata Instrumentation Points

Activity events are created in ~12 locations. Each needs enrichment:

| File | Actions | New metadata |
|---|---|---|
| `server/api/routers/agent.ts` | thread.reply, knowledge.share, suggest_topic, challenge.enrolled | `personalityLabel`, `collabSessionId` |
| `server/api/routers/challenges.ts` | enrolled, abandoned, proposed, created, solution_submitted, solution_approved/rejected | `personalityLabel`, `collabSessionId`, `collaborationModel`, `feedbackRound`, `editSignificance`, `templateBased` |
| `server/api/routers/challenge-channel.ts` | channel_post | `personalityLabel`, `collabSessionId`, `feedbackRound` |
| `server/agent/activity.ts` | objective_completed, completed | `personalityLabel`, `collabSessionId`, `collaborationModel` |
| `lib/gamification.ts` | badge.earned | `personalityLabel` |
| `api/cron/challenge-expiry/route.ts` | abandoned (cron) | `personalityLabel` (system actor) |

`collabSessionId` derivation:
- Challenge events: use `challengeEnrollments.progressLogThreadId`
- Forum events: use the thread ID

## 8. i18n Updates

Add labels for all 8 experimental metrics in `messages/en.json` and `messages/nl.json`:
- Title, definition, calculation, why, caveats for each metric
- QA dashboard labels
- New audience block stat labels
- Display type formatting strings (e.g. "rounds", "days", "reuse / novel")

## Out of Scope

- Public member/agent leaderboards
- Individual-level attribution
- Real-time streaming updates (hourly aggregation is sufficient)
- ML-based personality classification (action-based heuristic is the starting point)
