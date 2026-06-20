# Slice 1 — Realtime Upgrade + Interactive (MCP-Apps) Messages for the Inbox

**Date:** 2026-06-20 (revised after discovering the existing inbox system)
**Status:** Design approved (revised) — ready for implementation
**Branch:** `feat/realtime-chat`
**Parent roadmap:** [2026-06-20-circle-gap-roadmap.md](./2026-06-20-circle-gap-roadmap.md)
**Builds on / honors:** [ADR-0025](../../adr/0025-real-time-delivery-is-asymmetric.md)

## Why this revision

The original spec assumed chat was greenfield. It is not. The codebase already
has a working **inbox/DM system**: `conversations` (`type: "agent" | "dm"`),
`conversationParticipants` (with `lastReadAt`, `isPinned`), `messages`
(`senderType: "human" | "agent"`, `content`, `metadata` jsonb), the
`inbox.ts` tRPC router (incl. agent procedures), `inbox/dm.ts`, and a full
`components/inbox/*` UI. It delivers near-real-time via **3s polling** and
**ADR-0025** already specifies the upgrade path (SSE + Upstash Redis) and
**explicitly rejects WebSockets**.

So Slice 1 **extends the existing system** rather than building a parallel one,
and uses **SSE + Upstash Redis**, not Ably. Channels, group DMs, and
third-party agents as members are deferred to **Slice 1b** (they require a
larger change to the live participant/message model).

## Scope

**In:**
1. **Realtime upgrade (ADR-0025 Tier-1):** publish-on-write to Upstash Redis +
   an SSE stream to the browser, replacing the 3s poll as the primary delivery
   (poll retained as automatic fallback). Sub-second human-side latency.
2. **Interactive (MCP-Apps) messages:** a message may carry a `UIResource`
   (`text/html;profile=mcp-app`) rendered in a separate-origin sandboxed iframe
   via `@mcp-ui/client`, with a producer-trust → CSP policy. Actions from the
   iframe (`ui/message`, allow-listed `tools/call`, `ui/open-link`) are
   re-authorized server-side as the acting human.

**Out (→ Slice 1b or later):** channels, group DMs, third-party agents as
conversation members, agent trigger policies (`always`/`mention`/`off`), DM
blocks. The existing owner↔agent delivery (via `logActivity` →
`webhook-dispatch` cron, ADR-0025 "reactive-when-awake") is unchanged in Slice 1;
faster agent wake (Vercel Queues) stays deferred per ADR-0025 Tier-2.

## Architecture

### Realtime (SSE + Upstash Redis)
- **Publish on write.** The three message-write paths — `inbox.sendMessage`,
  `inbox.agentSendMessage`, and `inbox/dm.ts:sendDirectMessage` — after
  persisting, publish the new message to a Redis pub/sub channel keyed per
  recipient participant: `inbox:user:{userId}`. Publishing is best-effort
  (persistence already succeeded; a publish failure only degrades to polling).
- **SSE endpoint.** `GET /api/inbox/stream` (Node runtime / Vercel Fluid
  Compute) authenticates via Better Auth, subscribes to `inbox:user:{me}` on
  Upstash, and streams `message` events to the browser. One-way server→browser,
  matching ADR-0025's SSE-over-WebSockets decision.
- **Client.** A small SSE hook updates the React Query cache for
  `inbox.getMessages` / `inbox.totalUnreadCount` on incoming events (and triggers
  a light invalidate). The existing `refetchInterval` polling stays as a
  fallback for when SSE is unavailable, but its cadence can be relaxed.
- **No new persistence.** Postgres remains the source of truth; Redis is
  transport only.

### Interactive messages (MCP Apps `2026-01-26`)
- **Storage.** Add two columns to the existing `messages` table:
  - `uiResource` (jsonb, nullable) — the MCP-Apps resource
    (`{ uri, mimeType, encoding, content, csp? }`).
  - `uiProducerTrust` (varchar(20), nullable) — `platform | verified_agent |
    agent | member`, set at write time from the author. Drives the CSP policy.
  (`messages.metadata` jsonb already exists but is reused for other data; a
  dedicated column keeps the UI contract explicit and queryable.)
- **Producer.** In Slice 1's surface the producers are the user's **agent**
  (via `agentSendMessage`, carrying a resource) and the **platform**; the trust
  model is general so member/verified tiers apply unchanged when channels arrive.
- **Host rendering.** The assistant-message branch in `chat-window.tsx` /
  `inbox-mobile-view.tsx` renders a `UIResource` with `@mcp-ui/client`’s host
  renderer inside a **Sandbox Proxy on a separate origin**
  (`sandbox="allow-scripts"`, no `allow-same-origin` to the app), with a
  host-enforced **CSP** built per `uiProducerTrust` (MCP-Apps restrictive
  default: `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src
  'self' 'unsafe-inline'; connect-src 'none';`, declared domains honored only
  for trusted tiers).
- **Actions (iframe→host), re-authorized as the acting human:**
  - `ui/message` → post a normal message into the conversation
  - `tools/call` → an **allow-list** tool run under the caller's permissions
  - `ui/open-link` → `window.open` after scheme validation
  Host→guest sends theme tokens via host-context so embedded UI matches DESIGN.md.

## Data model change (minimal)

Only the existing `messages` table changes:
```
ALTER TABLE "app"."message" ADD COLUMN "ui_resource" jsonb;
ALTER TABLE "app"."message" ADD COLUMN "ui_producer_trust" varchar(20);
```
No change to `conversations` / `conversationParticipants` in Slice 1.

## tRPC / server surface
- Extend `inbox.sendMessage` and `inbox.agentSendMessage` to accept an optional
  validated `uiResource` and set `uiProducerTrust` from the author.
- New `inbox.callUiTool` (protected) — allow-listed, re-authorized tool bridge.
- New route `GET /api/inbox/stream` — SSE.
- New route `GET /api/inbox/ui-csp?messageId=…` — serves a message's UI HTML
  with the host-enforced, trust-derived CSP header (membership-checked).
- New `src/server/inbox/publish.ts` — Upstash publish helper, called by the
  three write paths.

## Pure logic (unit-tested, vitest)
- `src/lib/chat/trust.ts` — `resolveProducerTrust` + `cspForResource` (trust→CSP).
- `src/lib/chat/types.ts` — `UiResource` + trust types (already created).
- (No trigger/unread/capability libs in this slice — unread already exists via
  `lastReadAt`; trigger policy belongs to Slice 1b channels.)

## Security
- Sandbox proxy on a separate origin; no `allow-same-origin` to the app.
- Per-message, host-enforced CSP from the trust→policy table.
- Every `tools/call` / `ui/message` re-authorized server-side as the acting human.
- SSE endpoint scoped to `inbox:user:{me}`; a client only ever receives its own
  inbox events. UI-CSP route membership-checked before returning HTML.
- All UI-originated actions audited via `agentSessionLogs`.

## Testing
- Unit: `cspForResource` (locked-down for member trust, declared domains for
  verified), `resolveProducerTrust`.
- Integration: write→publish→SSE delivery (mock Upstash); `agentSendMessage`
  with a `uiResource` persists + carries trust; `callUiTool` re-authorization.
- Security: sandbox iframe lacks `allow-same-origin`; CSP header correct per trust.

## Rollout
- `NEXT_PUBLIC_FEATURE_CHAT` gates the realtime/UI behaviors; SSE degrades to the
  existing poll if Upstash unset. MCP-UI behind `NEXT_PUBLIC_FEATURE_CHAT_UI`.

## Follow-ups
- **Slice 1b:** channels + group DMs + third-party agents as members (widen
  `conversations.type`, add `communityId`/visibility, nullable
  `userId`/`agentId` participants, `senderAgentId`, agent trigger policies).
- ADR-0025 Tier-2 faster agent wake (Vercel Queues).
- When Tier-1 lands, update ADR-0025 status (SSE+Upstash: deferred → implemented).
