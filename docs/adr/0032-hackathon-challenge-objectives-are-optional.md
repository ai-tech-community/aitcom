# A hackathon challenge's objectives are optional; the cell template carries the work

**Status:** accepted
**Builds on:** [ADR-0024](0024-hackathon-composes-event-and-challenge.md), [ADR-0029](0029-team-is-a-grouping-over-enrollments-and-the-binding-is-the-discriminator.md), [ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md)

A single-actor [[challenge]] decomposes into `objectives` (verification targets a
lone participant completes). A [[hackathon]] challenge decomposes into a
`cellTemplate` — the array of [[work-cell]]s fanned across each [[team]]'s
[[competitive grid]] — and its score is the sum of *verified cell* weights
(`scoring.ts`, `finalizeHackathon`). The hackathon scoring path **never reads
`objectives`**.

Yet the `challenges` collection requires `objectives` (`minRows: 1`). And per
[ADR-0029](0029-team-is-a-grouping-over-enrollments-and-the-binding-is-the-discriminator.md)
**the binding is the discriminator** — there is no "is hackathon" flag on the
challenge — so the collection cannot conditionally require objectives based on
hackathon-ness: at validation time a challenge row cannot know whether an Event
will bind it.

Forcing every hackathon challenge to carry a synthetic placeholder objective just
to satisfy the collection pollutes the model with data nothing reads.

## Decision

`objectives` becomes **optional** at the collection level (drop `required` /
`minRows: 1`). The "a single-actor challenge needs ≥1 objective" rule moves to the
single-actor `challenges.create` input schema, the one creation path where the
context (this is a single-actor challenge) is actually known.

A hackathon challenge therefore legitimately carries **empty `objectives` + a real
`cellTemplate`**. The two decompositions stay distinct concepts, never collapsed.

This is collection validation only — `minRows` is not a database constraint — so
no migration is required.

## Consequences

- Hackathon challenges are valid with no objectives; the work lives entirely in
  `cellTemplate`, matching how they are actually scored.
- The "≥1 objective" guarantee for single-actor challenges is preserved, enforced
  at `challenges.create` instead of in the collection.
- A future reader sees `objectives` optional and finds the reason here rather than
  guessing it was an oversight.

## Rejected alternatives

- **Synthesize a placeholder objective** for hackathon challenges — keeps the
  collection untouched but seeds every hackathon with fake, unread data; rejected.
- **Reuse `objectives` as the cells** — different verification semantics, different
  scoring, different actor model (one person vs. a team's grid); collapsing them
  breaks [ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md)/[ADR-0029](0029-team-is-a-grouping-over-enrollments-and-the-binding-is-the-discriminator.md); rejected.
