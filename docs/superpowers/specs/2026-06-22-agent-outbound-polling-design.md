# Agent Outbound Polling — Design

**Date:** 2026-06-22
**Status:** Approved (design); pending implementation plan
**Author:** Greg (Zvi) + Claude

## Problem

Local Hermes/Aster agents are currently tested through an **inbound webhook** flow:

```
AIT → public tunnel URL (ngrok/localtunnel) → local bridge → Hermes → AIT reply
```

This is fragile: tunnel URLs die, local ports get stuck, stale bridge processes
linger, machines sleep/restart, and webhook approval/signing adds friction. Local
development should not depend on a public HTTPS endpoint.

## Goal

Make the default local-agent path **outbound polling** — the connector reaches out
to AIT, pulls work, processes it with the local agent, and pushes the reply back.
No inbound tunnel required. Model it on how Hermes works with Telegram (agent polls
for updates) rather than push-to-localhost.

```
Local Agent Connector → AIT API/MCP   (poll for new events)
                      ← events (inbox messages / future tasks)
Local Agent           → process with Hermes
Local Agent Connector → send reply back to AIT
                      → ack processed
```

Webhooks remain available as the **hosted-agent** path. Polling becomes the
recommended default for local agents.

## Key finding that shapes this design

Most polling primitives already exist; the gaps are narrow.

- **`check-inbox` is already non-destructive** — a pure `SELECT` of
  `senderType="human"` messages with no state mutation. Its description
  ("marks them as read") is wrong and will be corrected. Safe polling is already
  possible today.
- **`send-message`** already lets an agent reply to its owner (scope `contribute`,
  returns `messageId`).
- **Webhooks are already optional** — ADR-0025 establishes "pull is the floor."
- **Auth** is scoped API keys bound 1:1 to an owner, enforced in `trpc.ts`.
- **The webhook envelope, recipient-isolation filter (`webhookMatchesEvent`), and a
  per-row `cursor`** all already exist for the webhook cron.

Therefore the new poll endpoint is **the existing webhook filter served over a
server-stored cursor instead of pushed to a URL** — both transports read one log
(`activity_event`).

## Architecture — one event log, two transports

```
          ┌─────────────── activity_event (existing log) ───────────────┐
          │  human → agent message  →  logActivity(action="message.sent",│
          │                              recipientId=ownerId)            │
          └──────────────┬───────────────────────────┬──────────────────┘
                         │                            │
            (push, optional, hosted)      (pull, NEW — default for local)
                         │                            │
                  webhook-dispatch            poll-agent-events
                  → deliver-event             → same envelope, server cursor
                         │                            │
                  hosted agent URL          local connector (no public URL)
```

The recipient-isolation + reciprocity + self-exclusion + category-prefix logic in
`webhookMatchesEvent` (`src/server/agent/webhook-dispatch.ts`) is refactored into a
**shared, parameterized matcher** consumed by both the webhook cron and the poll
procedure, so push and pull cannot drift. New event types are added once and appear
on both transports.

No new event-source table; no parallel message query.

## Components

### 1. `poll-agent-events` — new MCP tool + tRPC procedure

- **Scope:** `read`. Non-destructive (does not advance the stored cursor).
- **Input:** `{ after?: string, limit?: number = 25 (max 100), types?: string[] }`
  - `after` — opaque cursor token; overrides the server-stored cursor when supplied.
  - `types` — optional category/action-prefix filter (convenience only; isolation
    is independent of it).
- **Behavior:**
  1. Resolve authed agent → `ownerId`, `agentId`.
  2. Select `activity_event` rows past the effective cursor, ordered
     `(createdAt ASC, id ASC)`, `LIMIT limit`.
  3. Apply the shared matcher: `recipientId === ownerId` (or action is a reciprocity
     action), `actorId !== agentId`, action prefix within requested/allowed
     categories.
  4. Update `last_polled_at` (fire-and-forget telemetry). Does **not** advance the
     stored cursor.
- **Output (envelope matches `deliver-event.ts` exactly):**

```json
{
  "events": [{
    "type": "message.sent",
    "data": {
      "actorId": "...", "actorType": "...", "actorName": "...",
      "targetType": "...", "targetId": "...", "metadata": {}
    },
    "eventId": "<activity_event.id>",
    "timestamp": "<createdAt ISO>"
  }],
  "nextCursor": "<opaque token>",
  "hasMore": true
}
```

- **Cursor:** opaque token encoding `(createdAt, id)` so events sharing a timestamp
  are never skipped. Query uses
  `(createdAt > c.createdAt) OR (createdAt = c.createdAt AND id > c.id)`.
  `hasMore = (rows.length === limit)`.

### 2. `ack-agent-events` — new tool + procedure

- **Scope:** `read`.
- **Input:** `{ cursor: string }` — the `nextCursor` from a fully processed poll.
- **Behavior:** validate token, advance the agent's **server-stored cursor**
  (`poll_cursor` + `poll_cursor_id`) monotonically (refuse to move backward), set
  `last_acked_at`.
- **Model:** batch-cursor ack (not per-event ledger). A fresh machine resumes from
  the server cursor with no local state. Within an unacked batch, dedupe is by
  `eventId`.

### 3. Reply path — `send-message` + idempotency

- `send-message` keeps its current contract (scope `contribute`, returns
  `messageId`), plus:
  - **Optional `idempotencyKey`.** New nullable `messages.idempotency_key` with a
    partial unique index on `(conversation_id, idempotency_key)`. On collision,
    return the **existing** `messageId` rather than inserting — so a connector that
    crashes after send-before-ack and retries won't double-post. Recommended usage:
    `idempotencyKey = triggering eventId`.
  - On success, set `last_reply_at` telemetry.
- **Clear permission error:** if the agent lacks `contribute` (e.g. manifest not
  accepted), `requireScope` throws `FORBIDDEN` with an actionable message: *"Reply
  scope not granted — owner must accept the current agent manifest to enable
  `contribute`."* The connection page mirrors this state and links to manifest
  approval.

### 4. Schema changes (one Payload migration, all `IF NOT EXISTS`)

On `agent_profile`:
- `poll_cursor` timestamptz null — server checkpoint (createdAt half)
- `poll_cursor_id` varchar(255) null — server checkpoint (id tiebreak half)
- `last_polled_at` timestamptz null
- `last_acked_at` timestamptz null
- `last_reply_at` timestamptz null
- `last_connector_error` text null
- `last_connector_error_at` timestamptz null

On `messages`:
- `idempotency_key` varchar(255) null
- partial unique index on `(conversation_id, idempotency_key)` where key is not null

Follows the `20260612b_*` Payload-migration pattern (`ALTER TABLE ... ADD COLUMN IF
NOT EXISTS`, descriptive header comment). Drizzle schema in `src/server/db/schema.ts`
updated to match. `payload generate:types` run afterward, with consumer guards
(per project memory: stale committed types hide the break).

Telemetry stored as inline columns on `agent_profile` (1:1 with the agent; mirrors
the existing inline `cursor` on `agent_webhooks`), not a separate table.

### 5. Connection page — Connect tab gains a "Local agent (polling)" section

Additive to the existing `/dashboard/agent` Connect tab (not a redesign):

- **Two labeled modes:**
  - *"Local agent — outbound polling, no public URL required"* (recommended,
    default). Existing key + scope UI lives here.
  - *"Hosted agent — webhook callback URL"* (the existing webhook UI moves under
    this heading).
- **Local panel shows:** API key/prefix status; required scopes with `contribute`
  approval state; the tool names (`poll-agent-events`, `ack-agent-events`,
  `send-message`); and live telemetry — **last seen heartbeat** (`lastActiveAt`),
  **last poll** (`lastPolledAt`), **last ack** (`lastAckedAt`), **last reply**
  (`lastReplyAt`), and **error state** (`lastConnectorError` /
  `lastConnectorErrorAt`). Health indicator: green if polled recently, amber if
  stale, red if error or never connected.
- A copy-paste **connector loop snippet** (the contract below).

Must conform to PRODUCT.md / DESIGN.md: One Voice Rule (Signal Orange only on the
single most important action/active state), Mono-Is-Machine for the stat/timestamp
readouts, Flat-By-Default surfaces.

## The local-agent contract (documented + shipped as a snippet)

```
cursor = null                        # server remembers; optional local persistence
while true:
  res = poll-agent-events(after=cursor, limit=25)
  for ev in res.events:
    if seen(ev.eventId): continue    # crash-safety dedupe
    ctx = get-conversation-history(...) if needed
    reply = run_local_agent(ev)      # Hermes / Aster
    send-message(content=reply, idempotencyKey=ev.eventId)
    mark_seen(ev.eventId)
  if res.events: ack-agent-events(cursor=res.nextCursor)
  cursor = res.nextCursor
  sleep(5..15s)
```

`idempotencyKey = eventId` ties the reply to its triggering event, giving
end-to-end exactly-once-ish behavior across connector crashes.

## Event types

- **Now:** `message.sent` — the only event a local inbox agent needs. The wire
  `type` stays as the existing internal action string (matches the webhook
  transport byte-for-byte; no alias layer for a single type).
- **Reserved (not built):** `agent_task.created`, `draft_review.requested`. Because
  the envelope and matcher are generic, these become future `activity_event` rows +
  category prefixes with **no connector or tool changes**. A normalized
  resource-style naming layer (e.g. `inbox.message.created`) is introduced — across
  both transports together — only when these types are actually added.

## Security

- `poll-agent-events` / `ack-agent-events` require a scoped API key; `send-message`
  requires `contribute`.
- The shared matcher guarantees an agent only sees events where
  `recipientId === its own ownerId` (or reciprocity actions) — never another owner's
  inbox.
- The envelope exposes only the actor display info already shipped by webhooks —
  nothing extra. The connector receives no more account data than needed.

## Explicitly out of scope (YAGNI)

- No `wait-for-work` long-poll (ADR-0025 already defers it).
- No per-event processed ledger (cursor + `eventId` dedupe suffices).
- No removal of webhook mode (it stays as the hosted path).
- No refactor/rename of `check-inbox` beyond fixing its misleading description.
- No new event types beyond `message.sent` (others reserved, not built).

## Testing strategy

- **Shared matcher:** unit tests proving identical inclusion/exclusion for webhook
  and poll given the same event set (recipient isolation, reciprocity, self-event
  exclusion, category prefix).
- **Cursor:** events sharing a `createdAt` are all returned across pages and never
  skipped; ack is monotonic (backward ack is a no-op); fresh-machine resume reads
  the server cursor.
- **Idempotency:** duplicate `send-message` with the same
  `(conversationId, idempotencyKey)` returns the original `messageId` and inserts no
  second row.
- **Isolation:** an agent for owner A never receives events whose `recipientId` is
  owner B.
- **Permission:** an agent without `contribute` gets the actionable `FORBIDDEN`.
- **Telemetry:** poll/ack/reply update the corresponding `agent_profile` timestamps.

## Affected files (anticipated)

- `src/server/db/schema.ts` — new columns + index (Drizzle).
- `src/migrations/<new>_agent_polling.ts` — Payload migration.
- `src/server/agent/webhook-dispatch.ts` — extract shared matcher.
- `src/server/api/routers/inbox.ts` (or `agent-management.ts`) — `pollAgentEvents`,
  `ackAgentEvents` procedures; `idempotencyKey` on `agentSendMessage`.
- `src/app/api/mcp/server.ts` — register `poll-agent-events`, `ack-agent-events`;
  fix `check-inbox` description.
- Connect-tab UI components under `src/components/agent/`.
- `payload generate:types` output.
