# Team is a grouping over enrollments, and the hackathon binding is its discriminator

**Status:** accepted
**Builds on:** [ADR-0024](0024-hackathon-composes-event-and-challenge.md), [ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md), [ADR-0022](0022-agent-commissions-amend-the-communication-boundary.md)

[ADR-0024](0024-hackathon-composes-event-and-challenge.md) fixed that a
[[hackathon]] is `Event ⋈ Challenge` and named the [[team]] the one genuinely new
concept, but deliberately left the **schema shape** of teams, the binding, and
the competitive [[work-grid]] open. This ADR fixes those three load-bearing
shapes. All three were chosen to keep the [[agent-commission]] **claim hot-path**
([ADR-0022](0022-agent-commissions-amend-the-communication-boundary.md) source
scope) untouched — that is the through-line.

## A team is a grouping over enrollments, not a replacement

A hackathon [[challenge]] is team-based, but every existing mechanism — the
source-scope claim check, per-objective progress, test results — keys off a
per-*user* `challenge_enrollment` row with `unique(userId, challengeId)`. So a
team **groups** enrollments rather than replacing them:

- each member keeps their own `challenge_enrollment` row (carrying a new nullable
  `teamId`), so source-scope, progress, and test machinery are **unchanged**;
- a new `team` row carries only the *shared* artifacts — one submission, one
  leaderboard slot, one XP pool;
- `unique(userId, challengeId)` is kept, which gives **one team per member per
  hackathon for free**.

The hot-path consequence is the whole point: when a member's commissioned agent
calls `claim-work-cell`, the eligibility check still asks "is this owner enrolled
in this challenge?" — already true, no rewrite. The team adds *one* predicate
(below), not a new trust boundary.

## The binding is a nullable `events.challengeId` — and it is the discriminator

A hackathon is the join of an existing `events` row and an existing `challenges`
row (both Payload collections). The join is **1:1-optional**, so it needs no join
table — a single nullable `challengeId` on `events` expresses "this hackathon
event runs *this* challenge." The event is the user-facing hackathon surface
(registration, reminders, Luma, calendar), so it naturally references its
challenge.

The binding is also the **only** signal that a challenge is team-based: a
challenge is team-based / competitive **exactly when** it is bound to a hackathon
event. There is no separate `format` flag to drift out of sync — *being a
hackathon* and *being team-based* are the same fact. One invariant guards it:
binding requires `event.communityId === challenge.communityId`, so the Hub-wide /
community-scoped distinction both inherit ([ADR-0024](0024-hackathon-composes-event-and-challenge.md))
cannot be broken by binding across scopes.

## One competitive grid per team

A competitive [[work-grid]] gains a nullable `teamId` (collaborative grids leave
it null). At **roster lock** (the hacking window opening — when membership is
frozen, per [[team]]) the platform instantiates **one competitive grid per team**
by cloning the challenge's hand-authored `cellTemplate[]` (the sponsor decomposes
up front, per [ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md);
the orchestrator cell stays deferred). Every team races an identical
decomposition independently.

The **only net-new claim predicate** over a collaborative grid is "the claimer's
owner is a member of *this* grid's team," evaluated alongside the unchanged
source-scope check. Cells, deadlines, requeue, results, and `submit-cell-result`
are reused verbatim.

## Scoring and rewards reuse the verification-gated path

These calls are reversible, so they are recorded here as consequences rather than
their own ADR:

- **Judging is automated and verification-driven for the MVP.** A team's score is
  the sum of its *verified* cell weights (the existing per-cell `verification`
  enum and weights), ranked into one leaderboard slot per team with `rankingMode`
  as the tiebreak, then confirmed at a sponsor/creator **finalize** gate. A human
  rubric judge panel is a deferred fast-follow.
- **A team's submission is the recombined competitive-grid output** (its verified
  cells) plus an optional captain-attached artifact, frozen by the captain's
  submit at the deadline. There is no separate freeform submission entity.
- **Rewards.** Per-cell XP is reused as-is (the claiming owner earns per verified
  cell — bounded by the fixed template, so not farmable). The challenge's prize
  XP is **split equally** among the winning team's members; the badge is granted
  to **all** winners; the sponsor reward is a description attributed to the team
  and fulfilled off-platform. Winner-takes-prize for the MVP; ranked-prize scaling
  is a trivial fast-follow.

## Consequences

- Net-new: the `team` table (captain, roster, status), a nullable
  `challenge_enrollment.teamId`, a nullable `events.challengeId` binding, a
  nullable `work_grid.teamId`, the challenge `cellTemplate[]`, the one added claim
  predicate, the team submission + leaderboard slot, and the finalize/prize step.
- The [[agent-commission]] source-scope check, progress, test, requeue, and result
  transport are **unchanged** — the layer is additive.
- A commission revoked mid-hack ([ADR-0022](0022-agent-commissions-amend-the-communication-boundary.md)
  is revocable) simply stops that member's agent from claiming further cells; no
  special hackathon handling is required.

## Rejected alternatives

- **Team replaces enrollment (the team is the enrolment unit)** — would rewrite
  the source-scope claim check, progress tracking, and `unique(userId,
  challengeId)`, i.e. the grid's trust boundary, for no gain; rejected.
- **An explicit `format: solo | team` flag on the challenge** — a second source of
  truth that can disagree with the binding; rejected in favour of the binding
  being the discriminator.
- **A `hackathon(eventId, challengeId)` join table** — a 1:1-optional relationship
  needs no join table, and [ADR-0024](0024-hackathon-composes-event-and-challenge.md)
  already steered away from a separate hackathon entity; rejected.
- **One shared competitive grid with team-tagged cells** — forces team-scoping
  into every cell query and muddies the collaborative grid (which has no team);
  rejected in favour of one grid per team.
