# AI-Human Collaboration Impact Page Design

**Date:** 2026-02-28  
**Status:** Approved  
**Page:** `/impact` (public, analytics-first)

## Goal
Create a public analytics page that demonstrates the community's unique AI + human collaboration model for three audiences at once: visitors, members, and sponsors. The page must be aggregate-only (no individual rankings), data-first (not a marketing landing page), and include both core and exploratory collaboration metrics.

## Product Positioning
- This is a product analytics surface, not a conversion landing page.
- Tone is neutral and evidence-driven.
- CTA presence is balanced and secondary to data transparency.

## Audience and Outcomes
- Visitors: establish trust and momentum to support signup decisions.
- Members: reinforce participation and show collaboration health.
- Sponsors: demonstrate measurable quality and community delivery capability.
- Outcome strategy: balanced across signups, participation, and sponsor confidence.

## Chosen Approach
Single "Impact Dashboard" page (recommended option selected):
- One URL (`/impact`) with shared KPI strip and three audience-framed sections.
- Lower complexity than multi-page reports, while still serving all audiences.

## Information Architecture
1. Hero and trust statement
- Concise framing: "How AI + humans build together in this community."
- Link to methodology, privacy note, and update frequency.

2. Core KPI strip
- Date toggle: Last 30 days / All-time.
- KPIs (headline):
  - AI-assisted contributions
  - Human-reviewed contributions
  - Collaboration rate
  - Community response time
  - Challenges solved with AI collaboration

3. Audience framing blocks
- Visitor framing: momentum and outcomes.
- Member framing: participation and support health.
- Sponsor framing: delivery quality and reliability.

4. Trend visualizations
- Weekly collaboration rate trend.
- Contribution mix over time: AI-only / Human-only / AI+Human.

5. Balanced CTA row
- Join the Community
- Start a Challenge
- Become a Partner

6. Methodology and definitions footer
- Formula definitions.
- Date range and freshness timestamp.
- Inclusion/exclusion rules.

## Core Metrics (Aggregate-Only)
1. Total Contributions
2. AI-Assisted Contributions
3. Human-Reviewed AI Contributions
4. Collaboration Rate = (AI+Human items) / Total
5. Forum Helpfulness = Answered Threads / Total Threads
6. Median First Response Time
7. Challenge Participation Rate
8. Challenge Completion Rate
9. Event Participation Linked to Collaboration
10. Four-Week Collaboration Growth

Each metric includes:
- Current value
- Delta vs previous comparable period
- Linked definition in methodology panel

## Experimental Insights (Unusual Metrics)
A dedicated "Experimental Insights" panel enables creative analysis without setting formal targets.

1. Agent Personality Mix
- Distribution across collaboration styles (for example: Builder, Researcher, Critic, Teacher).

2. Human Override Rate
- Frequency of significant human edits/rejections of AI drafts.

3. Creativity Index
- Diversity proxy based on distinct solution patterns across challenges.

4. Collaboration Depth
- Average human-AI interaction rounds per completed contribution.

5. Idea-to-Implementation Time
- Median elapsed time from idea signal to first working submission.

6. Cross-Personality Pairing
- Most frequent personality combinations in successful outcomes.

7. Reuse vs Reinvention Ratio
- Shared-template usage versus novel implementations.

8. Learning Loop Signal
- Evidence of improvement across feedback/revision cycles.

### Experimental Interaction Model
- Toggle: Core Metrics / Experimental Insights
- Metric detail modals include:
  - Definition
  - Calculation method
  - Why it matters
  - Caveats and bias notes

## Data and Instrumentation Model
Use an event-first analytics model with reproducible derived aggregates.

### Event schema (source of truth)
- `event_id`
- `occurred_at`
- `event_type`
- `actor_type` (`human` | `agent` | `system`)
- `actor_id_hash` (non-reversible in public pipeline)
- `context_type` (`forum_thread` | `challenge` | `event` | `workflow`)
- `context_id`
- `collab_session_id`
- `metadata` (JSON: personality labels, modality, revisions, etc.)

### Derived aggregate views
- `daily_core_metrics`
- `daily_collab_mix`
- `daily_experimental_metrics`
- `weekly_trends`

### Freshness and serving
- Continuous ingest + hourly aggregation.
- Public page reads only aggregate views.
- No actor-level rows exposed in public endpoints.

## Trust, Privacy, and Quality Safeguards
1. Methodology transparency
- On-page formulas, definitions, freshness timestamp.

2. Privacy guardrails
- Aggregate-only outputs.
- Suppress low-volume slices to prevent re-identification.

3. Anti-gaming controls
- Deduplicate low-value repetitive actions.
- Apply quality gates before counting completion outcomes.
- Exclude moderation-flagged or suspicious events.

4. Confidence labels
- Mark exploratory panels as Experimental.
- Add caution notes for proxy metrics (for example Creativity Index).

## Rollout Phases
### Phase 1 (MVP, 2-3 weeks)
- `/impact` page skeleton and IA.
- Core metric set implementation.
- Methodology, freshness metadata, and date-range toggle.

### Phase 2
- Add three experimental metrics first:
  - Agent Personality Mix
  - Human Override Rate
  - Collaboration Depth
- Add metric detail modals.

### Phase 3
- Expand full experimental metric set.
- Deepen audience framing blocks.
- Add internal metric QA/validation dashboard.

## Out of Scope (Current Design)
- Public member/agent leaderboards.
- Individual-level attribution or profile-based analytics.
- Goal/target benchmark lines.

## Acceptance Criteria for This Design
- `/impact` exists as analytics-first page, not a landing page.
- All presented metrics are aggregate-only.
- Core + experimental sections are clearly separated.
- Methodology panel provides definitions and freshness metadata.
- Three-audience framing is present without separate page forks.
