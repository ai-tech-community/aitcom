# A hackathon composes an Event and a Challenge; Team is the new concept

**Status:** accepted
**Builds on:** [ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md)

The platform wants to host hackathons. A hackathon is both a **time-boxed event**
(kickoff, hacking window, submission deadline, judging) and a **competitive
challenge** (a problem, submissions, scoring, prizes) — and it is **team-based**.
The codebase already has an `events` collection (whose domain explicitly
includes "hackathons", with `event_registration`, reminders, Luma sync) and a
`challenges` domain (objectives, submissions, channel, leaderboard, XP) — but
challenges are **single-actor** (`unique(userId, challengeId)`). This ADR fixes
how a hackathon maps onto those existing models.

## A hackathon is Event ⋈ Challenge — composition, not a new entity

A **hackathon is the composition of an Event and a Challenge**, not a new
top-level entity that swallows them:

- the **Event** owns *when it runs and who attends* — reusing
  `event_registration`, reminders, calendar, Luma sync;
- the bound **Challenge** owns *the problem, the work, the scoring* — reusing
  objectives, submissions, channel, leaderboard, XP;
- the hackathon problem is fanned across teams via a **competitive**
  [[work-grid]] ([ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md)).

Both an Event and a Challenge are [[shared-surface]]s, so a hackathon inherits
the Hub-wide / community-scoped distinction via the same `communityId` rule for
free.

## Team is the one genuinely new concept

Both underlying models are single-actor (one enrolment, one RSVP), so the only
new domain concept a hackathon requires is the **[[team]]**: a group of members
and their commissioned agents that enters as one competing unit, sharing one
submission, one leaderboard position, and earning/splitting XP as a unit. A
team's work-grid runs in **competitive** mode — cells claimable only by that
team's own members' agents — which preserves competitive integrity.

## Sequencing

The competitive hackathon is built **on top of a proven primitive**: the
collaborative work-grid ships first as the MVP
([ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md)), de-risking
the commission→dispatch→result loop against real offline agents with no teams or
judging in the way. Teams, judging, prizes, and the Event binding are the
**additive layer** that turns the proven grid into a hosted competitive event.

## Consequences

- Net-new: the `team` concept (membership, shared submission, shared leaderboard
  slot), an Event↔Challenge binding, the competitive grid-mode eligibility
  (already provided by [ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md)),
  and judging/prizes (the `sponsorReward`/`badgeReward` fields already exist as a
  starting point).
- No `hackathon` table swallows events/challenges; the event and challenge rows
  remain independently usable, and the hackathon is their join.

## Rejected alternatives

- **A standalone Hackathon entity referencing both** — cleanest on paper but
  duplicates event machinery (registration, reminders, Luma) and challenge
  machinery (objectives, submissions, scoring) already paid for; rejected.
- **A Challenge with event-timing bolted on** — would re-implement the event
  registration/reminder/Luma stack inside challenges; rejected.
- **Skipping teams (individual hackathon)** — not a hackathon; the team is the
  defining shape and the unit the competitive grid scopes to; rejected.
