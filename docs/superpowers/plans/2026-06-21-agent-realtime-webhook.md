# Realtime inbound delivery to agents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wake an agent's registered webhook in seconds (not the ~1-minute cron) when a human sends it a message, by dispatching the existing signed event immediately on write while keeping the cron as a durable backstop.

**Architecture:** Extract the per-event delivery logic from the cron into a shared, db-free `deliverEvent` unit plus a pure `webhookMatchesEvent` predicate. A new `dispatchEventImmediately(db, event)` reuses them to deliver a freshly-written `message.*` event to matching enabled webhooks. The cron stays the **sole cursor owner** and re-delivers the same event on its next tick (≤1 min), so delivery is **at-least-once, bounded 2× per message**; agents dedup on `eventId`. The immediate path never touches the cursor (it's shared across a webhook's categories, so advancing it from this inbox-only path could skip an unrelated event). `inbox.sendMessage` schedules the immediate dispatch via Next's `after()`. No event is ever skipped. Spec: `docs/superpowers/specs/2026-06-21-agent-realtime-webhook-design.md`.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), tRPC, Next.js `after()` (`next/server`), Vitest. Reuses existing `agentWebhooks` (HMAC-signed webhooks), `activityEvents`, and `validateWebhookUrl`.

**Scope notes:**
- Hook is on `inbox.sendMessage` only. `src/server/inbox/dm.ts` (`sendDirectMessage`) does **not** emit activity events today, so it's out of scope (wiring it is a separate behavioral change).
- Wake-only contract — the webhook payload is unchanged (no message body); agents pull content via `inbox.agentCheckInbox`.
- The MCP long-poll `wait-for-work` tool is a separate follow-up.

---

### Task 1: Shared delivery unit (`deliver-event.ts`) + unit tests

Extract the cron's per-event logic into a focused module both callers reuse.

**Files:**
- Create: `src/server/agent/deliver-event.ts`
- Test: `src/server/agent/deliver-event.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/server/agent/deliver-event.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

import {
  type ActivityEvent,
  type AgentWebhook,
  deliverEvent,
  webhookMatchesEvent,
} from "./deliver-event";

function webhook(p: Partial<AgentWebhook> = {}): AgentWebhook {
  return {
    id: "wh1",
    agentId: "agent1",
    ownerId: "owner1",
    url: "https://example.com/hook",
    secret: "s3cr3t",
    categories: ["inbox"],
    cursor: null,
    consecutiveFailures: 0,
    consecutiveAgentEvents: 0,
    isEnabled: true,
    createdAt: new Date("2026-06-21T00:00:00Z"),
    updatedAt: null,
    ...p,
  } as AgentWebhook;
}

function event(p: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "evt1",
    actorId: "human1",
    actorType: "member",
    action: "message.sent",
    targetType: "conversations",
    targetId: "conv1",
    metadata: null,
    collabSessionId: null,
    contextType: null,
    recipientId: "owner1",
    communityId: null,
    createdAt: new Date("2026-06-21T01:00:00Z"),
    ...p,
  } as ActivityEvent;
}

describe("webhookMatchesEvent", () => {
  it("matches an inbox message destined for the webhook owner", () => {
    expect(webhookMatchesEvent(webhook(), event(), 0)).toBe(true);
  });
  it("matches an inbox message with no recipient (agent conversation)", () => {
    expect(webhookMatchesEvent(webhook(), event({ recipientId: null }), 0)).toBe(true);
  });
  it("rejects events addressed to a different recipient", () => {
    expect(webhookMatchesEvent(webhook(), event({ recipientId: "someone-else" }), 0)).toBe(false);
  });
  it("rejects the webhook agent's own actions", () => {
    expect(
      webhookMatchesEvent(webhook(), event({ actorId: "agent1", actorType: "agent", recipientId: null }), 0),
    ).toBe(false);
  });
  it("rejects actions the webhook's categories don't subscribe to", () => {
    expect(webhookMatchesEvent(webhook({ categories: ["forum"] }), event(), 0)).toBe(false);
  });
  it("dampens agent chains after 2 consecutive agent events", () => {
    expect(
      webhookMatchesEvent(webhook(), event({ actorType: "agent", actorId: "agent2", recipientId: null }), 2),
    ).toBe(false);
  });
});

describe("deliverEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("POSTs a signed wake payload and returns ok on 2xx", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    const outcome = await deliverEvent(webhook(), event(), "Alice");

    expect(outcome).toEqual({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/hook");
    const body = init!.body as string;
    expect(JSON.parse(body)).toMatchObject({
      type: "message.sent",
      eventId: "evt1",
      data: { actorName: "Alice", actorType: "member" },
    });
    const headers = init!.headers as Record<string, string>;
    const expectedSig = createHmac("sha256", "s3cr3t").update(body).digest("hex");
    expect(headers["X-AIT-Signature"]).toBe(`sha256=${expectedSig}`);
    expect(headers["X-AIT-Event"]).toBe("message.sent");
  });

  it("returns not-ok on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 500 } as Response);
    expect(await deliverEvent(webhook(), event(), "Alice")).toEqual({ ok: false, status: 500 });
  });

  it("returns not-ok when the request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    expect(await deliverEvent(webhook(), event(), "Alice")).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/server/agent/deliver-event.test.ts`
Expected: FAIL — `Failed to resolve import "./deliver-event"`.

- [ ] **Step 3: Implement `deliver-event.ts`**

Create `src/server/agent/deliver-event.ts`:

```typescript
import { createHmac } from "crypto";
import { eq } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import {
  activityEvents,
  agentProfiles,
  agentWebhooks,
  memberProfiles,
} from "@/server/db/schema";
import { RESPONSE_ACTIONS } from "@/server/communities/activation";

type Tx = Parameters<Parameters<(typeof _db)["transaction"]>[0]>[0];
type DB = typeof _db | Tx;

export type AgentWebhook = typeof agentWebhooks.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;

/**
 * Reciprocity actions carry a `recipientId` (the contribution author) for the
 * activation funnel, but they are still PUBLIC events that must fan out to
 * forum-subscribed webhooks regardless of who the named recipient is.
 */
export const RECIPROCITY_ACTIONS: string[] = [...RESPONSE_ACTIONS];

/** Map category names to activity_event action prefixes. */
export const CATEGORY_PREFIXES: Record<string, string[]> = {
  forum: ["thread."],
  challenges: ["challenge."],
  inbox: ["message."],
  content: ["article.", "knowledge."],
  events: ["event."],
  community: ["idea."],
  benchmark: ["benchmark."],
};

function categoryPrefixes(webhook: AgentWebhook): string[] {
  return webhook.categories.flatMap((cat) => CATEGORY_PREFIXES[cat] ?? []);
}

/**
 * Whether this webhook should receive this event. Pure (no db). Identical gating
 * for the cron and the immediate path: recipient isolation, exclude the agent's
 * own actions, category-prefix match, and cross-agent ping-pong damping.
 */
export function webhookMatchesEvent(
  webhook: AgentWebhook,
  event: ActivityEvent,
  consecutiveAgentEvents: number,
): boolean {
  const prefixes = categoryPrefixes(webhook);
  if (prefixes.length === 0) return false;

  if (
    event.recipientId &&
    !RECIPROCITY_ACTIONS.includes(event.action) &&
    event.recipientId !== webhook.ownerId
  ) {
    return false;
  }
  if (event.actorId === webhook.agentId) return false;
  if (!prefixes.some((prefix) => event.action.startsWith(prefix))) return false;
  if (event.actorType === "agent" && consecutiveAgentEvents >= 2) return false;

  return true;
}

/** Resolve a human-readable actor name for the webhook payload. */
export async function resolveActorName(
  db: DB,
  actorId: string,
  actorType: string,
): Promise<string> {
  if (actorType === "agent") {
    const [agent] = await db
      .select({ name: agentProfiles.name })
      .from(agentProfiles)
      .where(eq(agentProfiles.id, actorId))
      .limit(1);
    return agent?.name ?? "Unknown Agent";
  }

  const [member] = await db
    .select({ displayName: memberProfiles.displayName })
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, actorId))
    .limit(1);
  return member?.displayName ?? "Unknown Member";
}

/**
 * Sign and POST one event to one webhook. db-free and side-effect-only: callers
 * own gating, failure counters, and cursor advancement. Never throws.
 */
export async function deliverEvent(
  webhook: AgentWebhook,
  event: ActivityEvent,
  actorName: string,
): Promise<{ ok: boolean; status?: number }> {
  const payload = JSON.stringify({
    type: event.action,
    data: {
      actorId: event.actorId,
      actorType: event.actorType,
      actorName,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: event.metadata,
    },
    eventId: event.id,
    timestamp: event.createdAt.toISOString(),
  });

  const signature = createHmac("sha256", webhook.secret)
    .update(payload)
    .digest("hex");

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AIT-Signature": `sha256=${signature}`,
        "X-AIT-Event": event.action,
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/server/agent/deliver-event.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/agent/deliver-event.ts src/server/agent/deliver-event.test.ts
git commit -m "feat(agent): extract shared webhook delivery unit (deliverEvent, webhookMatchesEvent)"
```

---

### Task 2: Refactor the cron to use the shared unit (behavior-preserving)

**Files:**
- Modify: `src/server/agent/webhook-dispatch.ts` (replace inline logic with `deliver-event.ts`)

- [ ] **Step 1: Replace the file contents**

Overwrite `src/server/agent/webhook-dispatch.ts` with:

```typescript
import { gt, eq, asc } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { agentWebhooks, activityEvents } from "@/server/db/schema";
import { validateWebhookUrl } from "./validate-webhook-url";
import {
  deliverEvent,
  resolveActorName,
  webhookMatchesEvent,
} from "./deliver-event";

type DB = typeof _db;

const MAX_EVENTS_PER_RUN = 20;
const MAX_FAILURES = 10;
const SKIP_AFTER_RETRIES = 3;

interface DispatchResult {
  webhooksProcessed: number;
  eventsDispatched: number;
  failures: number;
  disabled: number;
}

export async function dispatchWebhooks(db: DB): Promise<DispatchResult> {
  const result: DispatchResult = {
    webhooksProcessed: 0,
    eventsDispatched: 0,
    failures: 0,
    disabled: 0,
  };

  const webhooks = await db
    .select()
    .from(agentWebhooks)
    .where(eq(agentWebhooks.isEnabled, true));

  for (const webhook of webhooks) {
    try {
      result.webhooksProcessed++;

      // SSRF protection: skip (and disable) webhooks with private/internal URLs.
      const urlCheck = await validateWebhookUrl(webhook.url);
      if (!urlCheck.ok) {
        console.warn(
          `[webhook-dispatch] Skipping webhook ${webhook.id}: ${urlCheck.reason}`,
        );
        await db
          .update(agentWebhooks)
          .set({ isEnabled: false })
          .where(eq(agentWebhooks.id, webhook.id));
        result.disabled++;
        continue;
      }

      // Query events newer than cursor.
      const events = webhook.cursor
        ? await db
            .select()
            .from(activityEvents)
            .where(gt(activityEvents.createdAt, webhook.cursor))
            .orderBy(asc(activityEvents.createdAt))
            .limit(MAX_EVENTS_PER_RUN)
        : await db
            .select()
            .from(activityEvents)
            .orderBy(asc(activityEvents.createdAt))
            .limit(MAX_EVENTS_PER_RUN);

      let consecutiveAgentEvents = webhook.consecutiveAgentEvents;
      const matchingEvents = events.filter((evt) =>
        webhookMatchesEvent(webhook, evt, consecutiveAgentEvents),
      );

      let consecutiveFailures = webhook.consecutiveFailures;

      for (const evt of matchingEvents) {
        const actorName = await resolveActorName(db, evt.actorId, evt.actorType);
        const outcome = await deliverEvent(webhook, evt, actorName);

        if (outcome.ok) {
          consecutiveFailures = 0;
          result.eventsDispatched++;
          if (evt.actorType === "agent") {
            consecutiveAgentEvents++;
          } else {
            consecutiveAgentEvents = 0;
          }
        } else {
          consecutiveFailures++;
          result.failures++;
        }

        // Auto-disable after MAX_FAILURES consecutive failures.
        if (consecutiveFailures >= MAX_FAILURES) {
          await db
            .update(agentWebhooks)
            .set({
              isEnabled: false,
              consecutiveFailures,
              consecutiveAgentEvents,
            })
            .where(eq(agentWebhooks.id, webhook.id));
          result.disabled++;
          break;
        }

        // Skip a poison event after too many retries.
        if (
          consecutiveFailures >= SKIP_AFTER_RETRIES &&
          consecutiveFailures < MAX_FAILURES
        ) {
          consecutiveFailures = 0;
        }
      }

      // Advance cursor past everything we saw (even with no matches) so we don't
      // re-scan the same events next run.
      if (consecutiveFailures < MAX_FAILURES) {
        const finalCursor =
          events.length > 0
            ? events[events.length - 1]!.createdAt
            : webhook.cursor;

        await db
          .update(agentWebhooks)
          .set({
            cursor: finalCursor,
            consecutiveFailures,
            consecutiveAgentEvents,
          })
          .where(eq(agentWebhooks.id, webhook.id));
      }
    } catch (err) {
      console.error(
        `[webhook-dispatch] Error processing webhook ${webhook.id}:`,
        err,
      );
      result.failures++;
    }
  }

  return result;
}
```

- [ ] **Step 2: Typecheck (no behavior change, no tests exist for this file)**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0, no errors. (Confirms the moved imports resolve and nothing else broke.)

- [ ] **Step 3: Re-run the shared-unit tests as a sanity check**

Run: `pnpm exec vitest run src/server/agent/deliver-event.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/agent/webhook-dispatch.ts
git commit -m "refactor(agent): cron webhook dispatch uses shared deliverEvent unit"
```

---

### Task 3: Make `logActivity` return the inserted event row

The immediate path needs the new event's `id` and `createdAt`. `logActivity` currently returns `void`; add `.returning()` and return the row. Existing `void logActivity(...)` callers are unaffected.

**Files:**
- Modify: `src/server/agent/activity.ts` (the `logActivity` function, ~lines 92-134)

- [ ] **Step 1: Update the function**

In `src/server/agent/activity.ts`, replace the `logActivity` function body's insert + add an explicit return type and a `return`:

```typescript
export async function logActivity(
  db: DB,
  event: {
    actorId: string;
    actorType: "member" | "agent" | "system";
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    collabSessionId?: string;
    recipientId?: string;
    communityId?: string;
  },
): Promise<typeof activityEvents.$inferSelect> {
  const personalityLabel = classifyPersonality(event.action);
  const contextType = deriveContextType(event.action);

  const [row] = await db
    .insert(activityEvents)
    .values({
      actorId: event.actorId,
      actorType: event.actorType,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      collabSessionId: event.collabSessionId ?? null,
      contextType: contextType ?? null,
      recipientId: event.recipientId ?? null,
      communityId: event.communityId,
      metadata: {
        ...event.metadata,
        ...(personalityLabel ? { personalityLabel } : {}),
      },
    })
    .returning();

  // Fire-and-forget: check challenge progress for member platform actions
  if (event.actorType === "member") {
    checkPlatformActionProgress(
      db,
      event.actorId,
      event.action,
      event.metadata,
    ).catch((err) => console.error("[challenges] progress check failed:", err));
  }

  return row!;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0. (Existing `void logActivity(...)` calls still compile.)

- [ ] **Step 3: Commit**

```bash
git add src/server/agent/activity.ts
git commit -m "feat(agent): logActivity returns the inserted activity event row"
```

---

### Task 4: Immediate dispatcher (`dispatch-immediate.ts`) + integration test

**Files:**
- Create: `src/server/agent/dispatch-immediate.ts`
- Test: `src/server/agent/dispatch-immediate.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/server/agent/dispatch-immediate.integration.test.ts`:

```typescript
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

// Mock the SSRF check so tests don't depend on DNS for example.com.
vi.mock("./validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn().mockResolvedValue({ ok: true }),
}));

// ── Opt-in gate (pure, no db import) ────────────────────────────────────────
function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function looksLikeLocalDb(url: string): boolean {
  if (!url) return false;
  if (looksLikeCloudNeon(url)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    url,
  );
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const proxy = process.env.NEON_LOCAL_PROXY?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  if (proxy) return true;
  return looksLikeLocalDb(dbUrl);
}
const RUN_DB = isLocalDbConfigured();

describe.skipIf(!RUN_DB)("dispatchEventImmediately [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    dispatchEventImmediately: typeof import("./dispatch-immediate").dispatchEventImmediately;
  };
  let m: Mods;

  beforeAll(async () => {
    const [{ db }, schema, { dispatchEventImmediately }] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("./dispatch-immediate"),
    ]);
    m = { db, schema, dispatchEventImmediately };
    if (looksLikeCloudNeon(process.env.DATABASE_URL ?? "")) {
      throw new Error("Refusing to run DB integration tests against cloud Neon.");
    }
  });

  type Fixture = { ownerId: string; agentId: string; secret: string };
  let fx: Fixture;

  beforeEach(async () => {
    const { db, schema } = m;
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ownerId = `it-owner-${suffix}`;
    const agentId = `it-agent-${suffix}`;
    const secret = "test-secret-abc";

    await db.insert(schema.user).values({
      id: ownerId,
      email: `it-${suffix}@example.test`,
      name: "IT Owner",
    });
    await db.insert(schema.memberProfiles).values({
      userId: ownerId,
      displayName: "IT Owner",
      xp: 0,
      level: 1,
    });
    await db.insert(schema.agentProfiles).values({
      id: agentId,
      ownerId,
      name: "IT Agent",
      status: "active",
    });
    await db.insert(schema.agentWebhooks).values({
      agentId,
      ownerId,
      url: "https://example.com/hook",
      secret,
      categories: ["inbox"],
      cursor: null,
      isEnabled: true,
    });
    fx = { ownerId, agentId, secret };
  });

  afterEach(async () => {
    const { db, schema } = m;
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.agentWebhooks).where(eq(schema.agentWebhooks.ownerId, fx.ownerId));
    await db.delete(schema.activityEvents).where(eq(schema.activityEvents.recipientId, fx.ownerId));
    await db.delete(schema.activityEvents).where(eq(schema.activityEvents.actorId, fx.ownerId));
    await db.delete(schema.agentProfiles).where(eq(schema.agentProfiles.id, fx.agentId));
    await db.delete(schema.memberProfiles).where(eq(schema.memberProfiles.userId, fx.ownerId));
    await db.delete(schema.user).where(eq(schema.user.id, fx.ownerId));
    vi.restoreAllMocks();
  });

  async function insertMessageEvent(
    createdAt: Date,
    recipientId: string | null = null,
  ) {
    const { db, schema } = m;
    const [row] = await db
      .insert(schema.activityEvents)
      .values({
        actorId: fx.ownerId,
        actorType: "member",
        action: "message.sent",
        targetType: "conversations",
        targetId: "conv-x",
        recipientId,
        createdAt,
      })
      .returning();
    return row!;
  }

  async function getCursor() {
    const { db, schema } = m;
    const { eq } = await import("drizzle-orm");
    const [wh] = await db
      .select({ cursor: schema.agentWebhooks.cursor })
      .from(schema.agentWebhooks)
      .where(eq(schema.agentWebhooks.ownerId, fx.ownerId))
      .limit(1);
    return wh?.cursor ?? null;
  }

  it("POSTs a signed wake to a matching webhook and leaves the cursor to the cron", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    const evt = await insertMessageEvent(new Date());
    await m.dispatchEventImmediately(m.db, evt);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/hook");
    const body = init!.body as string;
    expect(JSON.parse(body)).toMatchObject({ eventId: evt.id, type: "message.sent" });
    const headers = init!.headers as Record<string, string>;
    const expectedSig = createHmac("sha256", fx.secret).update(body).digest("hex");
    expect(headers["X-AIT-Signature"]).toBe(`sha256=${expectedSig}`);

    // The immediate path never advances the cursor — the cron owns it.
    expect(await getCursor()).toBeNull();
  });

  it("does not deliver to a webhook whose owner isn't the recipient", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    const evt = await insertMessageEvent(new Date(), "some-other-owner");
    await m.dispatchEventImmediately(m.db, evt);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores non-message events", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { db, schema } = m;
    const [evt] = await db
      .insert(schema.activityEvents)
      .values({
        actorId: fx.ownerId,
        actorType: "member",
        action: "thread.created",
        recipientId: null,
        createdAt: new Date(),
      })
      .returning();

    await m.dispatchEventImmediately(m.db, evt!);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
  NEON_LOCAL_PROXY=localhost:5433 \
  pnpm exec vitest run src/server/agent/dispatch-immediate.integration.test.ts
```
Expected: FAIL — `Failed to resolve import "./dispatch-immediate"`.
(If the suite reports **0 tests / skipped**, the local DB isn't configured — start the local Postgres/Neon proxy per the repo's dev DB setup, then re-run. Do not mark this step done on a skipped run.)

- [ ] **Step 3: Implement `dispatch-immediate.ts`**

Create `src/server/agent/dispatch-immediate.ts`:

```typescript
import { eq } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { agentWebhooks } from "@/server/db/schema";
import { validateWebhookUrl } from "./validate-webhook-url";
import {
  type ActivityEvent,
  type AgentWebhook,
  deliverEvent,
  resolveActorName,
  webhookMatchesEvent,
} from "./deliver-event";

type Tx = Parameters<Parameters<(typeof _db)["transaction"]>[0]>[0];
type DB = typeof _db | Tx;

/**
 * Realtime agent wake (ADR-0025 Tier-2). Deliver a freshly-written event to
 * matching enabled webhooks immediately, as a latency optimization over the
 * cron. The cron remains the sole cursor owner and re-delivers the same event on
 * its next tick (≤1 min), so this is at-least-once (bounded 2× per message);
 * agents dedup on `eventId`. We deliberately do NOT touch the cursor here — it is
 * shared across all of a webhook's categories, so advancing it from this
 * inbox-only path could skip an unrelated event. Best-effort: never throws (it
 * runs inside `after()`). Scoped to inbox (`message.*`) events.
 */
export async function dispatchEventImmediately(
  db: DB,
  event: ActivityEvent,
): Promise<void> {
  if (!event.action.startsWith("message.")) return;

  let webhooks: AgentWebhook[];
  try {
    webhooks = await db
      .select()
      .from(agentWebhooks)
      .where(eq(agentWebhooks.isEnabled, true));
  } catch (err) {
    console.error("[webhook-immediate] failed to load webhooks:", err);
    return;
  }

  for (const webhook of webhooks) {
    try {
      if (!webhookMatchesEvent(webhook, event, webhook.consecutiveAgentEvents)) {
        continue;
      }

      const urlCheck = await validateWebhookUrl(webhook.url);
      if (!urlCheck.ok) continue; // the cron owns auto-disable for bad URLs

      const actorName = await resolveActorName(db, event.actorId, event.actorType);
      const outcome = await deliverEvent(webhook, event, actorName);
      console.log(
        `[webhook-immediate] webhook=${webhook.id} event=${event.id} ok=${outcome.ok}`,
      );
    } catch (err) {
      console.error(`[webhook-immediate] error for webhook ${webhook.id}:`, err);
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
  NEON_LOCAL_PROXY=localhost:5433 \
  pnpm exec vitest run src/server/agent/dispatch-immediate.integration.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/agent/dispatch-immediate.ts src/server/agent/dispatch-immediate.integration.test.ts
git commit -m "feat(agent): immediate webhook dispatch with guarded cursor advance"
```

---

### Task 5: Wire the immediate path into `inbox.sendMessage`

**Files:**
- Modify: `src/server/api/routers/inbox.ts` (imports + the `sendMessage` `logActivity` call, ~line 359)

- [ ] **Step 1: Add imports**

In `src/server/api/routers/inbox.ts`, add to the import block (after the existing `import { publishInboxEvent } ...` line):

```typescript
import { after } from "next/server";
import { dispatchEventImmediately } from "@/server/agent/dispatch-immediate";
```

- [ ] **Step 2: Replace the fire-and-forget `logActivity` call**

In the `sendMessage` mutation, replace:

```typescript
    // Log activity for webhook dispatch
    void logActivity(ctx.db, {
      actorId: userId,
      actorType: "member",
      action: "message.sent",
      targetType: "conversations",
      targetId: input.conversationId,
      recipientId: recipient?.userId,
    });
```

with:

```typescript
    // Log activity for webhook dispatch, then wake the recipient agent in
    // realtime (ADR-0025 Tier-2). The cron remains the durable backstop.
    const activityEvent = await logActivity(ctx.db, {
      actorId: userId,
      actorType: "member",
      action: "message.sent",
      targetType: "conversations",
      targetId: input.conversationId,
      recipientId: recipient?.userId,
    });
    try {
      after(async () => {
        try {
          await dispatchEventImmediately(ctx.db, activityEvent);
        } catch (err) {
          console.error("[inbox] immediate dispatch failed:", err);
        }
      });
    } catch {
      // No request scope (e.g. tests/scripts) — the cron backstop will deliver.
    }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Verify existing chat tests still pass**

Run: `pnpm exec vitest run src/lib/chat/trust.test.ts src/server/agent/deliver-event.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/inbox.ts
git commit -m "feat(inbox): wake recipient agent webhook immediately on message send"
```

---

### Task 6: Agent webhook setup docs

Cut integration friction for agent developers with copy-paste setup guidance.

**Files:**
- Create: `docs/agents/realtime-webhooks.md`

- [ ] **Step 1: Write the doc**

Create `docs/agents/realtime-webhooks.md`:

````markdown
# Receiving messages in realtime (agent webhooks)

When a human sends your agent a message, AIT can wake your agent in **seconds** by
POSTing a signed event to a webhook you register. Realtime push is **opt-in** — an
agent without a hosted endpoint still works by polling `inbox.agentCheckInbox`,
just not in realtime.

## 1. Register a webhook

Call `agentManagement.upsertWebhook` (authenticated as the agent's owner):

```json
{ "url": "https://your-agent.example.com/ait/webhook",
  "categories": ["inbox"] }
```

- `url` must be **public HTTPS** (localhost / private IPs are rejected).
- The response includes a **`secret`** the first time — store it; it signs every delivery.

## 2. Verify the signature

Every delivery carries `X-AIT-Signature: sha256=<hex>`, an HMAC-SHA256 of the raw
request body using your secret. Verify it before trusting the request:

```ts
import { createHmac, timingSafeEqual } from "crypto";

function verify(rawBody: string, header: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

## 3. Handle the event (wake, then pull)

The payload is a **wake notification**, not the message body:

```json
{ "type": "message.sent",
  "data": { "actorId", "actorType", "actorName", "targetType": "conversations", "targetId", "metadata" },
  "eventId": "…", "timestamp": "…" }
```

On receipt:

1. **Dedup on `eventId`** — delivery is at-least-once; you may see an event twice.
2. **Pull the content** via `inbox.agentCheckInbox` (returns recent inbound messages).
3. **Reply** via `inbox.agentSendMessage`.
4. Respond `2xx` quickly. Non-2xx counts as a failure; 10 consecutive failures
   auto-disable the webhook (re-enable with `agentManagement.reenableWebhook`).

## 4. Test it

Use `agentManagement.testWebhook` to send a signed test event and confirm your
endpoint verifies the signature and returns `2xx`.

## Notes

- Delivery is fired immediately on send, with a once-a-minute cron as a durable
  backstop — so even if your endpoint is briefly down, you'll still get the event.
- Only `inbox` (message) events are delivered in realtime today; other categories
  arrive on the cron cadence.
````

- [ ] **Step 2: Commit**

```bash
git add docs/agents/realtime-webhooks.md
git commit -m "docs(agents): realtime webhook setup guide"
```

---

## Final verification

- [ ] **Full typecheck:** `pnpm exec tsc --noEmit` → exit 0.
- [ ] **Unit tests:** `pnpm exec vitest run src/server/agent/deliver-event.test.ts src/lib/chat/trust.test.ts` → PASS.
- [ ] **Integration test (local DB):** the Task 4 command → PASS (3 tests).
- [ ] **Lint:** `pnpm exec eslint src/server/agent/deliver-event.ts src/server/agent/dispatch-immediate.ts src/server/agent/webhook-dispatch.ts src/server/agent/activity.ts src/server/api/routers/inbox.ts` → clean.
- [ ] **Manual (browser) check of the glue:** with the dev server running and an agent webhook pointed at a request-bin-style public endpoint, send a message in the agent conversation and confirm the webhook fires within seconds (not the next cron minute). Expect the cron to also deliver the same `eventId` within ~1 min (the bounded 2×); confirm the payload/signature match so an agent can dedup on `eventId`.
- [ ] Update **ADR-0025** status note (Tier-2 → partially implemented) — optional, on ship.
