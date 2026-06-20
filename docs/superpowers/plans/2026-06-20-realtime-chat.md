# Agent-Native Real-Time Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time chat (DMs, group DMs, community channels) with agents as native conversation members and interactive MCP-Apps UI messages rendered in sandboxed iframes.

**Architecture:** Postgres (Drizzle `app` schema) is the source of truth; Ably is fanout/presence/typing only. Writes go through tRPC, which validates, persists, then publishes to Ably; clients hold subscribe-only Ably tokens minted from membership. Agents participate by receiving webhook dispatches and posting back via their existing API key. Interactive UI uses the MCP Apps standard via `@mcp-ui/client` in a separate-origin sandbox, with a per-message `uiProducerTrust` → CSP policy table.

**Tech Stack:** Next.js 15.4 (App Router), tRPC 11.8, Drizzle + Neon Postgres, Better Auth, Ably (`ably` + `ably/react`), `@mcp-ui/client` / `@mcp-ui/server`, vitest, pnpm, Tailwind + OKLCH tokens.

**Spec:** [docs/superpowers/specs/2026-06-20-realtime-chat-design.md](../specs/2026-06-20-realtime-chat-design.md)

**Conventions confirmed from codebase:**
- Tests: vitest, colocated `*.test.ts`, pure-function style. Run a single file: `pnpm vitest run <path>`; one test: `pnpm vitest run <path> -t "<name>"`. Full: `pnpm test`.
- Typecheck/lint gate: `pnpm check` (= `next lint && tsc --noEmit`).
- DB instance: `import { db } from "@/server/db"`. Schema: `@/server/db/schema`. New tables go in `src/server/db/schema.ts` using `appSchema.table(...)`; **NO `pgEnum`** — enums are `varchar` + `.$type<>()`.
- Migrations are **hand-written** `src/migrations/*.ts`, registered in `src/migrations/index.ts`, applied with `pnpm db:apply`. Never `db:push`.
- Env: typed in `src/env.js` (`@t3-oss/env-nextjs`). External clients are lazy singletons (see `src/server/email.ts`, `src/server/mollie.ts`).
- tRPC: `createTRPCRouter`, `publicProcedure`, `protectedProcedure`, `agentProcedure` from `@/server/api/trpc`; register in `src/server/api/root.ts`. Client hooks via `api` from `@/trpc/react`.
- User/member ids are `varchar(255)` UUID strings. `communityId` is `varchar(255)`.

---

## File Structure

**Pure logic (unit-tested):**
- `src/lib/chat/trigger.ts` — agent trigger-policy evaluation (+ `.test.ts`)
- `src/lib/chat/unread.ts` — unread derivation (+ `.test.ts`)
- `src/lib/chat/trust.ts` — `uiProducerTrust` resolution + CSP policy table (+ `.test.ts`)
- `src/lib/chat/permissions.ts` — DM/channel permission predicates (+ `.test.ts`)
- `src/lib/chat/ably-capability.ts` — Ably capability JSON builder (+ `.test.ts`)
- `src/lib/chat/types.ts` — shared TS types/enums

**Server:**
- `src/server/db/schema.ts` — add chat tables (modify)
- `src/migrations/20260620a_chat.ts` — chat schema migration (create)
- `src/migrations/index.ts` — register migration (modify)
- `src/server/chat/dispatch.ts` — persist+publish helper, agent trigger fan-out
- `src/server/ably.ts` — lazy Ably REST singleton (create)
- `src/server/api/routers/chat.ts` — chat tRPC router (create)
- `src/server/api/root.ts` — register router (modify)
- `src/env.js` — add `ABLY_API_KEY`, `NEXT_PUBLIC_*` flags (modify)

**Client / UI (added in later phases):**
- `src/app/api/ably/token/route.ts` — Ably token endpoint
- `src/components/chat/*` — conversation list, message list, composer, message renderer, UI-resource renderer
- `src/app/[locale]/messages/*` and `src/app/[locale]/communities/[slug]/chat/*` — routes
- `public/sandbox_proxy.html` (or separate-origin host) — MCP-Apps sandbox proxy

---

## Phase 0 — Dependencies, env, feature flag

### Task 0.1: Install dependencies

**Files:** `package.json` (modify via pnpm)

- [ ] **Step 1: Add runtime deps**

Run:
```bash
pnpm add ably @mcp-ui/client @mcp-ui/server
```

- [ ] **Step 2: Verify install + typecheck still passes**

Run: `pnpm typecheck`
Expected: PASS (no new type errors; packages resolve).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(chat): add ably + mcp-ui dependencies"
```

### Task 0.2: Add env vars + feature flags

**Files:**
- Modify: `src/env.js`

- [ ] **Step 1: Add server + client keys to the env schema**

In `src/env.js`, add to the `server` object:
```js
ABLY_API_KEY: z.string().optional(),
```
add to the `client` object:
```js
NEXT_PUBLIC_FEATURE_CHAT: z.enum(["true", "false"]).default("false"),
NEXT_PUBLIC_FEATURE_CHAT_UI: z.enum(["true", "false"]).default("false"),
NEXT_PUBLIC_ABLY_SANDBOX_URL: z.string().url().optional(),
```
and add the matching entries to `runtimeEnv`:
```js
ABLY_API_KEY: process.env.ABLY_API_KEY,
NEXT_PUBLIC_FEATURE_CHAT: process.env.NEXT_PUBLIC_FEATURE_CHAT,
NEXT_PUBLIC_FEATURE_CHAT_UI: process.env.NEXT_PUBLIC_FEATURE_CHAT_UI,
NEXT_PUBLIC_ABLY_SANDBOX_URL: process.env.NEXT_PUBLIC_ABLY_SANDBOX_URL,
```

- [ ] **Step 2: Create the flag helper**

Create `src/lib/chat/flags.ts`:
```ts
import { env } from "@/env";

export const isChatEnabled = () => env.NEXT_PUBLIC_FEATURE_CHAT === "true";
export const isChatUiEnabled = () => env.NEXT_PUBLIC_FEATURE_CHAT_UI === "true";
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS

```bash
git add src/env.js src/lib/chat/flags.ts
git commit -m "feat(chat): add env vars + feature flags"
```

---

## Phase 1 — Data model

### Task 1.1: Shared chat types

**Files:**
- Create: `src/lib/chat/types.ts`

- [ ] **Step 1: Define enums + types**

Create `src/lib/chat/types.ts`:
```ts
export type ConversationType = "dm" | "group_dm" | "channel";
export type ConversationVisibility = "open" | "private" | "secret";
export type MemberRole = "owner" | "moderator" | "member";
export type AgentTriggerPolicy = "always" | "mention" | "off";
export type MessageType = "text" | "ui" | "system";
export type UiProducerTrust = "platform" | "verified_agent" | "agent" | "member";

/** MCP Apps UI resource persisted on a message (text/html;profile=mcp-app). */
export interface UiResource {
  uri: string; // ui://...
  mimeType: "text/html;profile=mcp-app";
  encoding: "text" | "blob";
  content: string; // html string, or base64 when encoding=blob
  csp?: {
    connectDomains?: string[];
    resourceDomains?: string[];
    frameDomains?: string[];
    baseUriDomains?: string[];
  };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS

```bash
git add src/lib/chat/types.ts
git commit -m "feat(chat): shared chat types"
```

### Task 1.2: Add chat tables to Drizzle schema

**Files:**
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Append chat tables**

At the end of `src/server/db/schema.ts`, add (the file already imports `index`, `uniqueIndex`, `primaryKey`, `sql`, `user`; reuse them):
```ts
// ─── Chat ────────────────────────────────────────────────────────────────
export const conversations = appSchema.table(
  "conversation",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: d.varchar({ length: 20 }).notNull().$type<
      "dm" | "group_dm" | "channel"
    >(),
    communityId: d.varchar("community_id", { length: 255 }),
    title: d.varchar({ length: 255 }),
    slug: d.varchar({ length: 255 }),
    visibility: d.varchar({ length: 20 }).$type<"open" | "private" | "secret">(),
    createdBy: d.varchar("created_by", { length: 255 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("conversation_community_idx").on(t.communityId),
    index("conversation_type_idx").on(t.type),
  ],
);

export const conversationMembers = appSchema.table(
  "conversation_member",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: d
      .varchar("conversation_id", { length: 255 })
      .notNull()
      .references(() => conversations.id),
    memberId: d.varchar("member_id", { length: 255 }),
    agentId: d.varchar("agent_id", { length: 255 }),
    role: d.varchar({ length: 20 }).notNull().default("member").$type<
      "owner" | "moderator" | "member"
    >(),
    agentTriggerPolicy: d
      .varchar("agent_trigger_policy", { length: 20 })
      .$type<"always" | "mention" | "off">(),
    lastReadAt: d.timestamp("last_read_at", { withTimezone: true }),
    mutedUntil: d.timestamp("muted_until", { withTimezone: true }),
    joinedAt: d
      .timestamp("joined_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("conversation_member_conv_idx").on(t.conversationId),
    index("conversation_member_member_idx").on(t.memberId),
    index("conversation_member_agent_idx").on(t.agentId),
    uniqueIndex("conversation_member_unique_member_idx").on(
      t.conversationId,
      t.memberId,
    ),
  ],
);

export const chatMessages = appSchema.table(
  "chat_message",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: d
      .varchar("conversation_id", { length: 255 })
      .notNull()
      .references(() => conversations.id),
    authorMemberId: d.varchar("author_member_id", { length: 255 }),
    authorAgentId: d.varchar("author_agent_id", { length: 255 }),
    type: d.varchar({ length: 20 }).notNull().default("text").$type<
      "text" | "ui" | "system"
    >(),
    body: d.text(),
    uiResource: d.jsonb("ui_resource").$type<import("@/lib/chat/types").UiResource>(),
    uiProducerTrust: d
      .varchar("ui_producer_trust", { length: 20 })
      .$type<"platform" | "verified_agent" | "agent" | "member">(),
    replyToId: d.varchar("reply_to_id", { length: 255 }),
    attachments: d.jsonb().$type<{ key: string; name: string; mime: string }[]>(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    editedAt: d.timestamp("edited_at", { withTimezone: true }),
    deletedAt: d.timestamp("deleted_at", { withTimezone: true }),
  }),
  (t) => [
    index("chat_message_conv_created_idx").on(t.conversationId, t.createdAt),
    index("chat_message_reply_idx").on(t.replyToId),
  ],
);

export const chatReactions = appSchema.table(
  "chat_reaction",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    messageId: d
      .varchar("message_id", { length: 255 })
      .notNull()
      .references(() => chatMessages.id),
    memberId: d.varchar("member_id", { length: 255 }),
    agentId: d.varchar("agent_id", { length: 255 }),
    emoji: d.varchar({ length: 32 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    uniqueIndex("chat_reaction_unique_idx").on(t.messageId, t.memberId, t.emoji),
  ],
);

export const dmBlocks = appSchema.table(
  "dm_block",
  (d) => ({
    blockerId: d
      .varchar("blocker_id", { length: 255 })
      .notNull()
      .references(() => user.id),
    blockedId: d
      .varchar("blocked_id", { length: 255 })
      .notNull()
      .references(() => user.id),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);
```

- [ ] **Step 2: Add `dmEnabled` to memberProfiles**

In the `memberProfiles` table definition in the same file, add a column alongside the existing ones:
```ts
dmEnabled: d.boolean("dm_enabled").default(true).notNull(),
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS

```bash
git add src/server/db/schema.ts
git commit -m "feat(chat): add chat tables to drizzle schema"
```

### Task 1.3: Write + register the migration

**Files:**
- Create: `src/migrations/20260620a_chat.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Write the migration**

Create `src/migrations/20260620a_chat.ts`:
```ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."conversation" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "type" varchar(20) NOT NULL,
      "community_id" varchar(255),
      "title" varchar(255),
      "slug" varchar(255),
      "visibility" varchar(20),
      "created_by" varchar(255) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamptz
    );
    CREATE INDEX IF NOT EXISTS "conversation_community_idx" ON "app"."conversation" ("community_id");
    CREATE INDEX IF NOT EXISTS "conversation_type_idx" ON "app"."conversation" ("type");

    CREATE TABLE IF NOT EXISTS "app"."conversation_member" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "conversation_id" varchar(255) NOT NULL REFERENCES "app"."conversation"("id"),
      "member_id" varchar(255),
      "agent_id" varchar(255),
      "role" varchar(20) DEFAULT 'member' NOT NULL,
      "agent_trigger_policy" varchar(20),
      "last_read_at" timestamptz,
      "muted_until" timestamptz,
      "joined_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "conversation_member_conv_idx" ON "app"."conversation_member" ("conversation_id");
    CREATE INDEX IF NOT EXISTS "conversation_member_member_idx" ON "app"."conversation_member" ("member_id");
    CREATE INDEX IF NOT EXISTS "conversation_member_agent_idx" ON "app"."conversation_member" ("agent_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "conversation_member_unique_member_idx" ON "app"."conversation_member" ("conversation_id","member_id");

    CREATE TABLE IF NOT EXISTS "app"."chat_message" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "conversation_id" varchar(255) NOT NULL REFERENCES "app"."conversation"("id"),
      "author_member_id" varchar(255),
      "author_agent_id" varchar(255),
      "type" varchar(20) DEFAULT 'text' NOT NULL,
      "body" text,
      "ui_resource" jsonb,
      "ui_producer_trust" varchar(20),
      "reply_to_id" varchar(255),
      "attachments" jsonb,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "edited_at" timestamptz,
      "deleted_at" timestamptz
    );
    CREATE INDEX IF NOT EXISTS "chat_message_conv_created_idx" ON "app"."chat_message" ("conversation_id","created_at");
    CREATE INDEX IF NOT EXISTS "chat_message_reply_idx" ON "app"."chat_message" ("reply_to_id");

    CREATE TABLE IF NOT EXISTS "app"."chat_reaction" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "message_id" varchar(255) NOT NULL REFERENCES "app"."chat_message"("id"),
      "member_id" varchar(255),
      "agent_id" varchar(255),
      "emoji" varchar(32) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "chat_reaction_unique_idx" ON "app"."chat_reaction" ("message_id","member_id","emoji");

    CREATE TABLE IF NOT EXISTS "app"."dm_block" (
      "blocker_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "blocked_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      PRIMARY KEY ("blocker_id","blocked_id")
    );

    ALTER TABLE "app"."member_profile" ADD COLUMN IF NOT EXISTS "dm_enabled" boolean DEFAULT true NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."member_profile" DROP COLUMN IF EXISTS "dm_enabled";
    DROP TABLE IF EXISTS "app"."dm_block";
    DROP TABLE IF EXISTS "app"."chat_reaction";
    DROP TABLE IF EXISTS "app"."chat_message";
    DROP TABLE IF EXISTS "app"."conversation_member";
    DROP TABLE IF EXISTS "app"."conversation";
  `);
}
```

- [ ] **Step 2: Register in the migration index**

In `src/migrations/index.ts`, add the import alongside the others:
```ts
import * as migration_20260620a_chat from "./20260620a_chat";
```
and add to the exported `migrations` array (at the end, preserving order):
```ts
{
  up: migration_20260620a_chat.up,
  down: migration_20260620a_chat.down,
  name: "20260620a_chat",
},
```

- [ ] **Step 3: Apply locally**

Run: `pnpm db:apply`
Expected: output shows `20260620a_chat` applied with no errors; re-running is idempotent (no-op).

- [ ] **Step 4: Commit**

```bash
git add src/migrations/20260620a_chat.ts src/migrations/index.ts
git commit -m "feat(chat): chat schema migration"
```

---

## Phase 2 — Pure logic + chat core router

### Task 2.1: Agent trigger evaluation (TDD)

**Files:**
- Create: `src/lib/chat/trigger.ts`
- Test: `src/lib/chat/trigger.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chat/trigger.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { shouldTriggerAgent } from "@/lib/chat/trigger";

describe("shouldTriggerAgent", () => {
  it("fires always-policy agent on any DM message", () => {
    expect(
      shouldTriggerAgent({
        conversationType: "dm",
        policy: "always",
        mentioned: false,
        replyInAgentThread: false,
      }),
    ).toBe(true);
  });

  it("does not fire off-policy agent even when mentioned", () => {
    expect(
      shouldTriggerAgent({
        conversationType: "channel",
        policy: "off",
        mentioned: true,
        replyInAgentThread: false,
      }),
    ).toBe(false);
  });

  it("fires mention-policy agent only on mention in a channel", () => {
    expect(
      shouldTriggerAgent({
        conversationType: "channel",
        policy: "mention",
        mentioned: true,
        replyInAgentThread: false,
      }),
    ).toBe(true);
    expect(
      shouldTriggerAgent({
        conversationType: "channel",
        policy: "mention",
        mentioned: false,
        replyInAgentThread: false,
      }),
    ).toBe(false);
  });

  it("fires mention-policy agent on a reply inside its own thread", () => {
    expect(
      shouldTriggerAgent({
        conversationType: "group_dm",
        policy: "mention",
        mentioned: false,
        replyInAgentThread: true,
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/chat/trigger.test.ts`
Expected: FAIL — cannot find module `@/lib/chat/trigger`.

- [ ] **Step 3: Implement**

Create `src/lib/chat/trigger.ts`:
```ts
import type { AgentTriggerPolicy, ConversationType } from "@/lib/chat/types";

export interface TriggerInput {
  conversationType: ConversationType;
  policy: AgentTriggerPolicy | null;
  mentioned: boolean;
  replyInAgentThread: boolean;
}

/** Decide whether an agent member should be invoked for a new message. */
export function shouldTriggerAgent(input: TriggerInput): boolean {
  const policy =
    input.policy ?? (input.conversationType === "dm" ? "always" : "mention");
  if (policy === "off") return false;
  if (policy === "always") return true;
  // policy === "mention"
  return input.mentioned || input.replyInAgentThread;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/chat/trigger.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/trigger.ts src/lib/chat/trigger.test.ts
git commit -m "feat(chat): agent trigger-policy evaluation"
```

### Task 2.2: Unread derivation (TDD)

**Files:**
- Create: `src/lib/chat/unread.ts`
- Test: `src/lib/chat/unread.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chat/unread.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { countUnread } from "@/lib/chat/unread";

const d = (s: string) => new Date(s);

describe("countUnread", () => {
  it("counts all messages when never read", () => {
    expect(
      countUnread(
        [{ createdAt: d("2026-06-20T10:00:00Z") }, { createdAt: d("2026-06-20T11:00:00Z") }],
        null,
      ),
    ).toBe(2);
  });

  it("counts only messages after lastReadAt", () => {
    expect(
      countUnread(
        [{ createdAt: d("2026-06-20T10:00:00Z") }, { createdAt: d("2026-06-20T12:00:00Z") }],
        d("2026-06-20T11:00:00Z"),
      ),
    ).toBe(1);
  });

  it("returns 0 when fully caught up", () => {
    expect(
      countUnread([{ createdAt: d("2026-06-20T10:00:00Z") }], d("2026-06-20T10:00:00Z")),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/chat/unread.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/chat/unread.ts`:
```ts
export function countUnread(
  messages: { createdAt: Date }[],
  lastReadAt: Date | null,
): number {
  if (!lastReadAt) return messages.length;
  return messages.filter((m) => m.createdAt > lastReadAt).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/chat/unread.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/unread.ts src/lib/chat/unread.test.ts
git commit -m "feat(chat): unread derivation"
```

### Task 2.3: Trust → CSP policy table (TDD)

**Files:**
- Create: `src/lib/chat/trust.ts`
- Test: `src/lib/chat/trust.test.ts`

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
    expect(resolveProducerTrust({ kind: "agent", verified: true })).toBe(
      "verified_agent",
    );
  });
  it("maps an unverified agent to agent", () => {
    expect(resolveProducerTrust({ kind: "agent", verified: false })).toBe("agent");
  });
  it("maps a human member to member", () => {
    expect(resolveProducerTrust({ kind: "member" })).toBe("member");
  });
});

describe("cspForResource", () => {
  it("locks member-trust UI down: no connect, no declared domains honored", () => {
    const csp = cspForResource("member", { connectDomains: ["evil.example"] });
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain("evil.example");
  });

  it("honors declared connect domains for verified_agent", () => {
    const csp = cspForResource("verified_agent", {
      connectDomains: ["api.example.com"],
    });
    expect(csp).toContain("connect-src 'self' https://api.example.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/chat/trust.test.ts`
Expected: FAIL — module not found.

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

/** Whether a trust level may declare external domains in its CSP. */
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

/** Build a host-enforced CSP per MCP Apps defaults, gated by producer trust. */
export function cspForResource(
  trust: UiProducerTrust,
  csp: UiResource["csp"] = {},
): string {
  const honor = HONORS_DECLARED_DOMAINS[trust];
  const connect = honor ? domainList(csp.connectDomains) : "";
  const resource = honor ? domainList(csp.resourceDomains) : "";
  const frame = honor ? domainList(csp.frameDomains) : "";
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'${resource}`,
    `img-src 'self' data:${resource}`,
    `connect-src ${honor && csp.connectDomains?.length ? `'self'${connect}` : "'none'"}`,
    `frame-src ${frame ? `'self'${frame}` : "'none'"}`,
    "base-uri 'none'",
  ].join("; ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/chat/trust.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/trust.ts src/lib/chat/trust.test.ts
git commit -m "feat(chat): producer trust + CSP policy table"
```

### Task 2.4: Permission predicates (TDD)

**Files:**
- Create: `src/lib/chat/permissions.ts`
- Test: `src/lib/chat/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chat/permissions.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { canStartDm, canManageChannel } from "@/lib/chat/permissions";

describe("canStartDm", () => {
  it("allows when recipient enabled DMs and no block", () => {
    expect(
      canStartDm({ recipientDmEnabled: true, blockedEitherWay: false }),
    ).toBe(true);
  });
  it("denies when recipient disabled DMs", () => {
    expect(
      canStartDm({ recipientDmEnabled: false, blockedEitherWay: false }),
    ).toBe(false);
  });
  it("denies when a block exists in either direction", () => {
    expect(
      canStartDm({ recipientDmEnabled: true, blockedEitherWay: true }),
    ).toBe(false);
  });
});

describe("canManageChannel", () => {
  it("allows community moderators and above", () => {
    expect(canManageChannel("moderator")).toBe(true);
    expect(canManageChannel("admin")).toBe(true);
    expect(canManageChannel("owner")).toBe(true);
  });
  it("denies plain members", () => {
    expect(canManageChannel("member")).toBe(false);
    expect(canManageChannel(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/chat/permissions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/chat/permissions.ts`:
```ts
export function canStartDm(input: {
  recipientDmEnabled: boolean;
  blockedEitherWay: boolean;
}): boolean {
  return input.recipientDmEnabled && !input.blockedEitherWay;
}

/** Community role required to create/manage channels: moderator+. */
export function canManageChannel(
  communityRole: "owner" | "admin" | "moderator" | "member" | null,
): boolean {
  return (
    communityRole === "owner" ||
    communityRole === "admin" ||
    communityRole === "moderator"
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/chat/permissions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/permissions.ts src/lib/chat/permissions.test.ts
git commit -m "feat(chat): DM/channel permission predicates"
```

### Task 2.5: Chat router — conversations + send + history

**Files:**
- Create: `src/server/api/routers/chat.ts`
- Modify: `src/server/api/root.ts`

> Note: this task wires persistence only. Ably publish is added in Phase 4 via `publishMessage` (a no-op until then). Keep procedures thin; they call the pure libs above.

- [ ] **Step 1: Create the router skeleton with `listConversations` + `history`**

Create `src/server/api/routers/chat.ts`:
```ts
import { z } from "zod";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  conversations,
  conversationMembers,
  chatMessages,
} from "@/server/db/schema";

async function assertMember(
  db: typeof import("@/server/db").db,
  conversationId: string,
  userId: string,
) {
  const [m] = await db
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.memberId, userId),
      ),
    )
    .limit(1);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
}

export const chatRouter = createTRPCRouter({
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: conversations.id,
        type: conversations.type,
        title: conversations.title,
        communityId: conversations.communityId,
        lastReadAt: conversationMembers.lastReadAt,
      })
      .from(conversationMembers)
      .innerJoin(
        conversations,
        eq(conversations.id, conversationMembers.conversationId),
      )
      .where(eq(conversationMembers.memberId, ctx.session.user.id))
      .orderBy(desc(conversations.updatedAt));
    return rows;
  }),

  history: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertMember(ctx.db, input.conversationId, ctx.session.user.id);
      const rows = await ctx.db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, input.conversationId),
            isNull(chatMessages.deletedAt),
          ),
        )
        .orderBy(asc(chatMessages.createdAt))
        .limit(input.limit);
      return rows;
    }),

  markRead: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(conversationMembers)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.memberId, ctx.session.user.id),
          ),
        );
      return { ok: true };
    }),
});
```

- [ ] **Step 2: Add the `send` mutation (delegates to dispatch helper from Phase 3/4)**

In `src/server/api/routers/chat.ts`, import the dispatch helper (created in Task 3.1) and add the procedure inside `createTRPCRouter({ ... })`:
```ts
import { dispatchMessage } from "@/server/chat/dispatch";
// ...
  send: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        body: z.string().min(1).max(8000),
        replyToId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, input.conversationId, ctx.session.user.id);
      return dispatchMessage(ctx.db, {
        conversationId: input.conversationId,
        authorMemberId: ctx.session.user.id,
        body: input.body,
        replyToId: input.replyToId,
      });
    }),
```

- [ ] **Step 3: Register the router**

In `src/server/api/root.ts`, add the import:
```ts
import { chatRouter } from "@/server/api/routers/chat";
```
and add to the `appRouter` object:
```ts
chat: chatRouter,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm check`
Expected: PASS once Task 3.1 (`dispatchMessage`) is implemented. If running this task before 3.1, temporarily inline a stub returning the inserted row, then replace in 3.1.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/chat.ts src/server/api/root.ts
git commit -m "feat(chat): chat router — conversations, history, markRead, send"
```

---

## Phase 3 — Agent participation loop

### Task 3.1: Message dispatch helper (persist + trigger fan-out)

**Files:**
- Create: `src/server/chat/dispatch.ts`

> This is the single choke-point for creating a message: it persists, (Phase 4) publishes to Ably, and evaluates agent triggers, reusing the existing `activityEvents` → `agentWebhooks` dispatch path so agents are notified exactly like other platform events.

- [ ] **Step 1: Implement the helper**

Create `src/server/chat/dispatch.ts`:
```ts
import { and, eq, ne } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import {
  chatMessages,
  conversations,
  conversationMembers,
  activityEvents,
} from "@/server/db/schema";
import { shouldTriggerAgent } from "@/lib/chat/trigger";
import { publishMessage } from "@/server/chat/publish";

type DB = typeof Db;

export interface DispatchInput {
  conversationId: string;
  authorMemberId?: string;
  authorAgentId?: string;
  body?: string;
  replyToId?: string;
  // UI fields (Phase 5) optional:
  type?: "text" | "ui" | "system";
  uiResource?: import("@/lib/chat/types").UiResource;
  uiProducerTrust?: import("@/lib/chat/types").UiProducerTrust;
}

const MENTION_RE = /@([a-z0-9_-]+)/gi;

export async function dispatchMessage(db: DB, input: DispatchInput) {
  const [conv] = await db
    .select({ type: conversations.type, communityId: conversations.communityId })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);
  if (!conv) throw new Error("conversation not found");

  const [message] = await db
    .insert(chatMessages)
    .values({
      conversationId: input.conversationId,
      authorMemberId: input.authorMemberId ?? null,
      authorAgentId: input.authorAgentId ?? null,
      type: input.type ?? (input.uiResource ? "ui" : "text"),
      body: input.body ?? null,
      uiResource: input.uiResource ?? null,
      uiProducerTrust: input.uiProducerTrust ?? null,
      replyToId: input.replyToId ?? null,
    })
    .returning();

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId));

  // Fanout (no-op until Phase 4 wires Ably)
  await publishMessage(input.conversationId, message);

  // Loop guard: agent-authored messages never trigger other agents.
  if (input.authorAgentId) return message;

  // Evaluate agent triggers → emit an activityEvent the webhook dispatcher will pick up.
  const mentions = (input.body ?? "").match(MENTION_RE)?.map((m) =>
    m.slice(1).toLowerCase(),
  ) ?? [];

  const agentMembers = await db
    .select({
      agentId: conversationMembers.agentId,
      policy: conversationMembers.agentTriggerPolicy,
    })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, input.conversationId),
        ne(conversationMembers.agentId, ""),
      ),
    );

  for (const a of agentMembers) {
    if (!a.agentId) continue;
    const fire = shouldTriggerAgent({
      conversationType: conv.type,
      policy: a.policy,
      mentioned: mentions.includes(a.agentId.toLowerCase()),
      replyInAgentThread: false, // refined in a follow-up; reply-thread lookup TBD-free below
    });
    if (!fire) continue;
    await db.insert(activityEvents).values({
      actorId: input.authorMemberId ?? "system",
      actorType: "member",
      action: "chat.message.created",
      targetType: "conversation",
      targetId: input.conversationId,
      recipientId: a.agentId,
      communityId: conv.communityId ?? null,
      metadata: { messageId: message.id, body: input.body ?? "" },
    });
  }

  return message;
}
```

- [ ] **Step 2: Create the publish stub (replaced in Phase 4)**

Create `src/server/chat/publish.ts`:
```ts
import type { InferSelectModel } from "drizzle-orm";
import type { chatMessages } from "@/server/db/schema";

/** Phase 4 replaces this with a real Ably REST publish. */
export async function publishMessage(
  _conversationId: string,
  _message: InferSelectModel<typeof chatMessages>,
): Promise<void> {
  // no-op until Ably is wired
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/chat/dispatch.ts src/server/chat/publish.ts
git commit -m "feat(chat): message dispatch + agent trigger fan-out"
```

### Task 3.2: Agent callback procedure (agent posts a message)

**Files:**
- Modify: `src/server/api/routers/chat.ts`

> Reuses `agentProcedure` (Bearer API-key auth) so an agent can post a reply that appears identically to a human message. Requires the agent be a member of the conversation.

- [ ] **Step 1: Add `agentSend` using `agentProcedure`**

In `src/server/api/routers/chat.ts`, add the import and procedure:
```ts
import { agentProcedure } from "@/server/api/trpc";
import { requireScope } from "@/server/agent/scopes"; // existing helper used by agent.ts
// ...
  agentSend: agentProcedure
    .input(
      z.object({
        conversationId: z.string(),
        body: z.string().min(1).max(8000),
        replyToId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const [m] = await ctx.db
        .select({ id: conversationMembers.id })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            eq(conversationMembers.agentId, ctx.agent.agentId),
          ),
        )
        .limit(1);
      if (!m)
        throw new TRPCError({ code: "FORBIDDEN", message: "Agent not in conversation" });

      return dispatchMessage(ctx.db, {
        conversationId: input.conversationId,
        authorAgentId: ctx.agent.agentId,
        body: input.body,
        replyToId: input.replyToId,
      });
    }),
```

> Confirm the exact import path of `requireScope` from how `src/server/api/routers/agent.ts` imports it (Task references it as already-existing). Mirror that import exactly.

- [ ] **Step 2: Typecheck**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/chat.ts
git commit -m "feat(chat): agent message callback (agentSend)"
```

### Task 3.3: Per-conversation agent rate limit (TDD)

**Files:**
- Create: `src/lib/chat/agent-rate.ts`
- Test: `src/lib/chat/agent-rate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chat/agent-rate.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { agentPostsExceeded } from "@/lib/chat/agent-rate";

const d = (min: number) => new Date(`2026-06-20T10:${String(min).padStart(2, "0")}:00Z`);

describe("agentPostsExceeded", () => {
  it("allows under the per-window cap", () => {
    expect(
      agentPostsExceeded(
        [d(0), d(1)],
        { windowMs: 5 * 60_000, max: 5, now: d(2) },
      ),
    ).toBe(false);
  });

  it("blocks at the cap within the window", () => {
    expect(
      agentPostsExceeded(
        [d(0), d(1), d(2), d(3), d(4)],
        { windowMs: 5 * 60_000, max: 5, now: d(4) },
      ),
    ).toBe(true);
  });

  it("ignores posts outside the window", () => {
    expect(
      agentPostsExceeded(
        [d(0), d(1), d(2), d(3), d(4)],
        { windowMs: 60_000, max: 5, now: d(10) },
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/chat/agent-rate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/chat/agent-rate.ts`:
```ts
export function agentPostsExceeded(
  recentPostTimes: Date[],
  opts: { windowMs: number; max: number; now: Date },
): boolean {
  const cutoff = opts.now.getTime() - opts.windowMs;
  const inWindow = recentPostTimes.filter((t) => t.getTime() > cutoff);
  return inWindow.length >= opts.max;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/chat/agent-rate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the guard into `agentSend`**

In `src/server/api/routers/chat.ts` `agentSend`, before calling `dispatchMessage`, count the agent's recent posts in this conversation and enforce the cap:
```ts
import { agentPostsExceeded } from "@/lib/chat/agent-rate";
// inside agentSend, after membership check:
const recent = await ctx.db
  .select({ createdAt: chatMessages.createdAt })
  .from(chatMessages)
  .where(
    and(
      eq(chatMessages.conversationId, input.conversationId),
      eq(chatMessages.authorAgentId, ctx.agent.agentId),
    ),
  )
  .orderBy(desc(chatMessages.createdAt))
  .limit(20);
if (
  agentPostsExceeded(
    recent.map((r) => r.createdAt),
    { windowMs: 5 * 60_000, max: 8, now: new Date() },
  )
) {
  throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Agent post rate exceeded" });
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm check`
Expected: PASS

```bash
git add src/lib/chat/agent-rate.ts src/lib/chat/agent-rate.test.ts src/server/api/routers/chat.ts
git commit -m "feat(chat): per-conversation agent post rate limit"
```

---

> **Phases 4–6 (Ably realtime client/token, MCP-Apps interactive UI host + sandbox, and the chat UI surfaces/routes) are appended once the Ably + @mcp-ui integration research returns, so their steps carry exact, current API code rather than guesses.**
