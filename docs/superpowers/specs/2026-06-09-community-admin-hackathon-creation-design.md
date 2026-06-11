# Community-admin hackathon creation & management — design

**Status:** approved (brainstorming complete)
**Date:** 2026-06-09
**Builds on:** [ADR-0024](../../adr/0024-hackathon-composes-event-and-challenge.md) (hackathon = Event ⋈ Challenge), [ADR-0029](../../adr/0029-team-is-a-grouping-over-enrollments-and-the-binding-is-the-discriminator.md) (binding is the discriminator), the shipped hackathon layers (Plans 1–3).

## Problem

A hackathon is the composition of an Event and a Challenge bound by `event.challengeId`
(ADR-0024). Today, creating one means three separate operations across two
creation paths plus a Payload-CMS-only step:

1. create a Challenge (with `cellTemplate`, `teamConfig`),
2. create a hackathon-type Event,
3. bind them (`hackathon.bindChallenge`),

and the lifecycle gates that follow (`lockRosters`) are **API-only — no UI**.
Worse, **community owners/admins are app-level actors (better-auth /
`communityMemberships`), not Payload CMS users**, so they cannot reach `/admin`
to author a challenge's `cellTemplate` at all. There is no in-app editor for it.

Net effect: a community organizer cannot create or run a hackathon without an
engineer. This design gives a community admin a single, in-app flow to create,
author, publish, and operate a community hackathon.

## Scope

**In scope:** community-scoped hackathons (those with a non-null `communityId`),
created and operated by a community `owner|admin`, entirely in-app.

**Out of scope (stays future work):** Hub-wide hackathons (no community admin
exists for them — they remain an operator/CMS concern); cron auto-lock at event
start; human-rubric judging; the launchpad post-event showcase; the
disband/lock race hardening noted in the Plan-3 review.

## Key decisions (resolved during brainstorming)

1. **Community-scoped only.** Creating from inside a community means both records
   inherit its `communityId`, so the binding invariant
   (`event.communityId === challenge.communityId`, `binding-invariant.ts`) holds
   by construction — an admin cannot produce an unbindable pair.

2. **Scaffold then fill (not one mega-form).** One action creates a correctly
   bound, community-scoped **draft** pair with sensible defaults and an **empty**
   `cellTemplate`; the admin then fills the work decomposition in an in-app
   editor and publishes. Nothing goes live half-defined.

3. **Lifecycle owned: create → publish → lock rosters.** `finalize` already
   exists. `lockRosters` exists but is API-only and is the one remaining blocker
   to a runnable hackathon, so it gets a button. Deferred items (auto-lock, etc.)
   are excluded.

4. **Draft-tolerant single mutation (no distributed-transaction theater).** The
   three writes go through the Payload client and are not one DB transaction.
   Because everything is created `draft` — invisible to calendar, leaderboard,
   and spectator view — a mid-sequence failure leaves at most an invisible draft
   the admin can retry or delete. No compensating cleanup.

5. **`objectives` decoupled from `cellTemplate`.** The `challenges` collection
   requires `objectives` (`minRows: 1`), but a hackathon scores from
   `cellTemplate` work-cells and never reads objectives; per ADR-0029 the binding
   is the discriminator, so the collection cannot conditionally require objectives
   based on hackathon-ness. Resolution: **relax `objectives` to optional at the
   collection level** and keep the "≥1 objective" rule in the single-actor
   `challenges.create` Zod, where the context is known. (Collection validation
   only — no DB migration. ADR candidate.)

6. **Single-source identity + derived timing.** The admin types one name, one
   description, one event window, one team-size range; the flow fans them across
   both records (`event.title`/`challenge.title` = name; both slugs derived and
   collision-suffixed; `challenge.startsAt/endsAt` derived from the event window).
   Per-record refinement happens later in the editor.

7. **In-app `cellTemplate` editor (admins never touch the CMS).** A repeatable
   "add task" UI (description / taskType / verificationMode / deadline), modeled
   on the existing objectives-list pattern, writes `cellTemplate`. This is the
   real new build.

8. **Role-scoped operation.** Operating a community hackathon
   (edit/publish/lock/finalize) is gated on **any active `owner|admin` of the
   hackathon's community**, not on `challenge.creatorId`. Co-admins cover for each
   other at a time-boxed deadline. `creatorId` remains provenance only. This
   diverges from the existing creator-scoped `requireChallengeSponsor`. (ADR
   candidate.)

## Architecture

### Collection change (no migration)
- `src/collections/Challenges.ts`: `objectives` — remove `required` and
  `minRows: 1` (becomes optional). The "≥1 objective" invariant moves to the
  single-actor `challenges.create` input schema.

### Backend — `hackathon` router (`src/server/api/routers/hackathon.ts`)

New authz gate:
- **`requireCommunityHackathonAdmin(challengeId, userId)`** — resolves the
  challenge; asserts `challenge.communityId` is non-null; asserts the caller has
  an **active** `owner|admin` membership of that community (mirrors the
  `createEvent` role check in `events.ts`). Returns the challenge doc. Used by all
  lifecycle mutations below. `requireChallengeSponsor` is retained for any
  Hub/CMS path.

New / changed mutations:
- **`createHackathon`** (new) — input: `communitySlug`, `name`, `description`,
  event window (`date`, `startTime`, `endTime`, `format`, `location`),
  `teamMin`, `teamMax`. Authz: community `owner|admin` (resolve community by slug,
  check membership). Behavior (ordered, draft-tolerant):
  1. create **Challenge** (Payload): `status=draft`, `creatorId`/`publishedBy` =
     admin, `communityId`, `title`=name, derived `slug`, `description`,
     `type=open-ended`, `difficulty=intermediate`, `rewards.xpReward=0`, empty
     `objectives`, empty `cellTemplate`, `teamConfig={minTeamSize,maxTeamSize}`.
  2. create **Event** (Payload): `status=draft`, `type=hackathon`, same
     `communityId`, `title`=name, derived `slug`, timing from input.
  3. set `event.challengeId = challenge.id` (validate `assertBindable` first).
  On any step's failure, surface the error and leave the invisible draft(s).
  Returns `{ eventId, eventSlug, challengeId }` for redirect.
- **`updateHackathon`** (new) — edit identity / window / `teamConfig` / prize
  (`xpReward`, `sponsorReward`, `badgeReward`) **and the `cellTemplate` task
  list**. Authz: `requireCommunityHackathonAdmin`. Validates `cellTemplate` rows
  against `cellTemplateSchema` (`src/server/hackathon/cell-template.ts`).
- **`publishHackathon`** (new) — validate **≥1 `cellTemplate` row**; set
  `event.status=published` and `challenge.status=active` (the `challenges` status
  enum is `draft | active | completed | archived` — there is no `published`).
  Opens team formation (team mutations already require a published hackathon
  event). Authz: `requireCommunityHackathonAdmin`.
- **`lockRosters`** (existing) — swap gate `requireChallengeSponsor` →
  `requireCommunityHackathonAdmin`. Now also callable from the UI.
- **`finalizeHackathon`** (existing) — swap gate likewise; surfaced on the manage
  route.

### Frontend
- **Entry:** admin-only **"Create hackathon"** button on
  `src/app/[locale]/communities/[slug]/events/page.tsx`, beside the existing
  create-event action → light create modal (the `createHackathon` fields).
- **Manage route (new):**
  `src/app/[locale]/communities/[slug]/events/[eventSlug]/manage/` — admin-gated
  (redirect non-admins). The authoring + operating home:
  - editable identity / window / `teamConfig` / prize,
  - the in-app **`cellTemplate` task editor** (repeatable; calls
    `updateHackathon`),
  - lifecycle controls **Publish · Lock rosters · Finalize** + current status
    display.
- **Public event page** (`src/app/[locale]/events/[slug]/page.tsx`):
  `HackathonPanel` unchanged **except the Finalize button is removed** (relocated
  to the manage route). Members still get team formation + the spectator view.
- **i18n:** new keys in `messages/en.json` and `messages/nl.json` under
  `hackathon` (create form, task editor, lifecycle controls).

### Component boundaries
- `createHackathon` modal — pure presentational form + one mutation call.
- Cell-task editor — a self-contained repeatable-list component (mirrors the
  objectives list in `sponsor-challenge-form.tsx`) whose only dependency is the
  `cellTemplate` shape; reused for create-time and edit-time.
- Lifecycle control strip — buttons bound to `publishHackathon` / `lockRosters` /
  `finalizeHackathon`, each disabled/guarded by current status.

## Lifecycle / status

```
draft  ──Publish (≥1 cell)──▶  published  ──Lock rosters──▶  locked  ──Finalize──▶  finalized
(manage-route only)            event=published,             (grids built;          (score / rank /
                               challenge=active             teams work, submit)     prize awarded)
                               (teams form)
```

(`published`/`locked`/`finalized` above name the hackathon's overall phase; the
underlying records carry their own status — event `draft→published`, challenge
`draft→active`. The team's `forming→locked` transition is what `Lock rosters`
drives.)

Pre-publish, the hackathon is visible only on the manage route (the event is
`draft`, so it is not listed and the public panel does not render).

## Testing

- **Unit:** slug derivation (collision suffixing) and the challenge/event
  default-field builder used by `createHackathon`.
- **Integration** (follow `work-grid.integration.test.ts`; may be DB-skipped):
  - `createHackathon`: non-admin rejected; admin produces a bound draft pair with
    correct `communityId` on both and empty `cellTemplate`.
  - `publishHackathon`: blocked with 0 cells; succeeds with ≥1, flipping both
    records to `published`.
  - Role-scoped operation: a co-`owner|admin` (not the creator) can lock/finalize;
    a non-admin member is rejected.

## ADR candidates
- **Role-scoped operation of community hackathons** (decision 8) — diverges from
  creator-scoped `requireChallengeSponsor`; surprising without context; genuine
  trade-off (creator vs. role).
- **Objectives decoupled from cells** (decision 5) — a future reader will ask why
  `objectives` is optional; the answer is the hackathon/single-actor split under a
  flagless discriminator.
