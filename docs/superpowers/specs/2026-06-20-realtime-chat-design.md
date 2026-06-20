# Slice 1 — Agent-Native Real-Time Chat & DMs (with Interactive UI Messages)

**Date:** 2026-06-20
**Status:** Design approved — ready for implementation plan
**Branch:** `feat/realtime-chat`
**Parent roadmap:** [2026-06-20-circle-gap-roadmap.md](./2026-06-20-circle-gap-roadmap.md)

## Summary

Add real-time chat to the platform — DMs, group DMs, and community channels — with
**agents as first-class conversation members** and **interactive UI messages** based
on the MCP Apps standard (`io.modelcontextprotocol/ui`, spec `2026-01-26`). A member
can ask a question and an agent (or the platform) replies with a live, interactive
component rendered in a sandboxed iframe; interacting with it posts actions back into
the conversation. This closes Circle.so's single biggest staple gap while doing it in
a way Circle can't easily copy: chat that is agentic and app-capable from day one.

## Goals

- Synchronous messaging across DM / group DM / community channel surfaces.
- Agents participate natively (answer, summarize, moderate), reusing existing agent
  webhook + API-key infrastructure.
- Messages can carry interactive UI (MCP Apps HTML profile) rendered in isolated
  sandboxed iframes, with a trust model that lets all producers emit UI in MVP and
  tightens later via policy, not rework.
- No regression to existing async surfaces (forum, notifications).

## Non-goals (this slice)

- Automated AI moderation (deferred to Workflows slice #4).
- Message full-text search (separate slice).
- Live audio/video (Circle Live equivalent) — explicitly deferred per roadmap.
- Member-authored `externalUrl` UI resources (trusted producers only in MVP).

## Architecture

### Transport & persistence
- **Realtime fanout:** Ably. One channel per conversation (`conversation:{id}`) carries
  message events, presence, and typing. Ably is **fanout only, never source of truth**.
- **Source of truth:** Postgres. Chat tables are defined Drizzle-style in `schema.ts`
  but applied via a **hand-written `src/migrations/*.ts` + `db:apply`** (never
  `db:push`), consistent with the project's migration rule.
- **Writes go through tRPC only.** The server validates membership/permission, inserts
  the row, then publishes to Ably. Clients hold a **subscribe-only Ably token** whose
  capability is minted from actual membership rows — a client can only subscribe to
  conversations it belongs to.
- **Catch-up/history:** on connect/reconnect, clients fetch missed messages via a tRPC
  `history` query (Postgres) keyed off `lastReadAt`. Ably carries only the live tail.

### Data model (new tables)

- **`conversations`**
  - `id`, `type` (`dm` | `group_dm` | `channel`)
  - `communityId` (null except channels)
  - `title`, `slug` (channels)
  - `visibility` (`open` | `private` | `secret`, channels only)
  - `createdBy`, `createdAt`, `updatedAt`
- **`conversationMembers`**
  - `conversationId`
  - `memberId` **or** `agentId` (a participant is human or agent; exactly one set)
  - `role` (`owner` | `moderator` | `member`)
  - `agentTriggerPolicy` (`always` | `mention` | `off`; defaulted by conversation type)
  - `lastReadAt`, `mutedUntil`, `joinedAt`
- **`messages`**
  - `id`, `conversationId`
  - `authorMemberId` **or** `authorAgentId`
  - `type` (`text` | `ui` | `system`)
  - `body` (text/markdown; nullable when pure UI)
  - `uiResource` (jsonb, nullable) — MCP Apps resource (see below)
  - `uiProducerTrust` (`platform` | `verified_agent` | `agent` | `member`) — derived
    from author at insert; drives the CSP/permission policy table
  - `replyToId` (thread parent, nullable)
  - `attachments` (jsonb; S3 keys via existing upload)
  - `createdAt`, `editedAt`, `deletedAt` (soft delete)
- **`messageReactions`** — `messageId`, member/agent, `emoji`
- **`dmBlocks`** — `blockerMemberId`, `blockedMemberId` (DM permission)
- Member setting addition: `dmEnabled` (default true)
- **Unread is derived** (`messages.createdAt > member.lastReadAt`); no receipt table.

### Permissions
- **DM:** any member may DM another unless the recipient blocked them (`dmBlocks`) or
  has `dmEnabled = false`.
- **Channel:** community-scoped. `open` (any community member joins) / `private`
  (invite) / `secret` (hidden). Create/manage gated to community `moderator`+ via
  existing community roles.
- **Group DM:** creator seeds members; members may add others (tightenable later).
- **Ably capability** is derived from membership rows; no client-trusted scoping.

### Moderation
- Soft-delete (`deletedAt`) + edit tracking, matching existing content patterns.
- Report-a-message reuses the existing reporting/notification flow to surface to
  community moderators. Automated agent moderation deferred to slice #4.

### Notifications & presence
- Offline mentions / DM messages create rows in the existing `notifications` table and
  fire existing push; in-app unread is derived from `lastReadAt`.
- Ably presence on each conversation channel → online indicators + typing.

## Agent participation loop

Reuses `agentWebhooks`, `agentApiKeys`, `agentSessionLogs` — no new agent infra.

1. Member posts → tRPC `chat.send` inserts the message + publishes to Ably.
2. **Trigger evaluation** (server-side, post-insert): for each `agentId` in the
   conversation, check `agentTriggerPolicy`:
   - DM → `always` (every human message fires the agent)
   - channel / group DM → `mention` (fires only on `@agent` or a reply inside a thread
     the agent is already in)
3. Matching agents receive a **webhook dispatch** (`agentWebhooks`) carrying
   conversation context (recent N messages + the triggering message).
4. The agent runs its own LLM, then calls back **`chat.send` authenticated by its
   `agentApiKey`** → normal insert + Ably fanout (reply appears identically to a
   human's). Session logged to `agentSessionLogs`.
5. **Loop guard:** an agent message never re-triggers another agent (or itself); a
   per-conversation agent rate limit prevents runaway agent-to-agent loops.

## Interactive UI messages (MCP Apps)

### Standard
Conform to **MCP Apps** (`io.modelcontextprotocol/ui`, spec `2026-01-26`). Reuse
`@mcp-ui/server` (`createUIResource`) on the producing side and `@mcp-ui/client`
(`AppRenderer`) on the host side rather than hand-rolling the protocol.

- **Resource:** `ui://…` URI, MIME `text/html;profile=mcp-app`, content as `text` or
  base64 `blob`. (`@mcp-ui` `externalUrl` is an optional convenience allow-listed to
  trusted producers only; not part of the official MVP MIME.)
- **Wire protocol:** JSON-RPC 2.0 over `postMessage`. The iframe acts as an MCP client;
  our **host acts as an MCP server** proxying the real one.

### Host (our app) responsibilities
The host is implemented with `@mcp-ui/client`'s `AppRenderer`, which manages the
**Sandbox Proxy** iframe served from a **dedicated isolated origin**
(`sandbox_proxy.html`), the JSON-RPC handshake, and lifecycle.

Guest→host methods we handle:
- `ui/message` → **post a message into the conversation** (the core click→say loop)
- `tools/call` → execute an **allow-listed** tRPC/agent tool, **re-authorized as the
  acting human** under their permissions; result returned via
  `ui/notifications/tool-result`, and may post a follow-up message
- `ui/open-link` → `window.open` after URL scheme validation
- `resources/read` → serve declared `ui://` resources
- `ui/request-display-mode` → inline / fullscreen / pip

Host→guest notifications we send:
- `ui/notifications/tool-input` / `tool-result`
- `ui/notifications/host-context-changed` → carries **DESIGN.md theme tokens** + user
  context so embedded UI matches the Town Square look
- `ui/notifications/size-changed` handling → auto-resize
- `ui/resource-teardown` on cleanup (wait for ack before tearing down)

### Security model
- **Sandboxed iframe** on a separate origin; `sandbox="allow-scripts"` **without**
  `allow-same-origin` to the app origin. Embedded code cannot reach app cookies/DOM.
- **Per-resource CSP, host-enforced.** Restrictive default per spec:
  `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none';`
  Allowed origins come from the resource's declared `connectDomains` /
  `resourceDomains` / `frameDomains`; undeclared domains are blocked.
- **Trust → policy table.** Every message carries `uiProducerTrust`. The host selects
  the CSP strictness, permitted MIME flavors, and capability `allow` attributes from a
  trust→policy table:
  - `platform` — broadest (still sandboxed)
  - `verified_agent` — broad, declared domains honored
  - `agent` (unverified) — locked-down CSP, no `externalUrl`
  - `member` — most restrictive CSP, `connect-src 'none'`, no capabilities
  - **MVP:** all four may produce; **guarding later = editing this table**, not the
    architecture.
- **Action re-authorization:** any `tools/call` / `ui/message` from an embedded UI is
  validated server-side as the **acting human**. An agent's UI can never make a user do
  something the user couldn't do directly.
- **Capability permissions** (`camera`/`microphone`/`geolocation`/`clipboardWrite`)
  honored only via iframe `allow` attributes per the trust policy; default none.
- All UI-originated actions audited via `agentSessionLogs`.
- postMessage **origin allow-listing** both directions; message size caps.

## tRPC surface (new `chat` router)
- `chat.listConversations`, `chat.getConversation`, `chat.history`
- `chat.send` (text | ui | attachments), `chat.edit`, `chat.delete`
- `chat.react`, `chat.markRead`
- `chat.createChannel`, `chat.joinChannel`, `chat.addMember`, `chat.startDm`,
  `chat.startGroupDm`
- `chat.setAgentTriggerPolicy`, `chat.report`, `chat.blockDm`, `chat.setDmEnabled`
- `chat.ablyToken` (mint subscribe-only capability from membership)
- `chat.callUiTool` (host bridge for guest `tools/call`, re-authorized as acting user)

## Testing strategy
- **Unit:** trigger-policy evaluation; trust→CSP/policy resolution; unread derivation;
  Ably capability minting from membership; URL scheme validation.
- **Integration (tRPC + Postgres):** send→persist→fanout; agent webhook round-trip
  (mock agent posts back via API key); `tools/call` re-authorization as acting human;
  DM block / DMs-off enforcement; channel visibility rules.
- **Security:** sandbox iframe has no `allow-same-origin` to app origin; CSP header
  built from declared domains; member-trust resource gets locked-down CSP; postMessage
  origin allow-listing; agent loop guard + rate limit.

## Rollout
- Behind a feature flag; dogfood in one community first.
- Agents off by default per channel until a trigger policy is explicitly set.
- Interactive UI behind a sub-flag so it can be enabled after base chat is stable.

## Open questions / follow-ups
- Choose Ably vs Pusher concretely at implementation time (design assumes Ably for
  native presence + history + per-channel capability auth).
- Sandbox proxy hosting: separate Vercel domain/subdomain vs isolated route — decide in
  the plan.
- Per-channel agent rate-limit defaults.
