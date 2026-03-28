# AI+Human Challenges — Design Document

**Date:** 2026-02-24
**Status:** Approved
**Approach:** Start with Challenges, Grow Incrementally (Approach B)

## Overview

A system of community activities where a member and their personal AI agent collaborate as a team. The agent **proactively** scouts the community, analyzes content, and pushes actionable advice to the member's inbox. The member decides what to act on and takes action. Outcomes are tracked, scored, and rewarded.

### Core Principle

**Agent advises, Human acts.** The agent does research, analysis, and suggestions — the human makes decisions and takes action. The agent is proactive: it does not wait to be asked.

### Goals (all weighted equally)

1. **Showcase agent capabilities** — Prove AI+Human collaboration creates better outcomes than either alone
2. **Drive engagement & retention** — Members come back regularly, level up, compete on leaderboards
3. **Produce real community value** — Activities generate useful artifacts (knowledge, tutorials, curated content)
4. **Train members to work with AI** — The community becomes a learning ground for AI-augmented work

## Activity Types Roadmap

| Phase | Type | Description | Example |
|-------|------|-------------|---------|
| **1** | **Time-boxed Challenges** | Weekly/monthly async challenges with clear objectives | "This week: find and contribute to 3 threads about automation. Your agent will scout relevant threads for you." |
| **2** | **Progressive Quests** | Multi-step challenges that unfold over days/weeks | "Agent scouts trending topics → You write a post → Agent finds related discussions → You synthesize a knowledge summary" |
| **3** | **Live Hackathons** | Real-time sessions (2-4h) tied to events | "Build the best curated resource guide on topic X. Your agent researches, you organize and publish." |
| **4** | **Competitive Showdowns** | Head-to-head or team-vs-team with community judging | "Your pair vs theirs: who produces the most useful community contribution this week?" |
| **5** | **Collaborative Missions** | Multiple pairs working toward a shared community goal | "Community goal: collectively document 50 AI tools. Each pair contributes pieces." |

**This document covers Phase 1 (Time-boxed Challenges) + the proactive agent advisory system.**

## Data Model

### Challenge (Payload CMS Collection)

| Field | Type | Description |
|-------|------|-------------|
| title | text | Challenge name |
| slug | text | URL-friendly identifier |
| description | richText | What the challenge is about, rules, context |
| type | select | `weekly` / `monthly` |
| status | select | `draft` / `active` / `completed` / `archived` |
| startsAt | date | When the challenge opens |
| endsAt | date | When the challenge closes |
| objectives | array | List of trackable objectives (see below) |
| xpReward | number | XP awarded on completion |
| badgeReward | relationship | Optional badge earned |
| maxParticipants | number | Optional cap (0 = unlimited) |
| proposedBy | relationship → user | Null if admin-created, user ID if community-proposed |
| featuredImage | upload | Visual for the challenge card |

### Objective (nested within Challenge)

| Field | Type | Description |
|-------|------|-------------|
| description | text | What to do ("Reply to 3 forum threads about AI") |
| action | select | Maps to `activity_events` actions: `thread.replied`, `thread.created`, `knowledge.shared`, `idea.submitted`, `idea.voted`, etc. |
| targetCount | number | How many times (e.g., 3 replies) |
| filter | json | Optional scope: `{ category: "question" }` or `{ tag: "automation" }` |

### Challenge Enrollment (Drizzle — appSchema)

| Field | Type | Description |
|-------|------|-------------|
| id | serial | Primary key |
| challengeId | number | FK → challenge |
| userId | text | FK → user |
| enrolledAt | timestamp | When they joined |
| completedAt | timestamp | Null until all objectives met |
| status | enum | `active` / `completed` / `abandoned` |

### Challenge Progress (Drizzle — appSchema)

| Field | Type | Description |
|-------|------|-------------|
| id | serial | Primary key |
| enrollmentId | number | FK → enrollment |
| objectiveIndex | number | Which objective (0-based) |
| currentCount | number | Progress so far |
| completedAt | timestamp | Null until target met |

### Progress Tracking Mechanism

No new tracking infrastructure needed. The existing `activity_events` table already logs all member actions. When a member takes an action:

1. Is this member enrolled in an active challenge?
2. Does this action match any objective's `action` + `filter`?
3. If yes → increment `currentCount` on the matching progress row
4. If all objectives complete → mark enrollment as `completed`, award XP + badge

This is a lightweight hook added to the existing `logActivity()` utility.

## Proactive Agent Advisory System

### How It Works

When a member enrolls in a challenge, their agent gets challenge context and starts proactively scouting and advising.

```
Challenge Enrolled → Agent Proactive Advisory Loop → Member Inbox (advice)
                                                            │
                                                     Member decides
                                                     what to act on
                                                            │
                                                     Takes action
                                                     (forum post, reply, etc.)
                                                            │
                                                     activity_events logged
                                                     & progress updated
```

### Agent Advisory Behavior

| Objective Type | Agent Proactive Behavior |
|----------------|--------------------------|
| `thread.replied` | Scouts threads matching the filter, sends: "I found 3 threads about automation that could use your input: [links + summary]" |
| `thread.created` | Analyzes trending topics and gaps, sends: "There's no thread yet about X — this could be a good one to start" |
| `knowledge.shared` | Searches community content, sends: "I found these insights across 5 threads that could be synthesized into a knowledge snippet" |
| `idea.submitted` | Reviews existing ideas and community pain points, sends: "Several members are discussing X but no idea has been submitted yet" |
| `idea.voted` | Surfaces unvoted ideas relevant to member's interests, sends: "These 3 ideas align with your expertise and need votes" |

### Delivery Mechanism

Advice is delivered through the **existing inbox system** as messages in the member's pinned agent conversation. No new UI needed for delivery.

### Advisory Schedule

| Challenge Type | Advisory Frequency |
|----------------|-------------------|
| Weekly challenge | Once daily |
| Monthly challenge | Every 2-3 days |

A **scheduled background job** (Vercel Cron) iterates over active enrollments, runs the agent's search/analysis tools for each member's incomplete objectives, and sends a message to their inbox.

### Example Agent Message

```
Challenge Update: "Automation Explorer"

You've completed 1/3 objectives. Here's what I found for you:

Objective: Reply to 3 threads about automation (1/3 done)

I found 2 threads that could use your expertise:
- "Struggling with n8n webhook reliability" — 4 replies, no solution yet
  → You could share your experience with webhook retries
- "Best practices for automating CI/CD with AI" — new thread, 0 replies
  → This aligns with your DevOps background

Want me to keep looking, or are you working on something else?
```

### Guardrails

- Agent **never acts** on the member's behalf — only advises
- Agent respects existing rate limits (60 req/min)
- Member can **mute** challenge advice (toggle on enrollment)
- If member hasn't opened the app in 3+ days, reduce frequency to avoid inbox spam

## Challenge UX & Member Journey

### Discovery & Enrollment

**Where challenges appear:**
- **Dashboard** — Active challenges card alongside onboarding checklist and activity feed
- **Community page** — New "Challenges" tab alongside Forum and Ideas
- **Agent inbox** — Agent proactively suggests relevant challenges

**Enrollment flow:**
1. Member sees challenge card with title, description, objectives, XP reward, time remaining
2. Clicks "Join Challenge"
3. System creates enrollment + progress rows
4. Agent receives challenge context and starts proactive advisory
5. Confirmation in agent inbox: "I'm on it! I'll start scouting for opportunities and send you advice."

### During the Challenge

Progress widget on dashboard + challenge detail page:

```
┌──────────────────────────────────────────┐
│  Automation Explorer             4d left │
│                                          │
│  ○ Reply to 3 threads about automation   │
│    ████████░░░░░░░░  2/3                 │
│                                          │
│  ○ Share 1 knowledge snippet             │
│    ░░░░░░░░░░░░░░░░  0/1                │
│                                          │
│  ○ Vote on 2 community ideas             │
│    ████████████████  2/2  ✓              │
│                                          │
│  Reward: 150 XP + "Explorer" badge       │
└──────────────────────────────────────────┘
```

### Challenge Completion

1. Enrollment marked `completed`
2. XP awarded via existing gamification system
3. Badge earned (if applicable)
4. Activity event logged: `challenge.completed`
5. Agent sends congratulations in inbox
6. Completion appears in the community activity feed

### Challenge Expiry

- Enrollment marked `abandoned`
- Partial XP awarded (proportional to completed objectives)
- Agent sends wrap-up message
- No badge for incomplete challenges

### Community-Proposed Challenges

Extends the existing Community Ideas pattern:

1. Member submits a challenge idea (title, description, suggested objectives)
2. Appears in "Proposed Challenges" section, community can vote
3. Admin reviews top-voted proposals, refines, and publishes as official challenges
4. Proposer gets XP bonus when their challenge goes live

## Activity Feed Integration

All challenge actions are logged via `logActivity()` and appear in feeds:

| Action | Feed Message | Feed Visibility |
|--------|-------------|-----------------|
| `challenge.enrolled` | "Sarah joined the Automation Explorer challenge" | Community feed |
| `challenge.completed` | "Marco completed the Automation Explorer challenge and earned 150 XP" | Community feed |
| `challenge.proposed` | "Lisa proposed a new challenge: API Integration Sprint" | Community feed |
| `challenge.objective_completed` | "You completed objective 2/3 in Automation Explorer" | Personal feed only |

## Leaderboards & Social Proof

### Challenge Leaderboard

Each challenge has a live leaderboard:

**Ranking criteria:**
1. Number of completed objectives (descending)
2. Time to completion (faster = higher rank)

### Community Leaderboard (Global)

| Metric | Description |
|--------|-------------|
| Challenges completed | Total count all-time |
| Current streak | Consecutive weekly challenges completed |
| Best agent advisor | Member whose agent sent the most acted-upon advice |
| Top proposer | Member whose proposed challenges got the most enrollments |

### Spotlight Integration

New spotlight categories:
- **Challenge Champion** — Most challenges completed in the last 7 days
- **Best AI Partnership** — Highest ratio of "agent advised → member acted"

### New Badges

| Badge | Criteria |
|-------|----------|
| `first_challenge` | Complete your first challenge |
| `challenge_streak_3` | Complete 3 consecutive weekly challenges |
| `challenge_streak_10` | Complete 10 consecutive weekly challenges |
| `challenge_proposer` | Your proposed challenge gets published |
| `mission_impossible` | Complete a monthly challenge with all objectives done in the first week |

## Technical Architecture

### New vs Reused Components

| Component | Status |
|-----------|--------|
| `activity_events` table | **Reused** — already logs all actions |
| `logActivity()` utility | **Extended** — add challenge progress check hook |
| Inbox / agent conversations | **Reused** — advisory delivered as messages |
| XP & badge system | **Reused** — rewards use existing gamification |
| Community Ideas voting | **Reused** — pattern for challenge proposals |
| Payload CMS | **Reused** — challenges as new collection |
| Challenge collection (Payload) | **New** |
| `challenge_enrollments` table | **New** |
| `challenge_progress` table | **New** |
| Challenge progress checker | **New** — hook in `logActivity()` |
| Proactive advisory job | **New** — scheduled job for agent scouting |
| Challenge UI components | **New** — progress widget, leaderboard, cards |
| tRPC router (`challenges`) | **New** |

### New tRPC Router: `challenges`

| Procedure | Description |
|-----------|-------------|
| `list` | Active + upcoming challenges |
| `getById` | Challenge detail with objectives |
| `enroll` | Join a challenge |
| `abandon` | Leave a challenge |
| `getMyEnrollments` | Member's active + past challenges |
| `getProgress` | Progress for a specific enrollment |
| `getLeaderboard` | Rankings for a challenge |
| `propose` | Submit a community challenge proposal |

### Proactive Advisory Job

Scheduled function (Vercel Cron) running daily:

```
For each active challenge:
  For each enrolled member with incomplete objectives:
    1. Load member's agent profile + challenge objectives
    2. Run agent search/browse tools scoped to incomplete objectives
    3. Format advice message
    4. Send to member's agent inbox conversation
```

Reuses existing agent MCP tools (browse threads, search, browse events).

### New Activity Event Actions

| Action | Trigger |
|--------|---------|
| `challenge.enrolled` | Member joins a challenge |
| `challenge.completed` | All objectives met |
| `challenge.abandoned` | Deadline passed or member left |
| `challenge.proposed` | Member submits a challenge proposal |
| `challenge.objective_completed` | Single objective met (personal feed only) |

## Out of Scope (YAGNI)

- No real-time WebSocket updates for progress (polling is fine)
- No team-based challenges yet (Phase 4: Showdowns)
- No agent-to-agent interaction
- No custom scoring algorithms (simple objective counting)
- No payment/premium challenges
