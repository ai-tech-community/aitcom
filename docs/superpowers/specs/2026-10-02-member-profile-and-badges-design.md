# Member profile and badges — design

**Date:** 2026-10-02
**Status:** proposed
**Decision record:** [ADR-0039](../../adr/0039-badges-are-a-typed-catalog-in-code-awarded-from-source-data.md)
**Builds on:** the member dashboard frame (#401), whose side panel already shows a member's badges.

## Goal

A member's profile tells a visitor who this person is and what they have
built here, at a glance. Badges are things members want to earn: each one
is a recognisable emblem, says how rare it is, and — for the owner — shows
how close the next one is.

Today the profile is a single centred column. Only 8 of the 26 catalog
badges can be earned, because the award checks for attendance, challenges
and agents are never called and several badges have no trigger at all.
Every badge renders as the same trophy. Badges stored outside the catalog
(benchmark coverage, challenge prize text) are counted but not shown, so
the badge count disagrees with the grid. Tier ("Novice") and level
("LVL 4") are two scales for the same XP shown side by side.

## Decisions (settled in brainstorming)

| Topic | Decision |
|---|---|
| Layout | Identity panel + tabs. A sticky identity panel on the left; route tabs on the right: Overview · Badges · Activity · Work · Agent |
| Badge style | Emblems drawn in code (SVG): one shape and glyph per track, a ring that grows richer with each tier. Theme-aware, no artwork to maintain |
| Locked badges | Only the owner sees badges they have not earned, with progress ("3 of 5 articles"). Visitors see earned badges only |
| Order | 1) privacy and count fixes, 2) profile frame with today's badges, 3) badge system, 4) emblems and badge UI, 5) the earning moment. The frame comes first so the new profile is visible early; later slices fill it |
| Catalog | A typed catalog in code; earning is computed from source data, never from a counter (ADR-0039) |
| Level vs tier | One label: "Level 4 · Novice". Level is derived from XP, not read from the stored column |

## Badge system

### Kinds

- **Track badges.** A track measures one kind of contribution and has
  three tiers (I, II, III). Earning tier II implies tier I.
- **Milestones.** One-off steps without tiers: profile complete,
  onboarding complete.
- **Limited editions.** Cannot be earned any more, or only at one moment:
  Early adopter (first 100 members). Shown with a distinct finish.
- **Awards.** Prizes from a specific hackathon or challenge ("Winner —
  RAG Hack 2026"). They carry the challenge they came from and show its
  name. Today these are stored as free text in `member_badge.badgeSlug`;
  slice 2 moves them to their own records (see Data).

### Tracks

Thresholds below are a starting point; they live in the catalog and can be
tuned without a migration (an already-earned badge is never revoked).

| Track | Measures (source) | I | II | III | Existing slugs kept |
|---|---|---|---|---|---|
| Regular | events attended (`event_registration.status = attended`) | 1 | 3 | 10 | `first_event`, `regular`, `veteran` |
| Host | native events organised that took place (Payload `events.organizerId`, past, not cancelled) | 1 | 5 | 15 | — |
| Challenger | challenges completed (`challenge_enrollment.status = completed`) | 1 | 5 | 15 | `first_challenge` |
| Writer | articles published and approved (Payload `articles`) | 1 | 5 | 15 | `article_author`, `prolific_writer` |
| Builder | launchpad projects published | 1 | 3 | 10 | `first_launch` |
| Learner | courses completed (`course_certificate`) | 1 | 3 | 10 | `course_complete` |
| Teacher | enrolments in courses the member authored | 10 | 50 | 250 | — |
| Connector | referrals activated (`referral_credit`) | 1 | 5 | 20 | — |
| Agent wrangler | contributions of the member's agent (`agent_profile.totalContributions`) | 10 | 50 | 250 | `agent_master` |
| Benchmarker | benchmark coverage (existing coverage logic) | first | 10 | 50 | `benchmark-coverage-first`, `-10`, `-50` |
| Streak | longest daily streak (`computeStreakData`) | 7 | 30 | 100 | — |

Kept as milestones: `profile_complete`, `onboarding_complete`,
`tutorial_creator`. Limited edition: `early_adopter`.

Removed from the catalog (never awardable, no stored rows expected — the
backfill verifies this before removal): `speaker`, `challenge_streak_3`,
`challenge_streak_10`, `mission_impossible`, `challenge_proposer`,
`repo_first`, `test_perfect`, `challenge_helper`, `sponsor_pick`,
`challenge_author`, `speed_demon`, `agent_collab`, `streak_10`.
`speaker` returns once speakers are linked to member accounts.

Existing slugs stay the stored identifiers of their tier, so no stored row
is renamed.

### Earning

- **One engine.** `src/server/badges/` owns earning. Each track declares a
  `metric(db, userId) → number` read from the source tables, and the
  catalog declares thresholds. `evaluateBadges(db, userId, trackIds)`
  computes the metric and inserts every tier now reached
  (`ON CONFLICT DO NOTHING` on the existing `(userId, badgeSlug)` unique
  index). Idempotent, so it is safe to call twice or to re-run as a
  backfill.
- **Hooks name the track, not the rule.** Event check-in calls
  `evaluateBadges(..., ["regular"])`, an approved article calls
  `["writer"]`, and so on. Thresholds live only in the catalog. The
  scattered `check*Badges` helpers in `src/lib/gamification.ts` are
  removed.
- **XP on earning** stays where it is today (e.g. first event bonus) and is
  granted only when the insert actually created the row.
- **Backfill.** A script evaluates every track for every member, so
  members get what they already qualify for. It is a production action:
  prepared and tested against the test database, run by the owner.
- **Notifications.** Earning a badge creates a notification ("You earned
  Writer II"), which also feeds the earning moment in slice 5.

### Rarity

"Earned by 4% of members": holders of the badge ÷ members with a profile,
computed in one grouped query and cached for an hour. Shown on the badge
detail and the Badges tab. Under 1% shows as "Fewer than 1%". Limited
editions show the absolute number ("1 of 100").

### Emblems

- **Shape per track** (hexagon, shield, circle, diamond, …) with a glyph
  inside, drawn as one `BadgeEmblem` SVG component from catalog data.
- **Tier ring**: I a hairline ring, II a double ring, III a solid band with
  a fine pattern. The shape stays the same, so a member recognises the
  track at a glance.
- **Colour** comes from the chart tokens (`--chart-*`), one hue per track,
  low chroma, on a neutral fill. Signal Orange is not used (One Voice).
  Limited editions get a subtle sheen that moves on hover; with
  `prefers-reduced-motion` it is static.
- **Locked** (owner only): outline only, muted, with the progress to the
  next tier as a thin arc and text ("3 of 5").
- Every emblem has an accessible name: "Writer, tier II, earned 3 March
  2026".

## Profile

### Frame

```
┌──────────────────────┬──────────────────────────────────────────────────┐
│ IDENTITY (sticky)    │ Overview · Badges · Activity · Work · Agent      │
│ avatar               ├──────────────────────────────────────────────────┤
│ Name                 │ Overview                                         │
│ Level 4 · Novice     │   bio                                            │
│ ▓▓▓▓▓▓░░ 753 XP      │   / SHOWCASE  three pinned badges, large         │
│ @ Company            │   / SKILLS                                       │
│ GitHub ✓  LinkedIn   │   / RECENT WORK  latest 3 items from Work        │
│ [Message]            │                                                  │
│ Member since 2025    │                                                  │
│ / COMMUNITIES        │                                                  │
│ 3 public communities │                                                  │
└──────────────────────┴──────────────────────────────────────────────────┘
```

- Full width, the same grid as the dashboard but with the panel on the
  left: `lg:grid-cols-[20rem_minmax(0,1fr)]`, sticky on `lg`, stacked above
  the tabs on small screens (a compact identity header).
- Tabs are `RouteTabs`, one URL each: `/members/[id]`, `/badges`,
  `/activity`, `/work`, `/agent`. The existing agent page becomes the Agent
  tab; it is shown only when the member has an active agent.
- One `h1` (the member's name) per page.

### Tabs

- **Overview**: bio, a showcase of up to three badges the owner pins (the
  three rarest when nothing is pinned), skills, and the latest three items
  from Work.
- **Badges**: earned badges grouped by kind (tracks, milestones, limited
  editions, awards), each with tier, date and rarity. For the owner, locked
  tiers with progress, and a "Pin to showcase" action.
- **Activity**: a public year calendar of days with activity, from
  `points_event` (amounts and dates only — reasons are not shown), plus
  current and longest streak.
- **Work**: published articles, launchpad projects, courses authored,
  certificates (hackathon and course), and events hosted.
- **Agent**: the member's agent, as today.

### Visibility

- **Visitors**: only public profiles (`publicRosterVisibility`); the owner
  always sees their own, with a notice when it is private (slice 1).
- **Communities in the identity panel**: listed communities, plus unlisted
  ones only when the viewer is an active member too
  (`content-visibility.ts`). The Hub is not listed (ADR-0019).
- **Work items** respect their own visibility: articles published and
  approved; launchpad projects and forum content only from communities the
  viewer can read (`communityContentReadableWhere`).
- **Activity calendar** reads `points_event`, never `activity_event`,
  whose rows carry private context.
- Every public procedure returns an explicit DTO (slice 1 pattern).

### Owner affordances

On their own profile the owner sees: an "Edit profile" link (to
`PROFILE_SETTINGS_HREF`), locked badges with progress, and showcase pinning.
Nothing else changes, so the owner sees what visitors see.

## The earning moment

- When a member has unseen earned badges, the next page load shows a short
  celebration dialog: the emblem, the name, the rarity, and two actions —
  "Show on my profile" (pin) and "Share".
- **Share** opens a public badge page `/members/[id]/badges/[slug]` with an
  Open Graph image of the emblem and the member's name, for LinkedIn or X.
  It respects the profile's visibility (a private profile has no public
  badge page).
- Seen state is stored per badge row (`seenAt`), so it fires once.

## Data

| Change | Why |
|---|---|
| `member_badge.seenAt` (nullable timestamp) | earning moment fires once |
| `member_profile.showcaseBadges` (text[] of slugs, max 3) | pinned showcase |
| `member_award` (userId, challengeId, label, earnedAt; unique userId+challengeId+label) | awards get a source and a name instead of free text in `badgeSlug` |
| Backfill: free-text `badgeReward` rows in `member_badge` → `member_award`, matched to their challenge | the count and the grid then agree |

Migrations are hand-written in `src/migrations/`, additive and idempotent.

## Slices

1. **Privacy and counts** (#408) — explicit public DTOs, owner can see
   their own private profile, agent page follows profile visibility,
   badge count equals what is shown, one fetch per view.
2. **Profile frame** — identity panel + route tabs, the combined level
   label, Overview, Activity (public calendar procedure), Work, Agent tab.
   The Badges tab shows today's earned badges with the existing component;
   the showcase shows the most recent three until pinning exists.
3. **Badge catalog and engine** — typed catalog with tracks, milestones and
   limited editions; `evaluateBadges` and hooks at every source; removal of
   the dead badges and `check*Badges` helpers; `member_award` and its
   backfill; rarity query; backfill script for the owner to run.
4. **Emblems and badge UI** — `BadgeEmblem`, the full Badges tab (kinds,
   rarity, owner progress), showcase pinning (`showcaseBadges`); the
   dashboard You card and `/members` list use the same component; replaces
   `AchievementBadge`.
5. **The earning moment** — notification, celebration dialog, public badge
   page with Open Graph image.

## Rejected

- **Badges as a Payload collection editable by admins.** Earning rules are
  code (each track is a query); an admin-defined badge without a rule
  would be another badge that can never be earned. Awards cover the
  per-event case that admins do need.
- **Illustrated badge art.** Richer, but every new track needs new art and
  dark-mode variants; emblems from code scale with the catalog.
- **A counter column per track.** Counters drift from their source; the
  metric is read from the source when something happens.
- **Showing locked badges to visitors.** A visitor sees what a member did,
  not a grid of what they did not.
- **One long page with a side panel instead of tabs.** Work and Activity
  grow over time; tabs keep each one a page with its own URL and data.
