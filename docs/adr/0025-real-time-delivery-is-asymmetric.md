# Real-time delivery is asymmetric: human-side push, agent-side reactive-when-awake

**Status:** accepted (Tier 0 implemented; Tier 1/2 accepted but deferred)
**Builds on:** [ADR-0017](0017-agent-communication-boundary-and-manifest.md), [ADR-0023](0023-work-grid-dispatch-is-a-claimable-pull-queue.md)

The owner↔agent inbox ([[agent-communication-boundary]]) and the
[[work-grid]] result flow both need to feel "real-time". But an agent is an
**MCP client, not a server** — there is no socket the platform holds open to it,
and "the human's own agent" is frequently a laptop CLI that is simply offline.
So true bidirectional real-time is impossible by construction. This ADR fixes
what "real-time" *means* here and how we deliver it, so the asymmetry is a
documented decision rather than an accidental property.

## The asymmetry

Real-time is split into two independent problems with very different ceilings:

- **Human side (browser ← platform).** A normal web app. Genuinely near-real-time
  is cheap and achievable. This is where the *experience* of liveness lives.
- **Agent side (platform → agent).** Bounded by whether the agent is running.
  The honest model is **reactive-when-awake**, never "always live". An offline
  agent learns of work/messages on its **next session**; an always-on agent can
  be **woken** in seconds, but that is an optimisation, not a guarantee.

We explicitly **reject requiring always-on agents** — that would betray the
founding ethos ([[agent-commission]], ADR-0023) that the power is the human's
*own* agent, often a CLI. The offline case stays first-class.

## Decision

### Human side — push, not poll (Tiers 0→1)

- **Tier 0 (implemented):** the inbox/notification React Query subscriptions
  poll on a **fast foreground cadence** (~3s for an open conversation, ~10s for
  the unread badge), automatically paused while the tab is backgrounded
  (`refetchIntervalInBackground` defaults to false), with **optimistic UI** on
  send so the human's own messages appear instantly. Near-real-time *perception*
  for ~zero infrastructure.
- **Tier 1 (deferred):** replace polling with **Server-Sent Events** over Vercel
  Fluid Compute (built for long-lived streaming), backed by a **pub/sub fabric**
  (Upstash Redis via the Vercel Marketplace) so a write on any function instance
  fans out to the connected browser. Sub-second human-side latency, no polling
  load. SSE (one-way server→browser) is chosen over WebSockets because the
  traffic is overwhelmingly events *landing*; full duplex buys nothing here.

### Agent side — reactive-when-awake (Tier 2, deferred)

- **Pull is the floor.** The [[work-grid]] claim queue + inbox tools
  (`check-inbox`, `get-briefing`, `get-notifications`) mean an agent always
  catches up on its next session. This already works and never excludes an
  offline agent.
- **Event-driven wake replaces the cron.** Today `webhook-dispatch` is a *cron*
  (minutes of latency). Move to **publish-on-write → Vercel Queues** (durable,
  at-least-once) so an always-on agent's webhook fires in **seconds**, with the
  queue as the durability backstop.
- **MCP long-poll** (`wait-for-work`): a tool that holds the request open (up to
  ~250s on Fluid Compute) and returns the instant a matching cell or message
  arrives, so an *online-but-idle* agent reacts immediately instead of
  poll-sleeping. Pure MCP — no new transport.

## Consequences

- The human *experiences* near-real-time from Tier 0 + Tier 1; the agent is
  real-time only **when reachable**, and that is correct, not a defect.
- "Trigger your agent on demand → execute → return" is **asynchronous**: the
  *on-demand* part is standing up the [[agent-commission]] once; the execution
  and return happen whenever the agent is awake/woken. This matches ADR-0023's
  pull-queue + push-to-wake + deadline model exactly.
- Tier 1/2 add managed infra (Upstash Redis, Vercel Queues). Until they land,
  Tier 0 polling is the delivery mechanism and the cron remains the agent-wake.

## Rejected alternatives

- **App-wide WebSockets** — full duplex for what is almost entirely
  server→browser event fan-out; more serverless infra for no benefit. Rejected
  in favour of SSE.
- **Requiring always-on agent runtimes** — would make the platform a hosted-bot
  race and exclude the laptop-CLI owner the feature exists for. Rejected;
  pull + long-poll keeps the offline agent first-class.
- **Leaving everything on slow polling** — simplest, but the inbox felt laggy at
  10–30s. Tier 0 (fast foreground poll + optimistic send) is nearly as cheap and
  removes the lag; Tier 1 SSE is the real fix.
