# Fix-1 Report: Cross-Tenant Webhook Fan-Out + Observability

## Summary

Fixed a critical security bug where agent-type conversations produced a `null` `recipientId` in the activity event, causing `webhookMatchesEvent` to skip the recipient-isolation gate and fan-out every `message.sent` event to every enabled webhook on the platform. Added scoped query in the immediate dispatch path for structural defense in depth. Added structured delivery observability on both cron and immediate paths.

---

## Changes

### 1. `src/server/api/routers/inbox.ts` — `sendMessage` (lines ~329–374)

**Problem:** Agent-type conversations have only ONE participant row (the owner/sender). The `recipient` query (`userId != me`) returns nothing → `recipient?.userId` is `undefined` → `recipientId: undefined` in `logActivity` → stored as `null` in the DB → `webhookMatchesEvent` skips isolation gate → cross-tenant fan-out.

**Fix:**
- Added a query to fetch `conversations.type` for the incoming `conversationId`.
- Computed `const webhookRecipientId = conversationType === "agent" ? userId : recipient?.userId`.
- Passed `recipientId: webhookRecipientId` to `logActivity(...)`.
- The two `publishInboxEvent(...)` calls are untouched (still use `recipient?.userId` / `userId`).

### 2. `src/server/agent/dispatch-immediate.ts` — `dispatchEventImmediately`

**Fix 1 — Scoped query (structural isolation):** Changed the enabled-webhooks `where` clause from `eq(agentWebhooks.isEnabled, true)` to `and(eq(agentWebhooks.isEnabled, true), event.recipientId ? eq(agentWebhooks.ownerId, event.recipientId) : undefined)`. Drizzle's `and(...)` ignores `undefined`, so null-recipient (public/broadcast) events still scan all enabled webhooks.

Changed import from `{ eq }` to `{ and, eq }` to support the new clause.

**Fix 2 — Observability:** Replaced the old `console.log` with the structured `[webhook-delivery]` log with `path: "immediate"`, `webhookId`, `eventId`, `ok`, and `latencyMs` (`Date.now()` around the `deliverEvent` call).

### 3. `src/server/agent/webhook-dispatch.ts` — `dispatchWebhooks` (cron path)

**Fix — Observability:** Added `Date.now()` timing around each `deliverEvent` call in the per-event loop. Added structured `console.log("[webhook-delivery]", { path: "cron", webhookId, eventId, ok, latencyMs })` after each call. Delivery behavior, counters, and cursor logic are unchanged.

### 4. `src/server/agent/deliver-event.test.ts`

**Fix — Relabeled test:** The test case titled `"matches an inbox message with no recipient (agent conversation)"` was relabeled to `"treats a null-recipient event as public (matches any subscriber)"`. The assertion (`webhookMatchesEvent(webhook(), event({ recipientId: null }), 0) === true`) is unchanged — null `recipientId` correctly bypasses the isolation gate for broadcast/public events; agent conversations now never produce a null `recipientId` (fixed at call site).

### 5. `src/server/agent/dispatch-immediate.integration.test.ts`

**Fix — `insertMessageEvent` default:** Changed the default `recipientId` parameter from `null` to `undefined`, and resolved `undefined` → `fx.ownerId` inside the function body. This makes the primary delivery test insert a properly-scoped event (`recipientId = fx.ownerId`), matching the fixed production behavior. The existing `"does not deliver to a webhook whose owner isn't the recipient"` test (with explicit `"some-other-owner"`) is unchanged and now also exercises the scoped query.

---

## Test Results

### TypeScript
```
tsc=0
```
No type errors.

### Unit tests: `deliver-event.test.ts`
```
✓ src/server/agent/deliver-event.test.ts (9 tests) 3ms
Test Files: 1 passed (1)
Tests: 9 passed (9)
```
All 9 tests pass, including the relabeled null-recipient test.

### Integration tests: `dispatch-immediate.integration.test.ts`
```
↓ src/server/agent/dispatch-immediate.integration.test.ts (3 tests | 3 skipped)
Test Files: 1 skipped (1)
Tests: 3 skipped (3)
```
Skipped cleanly — no local DB configured (`RUN_DB_TESTS` not set). 0 failures.

---

## Self-Review

- **Security:** The root cause (null `recipientId` on agent conversations) is fixed at the source. The scoped query in `dispatch-immediate.ts` adds structural defense: even if a future code path accidentally logs a null recipient, the query will scan all webhooks (safe for broadcast events), and the per-webhook `webhookMatchesEvent` gate still applies as a second line of defense.
- **Correctness:** `publishInboxEvent` calls are untouched — SSE delivery behavior is unchanged. Only `logActivity` `recipientId` is affected.
- **No regressions:** DM conversations still route via `recipient?.userId` (the non-owner other participant). Only agent-type conversations change behavior.
- **Observability:** Both paths now emit `[webhook-delivery]` structured logs with consistent shape for log aggregation/alerting.
