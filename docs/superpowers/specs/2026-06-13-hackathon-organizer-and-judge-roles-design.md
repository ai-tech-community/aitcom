# Hackathon organizer & judge roles — per-hackathon staff grants

**Date:** 2026-06-13
**Status:** approved
**Builds on:** [ADR-0029](../../adr/0029-team-is-a-grouping-over-enrollments-and-the-binding-is-the-discriminator.md) (team/grid/automated-judging), [ADR-0031](../../adr/0031-community-hackathon-operation-is-role-scoped.md) (hackathon ops gated to community owner/admin), and the tabbed organizer manage UI (Setup/Tasks/Analytics/Lifecycle) merged via PR #171.

## Problem

Two gaps in how a hackathon is run:

1. **No delegation.** Running a hackathon (Setup, Tasks, Analytics, lock rosters,
   finalize) is gated entirely to community `owner | admin` (ADR-0031). A
   community admin cannot hand day-to-day operation of one event to a trusted
   helper without making them a community-wide admin.

2. **No human judging.** A team's `finalRank` is computed purely from the sum of
   its verified work-cells; `finalizeHackathon` ranks deterministically and pays
   out. There is no way for human judges to rank submissions or give teams
   feedback.

Both gaps are the same shape: *grant an elevated role on one specific hackathon
to a user who is not a community admin.* This design introduces a shared
per-hackathon **staff grant** and builds two capability surfaces on top — an
**organizer** role (delegated event management) and a **judge** role (rank
submitted teams + leave per-team comments).

## Decisions (from brainstorming)

- **Scope:** per-hackathon grant, not a community-wide role. A grant attaches to
  one challenge (the hackathon discriminator), matching how teams, enrollments,
  and work-cells are keyed.
- **Judging model:** when a hackathon has judges, their aggregated ranking is the
  authoritative `finalRank` and drives payouts; the automated verification score
  becomes reference data judges see while ranking. Hackathons with no judges keep
  the existing automated finalize path unchanged.
- **Comment visibility:** after finalize, a team sees the comments left on *its
  own* submission; organizers and judges see all; nothing is public on the
  leaderboard/spectator view.
- **Organizer powers:** Setup, Tasks, Analytics, and inviting judges. The
  irreversible/payout actions (lock rosters, finalize, award prizes) and granting
  *other* organizers stay restricted to community admins.

## Architecture

One shared grant table with a `role` discriminator, two distinct capability
surfaces, one new lifecycle phase. No change to the community role model
(`owner | admin | moderator | member`).

### Data model

Two new Drizzle tables in `src/server/db/schema.ts`, created via a hand-written
Payload migration in `src/migrations/` (registered in `src/migrations/index.ts`,
applied with `pnpm db:apply` — never drizzle push).

**`app.hackathon_staff`** — the grant:

| column      | type                                   | notes                                   |
| ----------- | -------------------------------------- | --------------------------------------- |
| `id`        | serial pk                              |                                         |
| `challengeId` | int FK → challenge                   | the hackathon discriminator             |
| `userId`    | int FK → user                          | the grantee                             |
| `role`      | enum `organizer` \| `judge`            |                                         |
| `grantedBy` | int FK → user                          | who created the grant                   |
| `grantedAt` | timestamp                              |                                         |
| `revokedAt` | timestamp, nullable                    | soft-revoke; null = active              |

- Unique on `(challengeId, userId, role)` — one grant of each role per person per
  hackathon. A user may hold both roles (two rows); allowed, not forbidden.
- A revoked grant (`revokedAt` set) is inactive: ignored by gating and by judge
  aggregation.

**`app.judge_ranking`** — a judge's verdict, one row per (judge, team):

| column        | type                  | notes                                  |
| ------------- | --------------------- | -------------------------------------- |
| `id`          | serial pk             |                                        |
| `challengeId` | int FK → challenge    |                                        |
| `judgeUserId` | int FK → user         | the ranking judge                      |
| `teamId`      | int FK → team         | the ranked team                        |
| `rank`        | int                   | 1 = best; distinct within a judge      |
| `comment`     | text, nullable        | per-team feedback                      |
| `submittedAt` | timestamp             |                                        |

- Unique on `(challengeId, judgeUserId, teamId)`.
- A judge "submits a ranking" = a set of rows assigning each *submitted* team a
  distinct `rank`, with optional per-team `comment`.

### Permission model

New pure-ish helper `resolveHackathonRole(db, challengeId, userId)` returning the
highest capability the user holds:

```
admin     — community owner/admin (existing isCommunityHackathonAdmin)
organizer — active hackathon_staff grant role=organizer
judge      — active hackathon_staff grant role=judge
null       — none
```

Gating composes on top:

| Action                                            | Required        |
| ------------------------------------------------- | --------------- |
| Lock rosters / finalize / payout                  | `admin`         |
| Grant or revoke **organizers**                    | `admin`         |
| Grant or revoke **judges**                        | `admin` or `organizer` |
| Setup / Tasks tabs (edit)                         | `admin` or `organizer` |
| Analytics tab (read)                              | `admin` or `organizer` |
| Open judging                                      | `admin` or `organizer` |
| Submit/edit own rankings + comments               | `judge` (during judging window only) |

Existing `requireCommunityHackathonAdmin` / `requireHackathonOperator` gates for
lock/finalize are untouched. New gates `requireHackathonOrganizer` (admin or
organizer) and `requireHackathonJudge` wrap `resolveHackathonRole`.

### Lifecycle — one new phase

Today: `lock → hack → captain submits → admin finalizes (automated)`.

New: `lock → hack → submit → judging open → admin finalizes (judge-aggregated)`.

- A new `judgingOpenedAt` timestamp on the challenge (added by the same
  migration), set by an admin/organizer "Open judging" action, gates when judges
  may rank. Only **submitted** teams are rankable.
- **Finalize branches** on "does this hackathon have any active judge grants?":
  - **Judges assigned** → aggregate rankings into `team.finalRank` / `team.score`;
    payouts follow judge order via the existing prize logic.
  - **No judges** → existing automated path (sum of verified cells), unchanged.
- With judges assigned, finalize requires every *active* assigned judge to have
  submitted a complete ranking. An admin can revoke a non-responsive judge's grant
  to unblock. (Quorum-instead-of-all is a deliberate later tweak.)

### Aggregation (extends `src/server/hackathon/scoring.ts`, stays pure/db-free)

New pure function:

```
aggregateJudgeRankings(
  rankings: { judgeUserId, teamId, rank }[],
  automatedScores: Map<teamId, number>,
  submittedAt: Map<teamId, Date>,
): { teamId, finalRank }[]
```

- Average-rank (Borda-style): each team's aggregate = mean of its per-judge ranks.
- Lower mean rank wins. Ties broken by: higher automated verification score →
  earliest submission → `teamId` lexicographic (reuses the existing deterministic
  tiebreak chain in `rankTeams`).
- Finalize writes the returned order to `team.finalRank` (and keeps `team.score`
  as the automated reference), then runs the existing payout (`prizeSplit`,
  badges, `prizeAwardedAt` idempotency guard) against the judge order.

### tRPC surface (in `src/server/api/routers/hackathon.ts` or a sibling router)

- `grantStaff({ challengeId, userId, role })` — gate per table above.
- `revokeStaff({ challengeId, userId, role })` — sets `revokedAt`; gate per table.
- `listStaff({ challengeId })` — organizers + judges with grantee profile.
- `openJudging({ challengeId })` — sets `judgingOpenedAt`; admin/organizer.
- `judgeableTeams({ challengeId })` — submitted teams + artifact + automated score
  (judge-only, judging window).
- `submitRankings({ challengeId, rankings: [{ teamId, rank, comment }] })` —
  upserts the calling judge's rows; validates distinct ranks covering all
  submitted teams; judge-only, judging window.
- `myJudgingProgress` / progress count for the Lifecycle tab (N of M judges done).
- `teamJudgeFeedback({ teamId })` — comments on the caller's own team, post-finalize.
- `finalizeHackathon` — extended with the judge branch described above.

Granting is **immediate** for existing community members (admin/organizer picks
from the member list); the grantee gets an in-app notification via the existing
notification path. No email-invite/accept handshake in v1.

### UI surfaces

- **Staffing** (new) — on the manage **Setup** tab: an admin-only "Organizers"
  list + add-by-member picker + revoke, and a "Judges" list visible/editable to
  admins *and* organizers.
- **Judge workspace** (new page, e.g. `…/events/[slug]/judge`) — list of submitted
  teams with artifact link, summary, and automated score as reference; rank input
  (drag-to-order or numeric) + per-team comment box; "Submit rankings." Gated to
  judges during the judging window.
- **Team feedback** (new) — after finalize, the team workspace shows the comments
  left on *their* submission.
- **Manage Lifecycle tab** — gains an "Open judging" action and a judging-progress
  indicator (N of M judges submitted) ahead of the existing Finalize button.

## Components & isolation

- `resolveHackathonRole` / `requireHackathonOrganizer` / `requireHackathonJudge`
  — single source of truth for the new gates; pure resolution over a membership +
  grants fetch. Testable without HTTP.
- `aggregateJudgeRankings` — pure, db-free, unit-tested alongside existing
  `rankTeams` / `teamScore` in `scoring.ts`.
- Grant/judging mutations — thin tRPC handlers delegating to the gates and a small
  data layer; no business logic inline.
- Judge workspace + staffing UI — client islands hydrated from the new queries,
  following the existing manage-tab pattern.

## Testing

- **Pure unit:** `resolveHackathonRole` (every role/precedence/revoked case);
  `aggregateJudgeRankings` (single judge, panel, ties → each tiebreak level,
  ignores revoked judges).
- **Gating:** each new tRPC procedure rejects the wrong role and the right role
  outside the judging window.
- **Lifecycle/integration:** finalize with judges (judge order wins) vs without
  judges (automated path unchanged); finalize blocked until all active judges
  submit; revoking a judge unblocks; payout idempotency preserved.
- **Drift/migration:** new tables present after `db:apply`; `payload
  generate:types` regenerated and consumers compile.

## Build sequence (for the implementation plan)

1. `hackathon_staff` table + `judgingOpenedAt` + migration + `resolveHackathonRole`
   helper and gates (TDD on the pure resolver first).
2. Organizer surface: widen Setup/Tasks/Analytics gates + staffing UI + grant/
   revoke/list tRPC.
3. Judge surface: `judge_ranking` table + judging-window lifecycle (`openJudging`,
   `judgeableTeams`, `submitRankings`) + judge workspace page.
4. Aggregation in `scoring.ts` + finalize judge-branch + team feedback view.

## Out of scope (v1)

Numeric rubrics / weighted blending of automated + judge scores; judge-to-judge
discussion threads; public comment display; anonymous/blind judging; email
invitations with an acceptance handshake; quorum-based finalize (currently
all-active-judges).
