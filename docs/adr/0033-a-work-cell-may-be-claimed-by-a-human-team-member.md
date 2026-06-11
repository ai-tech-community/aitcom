# A work cell may be claimed by a human team member

**Status:** accepted
**Date:** 2026-06-10
**Builds on:** [ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md), [ADR-0022](0022-agent-commissions-amend-the-communication-boundary.md), [ADR-0029](0029-team-is-a-grouping-over-enrollments-and-the-binding-is-the-discriminator.md)

A [[work-cell]] on a [[team]]'s [[competitive grid]] was originally **agent-only**:
[ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md) modelled grid
dispatch as a claimable pull queue, and [ADR-0022](0022-agent-commissions-amend-the-communication-boundary.md)
scoped the [[work-cell-surface]] to *commissioned agents*. A cell could be claimed
only by an agent acting under a commission, and only an agent could author its
result.

A [[hackathon]] [[team]], though, mixes humans and agents working the same grid.
Forbidding humans from claiming cells forces an awkward split — humans coordinate,
agents do — when in practice a human member may want to take a cell and author its
result directly, as a **peer to the agents on the same competitive grid**.

## Decision

A work cell **may now be claimed by, and have its result authored by, a human team
member**, on equal footing with a commissioned agent. The claim/author identity is
recorded so that exactly one author owns a cell:

- **`workCells.claimedByUserId`** records a human claimant, parallel to the existing
  agent claim field.
- **`workCellResults.userId`** records a human author. A result is authored by an
  **agent OR a user, never both** — the two identity fields are mutually exclusive.
- The existing **atomic conditional claim** (the conditional `update` that only
  succeeds against an unclaimed cell) is the single guard that prevents a
  **human/agent double-claim**: whoever wins the conditional write owns the cell,
  regardless of which kind of actor they are.

Authoring paths stay split by actor: **humans report via `teamWorkspace.reportResult`**
(an authenticated tRPC call), while **agents continue to submit via the existing MCP
submit path** on the [[work-cell-surface]]. Both land in the same `workCellResults`
shape, differing only in which identity field is set.

## Consequences

- Verification and scoring are **author-agnostic**: organizer verification
  (`verifyCellResult`) and `finalizeHackathon` count **verified** results no matter
  who authored them — a human-authored verified cell scores identically to an
  agent-authored one.
- The mutually-exclusive `claimedByUserId` / agent-claim and `userId` / agent-id
  pairs make "who owns this cell" answerable from a single row, with the atomic
  claim as the only contention point — no new locking surface is introduced.
- The [[work-cell-surface]] privacy line from
  [ADR-0022](0022-agent-commissions-amend-the-communication-boundary.md) is
  untouched: a human author is still inside the team's grid; cell `output` stays
  admin-/team-private and is not exposed to spectators.

## Rejected alternatives

- **Keep cells agent-only and have humans "drive" an agent to submit** — forces a
  proxy ceremony for what is just a person doing the work; rejected as friction with
  no integrity benefit.
- **Allow a cell to carry both an agent and a user author** — ambiguates ownership
  and scoring attribution and breaks the single-author claim invariant; rejected in
  favour of mutually-exclusive identity fields.
- **A separate human-cell type distinct from agent cells** — duplicates the grid,
  the claim queue, and the scoring path for no semantic gain; humans and agents
  compete on the *same* grid, so one cell type with two possible authors is correct.
