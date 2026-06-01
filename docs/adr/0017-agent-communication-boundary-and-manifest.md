# Agent communication boundary + a Hub-invariant agent manifest

**Status:** accepted
**Builds on:** [ADR-0013](0013-hub-invariant-vs-community-policy.md), [ADR-0015](0015-community-surfaces-are-human-authored.md)

An agent on AIT is owned by exactly one human and acts on that human's behalf.
This ADR fixes the security boundary around what an agent may *communicate* and
*publish*, and establishes the agent-side normative document that states it.

## The boundary (Hub-invariant, not admin-tunable)

These are security invariants per [ADR-0013](0013-hub-invariant-vs-community-policy.md),
so a [[Community]] admin cannot loosen them:

1. **Owner-only channel.** An agent may exchange messages only with its
   [[owner]] (the `conversation` of `type:"agent"`). No other human and no other
   agent can message an agent; an agent can message no one but its owner.
2. **No agent-to-agent communication.** There is no channel between agents, by
   design. This *closes* the "agent-to-agent areas" future ADR-0015 had reserved
   (see amendment below) — those areas were never built and are now forbidden,
   not deferred.
3. **No-go surfaces.** An agent has no path — not even a draft — into
   member↔member direct messages (`conversation` `type:"dm"`). It cannot
   initiate, read, or inject into a private conversation between humans.
4. **Draft, don't publish.** Into community surfaces (forum, feed, ideas,
   investigations, …) an agent only produces drafts; a human publishes in their
   own name. This is [ADR-0015](0015-community-surfaces-are-human-authored.md),
   unchanged.
5. **Read is free.** An agent may read any public, human-published content.
   Reading is never "communication"; blocking it would be unenforceable and
   pointless.
6. **One agent per human.** Enforced by the unique `ownerId` constraint on
   `agent_profile`.

The hard line in 1/2 is **channel-level** and code-enforceable. Whether a
human-published draft happens to *address* another agent in its text is a
moderation concern, not a manifest invariant — once a human consciously
publishes a draft it is that human's speech in their own name.

## The manifest

The five rules above (plus #6) are stated in a single **Hub-invariant agent
manifest** — the agent-side counterpart to the human-facing **Terms** +
per-[[Community]] rules. Humans need no new document; this only gives agents the
normative layer humans already have.

One structured source of truth serves three roles so prose and enforcement
cannot drift:

- the **enforcement layer** imports it,
- the **owner accepts it on the agent's behalf** at registration/claim, and
- **`get-agent-guide`** serves its prose to the agent so the agent self-polices.

### Storage and acceptance

- The manifest is a **versioned code constant** (`MANIFEST_VERSION` + a
  structured invariant list), not a Payload global. A security contract a
  non-engineer could silently edit — and that the code-enforced invariants would
  then disagree with — defeats the no-drift goal. Changing it is a PR + redeploy,
  which matches its rarely-changing, security-critical nature.
- Owner acceptance mirrors the human `RulesAcceptance` pattern: an
  `agent_manifest_acceptance` record of *which manifest version which owner
  accepted for which agent*.
- **Gating:** an agent cannot reach `active` status (the state that unlocks the
  `contribute` scope) until its owner has accepted the current manifest version —
  on invite-code registration *and* on claim of an open-registration agent. On a
  version bump, the agent's `contribute` scope is suspended until the owner
  re-accepts; `read` stays available.

## Consequences

- Most of the boundary is already true: owner-only messaging is enforced in
  `inbox.ts`; agent-to-agent and DM-injection are true by absence; draft-only is
  ADR-0015. The net-new work is the manifest constant, the
  `agent_manifest_acceptance` record, the activation gate, wiring the prose into
  `get-agent-guide`, and ratifying the by-absence invariants so they don't
  silently regress.
- [ADR-0015](0015-community-surfaces-are-human-authored.md) is amended to delete
  its claim that agent-to-agent areas exist (they never did) and to point at
  invariant #2.

## Rejected alternatives

- **Manifest as an editable Payload global** — drift risk against code-enforced
  invariants; rejected for a security contract.
- **Record acceptance without gating activation** — leaves a window where an
  agent contributes before its owner has accepted accountability; rejected.
- **Forbidding agent-mentions inside human-published drafts (scope-2)** —
  unenforceable from content and redundant with the channel-level rule; left to
  moderation, not the manifest.
