# Work-grid dispatch is a claimable pull queue, and AIT is plumbing only

**Status:** accepted
**Builds on:** [ADR-0017](0017-agent-communication-boundary-and-manifest.md), [ADR-0022](0022-agent-commissions-amend-the-communication-boundary.md)

A [[work-grid]] decomposes one problem into independent [[work-cell]]s, fans
them across many participants' [[agent-commission|commissioned]] agents, and
recombines the results. This ADR fixes *how a cell reaches an agent*, *who does
the splitting and merging*, and *how a result is trusted* — the runtime of the
grid. It is the first real implementation of the [[challenge]]
`collaborationModel` field (`swarm`, `relay`, `escalation`, `adversarial`,
`blind`), which has existed as stored metadata but was never built.

## Dispatch is a claimable pull queue, not a push

Participants' agents are **not always-on servers** — "the human's own agent" is
often a local CLI or a sleeping n8n flow, not a hosted endpoint. A push-only
model (POST to a registered webhook) would silently exclude exactly the
human-powered audience the feature exists for.

Therefore a cell lives in a **claim queue**:

- A cell sits in the queue until a commissioned agent **claims** it (a new MCP
  tool, e.g. `claim-work-cell`) when that agent is online and the cell's task
  type matches the agent's [[agent-commission|commission]] envelope.
- **Push is an accelerant, not the mechanism.** Agents with a registered
  `agent_webhook` are pushed a wake signal; everything still lives in the queue
  so offline agents catch it on their next session.
- **Deadline → requeue.** Each cell has a deadline; on expiry it returns to the
  pool for another participant's agent. A sleepy grid self-heals.
- **N-way redundancy / `consensus`.** A correctness-critical cell may be
  dispatched to *N* agents and resolved by consensus — this is the `blind`
  collaborationModel and mirrors the benchmark trust model
  ([ADR-0007](0007-byoa-trust-model.md)). Redundancy multiplies agent labour, so
  it is **opt-in per cell, default off**.

**Result return path (agent → platform): an outbound MCP tool call, not a
webhook.** Agents are MCP *clients*. Having claimed a cell and done the work, an
agent returns its result by calling `submit-cell-result` — the same outbound
pattern as `submit-solution` today — so a laptop-bound CLI that can receive no
inbound webhook still participates fully. The webhook (`agent_webhook`) carries
only the **wake/dispatch signal** in the *platform → agent* direction ("a cell
matching your commission is available"); it is never the channel the result
travels back on. When a returned result must reach the [[orchestrator-cell]] or
requester and that consumer is itself an offline agent, it is woken by the same
push-to-wake-plus-queue mechanism (the merge is itself a cell).

A consequence worth stating plainly: a grid completes **as fast as
participants' agents are awake**, not instantly. That is the honest,
human-powered model — the community's real agents, not rented always-on bots.

## Orchestration is itself a cell

A grid needs something to **split** the problem into cells and **merge** the
results. That something must **not** be an AIT-internal agent — the founding
principle is that all cognition comes from the community's commissioned agents.
So orchestration is expressed as **work-cells run by a participant's own agent**:
the first cell decomposes, the last cell recombines. **AIT provides only
plumbing** — queue, dispatch, deadlines, attribution, and the *transport* of
cell outputs to the merge cell — and **performs no cognition itself**. For
simple challenges the sponsor hand-authors the cells up front (an extension of
the challenge `objectives[]`) and no orchestrator cell is needed.

## Trust is per-cell, reusing the existing verification enum

A cell inherits the existing challenge `verification` enum (`platform-action`,
`test`, `self-report`, `peer-review`) **plus a new `consensus` mode**, chosen
**per cell, not globally** — because the right trust model depends on the task
(code cells gate on `test`; fuzzy cells like *polish-text* use `consensus` or
`self-report`). XP is **verification-gated**: a `consensus`/`test` cell earns, a
`self-report` cell earns little, a cell that fails verification earns zero and
may cost reputation. This is the anti-farm mechanism for
[ADR-0022](0022-agent-commissions-amend-the-communication-boundary.md).

## Two grid modes over one primitive

The primitive above is identical in both modes; only **who may claim a cell**
differs:

- **Competitive grid** — cells claimable only by one [[team]]'s members' agents.
  Preserves competitive integrity; used by a [[hackathon]]
  ([ADR-0024](0024-hackathon-composes-event-and-challenge.md)).
- **Collaborative grid** — cells claimable by any commissioned agent in the
  community; one shared result, XP rewards participation. The direct expression
  of "spread a problem across humans and their agents," and the **MVP** consumer.

## Consequences

- Net-new: the cell queue + claim tool, deadline/requeue, optional N-way
  dispatch + consensus resolution, the `consensus` verification mode, the
  grid-mode eligibility flag, and recombination transport to the merge cell.
- The dispatch/commission machinery is a **platform primitive** kept separate
  from the challenges router; the work-grid is its first and only launch
  consumer, so "polish a message" can later be a one-cell grid with no challenge.
- `collaborationModel` stops being dead metadata and becomes the grid topology
  selector (`swarm` = parallel grid, `relay`/`escalation`/`adversarial`/`blind`
  = other topologies over the same queue).

## Rejected alternatives

- **Push-only (webhook) dispatch** — excludes offline, human-owned agents (the
  core audience); rejected as the mechanism, kept as a wake accelerant.
- **An always-on agent requirement** — would make the grid a hosted-bot race,
  betraying the human-powered ethos; rejected.
- **AIT-internal orchestration AI doing split/merge** — reintroduces the
  internal agent the feature exists to avoid, just at the coordination layer;
  rejected. Orchestration is a commissioned cell.
- **One global trust model** — the codebase already learned (challenges vs
  benchmark) that trust is task-dependent; rejected in favour of per-cell.
