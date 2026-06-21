# Design brief: Agent webhook self-registration (owner-approved)

- **Status:** Approved (shape) — pending implementation plan
- **Date:** 2026-06-21
- **Register:** product (Restrained)
- **Relates to:** realtime inbound delivery (#182), ADR-0025 Tier-2

## Context

A webhook configuration UI already exists and is design-compliant:
`src/components/agent/setup-webhook.tsx` (canonical) rendered in the agent
dashboard **Connect** tab (`/dashboard/agent?tab=connect`) and the onboarding
QuickStart. It supports the `inbox` event category that the realtime feature
uses, with HMAC-signed delivery, SSRF-validated URLs, a one-time secret reveal,
test/enable/disable, and a health dot. **We do not rebuild it.**

The genuine gap: every webhook procedure (`agentManagement.upsertWebhook`, etc.)
is **owner-only** (`protectedProcedure`). There is no way for an agent to register
its own webhook. Some users find manual setup hard, so agents should be able to
propose their own webhook — but an agent setting its own callback URL is sensitive,
so it must be **owner-approved**.

## Feature summary

An agent registers its own webhook via a new MCP tool (`register-webhook`,
mirroring the existing `register-agent`). The proposed URL lands **pending** and
delivers nothing until the **owner approves it** in the existing Connect-tab
webhook card. Plus light polish to that card for the realtime use case.

## Primary action

- **Owner:** review an agent-proposed webhook and **Approve** (or Reject).
- **Agent:** call `register-webhook(url, categories)` to propose.

## Design direction

Restrained, product register — reuse `SetupWebhook` and its tokens verbatim; no
new visual system. Scene: a developer wiring their agent, and an owner glancing
at the dashboard in focused light-mode work deciding "do I trust where my agent
wants to send data?" Anchors: the existing Connect-tab setup cards (internal
consistency), GitHub OAuth-app approval, Stripe webhook settings. Signal Orange
reserved for the single **Approve** action (One Voice Rule); the pending banner
uses the existing `warning` token (as the current secret box does).

## Scope

Production-ready. Backend: a `register-webhook` MCP tool + agent-auth path that
writes a *pending* proposal; an owner approve/reject tRPC procedure; an
`agentWebhooks` schema addition (`status: pending | active`) + a hand-written
migration. Frontend: a new **pending-proposal** state in the existing webhook
card + the polish items. One surface (the Connect-tab card), extended.

## Layout strategy

Extend the existing card; no new page. With a pending proposal, the card leads
with a `warning`-toned banner ("Your agent wants to receive events at `<url>`")
+ the proposed categories + **Approve** (primary) / **Reject** (ghost). Approved
→ the normal active card. No proposal → today's setup state, unchanged.

## Key states

No webhook · **Pending proposal** (owner: URL + categories + Approve/Reject;
agent: "awaiting owner approval") · Active (today's healthy card) · Degraded /
Disabled (today) · Rejected (agent may re-propose).

## Interaction model

Agent calls the tool → pending row created → owner sees the banner + a
notification (reuse existing notifications infra) → **Approve** flips it to
active + enabled and reveals the signing secret once → **Reject** discards. SSRF
validation + HMAC unchanged. Changing an already-approved URL re-enters pending.

## Content

MCP tool description + structured responses (`pending`/`approved`/`rejected`);
banner + Approve/Reject copy; notification copy; clarified `inbox` category label
→ "Messages — wake when someone messages your agent (realtime)"; a "How to verify
signatures" link to `docs/agents/realtime-webhooks.md`.

## Decisions (resolved during shape)

- Self-registration mechanism: **MCP tool** (`register-webhook`).
- Guardrail: **owner approval required** (pending → approve).
- Schema: add a **`status` enum** (`pending`/`active`) to `agentWebhooks`;
  `isEnabled` stays the on/off control within active.
- Notifications: reuse the existing notifications infra.
- Re-propose after reject: allowed, no cooldown.

## Recommended references for build

`clarify.md` (tool + approval copy), `harden.md` (approval/security flow + edge
cases). Layout/colorize not needed — reuse the existing card.

## Out of scope

- Rebuilding the owner-facing webhook UI (it conforms today).
- The realtime delivery mechanism itself (#182, already built).
