# Agent commissions amend the communication boundary

**Status:** accepted
**Builds on:** [ADR-0015](0015-community-surfaces-are-human-authored.md), [ADR-0017](0017-agent-communication-boundary-and-manifest.md)

The platform wants a human to **trigger another participant's agent on demand**
— "spread a problem across humans and their agents," "polish this message" —
and have the agent execute and return a result. Taken literally this breaks two
Hub-invariants: [ADR-0017](0017-agent-communication-boundary-and-manifest.md)
(an agent's only counterpart is its owner) and
[ADR-0015](0015-community-surfaces-are-human-authored.md) (agents draft, humans
publish). This ADR resolves the conflict by introducing a **commission** — a
deliberate, scoped evolution of the boundary — rather than abandoning it. The
power still comes from the human's own agent and only with the human's consent;
an AIT-internal agent is never the actor.

## The commission

A **commission** is a standing, scoped, revocable grant by which an [[owner]]
pre-authorises *their own* agent to accept and execute tasks triggered by a
**commissioned source** (at launch: the platform, on behalf of a [[challenge]]
the owner opted into) — without the owner approving each individual invocation.

ADR-0017 invariant #1 ("owner-only channel") is amended from *"owner only"* to
**"owner, or a source the owner has commissioned"**. The amendment is bounded:

1. **Scoped, not open.** A commission names **task types** drawn from an
   allowlist (e.g. `polish-text`, `solve-code-cell`) and a **source scope**
   (e.g. *challenges I am enrolled in*). A request outside that envelope is
   rejected before the agent sees it. The owner-only boundary is unchanged
   everywhere outside the envelope.
2. **The boundary still holds for the agent's internals.** A commissioned
   request may ask for **task output only** — never that the agent read or
   expose its owner's DMs, inbox, or any [[no-go-surface]]. The commission
   widens *who may ask for work*, not *what the agent may touch*.
3. **Revocable, instantly.** Revoking the commission closes the channel at once.
4. **Attributed.** A commissioned result is always labelled "X's agent,
   commissioned."

## Output: the work-cell surface

[ADR-0015](0015-community-surfaces-are-human-authored.md) requires agent output
to a *community surface* to be a human-published draft. A commissioned result
does **not** flow to a community surface — it flows to a **work-cell surface**,
a third surface class peer to *draft-allowed* and *no-go*:

- A work-cell surface is a sandboxed, opt-in space that exists to *consume*
  agent output (a challenge work-cell reached through a commission).
- On it a commissioned result **auto-returns without per-result owner
  approval**, because the consent ADR-0015 wants was **front-loaded into the
  commission grant** and everyone present expects agent output.
- The moment a commissioned result would touch a human community surface
  (forum, feed) it **reverts to draft-don't-post**. ADR-0015 is satisfied where
  it was meant to apply, not broken.

## The manifest clause

Per [ADR-0017](0017-agent-communication-boundary-and-manifest.md), capabilities
agents hold are stated in the Hub-invariant manifest. **Commissioned execution
is a new, separately-acceptable manifest clause** and is **off until the owner
accepts the manifest version that introduces it** — reusing the existing
`MANIFEST_VERSION` bump → `contribute`-scope-suspension machinery, so there is
**no silent capability gain**. Existing owned agents are not retroactively
granted commissioned execution; they gain it only on accepting the new version.

## Reputation

The **owner earns** for a commissioned cell (the owner stood up the commission
and bears accountability), but **XP is verification-gated** (see
[ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md)) and a
commissioned cell **does not count toward the activation / active-member
signal** — activation measures the human showing up, and an agent claiming a
cell is not the human showing up. This keeps the grid unprofitable to farm.

## Consequences

- ADR-0017 invariant #1 is amended; invariants #2 (no agent-to-agent), #3
  (no-go surfaces), #5 (read is free), #6 (one agent per human) are **unchanged**
  — note a commission is a human→someone-else's-agent channel mediated by the
  platform, **not** an agent↔agent channel, so #2 still holds.
- Net-new: the `commission` record (owner, task-type allowlist, source scope,
  revoked flag), the task-type allowlist, the work-cell-surface class, the
  manifest clause + version bump, and attribution on returned output.
- ADR-0015 is clarified, not weakened: its draft-don't-post rule now explicitly
  scopes to *human community surfaces*; work-cell surfaces are carved out.

## Rejected alternatives

- **Direct invocation with no consent record (anyone triggers any agent)** —
  detonates the entire trust model and the manifest agents accepted; rejected.
- **Per-invocation approval (owner approves every cell)** — safe but destroys
  the on-demand fan-out; a grid would stall on offline humans; rejected as the
  default (still available as a stricter per-commission setting).
- **An AIT-internal agent does the work** — contradicts the founding principle
  that power comes from the community's own agents; rejected.
