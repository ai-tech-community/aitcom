# Operating a community hackathon is role-scoped, not creator-scoped

**Status:** accepted
**Builds on:** [ADR-0024](0024-hackathon-composes-event-and-challenge.md), [ADR-0029](0029-team-is-a-grouping-over-enrollments-and-the-binding-is-the-discriminator.md)

The shipped hackathon lifecycle gates (`lockRosters`, `finalizeHackathon`) authorize
via `requireChallengeSponsor`, which checks `challenge.creatorId === caller` — the
single member who created the challenge. That was correct when a hackathon was set
up by one sponsor through the CMS. It is wrong once a **[[community admin]]** creates
and runs a community hackathon in-app, because:

- a hackathon is **time-boxed** — rosters must lock and results must finalize at a
  deadline; if only the creator can do it and they are unavailable, the contest stalls;
- community management is already a **role**, not a person — `createEvent` gates on
  any active `owner|admin`, and co-admins are expected to cover for each other.

## Decision

For a **community-scoped** hackathon (its [[challenge]] has a non-null `communityId`),
operating it — edit, publish, lock rosters, finalize — is gated on the caller being
an **active `owner|admin` of that community**, via a `requireCommunityHackathonAdmin`
gate. `challenge.creatorId` is retained as **provenance** ("who set it up"), not as
the operating key.

`requireChallengeSponsor` is kept for any Hub-wide / CMS-authored path, where no
community admin exists.

## Consequences

- Any owner/admin of the community can run the contest; the creator naturally
  qualifies. No single point of failure at the deadline.
- The two gates coexist: role-scoped for community hackathons, creator/CMS-scoped
  for Hub-wide ones. The discriminator is `challenge.communityId` being non-null.
- Authority over a hackathon now tracks **current** community roles — a demoted
  admin loses operating rights, which is the intended behavior.

## Rejected alternatives

- **Keep creator-scoping** — simplest, but strands a time-boxed contest behind one
  person and contradicts how every other community-management action is gated.
- **Co-sponsor list on the challenge** — an explicit per-hackathon allow-list
  duplicates the community role model that already answers "who may manage this";
  rejected as redundant state that can drift from membership.
