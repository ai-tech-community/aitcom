# Agent Webhook Self-Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated agent propose its own webhook via a new `register-webhook` MCP tool; the proposal lands `pending`, delivers nothing, and only goes live when the owner approves it in the existing Connect-tab webhook card.

**Architecture:** Add a `status` (`pending | active`) column to the existing `agent_webhook` Drizzle table. Delivery is gated on `status = 'active'` in both the in-memory matcher (`webhookMatchesEvent`, unit-testable) and the two SQL selection queries (cron + immediate). A new authenticated MCP tool (`register-webhook`, registered inside `createMcpServer`) writes/updates a single per-owner webhook row to `status='pending'`, notifies the owner, and logs an activity. Owner-facing tRPC `approveWebhook`/`rejectWebhook` flip the row to active (revealing the signing secret once) or delete it. The existing `SetupWebhook` card gains a pending-proposal state.

**Tech Stack:** Next.js App Router, tRPC, Drizzle ORM (Postgres/Neon), `@modelcontextprotocol/sdk`, Payload-style hand-written migrations (`src/migrations/*` + `pnpm db:apply`), Zod v3, Vitest.

## Global Constraints

- **Drizzle, not Payload, for `agentWebhooks`.** Schema lives in `src/server/db/schema.ts`; apply changes via a hand-written `src/migrations/*.ts` registered in `src/migrations/index.ts` + `pnpm db:apply`. NEVER `db:push` / drizzle push (vestigial). Migrations are additive only (`ALTER ... ADD COLUMN IF NOT EXISTS`).
- **`agentWebhooks` is Drizzle**, so a schema edit + migration suffices — no `payload generate:types` needed. Types flow from `typeof agentWebhooks.$inferSelect`.
- **One webhook row per owner.** Every existing query selects a single webhook by `ownerId` (`.limit(1)`); preserve that invariant.
- **Status column default is `'active'`** so existing rows (already-approved live webhooks) keep delivering after the migration — no backfill needed.
- **Secret is generated once on first insert and preserved across updates** (mirror `upsertWebhook`); it is revealed to the owner exactly once, on approval. The agent never receives the secret.
- **One Voice Rule (DESIGN.md):** Signal Orange / primary reserved for the single **Approve** action. Pending banner uses the existing `warning` token (as the secret box does). Reject is a ghost/outline button.
- **No new visual system.** Reuse `SetupWebhook` tokens and components verbatim.
- **Subagents share the working tree:** never `git checkout` / `git switch` / `git branch`. Work only on `feat/realtime-chat`.

## Testing strategy (read before Task 1)

This repo splits tests the way #182 did, and the reviewer accepted it:

- **Pure logic → real Vitest unit tests** (e.g. `src/server/agent/deliver-event.test.ts`). Task 2's status guard is genuinely unit-testable and uses full red→green TDD.
- **DB-touching logic → integration tests gated on a LOCAL Postgres.** `*.integration.test.ts` files **SKIP** unless `RUN_DB_TESTS=1` + a local DB is set (the gate refuses cloud Neon). Tasks 3 & 4 add integration cases that are **run during the pre-merge local-PG pass**, not in the per-task build loop. During the build loop, the always-on gate for these tasks is **`pnpm exec tsc --noEmit` (expect 0)**.
- **UI → `tsc` + manual/browser verification** (`verify` / `run` skill). Assume no React Testing Library harness; if one exists, add a component test, otherwise rely on tsc + a browser check.

The local-PG integration command (from the handoff) is:
```bash
RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 \
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/aitcom \
  NEON_LOCAL_PROXY=localhost:5433 \
  pnpm exec vitest run src/server/agent/<file>.integration.test.ts
```

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/server/db/schema.ts` | `agentWebhooks` table def | Modify: add `status` column (line ~649); update `notifications.type` comment (line 473) |
| `src/migrations/20260621a_agent_webhook_status.ts` | additive status column migration | Create |
| `src/migrations/index.ts` | migration registry | Modify: import + array entry |
| `src/server/agent/deliver-event.ts` | pure event/webhook matcher | Modify: `webhookMatchesEvent` rejects non-active |
| `src/server/agent/deliver-event.test.ts` | unit tests for matcher | Modify: add status-guard tests |
| `src/server/agent/dispatch-immediate.ts` | immediate-path selection query | Modify: add `status='active'` to where |
| `src/server/agent/webhook-dispatch.ts` | cron selection query | Modify: add `status='active'` to where |
| `src/app/api/mcp/webhook-tools.ts` | `register-webhook` MCP tool | Create |
| `src/app/api/mcp/server.ts` | authenticated MCP server factory | Modify: import + register webhook tools |
| `src/server/api/routers/agent-management.ts` | owner webhook tRPC | Modify: add `approveWebhook` / `rejectWebhook` |
| `src/server/agent/propose-webhook.integration.test.ts` | DB flow for tool + approve/reject | Create (gated) |
| `src/components/agent/setup-webhook.tsx` | webhook card UI | Modify: pending state + polish |
| `src/components/notifications/notification-panel.tsx` | notification link label | Modify: `linkLabel` fallback |

---

### Task 1: Add `status` column to `agent_webhook` (schema + migration)

**Files:**
- Modify: `src/server/db/schema.ts:649` (after `isEnabled`), and `:473` (notifications type comment)
- Create: `src/migrations/20260621a_agent_webhook_status.ts`
- Modify: `src/migrations/index.ts` (import + array entry)

**Interfaces:**
- Produces: `agentWebhooks.status` of TS type `"pending" | "active"` (via `$inferSelect`), DB default `'active'`. All later tasks read/write this.

- [ ] **Step 1: Add the column to the Drizzle schema**

In `src/server/db/schema.ts`, inside the `agentWebhooks` table definition, add `status` immediately after the `isEnabled` line (currently line 649):

```typescript
  isEnabled: d.boolean().notNull().default(true),
  status: d
    .varchar({ length: 20 })
    .notNull()
    .default("active")
    .$type<"pending" | "active">(),
```

(Plain `varchar` + `$type` union — matches the repo convention of avoiding `pgEnum` in `appSchema`; see the comment at `schema.ts:156`.)

- [ ] **Step 2: Update the notifications type comment**

In `src/server/db/schema.ts:473`, extend the inline comment listing notification types to include the new value:

```typescript
    type: d.varchar({ length: 50 }).notNull(), // "challenge_advisory" | "stale_review_reminder" | "challenge_digest" | "broadcast" | "event_reminder" | "introduction_request" | "referral_credited" | "webhook_proposed"
```

- [ ] **Step 3: Write the migration**

Create `src/migrations/20260621a_agent_webhook_status.ts`:

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Agent webhook self-registration (#183): add a `status` column gating
 * delivery. `active` = approved & deliverable; `pending` = agent-proposed,
 * awaiting owner approval (delivers nothing). Additive, IF NOT EXISTS, default
 * 'active' so all pre-existing (already-approved) webhooks keep delivering.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."agent_webhook"
      ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'active';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."agent_webhook" DROP COLUMN IF EXISTS "status";
  `);
}
```

- [ ] **Step 4: Register the migration**

In `src/migrations/index.ts`, add the import alongside the other imports near the top:

```typescript
import * as migration_20260621a_agent_webhook_status from "./20260621a_agent_webhook_status";
```

and add this entry as the **last** element of the `migrations` array (after `20260620b_points_boosts`):

```typescript
  {
    up: migration_20260621a_agent_webhook_status.up,
    down: migration_20260621a_agent_webhook_status.down,
    name: "20260621a_agent_webhook_status",
  },
```

- [ ] **Step 5: Verify the migration is pending (dry run)**

Run: `pnpm db:apply --dry-run`
Expected: output lists `20260621a_agent_webhook_status` among pending migrations (or "Up to date" only if already applied).

- [ ] **Step 6: Apply the migration**

Run: `pnpm db:apply`
Expected: `applying 20260621a_agent_webhook_status ...` then success. (Additive + `IF NOT EXISTS` ⇒ idempotent and safe against the configured DB; existing rows backfill to `'active'`.)

- [ ] **Step 7: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors. (Confirms `agentWebhooks.$inferSelect` now carries `status`.)

- [ ] **Step 8: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260621a_agent_webhook_status.ts src/migrations/index.ts
git commit -m "feat(agent): add status column to agent_webhook (pending|active)"
```

---

### Task 2: Gate delivery on `status = 'active'`

**Files:**
- Modify: `src/server/agent/deliver-event.ts:46-66` (`webhookMatchesEvent`)
- Test: `src/server/agent/deliver-event.test.ts`
- Modify: `src/server/agent/dispatch-immediate.ts:38-45`
- Modify: `src/server/agent/webhook-dispatch.ts:33-36`

**Interfaces:**
- Consumes: `agentWebhooks.status` (Task 1).
- Produces: a webhook with `status !== "active"` is never delivered to, by either path.

- [ ] **Step 1: Write the failing unit test**

In `src/server/agent/deliver-event.test.ts`, find the existing `webhookMatchesEvent` describe block and add (use the same factory/fixture helpers the neighboring tests use — match an existing `webhookMatchesEvent(...)` call to copy the webhook/event object shape; set `status` explicitly):

```typescript
it("rejects a pending webhook even when category and recipient match", () => {
  const webhook = makeWebhook({ status: "pending", categories: ["inbox"] });
  const event = makeEvent({ action: "message.created", recipientId: webhook.ownerId });
  expect(webhookMatchesEvent(webhook, event, 0)).toBe(false);
});

it("accepts an active webhook on the same event", () => {
  const webhook = makeWebhook({ status: "active", categories: ["inbox"] });
  const event = makeEvent({ action: "message.created", recipientId: webhook.ownerId });
  expect(webhookMatchesEvent(webhook, event, 0)).toBe(true);
});
```

> If the test file builds webhook objects inline rather than via a `makeWebhook` helper, copy an existing inline object from a passing test in the same file and add `status: "pending"` / `status: "active"`. Do not invent a helper that isn't there.

- [ ] **Step 2: Run the test, verify the "pending" case fails**

Run: `pnpm exec vitest run src/server/agent/deliver-event.test.ts`
Expected: the new "rejects a pending webhook" test FAILS (matcher returns `true` because the guard doesn't exist yet); "accepts an active webhook" passes.

- [ ] **Step 3: Add the guard to `webhookMatchesEvent`**

In `src/server/agent/deliver-event.ts`, at the **top** of the `webhookMatchesEvent` body (line ~51, before the `prefixes` computation), add:

```typescript
  if (webhook.status !== "active") return false;
```

- [ ] **Step 4: Run the tests, verify green**

Run: `pnpm exec vitest run src/server/agent/deliver-event.test.ts`
Expected: all tests PASS (now 11+).

- [ ] **Step 5: Add the SQL filter to the immediate-dispatch query**

In `src/server/agent/dispatch-immediate.ts`, update the `.where(and(...))` (lines 38-45) to also require active status:

```typescript
      .where(
        and(
          eq(agentWebhooks.isEnabled, true),
          eq(agentWebhooks.status, "active"),
          event.recipientId
            ? eq(agentWebhooks.ownerId, event.recipientId)
            : undefined,
        ),
      );
```

- [ ] **Step 6: Add the SQL filter to the cron query**

In `src/server/agent/webhook-dispatch.ts`, the import already has `eq`; add `and` to the `drizzle-orm` import on line 1:

```typescript
import { and, gt, eq, asc } from "drizzle-orm";
```

Then update the selection (lines 33-36):

```typescript
  const webhooks = await db
    .select()
    .from(agentWebhooks)
    .where(and(eq(agentWebhooks.isEnabled, true), eq(agentWebhooks.status, "active")));
```

- [ ] **Step 7: Typecheck + full matcher test**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run src/server/agent/deliver-event.test.ts`
Expected: 0 type errors; all matcher tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/server/agent/deliver-event.ts src/server/agent/deliver-event.test.ts src/server/agent/dispatch-immediate.ts src/server/agent/webhook-dispatch.ts
git commit -m "feat(agent): gate webhook delivery on status=active (pure guard + SQL)"
```

---

### Task 3: `register-webhook` MCP tool

**Files:**
- Create: `src/app/api/mcp/webhook-tools.ts`
- Modify: `src/app/api/mcp/server.ts:8-13` (import) and the body of `createMcpServer` (register call)
- Test: `src/server/agent/propose-webhook.integration.test.ts` (created here; run in pre-merge PG pass)

**Interfaces:**
- Consumes: `AgentKeyData` (`{ ownerId: string | null; agentId: string; scopes: string[] }`) in `createMcpServer` closure; `validateWebhookUrl` from `@/server/agent/validate-webhook-url`; `logActivity` from `@/server/agent/activity`; `agentWebhooks`, `notifications` from `@/server/db/schema`; `db` from `@/server/db`.
- Produces: a single per-owner `agent_webhook` row with `status='pending'`, `isEnabled=false`; an owner `notifications` row of type `"webhook_proposed"` with `metadata.reviewPath="/dashboard/agent?tab=connect"` and `metadata.linkLabel="Review webhook request"`; an `activityEvents` row with action `"agent.webhook.proposed"`.

- [ ] **Step 1: Create the webhook tools module**

Create `src/app/api/mcp/webhook-tools.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { agentWebhooks, agentProfiles, notifications } from "@/server/db/schema";
import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";
import { logActivity } from "@/server/agent/activity";
import type { AgentKeyData } from "./server";

const WEBHOOK_CATEGORIES = [
  "forum",
  "challenges",
  "inbox",
  "content",
  "events",
  "community",
  "benchmark",
] as const;

function jsonResult(payload: unknown, isError = false) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

export function registerWebhookTools(server: McpServer, keyData: AgentKeyData) {
  server.registerTool(
    "register-webhook",
    {
      description:
        "Propose a webhook so your owner can wake you in realtime when events happen (e.g. someone messages you). The URL lands PENDING and delivers nothing until your owner approves it in their dashboard. Your owner is notified to review it. Changing an already-approved URL re-enters pending. After approval, your owner receives the signing secret to configure on your endpoint; verify signatures per docs/agents/realtime-webhooks.md.",
      inputSchema: {
        url: z
          .string()
          .url()
          .startsWith("https://", { message: "Webhook URL must use HTTPS" })
          .describe("HTTPS URL that will receive event POSTs."),
        categories: z
          .array(z.enum(WEBHOOK_CATEGORIES))
          .min(1)
          .describe(
            "Event categories to subscribe to. Use [\"inbox\"] to be woken when someone messages your agent.",
          ),
      },
    },
    async ({ url, categories }) => {
      // Must be a claimed agent with an owner who can approve + receive deliveries.
      if (!keyData.ownerId) {
        return jsonResult(
          {
            status: "error",
            error:
              "This agent is not yet claimed by an owner, so it cannot register a webhook. Ask your owner to claim you first.",
          },
          true,
        );
      }
      // Self-configuration scope (held by claimed agents post-manifest).
      if (!keyData.scopes.includes("self-profile")) {
        return jsonResult(
          {
            status: "error",
            error:
              "This agent lacks the `self-profile` scope. Its owner must accept the current agent manifest before it can register a webhook.",
          },
          true,
        );
      }

      const urlCheck = await validateWebhookUrl(url);
      if (!urlCheck.ok) {
        return jsonResult({ status: "error", error: urlCheck.reason }, true);
      }

      const ownerId = keyData.ownerId;

      // Confirm the calling agent actually belongs to this owner (defensive).
      const [agent] = await db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.id, keyData.agentId))
        .limit(1);
      if (!agent) {
        return jsonResult({ status: "error", error: "Agent not found." }, true);
      }

      // One webhook row per owner: update if present, else insert. Secret is
      // generated once on first insert and preserved across updates.
      const [existing] = await db
        .select()
        .from(agentWebhooks)
        .where(eq(agentWebhooks.ownerId, ownerId))
        .limit(1);

      // No-op if the agent re-proposes the exact active config.
      if (
        existing &&
        existing.status === "active" &&
        existing.url === url &&
        JSON.stringify([...existing.categories].sort()) ===
          JSON.stringify([...categories].sort())
      ) {
        return jsonResult({
          status: "active",
          message: "This webhook is already approved and active. No change.",
        });
      }

      let webhookId: string;
      if (existing) {
        const [updated] = await db
          .update(agentWebhooks)
          .set({
            url,
            categories: [...categories],
            status: "pending",
            isEnabled: false,
            consecutiveFailures: 0,
          })
          .where(eq(agentWebhooks.id, existing.id))
          .returning({ id: agentWebhooks.id });
        webhookId = updated!.id;
      } else {
        const secret = randomBytes(32).toString("hex");
        const [inserted] = await db
          .insert(agentWebhooks)
          .values({
            agentId: keyData.agentId,
            ownerId,
            url,
            secret,
            categories: [...categories],
            status: "pending",
            isEnabled: false,
          })
          .returning({ id: agentWebhooks.id });
        webhookId = inserted!.id;
      }

      // Notify the owner (reuses the generic reviewPath link in the panel).
      await db.insert(notifications).values({
        userId: ownerId,
        type: "webhook_proposed",
        title: "Your agent wants to receive events",
        content: `Your agent proposed a webhook at ${url}. Review and approve it to start realtime delivery.`,
        metadata: {
          reviewPath: "/dashboard/agent?tab=connect",
          linkLabel: "Review webhook request",
          webhookId,
        },
      });

      await logActivity(db, {
        actorId: keyData.agentId,
        actorType: "agent",
        action: "agent.webhook.proposed",
        targetType: "agent_webhook",
        targetId: webhookId,
        recipientId: ownerId,
        metadata: { url, categories },
      });

      return jsonResult({
        status: "pending",
        message:
          "Webhook proposed. Your owner has been notified and must approve it before any events are delivered. You will start receiving events once approved.",
      });
    },
  );
}
```

- [ ] **Step 2: Register the tool in the authenticated MCP server**

In `src/app/api/mcp/server.ts`, add to the tool-module imports (after line 13):

```typescript
import { registerWebhookTools } from "./webhook-tools";
```

Then, inside `createMcpServer`, alongside the other `register*Tools(...)` calls (search for `registerRegistrationTools` / `registerFeedTools` invocations near the end of the factory) add:

```typescript
  registerWebhookTools(server, keyData);
```

> If the existing `register*Tools` calls in this factory are passed `(server)` or `(server, caller)` rather than `keyData`, still pass `keyData` here — `register-webhook` needs the calling agent. Match placement, not argument list.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Write the integration test (gated; run in pre-merge PG pass)**

Create `src/server/agent/propose-webhook.integration.test.ts`. Mirror the structure of `src/server/agent/dispatch-immediate.integration.test.ts` (same DB-gate guard, setup/teardown, and seed helpers — open that file and copy its `describe.skipIf(...)` / `RUN_DB_TESTS` gate and fixture bootstrapping verbatim, then adapt). Cover, by calling the same DB operations the tool performs (import and call a small extracted helper, or replicate the insert/update + notification + status assertions inline against the seeded owner/agent):

```typescript
// Cases (assert against the seeded owner/agent):
// 1. First proposal: inserts a row with status='pending', isEnabled=false,
//    a non-empty secret, and creates a notifications row of type
//    'webhook_proposed' for the owner.
// 2. A pending webhook is NOT returned by the active-only delivery query
//    (status='active' filter excludes it).
// 3. Re-proposing a different URL over an existing ACTIVE row flips it to
//    status='pending', isEnabled=false, and PRESERVES the original secret.
// 4. Re-proposing the exact active url+categories is a no-op (stays active).
```

> Keep the assertions concrete (query the row back and check fields). Do not assert on MCP transport plumbing — assert on DB state, which is what matters.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mcp/webhook-tools.ts src/app/api/mcp/server.ts src/server/agent/propose-webhook.integration.test.ts
git commit -m "feat(agent): register-webhook MCP tool (owner-approval-gated proposal)"
```

---

### Task 4: Owner `approveWebhook` / `rejectWebhook` tRPC

**Files:**
- Modify: `src/server/api/routers/agent-management.ts` (add after `testWebhook`, ~line 660; reuse the file's existing imports: `agentWebhooks`, `eq`, `and`, `TRPCError`, `validateWebhookUrl`, `protectedProcedure`)
- Test: extend `src/server/agent/propose-webhook.integration.test.ts`

**Interfaces:**
- Consumes: the pending row from Task 3; `validateWebhookUrl`.
- Produces:
  - `agentManagement.approveWebhook(): { secret: string }` — flips the owner's `pending` webhook to `status='active'`, `isEnabled=true`, `consecutiveFailures=0`, returns the signing `secret` (revealed once).
  - `agentManagement.rejectWebhook(): { success: true }` — deletes the owner's `pending` webhook row.

- [ ] **Step 1: Add `approveWebhook`**

In `src/server/api/routers/agent-management.ts`, after the `testWebhook` procedure, add:

```typescript
  /** Approve an agent-proposed (pending) webhook: activate it and reveal the secret once. */
  approveWebhook: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [webhook] = await ctx.db
      .select()
      .from(agentWebhooks)
      .where(
        and(
          eq(agentWebhooks.ownerId, userId),
          eq(agentWebhooks.status, "pending"),
        ),
      )
      .limit(1);

    if (!webhook) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No pending webhook proposal to approve",
      });
    }

    // SSRF protection: re-validate the proposed URL at approval time.
    const urlCheck = await validateWebhookUrl(webhook.url);
    if (!urlCheck.ok) {
      throw new TRPCError({ code: "BAD_REQUEST", message: urlCheck.reason });
    }

    await ctx.db
      .update(agentWebhooks)
      .set({ status: "active", isEnabled: true, consecutiveFailures: 0 })
      .where(eq(agentWebhooks.id, webhook.id));

    return { secret: webhook.secret };
  }),

  /** Reject (discard) an agent-proposed (pending) webhook. */
  rejectWebhook: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    await ctx.db
      .delete(agentWebhooks)
      .where(
        and(
          eq(agentWebhooks.ownerId, userId),
          eq(agentWebhooks.status, "pending"),
        ),
      );
    return { success: true };
  }),
```

> Verify `and` is imported from `drizzle-orm` in this file; if only `eq` is imported, add `and`.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Extend the integration test (gated; pre-merge PG pass)**

Add to `src/server/agent/propose-webhook.integration.test.ts` cases that exercise the approve/reject DB effects directly (call the tRPC procedures via a test caller if the file already builds one, else assert the equivalent update/delete):

```typescript
// 5. approveWebhook on a pending row sets status='active', isEnabled=true,
//    consecutiveFailures=0, and returns the row's secret.
// 6. After approval the row IS returned by the active-only delivery query.
// 7. rejectWebhook deletes the pending row (subsequent getWebhook → null).
```

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/agent-management.ts src/server/agent/propose-webhook.integration.test.ts
git commit -m "feat(agent): owner approve/reject webhook proposal tRPC"
```

---

### Task 5: Pending-proposal UI state + polish

**Files:**
- Modify: `src/components/agent/setup-webhook.tsx`
- Modify: `src/components/notifications/notification-panel.tsx:198-208` (link label)

**Interfaces:**
- Consumes: `webhook.status` from `getWebhook`; `agentManagement.approveWebhook` / `rejectWebhook` (Task 4).
- Produces: a pending-state webhook card; a configurable notification link label.

- [ ] **Step 1: Polish the `inbox` category copy**

In `src/components/agent/setup-webhook.tsx`, in the `EVENT_CATEGORIES` array (lines 10-17), update the `inbox` entry:

```typescript
  { id: "inbox", label: "Messages", desc: "Wake when someone messages your agent (realtime)" },
```

- [ ] **Step 2: Add approve/reject mutations**

In the `SetupWebhook` component, after the `testWebhook` mutation (line ~62), add:

```typescript
  const approveWebhook = api.agentManagement.approveWebhook.useMutation({
    onSuccess: (data) => {
      setRevealedSecret(data.secret);
      void refetch();
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const rejectWebhook = api.agentManagement.rejectWebhook.useMutation({
    onSuccess: () => {
      setUrl("");
      setCategories([]);
      setRevealedSecret(null);
      setInitialized(false);
      void refetch();
    },
    onError: (err) => setError(err.message),
  });
```

- [ ] **Step 3: Render the pending-proposal branch**

In `src/components/agent/setup-webhook.tsx`, inside the card body, render the pending banner when `webhook?.status === "pending"` **instead of** the normal URL/subscriptions/save controls. Add this block at the top of the `<div className="mt-4 space-y-4">` content (before the status dot block), and gate the existing setup controls so they don't show while pending.

Use the `EVENT_CATEGORIES` map to label the proposed categories. The banner uses the existing `warning` token; **Approve** is the primary `Button` (One Voice Rule), **Reject** is `variant="outline"` (ghost):

```tsx
{webhook?.status === "pending" ? (
  <div className="space-y-4">
    <div className="border-warning/30 bg-warning/10 rounded-lg border p-4">
      <p className="text-warning font-mono text-xs tracking-wider">
        PENDING — AGENT WEBHOOK REQUEST
      </p>
      <p className="mt-2 text-sm">
        Your agent wants to receive events at:
      </p>
      <code className="text-warning mt-1 block font-mono text-xs break-all">
        {webhook.url}
      </code>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(webhook.categories as Category[]).map((cat) => {
          const meta = EVENT_CATEGORIES.find((c) => c.id === cat);
          return (
            <span
              key={cat}
              className="border-border bg-secondary/50 text-muted-foreground rounded border px-2 py-0.5 font-mono text-xs"
            >
              {meta?.label ?? cat}
            </span>
          );
        })}
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        Approve only if you trust this destination. Approving reveals the
        signing secret once and starts realtime delivery.
      </p>
    </div>

    {error && (
      <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 font-mono text-xs">
        {error}
      </div>
    )}

    {revealedSecret && (
      <div className="border-warning/30 bg-warning/10 rounded border p-3">
        <p className="text-warning font-mono text-xs tracking-wider">
          WEBHOOK SECRET — SAVE THIS NOW
        </p>
        <code className="text-warning mt-1 block font-mono text-xs break-all">
          {revealedSecret}
        </code>
        <p className="text-muted-foreground mt-2 text-xs">
          Configure this on your agent&apos;s endpoint to verify signatures. It
          won&apos;t be shown again.{" "}
          <a
            href="https://github.com/ai-tech-community/aitcom/blob/main/docs/agents/realtime-webhooks.md"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            How to verify signatures
          </a>
        </p>
      </div>
    )}

    <div className="flex items-center gap-2">
      <Button
        size="sm"
        className="font-mono text-xs tracking-wider"
        onClick={() => approveWebhook.mutate()}
        disabled={approveWebhook.isPending || rejectWebhook.isPending}
      >
        {approveWebhook.isPending ? "..." : "Approve"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="font-mono text-xs tracking-wider"
        onClick={() => rejectWebhook.mutate()}
        disabled={approveWebhook.isPending || rejectWebhook.isPending}
      >
        Reject
      </Button>
    </div>
  </div>
) : (
  <>
    {/* existing status dot + URL input + subscriptions + secret + actions */}
  </>
)}
```

Wrap the **existing** content (status dot block through the action buttons row) in the `: ( <> ... </> )` branch above so it renders only when not pending. Keep that existing markup unchanged.

> Note: while a proposal is pending, `webhook.isEnabled` is `false` and `status` is `pending`; the existing `statusColor`/`statusLabel` logic is only reached in the non-pending branch, so it needs no change.

- [ ] **Step 4: Add the "How to verify signatures" link to the active card**

Still in `setup-webhook.tsx`, in the existing non-pending secret-reveal box (the `revealedSecret` block at lines 155-168), append the same "How to verify signatures" link after the "won't be shown again" sentence (copy the `<a>` element from Step 3).

- [ ] **Step 5: Make the notification link label configurable**

In `src/components/notifications/notification-panel.tsx`, the link currently hardcodes `"Review suggestion"` (line 207). Extend `reviewPathFromMetadata`'s sibling logic to also read an optional label. Update the `NotificationMetadata` type (line 12-14) and the link text:

```typescript
type NotificationMetadata = {
  reviewPath?: unknown;
  linkLabel?: unknown;
};
```

and where the link renders (line ~207), replace the hardcoded text:

```tsx
{typeof (n.metadata as NotificationMetadata)?.linkLabel === "string"
  ? ((n.metadata as NotificationMetadata).linkLabel as string)
  : "Review suggestion"}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Lint the touched files**

Run: `pnpm exec eslint src/components/agent/setup-webhook.tsx src/components/notifications/notification-panel.tsx`
Expected: clean (or only pre-existing warnings).

- [ ] **Step 8: Commit**

```bash
git add src/components/agent/setup-webhook.tsx src/components/notifications/notification-panel.tsx
git commit -m "feat(agent): pending webhook-proposal UI + inbox/realtime copy polish"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-06-21-agent-webhook-self-registration-design.md`):
- Self-registration via MCP tool → Task 3 (`register-webhook`). ✓
- Owner-approval-gated, no delivery until approved → Task 2 (status gate) + Task 4 (approve). ✓
- `status` enum (`pending`/`active`) + hand-written migration → Task 1. ✓
- Reuse notifications infra → Task 3 (`webhook_proposed` + reviewPath link) + Task 5 Step 5. ✓
- Extend existing card with warning-toned pending banner + Approve(primary)/Reject(ghost) → Task 5 Step 3. ✓
- Reveal signing secret once on approval → Task 4 (returns secret) + Task 5 (renders it). ✓
- Changing an approved URL re-enters pending → Task 3 (update path sets `status='pending'`). ✓
- Re-propose after reject allowed, no cooldown → Task 4 reject deletes the row; Task 3 can insert again. ✓
- Polish `inbox` label → "Messages — wake when someone messages your agent (realtime)" → Task 5 Step 1. ✓
- Link `docs/agents/realtime-webhooks.md` → Task 5 Steps 3-4. ✓
- `isEnabled` stays the on/off control within active → preserved; status is the orthogonal gate. ✓
- Do NOT rebuild the owner webhook UI → only the pending branch is added. ✓

**Known edge (documented, accepted):** Re-proposing a *changed* URL over an active webhook flips it to `pending`, which **pauses delivery** to the previously-active URL until the owner re-approves; rejecting that change **deletes** the row (single-row-per-owner model, per the brief's schema decision — no shadow pending columns). This is the intended security posture (owner re-approves any URL change). Harden notes for `harden.md`: agent cannot grief other tenants (scoped to its own owner's row); SSRF re-validated at approval; secret never returned to the agent.

**Placeholder scan:** No "TBD"/"add validation"/"similar to Task N". The only deferred specifics are the integration-test fixtures, which explicitly say "copy the gate/fixtures from `dispatch-immediate.integration.test.ts`" — a concrete source, not a placeholder — consistent with the repo's DB-gated test posture.

**Type consistency:** `status: "pending" | "active"` is used identically in schema (`$type`), the matcher guard, both SQL filters (`eq(agentWebhooks.status, "active")`), the tool (`status: "pending"`/`"active"`), the tRPC procedures, and the UI (`webhook.status === "pending"`). Secret handling (generate-on-insert, preserve-on-update, reveal-on-approve) is consistent across Task 3 and Task 4.
