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
      replyInAgentThread: false, // channel reply-thread detection is a follow-up; DM (always) + @mention cover MVP
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

## Phase 4 — Ably realtime (token, publish, client)

> **Doc-verify note:** Ably's REST/Realtime + `ably/react` surface below is stable, but before implementing run a quick check against https://ably.com/docs/auth/token and https://ably.com/docs/getting-started/react to confirm `createTokenRequest`, `AblyProvider`, `ChannelProvider`, `useChannel`, and `usePresence` signatures for the installed `ably` version (`pnpm why ably`).

### Task 4.1: Ably REST singleton

**Files:**
- Create: `src/server/ably.ts`

- [ ] **Step 1: Implement lazy singleton (mirrors `src/server/mollie.ts`)**

Create `src/server/ably.ts`:
```ts
import   from "ably";

import { env } from "@/env";

let restInstance: Ably.Rest | null = null;

/** Server-side REST client (publish + token minting). Null if unconfigured. */
export function getAblyRest(): Ably.Rest | null {
  if (!env.ABLY_API_KEY) return null;
  restInstance ??= new Ably.Rest({ key: env.ABLY_API_KEY });
  return restInstance;
}

export const conversationChannel = (id: string) => `conversation:${id}`;
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS

```bash
git add src/server/ably.ts
git commit -m "feat(chat): ably REST singleton"
```

### Task 4.2: Capability builder (TDD)

**Files:**
- Create: `src/lib/chat/ably-capability.ts`
- Test: `src/lib/chat/ably-capability.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/chat/ably-capability.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { buildAblyCapability } from "@/lib/chat/ably-capability";

describe("buildAblyCapability", () => {
  it("returns an empty capability for no conversations", () => {
    expect(buildAblyCapability([])).toEqual({});
  });

  it("scopes subscribe + presence to each conversation channel only", () => {
    expect(buildAblyCapability(["a", "b"])).toEqual({
      "conversation:a": ["subscribe", "presence"],
      "conversation:b": ["subscribe", "presence"],
    });
  });

  it("never grants publish capability", () => {
    const cap = buildAblyCapability(["a"]);
    expect(cap["conversation:a"]).not.toContain("publish");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/chat/ably-capability.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/chat/ably-capability.ts`:
```ts
/** Subscribe-only (+presence) capability scoped to the given conversations. */
export function buildAblyCapability(
  conversationIds: string[],
): Record<string, string[]> {
  const cap: Record<string, string[]> = {};
  for (const id of conversationIds) {
    cap[`conversation:${id}`] = ["subscribe", "presence"];
  }
  return cap;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/chat/ably-capability.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/ably-capability.ts src/lib/chat/ably-capability.test.ts
git commit -m "feat(chat): ably capability builder"
```

### Task 4.3: Token endpoint

**Files:**
- Create: `src/app/api/ably/token/route.ts`

> Mints a subscribe-only `TokenRequest` scoped to the caller's actual conversation memberships. The client's `authCallback` hits this route.

- [ ] **Step 1: Implement the route**

Create `src/app/api/ably/token/route.ts`:
```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { conversationMembers } from "@/server/db/schema";
import { getAblyRest } from "@/server/ably";
import { buildAblyCapability } from "@/lib/chat/ably-capability";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rest = getAblyRest();
  if (!rest) {
    return NextResponse.json({ error: "ably not configured" }, { status: 503 });
  }

  const rows = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.memberId, session.user.id));

  const capability = buildAblyCapability(rows.map((r) => r.conversationId));

  const tokenRequest = await rest.auth.createTokenRequest({
    clientId: session.user.id,
    capability: JSON.stringify(capability),
  });

  return NextResponse.json(tokenRequest);
}
```

> Confirm the Better Auth server import path (`@/server/better-auth`) matches how `src/server/api/trpc.ts` imports `auth`. Mirror it exactly.

- [ ] **Step 2: Manual verification**

Run dev server (`pnpm dev`), sign in, then in the browser console:
```js
await fetch("/api/ably/token").then((r) => r.status)
```
Expected: `200` when signed in with `ABLY_API_KEY` set; `401` when signed out.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ably/token/route.ts
git commit -m "feat(chat): ably token endpoint scoped to memberships"
```

### Task 4.4: Real publish (replace the stub)

**Files:**
- Modify: `src/server/chat/publish.ts`

- [ ] **Step 1: Replace the no-op with an Ably REST publish**

Replace the contents of `src/server/chat/publish.ts`:
```ts
import type { InferSelectModel } from "drizzle-orm";

import type { chatMessages } from "@/server/db/schema";
import { getAblyRest, conversationChannel } from "@/server/ably";

export async function publishMessage(
  conversationId: string,
  message: InferSelectModel<typeof chatMessages>,
): Promise<void> {
  const rest = getAblyRest();
  if (!rest) return; // graceful no-op when unconfigured
  try {
    await rest.channels.get(conversationChannel(conversationId)).publish("message", message);
  } catch (err) {
    // Persistence already succeeded; fanout is best-effort. Log, don't throw.
    console.error("[chat] ably publish failed", err);
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS

```bash
git add src/server/chat/publish.ts
git commit -m "feat(chat): publish messages to ably after persist"
```

### Task 4.5: Client realtime provider + channel hook

**Files:**
- Create: `src/components/chat/ably-provider.tsx`
- Create: `src/components/chat/use-conversation.ts`

- [ ] **Step 1: Provider with token auth**

Create `src/components/chat/ably-provider.tsx`:
```tsx
"use client";

import Ably from "ably";
import { AblyProvider, ChannelProvider } from "ably/react";
import { useState } from "react";

export function ChatAblyProvider({
  conversationId,
  children,
}: {
  conversationId: string;
  children: React.ReactNode;
}) {
  const [client] = useState(
    () =>
      new Ably.Realtime({
        authCallback: async (_params, callback) => {
          try {
            const res = await fetch("/api/ably/token");
            if (!res.ok) throw new Error(`token ${res.status}`);
            callback(null, await res.json());
          } catch (err) {
            callback(err as string, null);
          }
        },
      }),
  );

  return (
    <AblyProvider client={client}>
      <ChannelProvider channelName={`conversation:${conversationId}`}>
        {children}
      </ChannelProvider>
    </AblyProvider>
  );
}
```

- [ ] **Step 2: Channel hook (live tail + presence + typing)**

Create `src/components/chat/use-conversation.ts`:
```ts
"use client";

import { useChannel, usePresence, usePresenceListener } from "ably/react";
import { useCallback, useState } from "react";

import { api } from "@/trpc/react";

export type ChatMessage = NonNullable<
  ReturnType<typeof api.chat.history.useQuery>["data"]
>[number];

export function useConversation(conversationId: string) {
  // History from Postgres (source of truth).
  const history = api.chat.history.useQuery({ conversationId });
  const [live, setLive] = useState<ChatMessage[]>([]);

  // Live tail from Ably.
  useChannel(`conversation:${conversationId}`, "message", (msg) => {
    setLive((prev) => [...prev, msg.data as ChatMessage]);
  });

  // Presence (online indicator).
  usePresence(`conversation:${conversationId}`);
  const { presenceData } = usePresenceListener(`conversation:${conversationId}`);

  const send = api.chat.send.useMutation();
  const post = useCallback(
    (body: string, replyToId?: string) =>
      send.mutateAsync({ conversationId, body, replyToId }),
    [conversationId, send],
  );

  const messages = [...(history.data ?? []), ...live].filter(
    (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
  );

  return {
    messages,
    online: presenceData.map((p) => p.clientId),
    isLoading: history.isLoading,
    post,
    isSending: send.isPending,
  };
}
```

> **Doc-verify:** confirm `usePresence`/`usePresenceListener` return shapes for the installed `ably` version; the import names are correct for `ably/react` v2.x.

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS

```bash
git add src/components/chat/ably-provider.tsx src/components/chat/use-conversation.ts
git commit -m "feat(chat): client ably provider + conversation hook"
```

---

## Phase 5 — MCP-Apps interactive UI messages

> **Doc-verify note:** `@mcp-ui/client` / `@mcp-ui/server` evolve quickly. Before implementing Tasks 5.3–5.5, verify the current `createUIResource` signature and the host renderer's component name + props (`AppRenderer` vs `UIResourceRenderer`, and the `onUiAction`/`onCallTool`/`onMessage`/`onOpenLink` callback names) against https://mcpui.dev and github.com/idosal/mcp-ui for the installed version (`pnpm why @mcp-ui/client`). The task code uses the names from the 2026-01-26 MCP Apps spec; adapt prop names if the package differs.

### Task 5.1: Producer-trust assignment in dispatch (TDD via trust lib already covered)

**Files:**
- Modify: `src/server/chat/dispatch.ts`
- Modify: `src/server/api/routers/chat.ts`

- [ ] **Step 1: Extend `send` + `agentSend` to carry a UI resource**

In `src/server/api/routers/chat.ts`, extend both input schemas with an optional UI resource and pass through, computing trust from the author. Add to imports:
```ts
import { resolveProducerTrust } from "@/lib/chat/trust";
import type { UiResource } from "@/lib/chat/types";
```
Add a zod schema near the top of the file:
```ts
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
In `send` input add `uiResource: uiResourceSchema.optional()`, and in the handler pass:
```ts
uiResource: input.uiResource as UiResource | undefined,
uiProducerTrust: input.uiResource
  ? resolveProducerTrust({ kind: "member" })
  : undefined,
```
In `agentSend` add the same input field, and pass trust derived from agent verification status (read `agentProfiles.status === "active"` or a `verified` flag for the agent; if unavailable use `verified: false`):
```ts
uiProducerTrust: input.uiResource
  ? resolveProducerTrust({ kind: "agent", verified: agentIsVerified })
  : undefined,
```
where `agentIsVerified` is fetched from the agent profile in the same handler.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm check`
Expected: PASS

```bash
git add src/server/api/routers/chat.ts src/server/chat/dispatch.ts
git commit -m "feat(chat): accept UI-resource messages with producer trust"
```

### Task 5.2: CSP header endpoint for sandbox resources

**Files:**
- Create: `src/app/api/chat/ui-csp/route.ts`

> The sandbox proxy fetches the resource HTML with a host-enforced CSP derived from the message's `uiProducerTrust` via `cspForResource` (already TDD'd in Task 2.3).

- [ ] **Step 1: Implement**

Create `src/app/api/chat/ui-csp/route.ts`:
```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { chatMessages } from "@/server/db/schema";
import { cspForResource } from "@/lib/chat/trust";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new NextResponse("unauthorized", { status: 401 });

  const messageId = new URL(req.url).searchParams.get("messageId");
  if (!messageId) return new NextResponse("missing messageId", { status: 400 });

  const [m] = await db
    .select({
      uiResource: chatMessages.uiResource,
      trust: chatMessages.uiProducerTrust,
    })
    .from(chatMessages)
    .where(eq(chatMessages.id, messageId))
    .limit(1);
  if (!m?.uiResource) return new NextResponse("not found", { status: 404 });

  const csp = cspForResource(m.trust ?? "member", m.uiResource.csp);
  return new NextResponse(m.uiResource.content, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

> **Membership check:** before returning content, assert the caller is a member of the message's conversation (reuse the `assertMember` pattern from the chat router). Add that query here so resource HTML isn't readable by non-members.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/chat/ui-csp/route.ts
git commit -m "feat(chat): host-enforced CSP endpoint for UI resources"
```

### Task 5.3: Sandbox proxy on a separate origin

**Files:**
- Create: `public/sandbox/sandbox_proxy.html` (interim) — and a decision record on final hosting.

> **Decision required at implementation:** the sandbox proxy MUST be served from a **different origin** than the app for true isolation. Options, in order of preference:
> 1. **Separate Vercel project/subdomain** (e.g. `sandbox.<app-domain>`) serving the official `@mcp-ui/client` sandbox proxy HTML. Strongest isolation. Set `NEXT_PUBLIC_ABLY_SANDBOX_URL` (reuse the env var added in Task 0.2, or rename to `NEXT_PUBLIC_CHAT_SANDBOX_URL`) to its URL.
> 2. A distinct domain pointed at a static `sandbox_proxy.html`.
>
> Serving from the same origin under a path is **NOT acceptable** — it defeats the sandbox. Document the chosen approach in `docs/superpowers/specs/2026-06-20-realtime-chat-design.md` "Open questions".

- [ ] **Step 1: Obtain the official sandbox proxy HTML**

Fetch the current `sandbox_proxy.html` (or the documented equivalent) from `@mcp-ui/client` (check the installed package's `dist`/`examples` or the repo). Place it at the separate-origin host. Do not hand-roll it — use the SDK's proxy so the JSON-RPC handshake matches.

- [ ] **Step 2: Verify it loads from the separate origin**

Open the sandbox URL directly in a browser; expected: a blank page that posts `ui-lifecycle-iframe-ready` / `sandbox-proxy-ready` (visible via a `window.addEventListener("message", ...)` probe on a test page).

- [ ] **Step 3: Commit the hosting decision + any static asset**

```bash
git add public/sandbox/ docs/superpowers/specs/2026-06-20-realtime-chat-design.md
git commit -m "feat(chat): sandbox proxy hosting for MCP-Apps UI"
```

### Task 5.4: `callUiTool` — re-authorized tool bridge

**Files:**
- Modify: `src/server/api/routers/chat.ts`
- Create: `src/server/chat/ui-tools.ts`

> Guest `tools/call` from an embedded UI is routed here and executed **as the acting human**, against an allow-list. This is the security-critical re-authorization point.

- [ ] **Step 0: Extract the challenges-enrollment service**

Open `src/server/api/routers/challenges.ts`, find the `enroll` mutation, and move its body into a shared function so both the router and the UI tool reuse the exact same checks. Create `src/server/challenges/enroll.ts`:
```ts
import type { db as Db } from "@/server/db";

type DB = typeof Db;

/** Single source of truth for challenge enrollment. Mirror the existing
 *  challenges router `enroll` mutation body here verbatim (eligibility,
 *  membership, XP award, activity log), accepting the actor's userId. */
export async function enrollInChallenge(
  db: DB,
  userId: string,
  challengeId: number,
) {
  // Paste the existing `enroll` mutation logic here, using `userId` as the actor.
  // Then update the challenges router `enroll` mutation to call this function.
}
```
Update the challenges router `enroll` mutation to call `enrollInChallenge(ctx.db, ctx.session.user.id, input.challengeId)`. Run `pnpm check` (expected PASS) and the existing challenges tests (`pnpm vitest run src/lib/challenges*` if present) to confirm no regression, then commit before continuing.

- [ ] **Step 1: Define the allow-list + handler**

Create `src/server/chat/ui-tools.ts`:
```ts
import { z } from "zod";

import type { db as Db } from "@/server/db";

type DB = typeof Db;

/** Tools an embedded UI may invoke, each executed as the acting human. */
export const UI_TOOLS = {
  "challenge.enroll": {
    input: z.object({ challengeId: z.number() }),
    // Implementation step: call the SAME enrollment code path the challenges
    // router's `enroll` mutation uses, passing this `userId` as the actor, so all
    // of its existing eligibility/membership checks run. Open
    // `src/server/api/routers/challenges.ts`, find the `enroll` mutation, extract
    // its body into a shared `enrollInChallenge(db, userId, challengeId)` service
    // function, have both the router and this `run` call it. Do not duplicate or
    // weaken its checks.
    run: async (db: DB, userId: string, args: { challengeId: number }) => {
      const { enrollInChallenge } = await import("@/server/challenges/enroll");
      return enrollInChallenge(db, userId, args.challengeId);
    },
  },
} as const;

export type UiToolName = keyof typeof UI_TOOLS;

export async function runUiTool(
  db: DB,
  userId: string,
  name: string,
  rawArgs: unknown,
) {
  const tool = (UI_TOOLS as Record<string, (typeof UI_TOOLS)[UiToolName]>)[name];
  if (!tool) throw new Error(`tool not allowed: ${name}`);
  const args = tool.input.parse(rawArgs);
  // @ts-expect-error narrowed by allow-list lookup
  return tool.run(db, userId, args);
}
```

- [ ] **Step 2: Expose via tRPC**

In `src/server/api/routers/chat.ts` add:
```ts
import { runUiTool } from "@/server/chat/ui-tools";
// ...
  callUiTool: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        name: z.string(),
        args: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMember(ctx.db, input.conversationId, ctx.session.user.id);
      return runUiTool(ctx.db, ctx.session.user.id, input.name, input.args);
    }),
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm check`
Expected: PASS (the `throw` placeholder is intentional until a concrete first tool is wired; replace `challenge.enroll`'s `run` with the real challenges-enrollment call before enabling the UI flag).

```bash
git add src/server/chat/ui-tools.ts src/server/api/routers/chat.ts
git commit -m "feat(chat): re-authorized UI tool bridge (allow-list)"
```

### Task 5.5: Client UI-resource renderer

**Files:**
- Create: `src/components/chat/ui-resource.tsx`

- [ ] **Step 1: Render the resource via the MCP-UI host SDK**

Create `src/components/chat/ui-resource.tsx`:
```tsx
"use client";

import { AppRenderer } from "@mcp-ui/client";

import { env } from "@/env";
import { api } from "@/trpc/react";
import type { UiResource } from "@/lib/chat/types";

export function ChatUiResource({
  conversationId,
  messageId,
  resource,
  onPostToChat,
}: {
  conversationId: string;
  messageId: string;
  resource: UiResource;
  onPostToChat: (text: string) => void;
}) {
  const callTool = api.chat.callUiTool.useMutation();
  const sandboxUrl = env.NEXT_PUBLIC_ABLY_SANDBOX_URL; // separate-origin proxy

  return (
    <AppRenderer
      sandbox={sandboxUrl ? { url: new URL(sandboxUrl) } : undefined}
      // The host fetches CSP-enforced HTML by messageId:
      resource={{
        uri: resource.uri,
        mimeType: resource.mimeType,
        // Point the renderer at our CSP endpoint for the actual HTML.
        url: `/api/chat/ui-csp?messageId=${encodeURIComponent(messageId)}`,
      }}
      onMessage={(text: string) => onPostToChat(text)}
      onCallTool={async (name: string, args: unknown) =>
        callTool.mutateAsync({ conversationId, name, args })
      }
      onOpenLink={async ({ url }: { url: string }) => {
        if (url.startsWith("https://") || url.startsWith("http://")) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }}
    />
  );
}
```

> **Doc-verify (important):** the exact `AppRenderer` prop names (`resource` shape, `onMessage`/`onCallTool`/`onOpenLink`) must be confirmed against the installed `@mcp-ui/client`. If the package exposes `UIResourceRenderer` with an `onUiAction(action)` union instead, adapt: map `action.type === "prompt"|"link"|"tool"` to `onPostToChat`, `window.open`, and `callTool.mutateAsync` respectively. The intent (post-to-chat, re-authorized tool call, validated link) stays identical.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS (adjust props per the doc-verify before this passes if the package differs).

```bash
git add src/components/chat/ui-resource.tsx
git commit -m "feat(chat): render MCP-Apps UI resources in chat"
```

---

## Phase 6 — Chat UI surfaces + routes

> All routes gate on `isChatEnabled()`; interactive UI gates additionally on `isChatUiEnabled()`. Mirror the server/client page split from existing routes (e.g. `src/app/[locale]/communities/[slug]/page.tsx` + `_overview-client.tsx`).

### Task 6.1: Message list + composer + message renderer

**Files:**
- Create: `src/components/chat/message-list.tsx`
- Create: `src/components/chat/composer.tsx`
- Create: `src/components/chat/message-item.tsx`

- [ ] **Step 1: Message item (dispatches text vs ui)**

Create `src/components/chat/message-item.tsx`:
```tsx
"use client";

import { RelativeTime } from "@/components/ui/relative-time";
import { ChatUiResource } from "@/components/chat/ui-resource";
import { isChatUiEnabled } from "@/lib/chat/flags";
import type { ChatMessage } from "@/components/chat/use-conversation";

export function MessageItem({
  message,
  conversationId,
  onPostToChat,
}: {
  message: ChatMessage;
  conversationId: string;
  onPostToChat: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-2">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="font-medium text-foreground">
          {message.authorAgentId ? "Agent" : "Member"}
        </span>
        <RelativeTime date={message.createdAt} />
      </div>
      {message.type === "ui" && message.uiResource && isChatUiEnabled() ? (
        <ChatUiResource
          conversationId={conversationId}
          messageId={message.id}
          resource={message.uiResource}
          onPostToChat={onPostToChat}
        />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{message.body}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Composer**

Create `src/components/chat/composer.tsx`:
```tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (body: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const submit = async () => {
    const body = value.trim();
    if (!body) return;
    setValue("");
    await onSend(body);
  };
  return (
    <div className="border-border flex items-end gap-2 border-t p-3">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Message…"
        className="max-h-32 min-h-9 resize-none"
        rows={1}
      />
      <Button onClick={() => void submit()} disabled={disabled}>
        Send
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Message list (wires the hook)**

Create `src/components/chat/message-list.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";

import { useConversation } from "@/components/chat/use-conversation";
import { MessageItem } from "@/components/chat/message-item";
import { Composer } from "@/components/chat/composer";
import { Skeleton } from "@/components/ui/skeleton";

export function MessageList({ conversationId }: { conversationId: string }) {
  const { messages, isLoading, post, isSending } = useConversation(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-2/3" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {messages.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            conversationId={conversationId}
            onPostToChat={(text) => void post(text)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <Composer onSend={post} disabled={isSending} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS

```bash
git add src/components/chat/message-list.tsx src/components/chat/composer.tsx src/components/chat/message-item.tsx
git commit -m "feat(chat): message list, composer, message item"
```

### Task 6.2: Conversation routes (DM + community channel)

**Files:**
- Create: `src/app/[locale]/messages/page.tsx` + `_inbox-client.tsx`
- Create: `src/app/[locale]/messages/[conversationId]/page.tsx` + `_conversation-client.tsx`
- Create: `src/app/[locale]/communities/[slug]/chat/[channelId]/page.tsx` + `_channel-client.tsx`

- [ ] **Step 1: Conversation detail client (wraps provider + list)**

Create `src/app/[locale]/messages/[conversationId]/_conversation-client.tsx`:
```tsx
"use client";

import { use } from "react";
import { notFound } from "next/navigation";

import { ChatAblyProvider } from "@/components/chat/ably-provider";
import { MessageList } from "@/components/chat/message-list";
import { isChatEnabled } from "@/lib/chat/flags";

export function ConversationClient({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  if (!isChatEnabled()) notFound();
  const { conversationId } = use(params);
  return (
    <ChatAblyProvider conversationId={conversationId}>
      <div className="mx-auto h-[calc(100vh-4rem)] max-w-2xl">
        <MessageList conversationId={conversationId} />
      </div>
    </ChatAblyProvider>
  );
}
```

- [ ] **Step 2: Server page wrapper**

Create `src/app/[locale]/messages/[conversationId]/page.tsx`:
```tsx
import { ConversationClient } from "./_conversation-client";

export default function Page({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  return <ConversationClient params={params} />;
}
```

- [ ] **Step 3: Inbox list page**

Create `src/app/[locale]/messages/_inbox-client.tsx`:
```tsx
"use client";

import Link from "next/link";

import { api } from "@/trpc/react";
import { isChatEnabled } from "@/lib/chat/flags";
import { notFound } from "next/navigation";

export function InboxClient() {
  if (!isChatEnabled()) notFound();
  const { data, isLoading } = api.chat.listConversations.useQuery();
  if (isLoading) return <p className="p-4 text-muted-foreground">Loading…</p>;
  return (
    <ul className="mx-auto max-w-2xl divide-y">
      {(data ?? []).map((c) => (
        <li key={c.id}>
          <Link
            href={`/messages/${c.id}`}
            className="hover:bg-accent block px-4 py-3"
          >
            {c.title ?? (c.type === "dm" ? "Direct message" : "Conversation")}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```
Create `src/app/[locale]/messages/page.tsx`:
```tsx
import { InboxClient } from "./_inbox-client";

export default function Page() {
  return <InboxClient />;
}
```

- [ ] **Step 4: Community channel route mirrors the conversation client**

Create `src/app/[locale]/communities/[slug]/chat/[channelId]/page.tsx` and `_channel-client.tsx` mirroring Steps 1–2, using `channelId` as the `conversationId` passed to `ChatAblyProvider` + `MessageList`.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm check`
Expected: PASS

```bash
git add src/app/[locale]/messages src/app/[locale]/communities/[slug]/chat
git commit -m "feat(chat): messages inbox + conversation + community channel routes"
```

### Task 6.3: Conversation/channel/DM creation procedures

**Files:**
- Modify: `src/server/api/routers/chat.ts`

- [ ] **Step 1: Add `startDm`, `startGroupDm`, `createChannel`, `joinChannel`, `setAgentTriggerPolicy`, `blockDm`, `setDmEnabled`, `report`**

In `src/server/api/routers/chat.ts`, add these procedures. Each follows the same shape: validate via the pure predicates from Task 2.4, insert `conversations` + `conversationMembers` rows, return the conversation id. Example `startDm` (repeat the structural pattern for the others):
```ts
import { canStartDm, canManageChannel } from "@/lib/chat/permissions";
import { memberProfiles, dmBlocks } from "@/server/db/schema";
import { or } from "drizzle-orm";
// ...
  startDm: protectedProcedure
    .input(z.object({ recipientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      const [recipient] = await ctx.db
        .select({ dmEnabled: memberProfiles.dmEnabled })
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, input.recipientId))
        .limit(1);
      const blocks = await ctx.db
        .select({ blockerId: dmBlocks.blockerId })
        .from(dmBlocks)
        .where(
          or(
            and(eq(dmBlocks.blockerId, me), eq(dmBlocks.blockedId, input.recipientId)),
            and(eq(dmBlocks.blockerId, input.recipientId), eq(dmBlocks.blockedId, me)),
          ),
        );
      if (
        !canStartDm({
          recipientDmEnabled: recipient?.dmEnabled ?? false,
          blockedEitherWay: blocks.length > 0,
        })
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot DM this member" });
      }
      const [conv] = await ctx.db
        .insert(conversations)
        .values({ type: "dm", createdBy: me })
        .returning();
      await ctx.db.insert(conversationMembers).values([
        { conversationId: conv.id, memberId: me, role: "owner" },
        { conversationId: conv.id, memberId: input.recipientId, role: "member" },
      ]);
      return { conversationId: conv.id };
    }),
```
For `createChannel`, resolve the caller's community role (reuse the existing community-membership query used elsewhere — mirror how `src/server/api/routers/communities.ts` reads a member's role) and gate with `canManageChannel(role)`. For `setAgentTriggerPolicy`, update the agent's `conversationMembers.agentTriggerPolicy`. For `setDmEnabled`, update `memberProfiles.dmEnabled`. For `blockDm`, insert/delete a `dmBlocks` row. For `report`, insert into the existing reporting/notification path (mirror how content reports are created elsewhere).

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm check`
Expected: PASS

```bash
git add src/server/api/routers/chat.ts
git commit -m "feat(chat): conversation/channel/DM creation + settings procedures"
```

### Task 6.4: End-to-end manual verification

- [ ] **Step 1: Enable flags locally**

Set in `.env`: `NEXT_PUBLIC_FEATURE_CHAT=true`, `NEXT_PUBLIC_FEATURE_CHAT_UI=true`, `ABLY_API_KEY=…`, `NEXT_PUBLIC_ABLY_SANDBOX_URL=…`.

- [ ] **Step 2: Two-browser DM test**

Sign in as two users; from user A `startDm` to user B (via a temporary button or tRPC panel), open `/messages/<id>` in both; send a message from A; expected: it appears in B within ~1s via Ably, and persists on reload (Postgres history).

- [ ] **Step 3: Agent loop test**

Add an agent as a conversation member with `agentTriggerPolicy='always'` in a DM; post a message; expected: an `activityEvents` row with `action='chat.message.created'` and `recipientId=<agentId>`; after the webhook dispatcher runs, the agent's `agentSend` reply appears in the conversation.

- [ ] **Step 4: Interactive UI test**

Have the agent `agentSend` a `uiResource` (simple HTML with a button that posts `ui/message`); expected: it renders in a sandboxed iframe from the separate origin; clicking the button posts a chat message; a `tools/call` to an allow-listed tool runs as the acting human.

- [ ] **Step 5: Security spot-checks**

In devtools, confirm the UI iframe's `sandbox` attribute lacks `allow-same-origin` for the app origin, and the `Content-Security-Policy` response header on `/api/chat/ui-csp` for a member-trust resource is the locked-down variant (`connect-src 'none'`).

### Task 6.5: Message mutations (react/edit/delete) + offline notifications

**Files:**
- Modify: `src/server/api/routers/chat.ts`
- Modify: `src/server/chat/dispatch.ts`

- [ ] **Step 1: Add `react`, `edit`, `delete` procedures**

In `src/server/api/routers/chat.ts`, add (import `chatReactions` from schema):
```ts
import { chatReactions } from "@/server/db/schema";
// ...
  react: protectedProcedure
    .input(z.object({ messageId: z.string(), emoji: z.string().max(32) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(chatReactions)
        .values({ messageId: input.messageId, memberId: ctx.session.user.id, emoji: input.emoji })
        .onConflictDoNothing();
      return { ok: true };
    }),

  edit: protectedProcedure
    .input(z.object({ messageId: z.string(), body: z.string().min(1).max(8000) }))
    .mutation(async ({ ctx, input }) => {
      const [m] = await ctx.db
        .update(chatMessages)
        .set({ body: input.body, editedAt: new Date() })
        .where(
          and(
            eq(chatMessages.id, input.messageId),
            eq(chatMessages.authorMemberId, ctx.session.user.id),
          ),
        )
        .returning();
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not your message" });
      return m;
    }),

  delete: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [m] = await ctx.db
        .update(chatMessages)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(chatMessages.id, input.messageId),
            eq(chatMessages.authorMemberId, ctx.session.user.id),
          ),
        )
        .returning();
      if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "Not your message" });
      return { ok: true };
    }),
```

- [ ] **Step 2: Create offline notifications for DM messages + @mentions**

In `src/server/chat/dispatch.ts`, after persisting + publishing (and only for human-authored messages), insert a `notifications` row for each human recipient who should be notified: in a DM, the other member; in a channel/group, any `@mentioned` member. Mirror the existing notification-insert shape from `src/server/db/schema.ts` `notifications` (fields: `userId`, `type`, `title`, `content`, `metadata`, `communityId`). Add to the imports `notifications` and, after the agent-trigger loop:
```ts
import { notifications } from "@/server/db/schema";
// ... after agent trigger loop, before `return message`:
const humanRecipients = await db
  .select({ memberId: conversationMembers.memberId })
  .from(conversationMembers)
  .where(eq(conversationMembers.conversationId, input.conversationId));
const notifyIds = humanRecipients
  .map((r) => r.memberId)
  .filter((id): id is string => !!id && id !== input.authorMemberId)
  .filter((id) =>
    conv.type === "dm" ? true : mentions.includes(id.toLowerCase()),
  );
if (notifyIds.length > 0) {
  await db.insert(notifications).values(
    notifyIds.map((id) => ({
      userId: id,
      type: "chat_message",
      title: "New message",
      content: (input.body ?? "").slice(0, 140),
      metadata: { conversationId: input.conversationId, messageId: message.id },
      communityId: conv.communityId ?? null,
    })),
  );
}
```

> The existing email/push delivery already fans out from `notifications` rows (see the notifications router + cron digest), so no extra delivery wiring is needed here. Members' in-app unread for chat itself stays derived from `lastReadAt` (Task 2.2).

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm check`
Expected: PASS

```bash
git add src/server/api/routers/chat.ts src/server/chat/dispatch.ts
git commit -m "feat(chat): react/edit/delete + offline notifications"
```

---

## Follow-ups (out of scope for this slice)
- Fold existing inbox/presence polling (`LIVE_MESSAGES_REFETCH_MS`, hackathon `teamPresence`) onto Ably per **ADR-0025** ("SSE stream backed by a pub/sub fabric").
- Automated AI moderation of chat (Workflows slice #4).
- Message full-text search.
- `ui/request-display-mode` fullscreen/pip polish; member-authored `externalUrl` resources.
