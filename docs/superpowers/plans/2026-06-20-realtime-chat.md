# Realtime + Interactive Messages for the Inbox — Implementation Plan (revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Upgrade the existing inbox/DM system to SSE+Upstash realtime (ADR-0025 Tier-1) and add MCP-Apps interactive UI messages, without building a parallel system.

**Architecture:** Extend the existing `conversations`/`conversationParticipants`/`messages` tables, `inbox.ts` router, and `components/inbox/*`. Postgres stays source of truth; Upstash Redis is publish-on-write transport, delivered to the browser via an SSE stream. A message may carry an MCP-Apps `UIResource` rendered in a separate-origin sandboxed iframe with a producer-trust→CSP policy; iframe actions are re-authorized server-side as the acting human.

**Tech Stack:** Next.js 15.4 (App Router), tRPC 11.8, Drizzle + Neon Postgres, Better Auth, `@upstash/redis` (publish) + `ioredis` (SSE subscribe), `@mcp-ui/client`/`@mcp-ui/server`, vitest, pnpm.

**Spec:** [2026-06-20-realtime-chat-design.md](../specs/2026-06-20-realtime-chat-design.md) · **Honors:** [ADR-0025](../../adr/0025-real-time-delivery-is-asymmetric.md)

**Existing system (verbatim map drove this plan):**
- `messages` (`message`): `id, conversationId, senderId(→user.id), senderType("human"|"agent"), content, metadata(jsonb), createdAt`.
- `conversationParticipants` (`conversation_participant`): `…, userId, lastReadAt, isPinned`.
- `conversations` (`conversation`): `type("agent"|"dm"), createdAt, updatedAt`.
- Write paths: `inbox.sendMessage` (human), `inbox.agentSendMessage` (agent, already takes `metadata`), `inbox/dm.ts:sendDirectMessage`.
- Agent delivery: `logActivity` → `activityEvents(action:"message.sent", recipientId)` → cron `webhook-dispatch` (category `inbox` = prefix `message.`). Unchanged this slice.
- Client realtime: `getMessages` polled @3s in `chat-window.tsx` + `inbox-mobile-view.tsx`; `totalUnreadCount` @10s in `inbox-pill.tsx`.

**Run boundary:** Execute Phases 0–3 now (buildable + the migration applies to dev DB). Pause before Phase 4 (SSE) and 5 (MCP-UI render) — those need Upstash credentials and a separate-origin sandbox host to verify end-to-end.

**Conventions:** vitest (`pnpm vitest run <path>`); typecheck gate `pnpm check`; migrations hand-written in `src/migrations/*.ts`, registered in `src/migrations/index.ts`, applied with `pnpm db:apply` (never `db:push`); pnpm.

**Already done (Phase 0 partial, under prior design — corrected in Tasks 0.3/0.4):** `@mcp-ui/client`/`@mcp-ui/server` installed; `ably` installed (to be removed); `src/lib/chat/flags.ts` + feature-flag env added; `src/lib/chat/types.ts` created.

---

## Phase 0 — Dependency + env corrections

> Phase 0 earlier installed `ably` and added `ABLY_API_KEY` under the old (Ably) design. ADR-0025 mandates Upstash. These two tasks correct that forward (no history rewrite).

### Task 0.3: Swap Ably dep for Upstash

**Files:** `package.json`

- [ ] **Step 1: Remove ably, add upstash redis**

Run:
```bash
pnpm remove ably
pnpm add @upstash/redis
```
(`ioredis` for the SSE subscriber is added in Phase 4, not needed yet.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. Nothing imports `ably` yet (Ably client tasks were never built).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(chat): swap ably for @upstash/redis per ADR-0025"
```

### Task 0.4: Correct env vars

**Files:** `src/env.js`

- [ ] **Step 1: Replace ABLY_API_KEY with Upstash creds**

In `src/env.js` `server`: remove `ABLY_API_KEY`, add:
```js
UPSTASH_REDIS_REST_URL: z.string().url().optional(),
UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
```
In `client`: rename `NEXT_PUBLIC_ABLY_SANDBOX_URL` → `NEXT_PUBLIC_CHAT_SANDBOX_URL` (same `z.string().url().optional()`). Keep `NEXT_PUBLIC_FEATURE_CHAT` and `NEXT_PUBLIC_FEATURE_CHAT_UI`.
Update `runtimeEnv` to match (remove `ABLY_API_KEY`, add the two `UPSTASH_*` with `process.env.…`, rename the sandbox var).

- [ ] **Step 2: Update any sandbox env reference**

Grep for `NEXT_PUBLIC_ABLY_SANDBOX_URL`; rename any occurrence to `NEXT_PUBLIC_CHAT_SANDBOX_URL`. (Likely none yet outside env.)

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm typecheck` → PASS
```bash
git add src/env.js
git commit -m "chore(chat): env vars for Upstash + sandbox per ADR-0025"
```

---

## Phase 1 — Data model (two columns on `messages`)

### Task 1.4: Add `uiResource` + `uiProducerTrust` to `messages`

**Files:** `src/server/db/schema.ts`, `src/migrations/20260620a_chat.ts`, `src/migrations/index.ts`

- [ ] **Step 1: Extend the existing `messages` table**

In `src/server/db/schema.ts`, in the EXISTING `messages` table column object (do NOT create a new table), add after `metadata`:
```ts
uiResource: d.jsonb("ui_resource").$type<import("@/lib/chat/types").UiResource>(),
uiProducerTrust: d
  .varchar("ui_producer_trust", { length: 20 })
  .$type<import("@/lib/chat/types").UiProducerTrust>(),
```

- [ ] **Step 2: Write the migration**

Create `src/migrations/20260620a_chat.ts`:
```ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."message" ADD COLUMN IF NOT EXISTS "ui_resource" jsonb;
    ALTER TABLE "app"."message" ADD COLUMN IF NOT EXISTS "ui_producer_trust" varchar(20);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."message" DROP COLUMN IF EXISTS "ui_producer_trust";
    ALTER TABLE "app"."message" DROP COLUMN IF EXISTS "ui_resource";
  `);
}
```

- [ ] **Step 3: Register the migration**

In `src/migrations/index.ts`, add the import alongside the others:
```ts
import * as migration_20260620a_chat from "./20260620a_chat";
```
and append to the `migrations` array:
```ts
{ up: migration_20260620a_chat.up, down: migration_20260620a_chat.down, name: "20260620a_chat" },
```

- [ ] **Step 4: Apply + typecheck**

Run: `pnpm db:apply` (expected: applies `20260620a_chat`, idempotent on re-run)
Run: `pnpm check` (expected PASS)

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260620a_chat.ts src/migrations/index.ts
git commit -m "feat(chat): add ui_resource + ui_producer_trust to messages"
```

---

## Phase 2 — Pure logic (trust → CSP)

### Task 2.3: Trust → CSP policy table (TDD)

**Files:** `src/lib/chat/trust.ts`, `src/lib/chat/trust.test.ts`

> `src/lib/chat/types.ts` already exists (Task 1.1) with `UiProducerTrust` + `UiResource`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/chat/trust.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { resolveProducerTrust, cspForResource } from "@/lib/chat/trust";

describe("resolveProducerTrust", () => {
  it("maps platform-authored UI to platform trust", () => {
    expect(resolveProducerTrust({ kind: "platform" })).toBe("platform");
  });
  it("maps a verified agent to verified_agent", () => {
    expect(resolveProducerTrust({ kind: "agent", verified: true })).toBe("verified_agent");
  });
  it("maps an unverified agent to agent", () => {
    expect(resolveProducerTrust({ kind: "agent", verified: false })).toBe("agent");
  });
  it("maps a human member to member", () => {
    expect(resolveProducerTrust({ kind: "member" })).toBe("member");
  });
});

describe("cspForResource", () => {
  it("locks member-trust UI down: no connect, declared domains ignored", () => {
    const csp = cspForResource("member", { connectDomains: ["evil.example"] });
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain("evil.example");
  });
  it("honors declared connect domains for verified_agent", () => {
    const csp = cspForResource("verified_agent", { connectDomains: ["api.example.com"] });
    expect(csp).toContain("connect-src 'self' https://api.example.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/chat/trust.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/chat/trust.ts`:
```ts
import type { UiProducerTrust, UiResource } from "@/lib/chat/types";

export type ProducerDescriptor =
  | { kind: "platform" }
  | { kind: "agent"; verified: boolean }
  | { kind: "member" };

export function resolveProducerTrust(p: ProducerDescriptor): UiProducerTrust {
  switch (p.kind) {
    case "platform":
      return "platform";
    case "member":
      return "member";
    case "agent":
      return p.verified ? "verified_agent" : "agent";
  }
}

const HONORS_DECLARED_DOMAINS: Record<UiProducerTrust, boolean> = {
  platform: true,
  verified_agent: true,
  agent: false,
  member: false,
};

function domainList(domains: string[] | undefined): string {
  if (!domains || domains.length === 0) return "";
  return " " + domains.map((d) => `https://${d}`).join(" ");
}

export function cspForResource(
  trust: UiProducerTrust,
  csp: UiResource["csp"] = {},
): string {
  const honor = HONORS_DECLARED_DOMAINS[trust];
  const resource = honor ? domainList(csp.resourceDomains) : "";
  const frame = honor ? domainList(csp.frameDomains) : "";
  return [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    `style-src 'self' 'unsafe-inline'${resource}`,
    `img-src 'self' data:${resource}`,
    `connect-src ${honor && csp.connectDomains?.length ? `'self'${domainList(csp.connectDomains)}` : "'none'"}`,
    `frame-src ${frame ? `'self'${frame}` : "'none'"}`,
    "base-uri 'none'",
  ].join("; ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/chat/trust.test.ts` → PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/trust.ts src/lib/chat/trust.test.ts
git commit -m "feat(chat): producer trust + CSP policy table"
```

---

## Phase 3 — Server: publish helper, UI-accept on writes, tool bridge

### Task 3.4: Upstash publish helper

**Files:** `src/server/inbox/publish.ts`

- [ ] **Step 1: Lazy Upstash client + per-user publish (mirror `src/server/mollie.ts` singleton style)**

Create `src/server/inbox/publish.ts`:
```ts
import { Redis } from "@upstash/redis";

import { env } from "@/env";

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  redis ??= new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

export const inboxUserChannel = (userId: string) => `inbox:user:${userId}`;

/** Best-effort fanout. Persistence already succeeded; failure degrades to poll. */
export async function publishInboxEvent(
  recipientUserId: string,
  payload: unknown,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.publish(inboxUserChannel(recipientUserId), JSON.stringify(payload));
  } catch (err) {
    console.error("[inbox] upstash publish failed", err);
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck` → PASS
```bash
git add src/server/inbox/publish.ts
git commit -m "feat(chat): upstash publish helper for inbox fanout"
```

### Task 3.5: Publish on write (3 paths) + accept UI resource

**Files:** `src/server/api/routers/inbox.ts`, `src/server/inbox/dm.ts`

- [ ] **Step 1: Publish from `inbox.sendMessage`**

In `src/server/api/routers/inbox.ts` `sendMessage`, after the message insert and `updatedAt` update (the recipient is already computed as `recipient`), add:
```ts
import { publishInboxEvent } from "@/server/inbox/publish";
// ... after logActivity:
if (recipient?.userId) {
  void publishInboxEvent(recipient.userId, { kind: "message", conversationId: input.conversationId, message });
}
void publishInboxEvent(userId, { kind: "message", conversationId: input.conversationId, message });
```

- [ ] **Step 2: Accept an optional `uiResource` on `sendMessage` + `agentSendMessage`**

Add a shared zod schema + imports near the top of `inbox.ts`:
```ts
import { resolveProducerTrust } from "@/lib/chat/trust";
import type { UiResource } from "@/lib/chat/types";

const uiResourceSchema = z.object({
  uri: z.string().startsWith("ui://"),
  mimeType: z.literal("text/html;profile=mcp-app"),
  encoding: z.enum(["text", "blob"]),
  content: z.string().max(200_000),
  csp: z
    .object({
      connectDomains: z.array(z.string()).optional(),
      resourceDomains: z.array(z.string()).optional(),
      frameDomains: z.array(z.string()).optional(),
      baseUriDomains: z.array(z.string()).optional(),
    })
    .optional(),
});
```
In `sendMessage` input add `uiResource: uiResourceSchema.optional()`, and in the `messages` insert add:
```ts
uiResource: input.uiResource as UiResource | undefined,
uiProducerTrust: input.uiResource ? resolveProducerTrust({ kind: "member" }) : undefined,
```
In `agentSendMessage` input add `uiResource: uiResourceSchema.optional()`. Read the agent profile for `ctx.agent.agentId` to get `agentIsVerified` (treat `status === "active"` as verified, else false), then in the insert add:
```ts
uiResource: input.uiResource as UiResource | undefined,
uiProducerTrust: input.uiResource ? resolveProducerTrust({ kind: "agent", verified: agentIsVerified }) : undefined,
```
Also publish from `agentSendMessage` after the insert: `void publishInboxEvent(ownerId, { kind: "message", conversationId: convId, message });`

- [ ] **Step 3: Publish from `sendDirectMessage`**

In `src/server/inbox/dm.ts`, capture the inserted message via `.returning()`, import `publishInboxEvent`, and after the insert add `await publishInboxEvent(toUserId, { kind: "message", conversationId, message })`.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm check` → PASS
```bash
git add src/server/api/routers/inbox.ts src/server/inbox/dm.ts
git commit -m "feat(chat): publish on message write + accept UI resources"
```

### Task 3.6: Re-authorized UI tool bridge

**Files:** `src/server/inbox/ui-tools.ts`, `src/server/api/routers/inbox.ts`

- [ ] **Step 1: Allow-list + handler**

Create `src/server/inbox/ui-tools.ts`:
```ts
import { z } from "zod";

import type { db as Db } from "@/server/db";

type DB = typeof Db;

/** Tools an embedded UI may invoke, each executed AS the acting human under
 *  their own permissions. Starts empty; add per concrete need, always calling
 *  the SAME service the normal router uses so existing checks run. */
export const UI_TOOLS: Record<
  string,
  { input: z.ZodTypeAny; run: (db: DB, userId: string, args: unknown) => Promise<unknown> }
> = {};

export async function runUiTool(db: DB, userId: string, name: string, rawArgs: unknown) {
  const tool = UI_TOOLS[name];
  if (!tool) throw new Error(`tool not allowed: ${name}`);
  const args = tool.input.parse(rawArgs);
  return tool.run(db, userId, args);
}
```

- [ ] **Step 2: Expose via tRPC**

In `inbox.ts` add (reuse the participant-check pattern from `sendMessage`):
```ts
import { runUiTool } from "@/server/inbox/ui-tools";
// ...
  callUiTool: protectedProcedure
    .input(z.object({ conversationId: z.string(), name: z.string(), args: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const [participant] = await ctx.db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (!participant) throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant" });
      return runUiTool(ctx.db, ctx.session.user.id, input.name, input.args);
    }),
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm check` → PASS
```bash
git add src/server/inbox/ui-tools.ts src/server/api/routers/inbox.ts
git commit -m "feat(chat): re-authorized UI tool bridge (allow-list)"
```

---

> **API-verified (research 2026-06-20):** `@upstash/redis@1.38.0` HAS `subscribe()` over HTTP/SSE — **no `ioredis`/TCP needed**. `@mcp-ui/client@7.1.1` host component is **`AppRenderer`** (NOT `UIResourceRenderer`); callbacks are separate named props **`onMessage`/`onCallTool`/`onOpenLink`** (NOT `onUIAction`); `sandbox.url` must be a `URL` to a **self-hosted `sandbox_proxy.html`**. E2E verification of Phases 4–5 still needs Upstash creds + a separate-origin sandbox host.

## Phase 4 — SSE delivery (code now; E2E needs Upstash creds)

### Task 4.1: Inbox subscribe client + SSE route

**Files:** `src/server/inbox/publish.ts` (add export), `src/app/api/inbox/stream/route.ts`

- [ ] **Step 1: Export a subscribe-capable client from publish.ts**

Add to `src/server/inbox/publish.ts`:
```ts
/** Same lazy client, exposed for the SSE route's subscribe(). Null if unconfigured. */
export function getInboxRedis(): Redis | null {
  return getRedis();
}
```

- [ ] **Step 2: SSE route using `@upstash/redis` `subscribe()`**

Create `src/app/api/inbox/stream/route.ts`:
```ts
import { auth } from "@/server/better-auth";
import { getInboxRedis, inboxUserChannel } from "@/server/inbox/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const redis = getInboxRedis();
  if (!redis) return new Response("realtime unconfigured", { status: 503 });

  const channel = inboxUserChannel(session.user.id);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const subscription = redis.subscribe([channel]);
      subscription.on("message", (data: { channel: string; message: unknown }) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data.message)}\n\n`));
      });
      subscription.on("error", (err: Error) => console.error("[inbox-sse] subscribe error", err));
      // keep-alive comment every 25s so proxies don't drop idle connections
      const ping = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), 25_000);
      request.signal.addEventListener("abort", () => {
        clearInterval(ping);
        void subscription.unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```
> Confirm `auth` import path matches `src/server/api/trpc.ts`. `pnpm check` → PASS. Commit `feat(chat): SSE inbox stream via upstash subscribe`.

### Task 4.2: Client SSE hook + wire into chat windows

**Files:** `src/components/inbox/use-inbox-stream.ts`, `chat-window.tsx`, `inbox-mobile-view.tsx`

- [ ] **Step 1:** Create `use-inbox-stream.ts` — `useEffect` opens `new EventSource("/api/inbox/stream")`; `onmessage` parses the payload (`{ kind:"message", conversationId, message }`) and calls `api.useUtils().inbox.getMessages.invalidate({ conversationId })` + `inbox.totalUnreadCount.invalidate()`; closes on unmount; gate on `isChatEnabled()`.
- [ ] **Step 2:** Call the hook in `chat-window.tsx` + `inbox-mobile-view.tsx`. Keep the existing `refetchInterval` poll as fallback but relax it (e.g. 15s) — SSE is primary.
- [ ] **Step 3:** `pnpm check` → PASS. Commit `feat(chat): client SSE hook + wire into inbox windows`.

### Task 4.3 (deferred — needs Upstash creds): two-browser verification
Message appears <1s via SSE; with Upstash unset, `/api/inbox/stream` 503s and the poll fallback still delivers.

## Phase 5 — MCP-Apps interactive rendering (code now; E2E needs sandbox origin)

> **MUST-FIX before this ships (from Phase 0–3 final review):** the verified-agent
> trust mapping in `inbox.ts` `agentSendMessage` uses `agentProfiles.status === "active"`,
> which is true for ~every agent — so all agents would get the top `verified_agent` CSP
> tier. Before the CSP header is consumed here, redefine "verified" to a real signal
> (dedicated `isVerified`/manifest flag) or default agents to the stricter `agent` tier.

### Task 5.1: CSP-enforced UI-HTML route

**Files:** `src/app/api/inbox/ui-csp/route.ts`

- [ ] Membership-checked route returning a message's `uiResource.content` with the trust-derived CSP header:
```ts
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { messages, conversationParticipants } from "@/server/db/schema";
import { cspForResource } from "@/lib/chat/trust";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const id = new URL(request.url).searchParams.get("messageId");
  if (!id) return new Response("missing messageId", { status: 400 });

  const [m] = await db
    .select({ conversationId: messages.conversationId, uiResource: messages.uiResource, trust: messages.uiProducerTrust })
    .from(messages).where(eq(messages.id, id)).limit(1);
  if (!m?.uiResource) return new Response("not found", { status: 404 });

  const [member] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, m.conversationId), eq(conversationParticipants.userId, session.user.id)))
    .limit(1);
  if (!member) return new Response("forbidden", { status: 403 });

  return new Response(m.uiResource.content, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": cspForResource(m.trust ?? "member", m.uiResource.csp),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

### Task 5.2: Self-host the sandbox proxy + origin config

**Files:** `public/sandbox_proxy.html`

- [ ] Copy the official proxy verbatim from the `@mcp-ui/client` monorepo (`sdks/typescript/client/scripts/proxy/index.html`) into `public/sandbox_proxy.html` — do NOT hand-roll. (The research captured its full contents if the path moved.)
- [ ] **Separate-origin (production security):** for untrusted producers the proxy MUST be served from a **different origin** than the app. The component (Task 5.3) reads `NEXT_PUBLIC_CHAT_SANDBOX_URL`; set it to a separate-origin proxy URL in prod. The `public/` copy is the **dev-only same-origin fallback** — document that prod must point at the separate origin and override `sandbox.permissions` to drop `allow-same-origin`.

### Task 5.3: `AppRenderer` UI-message component

**Files:** `src/components/inbox/ui-message.tsx`

- [ ] Render an agent message's `uiResource` via `@mcp-ui/client`'s **`AppRenderer`** (NOT `UIResourceRenderer`). Use `html={resource.content}` (pre-fetched), `sandbox={{ url: new URL(env.NEXT_PUBLIC_CHAT_SANDBOX_URL ?? "/sandbox_proxy.html", window.location.origin), permissions: "allow-scripts" }}`, and the v7 named callbacks:
  - `onMessage(params)` → post to chat via `inbox.sendMessage` (text from `params` by convention)
  - `onCallTool(params)` → `inbox.callUiTool.mutateAsync({ conversationId, name: params.name, args: params.arguments })`
  - `onOpenLink({ url })` → validate scheme then `window.open(url, "_blank", "noopener,noreferrer")`
  - `hostContext={{ theme, locale }}` carrying DESIGN.md theme
- [ ] Hook into the assistant-message branch of `chat-window.tsx` / `inbox-mobile-view.tsx` behind `isChatUiEnabled()` (render `<UiMessage>` when `msg.uiResource` present, else the text branch).
- [ ] `pnpm check` → PASS. Commit.

### Task 5.4 (deferred — needs sandbox origin): security spot-checks
Inner guest iframe lacks `allow-same-origin` to the app origin; CSP header correct per trust on `/api/inbox/ui-csp`; `callUiTool` runs as the acting human.

## Phase 6 — Flags + end-to-end verification
- **Task 6.1:** Confirm graceful degradation: SSE 503 → poll; Upstash unset → poll; sandbox unset → text-only.
- **Task 6.2:** When Tier-1 ships, update ADR-0025 status (SSE+Upstash: deferred → implemented).

## Follow-ups (Slice 1b+)
- Channels + group DMs + third-party agents as members (widen `conversations.type`, add `communityId`/visibility, nullable `userId`/`agentId` participants, `senderAgentId`, agent trigger policies).
- ADR-0025 Tier-2 faster agent wake (Vercel Queues).
