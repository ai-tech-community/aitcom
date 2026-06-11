# Agents Tool Catalog + Hub-Wide Ideas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Workers must NOT run `git checkout` / `git switch`.** The orchestrator creates the branch once before Task 1.

**Goal:** A public `/agents` page that renders a registry-derived catalog of all MCP tools (grouped by surface, badged by gate) and links into a new Hub-wide `/ideas` page where missing capabilities are suggested as categorized `CommunityIdeas`.

**Architecture:** The MCP server factory moves out of the route handler into an importable module. A catalog module instantiates the real server with a stub tRPC caller, lists tools over an in-memory MCP client/server pair (names + descriptions come live from the registry), and layers a hand-written `TOOL_META` map (surface grouping + gate badge) on top — a drift test asserts `TOOL_META` covers exactly the live registry. The Hub-wide ideas page reuses the existing `forum.getIdeas/submitIdea/toggleVote` tRPC procedures, extended with a `category` enum (`platform` | `agent-capability`) on the `CommunityIdeas` Payload collection.

**Tech Stack:** Next.js App Router (RSC), next-intl, tRPC, Payload CMS (hand-written migrations + `payload generate:types`), `@modelcontextprotocol/sdk` (`InMemoryTransport`), Vitest, shadcn/ui.

**Branch:** create `feat/agents-tool-catalog` off `main` before Task 1.

**Domain decisions this implements** (from CONTEXT.md → *Tool catalog*, *Idea*):
- Catalog is public, human-facing, derived from the registry — never hand-maintained copy.
- Suggestions are Hub-wide Ideas with a category — not a separate feedback system.
- Hub-wide `/ideas` shows only `communityId = null` ideas — it is not an aggregator.
- Ideas remain human-authored; no new MCP tools in this plan.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/app/api/mcp/server.ts` | Create | MCP server factories (`createMcpServer`, `createRegistrationMcpServer`) + `Caller`/`AgentKeyData` types — moved verbatim out of route.ts |
| `src/app/api/mcp/route.ts` | Modify | Thin HTTP handler only (auth, rate-limit, transport) |
| `src/lib/idea-categories.ts` | Create | `IDEA_CATEGORIES` const shared by server + client |
| `src/server/mcp/catalog-meta.ts` | Create | `TOOL_META` map, surface/gate types, `groupBySurface()` — pure, no server imports |
| `src/server/mcp/catalog-meta.test.ts` | Create | Unit tests for grouping |
| `src/server/mcp/catalog.ts` | Create | `getToolCatalog()` — live listing via in-memory MCP pair |
| `src/server/mcp/catalog.integration.test.ts` | Create | Drift test: `TOOL_META` ⇔ live registry (DB-guarded) |
| `src/collections/CommunityIdeas.ts` | Modify | Add `category` select field |
| `src/migrations/20260611_community_ideas_category.ts` | Create | Enum type + column |
| `src/payload-types.ts` | Regenerate | Via `payload generate:types` |
| `src/server/api/routers/ideas-filter.ts` | Create | `buildIdeasWhere()` pure helper |
| `src/server/api/routers/ideas-filter.test.ts` | Create | Unit tests for where-builder |
| `src/server/api/routers/forum.ts` | Modify | `getIdeas` Hub scoping + category filter; `submitIdea` category input |
| `src/components/ideas/hub-ideas.tsx` | Create | Client component: list/filter/suggest/vote |
| `src/components/ideas/hub-ideas.test.tsx` | Create | Component test (mocked tRPC) |
| `src/app/[locale]/ideas/page.tsx` | Create | Server shell, reads searchParams deep-link |
| `src/app/[locale]/agents/page.tsx` | Create | Public catalog page (RSC) |
| `src/components/navbar.tsx` | Modify | Add `/agents` + `/ideas` nav links |
| `messages/en.json`, `messages/nl.json` | Modify | New namespaces + nav keys |

---

### Task 1: Extract MCP server factories into `src/app/api/mcp/server.ts`

Pure mechanical move. Next.js route files may only export HTTP-method handlers, so the factories must live elsewhere to be importable by the catalog.

**Files:**
- Create: `src/app/api/mcp/server.ts`
- Modify: `src/app/api/mcp/route.ts`

- [ ] **Step 1: Create `src/app/api/mcp/server.ts`**

Move — **without editing their bodies** — the following from `route.ts` into the new file:
- `type Caller = ReturnType<typeof createCaller>` (route.ts:42) — change to `export type`
- the entire `createMcpServer` function (route.ts:44 through its closing `}` at ~line 1143, i.e. everything from the `function createMcpServer(` line to the line before `// ── Registration-only MCP server` comment) — add `export`
- the entire `createRegistrationMcpServer` function — add `export`
- every import the moved code uses (at minimum: `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`, `z` from `zod/v3`, `eq` from `drizzle-orm`, `db` from `@/server/db`, `agentProfiles` from `@/server/db/schema`, `createCaller` from `@/server/api/root`, and the six `register*Tools` imports from `./advisory-tools`, `./benchmark-tools`, `./commission-tools`, `./community-tools`, `./feed-tools`, `./registration-tools`). If `tsc` flags more (the function body is ~1100 lines), move those imports too.

Also replace the inline keyData parameter type with a named export, updating the `createMcpServer` signature to use it:

```typescript
export type AgentKeyData = {
  ownerId: string | null;
  agentId: string;
  scopes: string[];
};

export function createMcpServer(caller: Caller, keyData: AgentKeyData) {
```

- [ ] **Step 2: Rewrite `src/app/api/mcp/route.ts` as the thin handler**

Keep the existing `authenticateRequest` (with its NOTE comment block), `handleMcpRequest`, and `GET`/`POST`/`DELETE` exports **unchanged**; the file becomes:

```typescript
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { db } from "@/server/db";
import { validateApiKey } from "@/server/agent/api-key";
import { checkRegistrationRateLimit } from "@/server/agent/rate-limit";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { createMcpServer, createRegistrationMcpServer } from "./server";

// ── Auth helper ─────────────────────────────────────────────────────────────
//
// (keep the existing NOTE comment about rate limiting verbatim)

async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const apiKey = authHeader.slice(7);
  const keyData = await validateApiKey(db, apiKey);
  if (!keyData) return null;

  return keyData;
}

// (keep handleMcpRequest exactly as it is today — it already calls
// createMcpServer(caller, keyData) and createRegistrationMcpServer(),
// which now resolve via the import above)

export async function GET(req: Request) {
  return handleMcpRequest(req);
}

export async function POST(req: Request) {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req);
}
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: PASS (no unused imports in route.ts, no missing imports in server.ts). Fix any import the compiler flags by moving it to the file that needs it.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mcp/server.ts src/app/api/mcp/route.ts
git commit -m "refactor(mcp): extract server factories from route handler for reuse"
```

---

### Task 2: Catalog metadata module (`TOOL_META` + grouping)

Pure module — no server imports — so it is unit-testable without a DB and importable by client code if ever needed.

**Files:**
- Create: `src/server/mcp/catalog-meta.ts`
- Test: `src/server/mcp/catalog-meta.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  groupBySurface,
  SURFACE_ORDER,
  TOOL_META,
} from "./catalog-meta";

describe("groupBySurface", () => {
  it("groups a known tool under its surface with its gate", () => {
    const groups = groupBySurface([
      { name: "browse-feed", description: "Browse the feed." },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({
      surface: "feed",
      tools: [
        { name: "browse-feed", description: "Browse the feed.", gate: "read" },
      ],
    });
  });

  it("puts unknown tools in 'other' with a read gate", () => {
    const groups = groupBySurface([
      { name: "not-a-real-tool", description: "x" },
    ]);
    expect(groups[0]?.surface).toBe("other");
    expect(groups[0]?.tools[0]?.gate).toBe("read");
  });

  it("orders groups by SURFACE_ORDER", () => {
    const groups = groupBySurface([
      { name: "claim-work-cell", description: "a" },
      { name: "register-agent", description: "b" },
    ]);
    expect(groups.map((g) => g.surface)).toEqual([
      "registration",
      "commissions",
    ]);
  });

  it("every TOOL_META surface appears in SURFACE_ORDER", () => {
    for (const meta of Object.values(TOOL_META)) {
      expect(SURFACE_ORDER).toContain(meta.surface);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/mcp/catalog-meta.test.ts`
Expected: FAIL — `Cannot find module './catalog-meta'`

- [ ] **Step 3: Write `src/server/mcp/catalog-meta.ts`**

The gates are **editorial** (the scope checks live inside handler closures and are not machine-extractable); review the assignments below when touching them. The drift test in Task 3 enforces that the *set of names* exactly matches the live registry.

```typescript
// Human-facing metadata layered over the live MCP tool registry.
// Names/descriptions come from the registry (src/server/mcp/catalog.ts);
// this file only assigns each tool a surface (grouping) and a gate (badge).
// catalog.integration.test.ts fails if this map drifts from the registry.

export type ToolGate =
  | "public" // no API key needed
  | "read"
  | "contribute" // requires manifest acceptance
  | "self-profile"
  | "commission";

export type ToolSurface =
  | "registration"
  | "forum"
  | "feed"
  | "events"
  | "members"
  | "knowledge"
  | "ideas"
  | "inbox"
  | "challenges"
  | "sessions"
  | "communities"
  | "stewardship"
  | "commissions"
  | "benchmark";

export type ToolMeta = { surface: ToolSurface; gate: ToolGate };

export const TOOL_META: Record<string, ToolMeta> = {
  // ── Getting started ──
  "register-agent": { surface: "registration", gate: "public" },
  "get-agent-guide": { surface: "registration", gate: "public" },
  "check-claim-status": { surface: "registration", gate: "read" },
  // ── Forum ──
  "browse-threads": { surface: "forum", gate: "read" },
  "read-thread": { surface: "forum", gate: "read" },
  "reply-to-thread": { surface: "forum", gate: "contribute" },
  "suggest-topic": { surface: "forum", gate: "contribute" },
  // ── Feed ──
  "browse-feed": { surface: "feed", gate: "read" },
  "get-feed-comments": { surface: "feed", gate: "read" },
  "create-feed-post": { surface: "feed", gate: "contribute" },
  "comment-on-feed-post": { surface: "feed", gate: "contribute" },
  "toggle-feed-like": { surface: "feed", gate: "contribute" },
  // ── Events ──
  "browse-events": { surface: "events", gate: "read" },
  "suggest-event-interest": { surface: "events", gate: "contribute" },
  // ── Members & profile ──
  "browse-members": { surface: "members", gate: "read" },
  "my-profile": { surface: "members", gate: "read" },
  "update-own-profile": { surface: "members", gate: "self-profile" },
  // ── Knowledge ──
  "search-knowledge": { surface: "knowledge", gate: "read" },
  "share-knowledge": { surface: "knowledge", gate: "contribute" },
  // ── Ideas ──
  "vote-idea": { surface: "ideas", gate: "contribute" },
  // ── Owner inbox & briefings ──
  "get-notifications": { surface: "inbox", gate: "read" },
  "get-briefing": { surface: "inbox", gate: "read" },
  "check-inbox": { surface: "inbox", gate: "read" },
  "send-message": { surface: "inbox", gate: "read" },
  "get-conversation-history": { surface: "inbox", gate: "read" },
  "read-owner-messages": { surface: "inbox", gate: "read" },
  // ── Challenges ──
  "browse-challenges": { surface: "challenges", gate: "read" },
  "get-challenge-details": { surface: "challenges", gate: "read" },
  "get-my-challenge-progress": { surface: "challenges", gate: "read" },
  "browse-challenge-channel": { surface: "challenges", gate: "read" },
  "get-community-signals": { surface: "challenges", gate: "read" },
  "enroll-in-challenge": { surface: "challenges", gate: "contribute" },
  "report-objective-progress": { surface: "challenges", gate: "contribute" },
  "report-test-results": { surface: "challenges", gate: "contribute" },
  "post-to-challenge-channel": { surface: "challenges", gate: "contribute" },
  "reply-in-challenge-channel": { surface: "challenges", gate: "contribute" },
  "submit-solution": { surface: "challenges", gate: "contribute" },
  "init-challenge-config": { surface: "challenges", gate: "contribute" },
  "propose-challenge": { surface: "challenges", gate: "contribute" },
  // ── Session memory ──
  "save-session-summary": { surface: "sessions", gate: "read" },
  "get-session-history": { surface: "sessions", gate: "read" },
  // ── Communities ──
  "browse-communities": { surface: "communities", gate: "read" },
  "get-community-info": { surface: "communities", gate: "read" },
  "get-owner-communities": { surface: "communities", gate: "read" },
  "get-community-invites": { surface: "communities", gate: "read" },
  "join-community": { surface: "communities", gate: "contribute" },
  "request-to-join-community": { surface: "communities", gate: "contribute" },
  "leave-community": { surface: "communities", gate: "contribute" },
  "accept-community-invite": { surface: "communities", gate: "contribute" },
  "create-community": { surface: "communities", gate: "contribute" },
  "update-community-settings": { surface: "communities", gate: "contribute" },
  "create-community-invite": { surface: "communities", gate: "contribute" },
  "revoke-community-invite": { surface: "communities", gate: "contribute" },
  // ── Community stewardship ──
  "suggest-ban-member": { surface: "stewardship", gate: "contribute" },
  "suggest-remove-member": { surface: "stewardship", gate: "contribute" },
  "suggest-transfer-ownership": { surface: "stewardship", gate: "contribute" },
  "suggest-set-member-role": { surface: "stewardship", gate: "contribute" },
  "get-at-risk-members": { surface: "stewardship", gate: "read" },
  "new-joiner-intro-candidates": { surface: "stewardship", gate: "read" },
  "get-intro-candidates": { surface: "stewardship", gate: "read" },
  "get-unactivated-newcomers": { surface: "stewardship", gate: "read" },
  "newcomers-awaiting-response": { surface: "stewardship", gate: "read" },
  "suggest-introduction": { surface: "stewardship", gate: "contribute" },
  "suggest-revival": { surface: "stewardship", gate: "contribute" },
  "suggest-welcome": { surface: "stewardship", gate: "contribute" },
  "suggest-greeting": { surface: "stewardship", gate: "contribute" },
  "suggest-broadcast": { surface: "stewardship", gate: "contribute" },
  "propose-ritual": { surface: "stewardship", gate: "contribute" },
  // ── Commissions & work grid ──
  "list-claimable-cells": { surface: "commissions", gate: "read" },
  "claim-work-cell": { surface: "commissions", gate: "commission" },
  "submit-cell-result": { surface: "commissions", gate: "commission" },
  "create-commission": { surface: "commissions", gate: "commission" },
  "revoke-commission": { surface: "commissions", gate: "commission" },
  // ── Benchmark ──
  "list-benchmark-prompts": { surface: "benchmark", gate: "read" },
  "submit-benchmark-run": { surface: "benchmark", gate: "contribute" },
};

export const SURFACE_ORDER = [
  "registration",
  "feed",
  "forum",
  "events",
  "members",
  "knowledge",
  "ideas",
  "inbox",
  "challenges",
  "sessions",
  "communities",
  "stewardship",
  "commissions",
  "benchmark",
  "other",
] as const;

export type CatalogTool = { name: string; description: string };

export type CatalogGroup = {
  surface: ToolSurface | "other";
  tools: Array<CatalogTool & { gate: ToolGate }>;
};

export function groupBySurface(tools: CatalogTool[]): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>();
  for (const tool of tools) {
    const meta = TOOL_META[tool.name] ?? {
      surface: "other" as const,
      gate: "read" as const,
    };
    const group =
      groups.get(meta.surface) ??
      ({ surface: meta.surface, tools: [] } as CatalogGroup);
    group.tools.push({ ...tool, gate: meta.gate });
    groups.set(meta.surface, group);
  }
  return SURFACE_ORDER.filter((s) => groups.has(s)).map(
    (s) => groups.get(s)!,
  );
}
```

(Note: `groupBySurface`'s fallback never returns surface `"other"` from `TOOL_META` itself — `"other"` only exists in `SURFACE_ORDER` and `CatalogGroup`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/mcp/catalog-meta.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server/mcp/catalog-meta.ts src/server/mcp/catalog-meta.test.ts
git commit -m "feat(agents): tool catalog metadata map with surface grouping and gate badges"
```

---

### Task 3: Live catalog listing + drift test

**Files:**
- Create: `src/server/mcp/catalog.ts`
- Test: `src/server/mcp/catalog.integration.test.ts`

- [ ] **Step 1: Write the failing drift test**

The import chain (`catalog.ts` → `server.ts` → `db`) needs env at module load, so the test is DB-guarded like `hackathon-create.integration.test.ts` and uses **dynamic import** so the chain never loads when skipped.

```typescript
import { describe, expect, it } from "vitest";

// Instantiates the real MCP server (stub caller, never invoked) and checks
// TOOL_META covers exactly the live registry. Needs env (DATABASE_URL) only
// because the server module's import chain creates a db client at load time —
// no queries are ever made.
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d("tool catalog drift", () => {
  it("TOOL_META matches the live tool registry exactly", async () => {
    const { getToolCatalog } = await import("./catalog");
    const { TOOL_META } = await import("./catalog-meta");

    const live = new Set((await getToolCatalog()).map((t) => t.name));
    const meta = new Set(Object.keys(TOOL_META));

    const missingFromMeta = [...live].filter((n) => !meta.has(n)).sort();
    const staleInMeta = [...meta].filter((n) => !live.has(n)).sort();

    expect(missingFromMeta, "tools missing from TOOL_META").toEqual([]);
    expect(staleInMeta, "TOOL_META entries with no live tool").toEqual([]);
  });

  it("every live tool has a non-empty description", async () => {
    const { getToolCatalog } = await import("./catalog");
    for (const tool of await getToolCatalog()) {
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `set -a && source .env && set +a && npx vitest run src/server/mcp/catalog.integration.test.ts`
Expected: FAIL — `Cannot find module './catalog'`
(Without sourcing `.env` it reports `skipped` — that's the CI-without-DB behavior, by design.)

- [ ] **Step 3: Write `src/server/mcp/catalog.ts`**

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createMcpServer,
  createRegistrationMcpServer,
  type Caller,
} from "@/app/api/mcp/server";
import type { CatalogTool } from "./catalog-meta";

// All scopes, so scope-conditional registration (if any ever appears) is included.
const ALL_SCOPES = [
  "read",
  "contribute",
  "self-profile",
  "commission:claim-cell",
  "commission:submit-result",
];

// Tool registration only stores handlers; listing tools never invokes them,
// so the caller can be a tripwire that throws if anything does call it.
function createStubCaller(): Caller {
  const explode = () => {
    throw new Error("tool-catalog stub caller must never be invoked");
  };
  const leaf = new Proxy(explode, { get: () => explode, apply: explode });
  return new Proxy({}, { get: () => leaf }) as unknown as Caller;
}

async function listServerTools(server: McpServer): Promise<CatalogTool[]> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "tool-catalog", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
    }));
  } finally {
    await client.close();
    await server.close();
  }
}

async function loadToolCatalog(): Promise<CatalogTool[]> {
  const registration = await listServerTools(createRegistrationMcpServer());
  const authenticated = await listServerTools(
    createMcpServer(createStubCaller(), {
      ownerId: null,
      agentId: "tool-catalog",
      scopes: ALL_SCOPES,
    }),
  );
  const seen = new Set<string>();
  return [...registration, ...authenticated].filter((t) =>
    seen.has(t.name) ? false : (seen.add(t.name), true),
  );
}

let cached: Promise<CatalogTool[]> | null = null;

export function getToolCatalog(): Promise<CatalogTool[]> {
  cached ??= loadToolCatalog();
  return cached;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `set -a && source .env && set +a && npx vitest run src/server/mcp/catalog.integration.test.ts`
Expected: PASS (2 tests). If the drift test lists `missingFromMeta` names, add them to `TOOL_META` (the exploration count was 75 tools; the registry is the source of truth — the test output is the authoritative list).

- [ ] **Step 5: Commit**

```bash
git add src/server/mcp/catalog.ts src/server/mcp/catalog.integration.test.ts
git commit -m "feat(agents): registry-derived tool catalog with drift test"
```

---

### Task 4: `category` field on CommunityIdeas (collection + migration + types)

**Files:**
- Create: `src/lib/idea-categories.ts`
- Modify: `src/collections/CommunityIdeas.ts`
- Create: `src/migrations/20260611_community_ideas_category.ts`
- Regenerate: `src/payload-types.ts`

- [ ] **Step 1: Create `src/lib/idea-categories.ts`**

```typescript
export const IDEA_CATEGORIES = ["platform", "agent-capability"] as const;

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];
```

- [ ] **Step 2: Add the field to `src/collections/CommunityIdeas.ts`**

Insert after the `status` field (before `voteCount`):

```typescript
    {
      name: "category",
      type: "select",
      required: true,
      defaultValue: "platform",
      options: [
        { label: "Platform", value: "platform" },
        { label: "Agent capability", value: "agent-capability" },
      ],
      admin: {
        position: "sidebar",
        description:
          "Hub-wide triage lane. 'Agent capability' = a missing MCP tool suggested from the /agents catalog.",
      },
    },
```

- [ ] **Step 3: Write the migration**

`src/migrations/20260611_community_ideas_category.ts`:

```typescript
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_community_ideas_category" AS ENUM('platform', 'agent-capability');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.execute(sql`
    ALTER TABLE "community_ideas"
      ADD COLUMN IF NOT EXISTS "category" "enum_community_ideas_category" DEFAULT 'platform' NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "community_ideas" DROP COLUMN IF EXISTS "category";
  `);
  await db.execute(sql`
    DROP TYPE IF EXISTS "enum_community_ideas_category";
  `);
}
```

- [ ] **Step 4: Apply migration and regenerate types**

Run: `npm run db:apply`
Expected: output mentions applying `20260611_community_ideas_category`.

Run: `npx payload generate:types`
Expected: `src/payload-types.ts` regenerated; `CommunityIdea` now has `category: 'platform' | 'agent-capability';`.

Run: `npm run check`
Expected: PASS (the new field is required-with-default, so existing `payload.create` calls — `forum.ts submitIdea` — still typecheck because Payload fills defaults; if `tsc` complains about the create call's data object, add `category: "platform"` there and it will be replaced in Task 5 anyway).

- [ ] **Step 5: Commit**

```bash
git add src/lib/idea-categories.ts src/collections/CommunityIdeas.ts src/migrations/20260611_community_ideas_category.ts src/payload-types.ts
git commit -m "feat(ideas): category field on community-ideas (platform | agent-capability)"
```

---

### Task 5: Hub scoping + category in the forum router

**Behavior change (deliberate, per CONTEXT.md → Idea):** `getIdeas` *without* `communitySlug` previously returned **all** ideas (hub + every community mixed); it now returns **hub-only** (`communityId` absent). Also, a `communitySlug` that doesn't resolve now returns `[]` instead of everything.

**Files:**
- Create: `src/server/api/routers/ideas-filter.ts`
- Test: `src/server/api/routers/ideas-filter.test.ts`
- Modify: `src/server/api/routers/forum.ts` (`getIdeas` ~line 183, `submitIdea` ~line 236)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { buildIdeasWhere } from "./ideas-filter";

describe("buildIdeasWhere", () => {
  it("scopes to a community when communityId is given", () => {
    expect(buildIdeasWhere({ communityId: "c1" })).toEqual({
      communityId: { equals: "c1" },
    });
  });

  it("scopes to hub (communityId absent) when no communityId", () => {
    expect(buildIdeasWhere({})).toEqual({
      communityId: { exists: false },
    });
  });

  it("ands a category filter when given", () => {
    expect(buildIdeasWhere({ category: "agent-capability" })).toEqual({
      and: [
        { communityId: { exists: false } },
        { category: { equals: "agent-capability" } },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/api/routers/ideas-filter.test.ts`
Expected: FAIL — `Cannot find module './ideas-filter'`

- [ ] **Step 3: Write `src/server/api/routers/ideas-filter.ts`**

```typescript
import type { Where } from "payload";

import type { IdeaCategory } from "@/lib/idea-categories";

export function buildIdeasWhere(opts: {
  communityId?: string;
  category?: IdeaCategory;
}): Where {
  const clauses: Where[] = [
    opts.communityId
      ? { communityId: { equals: opts.communityId } }
      : { communityId: { exists: false } },
  ];
  if (opts.category) {
    clauses.push({ category: { equals: opts.category } });
  }
  return clauses.length === 1 ? clauses[0]! : { and: clauses };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/api/routers/ideas-filter.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Update `getIdeas` in `forum.ts`**

Add imports at the top of `forum.ts`:

```typescript
import { IDEA_CATEGORIES } from "@/lib/idea-categories";
import { buildIdeasWhere } from "./ideas-filter";
```

Replace the input schema and the where-derivation portion of `getIdeas` (keep the vote-decoration logic below `payload.find` untouched):

```typescript
    getIdeas: publicProcedure
      .input(
        z.object({
          sort: z.enum(["votes", "recent"]).default("votes"),
          communitySlug: z.string().optional(),
          category: z.enum(IDEA_CATEGORIES).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const payload = await getPayloadClient();

        let communityId: string | undefined;
        if (input.communitySlug) {
          const community = await ctx.db.query.communities.findFirst({
            where: and(
              eq(communities.slug, input.communitySlug),
              isNull(communities.deletedAt),
            ),
            columns: { id: true },
          });
          if (!community) return [];
          communityId = community.id;
        }

        const where = buildIdeasWhere({
          communityId,
          category: input.category,
        });

        const { docs } = await payload.find({
          collection: "community-ideas",
          where,
          sort: input.sort === "votes" ? "-voteCount" : "-createdAt",
          limit: 50,
          depth: 0,
        });
        // ... existing hasVoted decoration unchanged ...
```

- [ ] **Step 6: Update `submitIdea` in `forum.ts`**

Add to its input object:

```typescript
          category: z.enum(IDEA_CATEGORIES).default("platform"),
```

And in the `payload.create` data object, add:

```typescript
          category: input.category,
```

- [ ] **Step 7: Verify no other caller breaks**

Run: `grep -rn "getIdeas.useQuery\|getIdeas.invalidate\|getIdeas.setData\|getIdeas.getData\|getIdeas.cancel" src --include="*.tsx" --include="*.ts"`
Expected: hits in `src/app/[locale]/communities/[slug]/ideas/page.tsx` (passes `communitySlug` — unaffected) and `src/components/community/modals/ideas-modal.tsx`. The modal calls `getIdeas` **without** a slug and now sees hub-only ideas — this is the intended Hub semantics, not a regression. Note any *other* unexpected caller in the task report.

Run: `npm run check` then `npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/server/api/routers/ideas-filter.ts src/server/api/routers/ideas-filter.test.ts src/server/api/routers/forum.ts
git commit -m "feat(ideas): hub-only scoping and category filter for getIdeas/submitIdea"
```

---

### Task 6: Hub-wide `/ideas` page

**Files:**
- Create: `src/components/ideas/hub-ideas.tsx`
- Test: `src/components/ideas/hub-ideas.test.tsx`
- Create: `src/app/[locale]/ideas/page.tsx`
- Modify: `messages/en.json`, `messages/nl.json`

- [ ] **Step 1: Add translations**

In `messages/en.json`, add a top-level `"hubIdeas"` namespace:

```json
"hubIdeas": {
  "title": "Ideas",
  "subtitle": "Suggest and vote on improvements to the platform — including new agent capabilities.",
  "suggest": "Suggest an idea",
  "formTitlePlaceholder": "What should we build?",
  "formDescriptionPlaceholder": "Why is this useful? What would it unlock?",
  "categoryLabel": "Category",
  "categoryPlatform": "Platform",
  "categoryAgentCapability": "Agent capability",
  "filterAll": "All",
  "mostVoted": "Most voted",
  "recent": "Recent",
  "submit": "Submit",
  "cancel": "Cancel",
  "noIdeas": "No ideas yet — be the first.",
  "statusOpen": "Open",
  "statusImplemented": "Implemented",
  "statusRejected": "Rejected",
  "signInToVote": "Sign in to vote on ideas",
  "signInToSuggest": "Sign in to suggest an idea",
  "submitted": "Idea submitted!",
  "mustAcceptRules": "Please accept the community rules first."
}
```

In `messages/nl.json`:

```json
"hubIdeas": {
  "title": "Ideeën",
  "subtitle": "Stel verbeteringen voor en stem erop — ook nieuwe agent-capaciteiten.",
  "suggest": "Idee voorstellen",
  "formTitlePlaceholder": "Wat moeten we bouwen?",
  "formDescriptionPlaceholder": "Waarom is dit nuttig? Wat maakt het mogelijk?",
  "categoryLabel": "Categorie",
  "categoryPlatform": "Platform",
  "categoryAgentCapability": "Agent-capaciteit",
  "filterAll": "Alles",
  "mostVoted": "Meeste stemmen",
  "recent": "Recent",
  "submit": "Versturen",
  "cancel": "Annuleren",
  "noIdeas": "Nog geen ideeën — wees de eerste.",
  "statusOpen": "Open",
  "statusImplemented": "Geïmplementeerd",
  "statusRejected": "Afgewezen",
  "signInToVote": "Log in om op ideeën te stemmen",
  "signInToSuggest": "Log in om een idee voor te stellen",
  "submitted": "Idee verstuurd!",
  "mustAcceptRules": "Accepteer eerst de communityregels."
}
```

- [ ] **Step 2: Write the failing component test**

`src/components/ideas/hub-ideas.test.tsx` (mocking pattern follows `src/components/agent-suggestions.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HubIdeas } from "./hub-ideas";

const { mockGetIdeas, mockUseUtils, mockUseMutation } = vi.hoisted(() => ({
  mockGetIdeas: vi.fn(),
  mockUseUtils: vi.fn(),
  mockUseMutation: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: mockUseUtils,
    forum: {
      getIdeas: { useQuery: mockGetIdeas },
      submitIdea: { useMutation: mockUseMutation },
      toggleVote: { useMutation: mockUseMutation },
    },
  },
}));

vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    requireAuth: (fn: () => void) => fn(),
    promptAuth: vi.fn(),
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("HubIdeas", () => {
  it("renders ideas with category and status badges", () => {
    mockUseUtils.mockReturnValue({
      forum: { getIdeas: { invalidate: vi.fn() } },
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockGetIdeas.mockReturnValue({
      isLoading: false,
      data: [
        {
          id: 1,
          title: "Agents need a calendar tool",
          description: "Let agents check event schedules.",
          status: "open",
          category: "agent-capability",
          voteCount: 3,
          hasVoted: false,
          authorName: "zvi",
        },
      ],
    });

    render(<HubIdeas />);
    expect(
      screen.getByText("Agents need a calendar tool"),
    ).toBeInTheDocument();
    expect(screen.getByText("categoryAgentCapability")).toBeInTheDocument();
    expect(screen.getByText("statusOpen")).toBeInTheDocument();
  });

  it("opens the form initially when initialShowForm is set", () => {
    mockUseUtils.mockReturnValue({
      forum: { getIdeas: { invalidate: vi.fn() } },
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockGetIdeas.mockReturnValue({ isLoading: false, data: [] });

    render(
      <HubIdeas initialCategory="agent-capability" initialShowForm />,
    );
    expect(
      screen.getByPlaceholderText("formTitlePlaceholder"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/ideas/hub-ideas.test.tsx`
Expected: FAIL — `Cannot find module './hub-ideas'`

- [ ] **Step 4: Write `src/components/ideas/hub-ideas.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ChevronUp, Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IDEA_CATEGORIES, type IdeaCategory } from "@/lib/idea-categories";

const statusStyles: Record<string, string> = {
  open: "text-zinc-500 border-zinc-200",
  implemented: "text-green-600 border-green-200 bg-green-50",
  rejected: "text-zinc-400 border-zinc-200 bg-zinc-50",
};

type CategoryFilter = IdeaCategory | "all";

export function HubIdeas({
  initialCategory,
  initialShowForm = false,
}: {
  initialCategory?: IdeaCategory;
  initialShowForm?: boolean;
}) {
  const t = useTranslations("hubIdeas");
  const [sort, setSort] = useState<"votes" | "recent">("votes");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(
    initialCategory ?? "all",
  );
  const [showForm, setShowForm] = useState(initialShowForm);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDesc, setIdeaDesc] = useState("");
  const [formCategory, setFormCategory] = useState<IdeaCategory>(
    initialCategory ?? "platform",
  );

  const { requireAuth } = useRequireAuth();
  const utils = api.useUtils();

  const queryInput = {
    sort,
    category: categoryFilter === "all" ? undefined : categoryFilter,
  };
  const { data: ideas = [], isLoading } =
    api.forum.getIdeas.useQuery(queryInput);

  const submitMutation = api.forum.submitIdea.useMutation({
    onSuccess: () => {
      setIdeaTitle("");
      setIdeaDesc("");
      setShowForm(false);
      void utils.forum.getIdeas.invalidate();
      toast.success(t("submitted"));
    },
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(t("mustAcceptRules"));
        return;
      }
      toast.error(err.message);
    },
  });

  const voteMutation = api.forum.toggleVote.useMutation({
    onError: (err) => {
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(t("mustAcceptRules"));
        return;
      }
      toast.error(err.message);
    },
    onSettled: () => void utils.forum.getIdeas.invalidate(),
  });

  const categoryLabel = (c: IdeaCategory) =>
    c === "platform" ? t("categoryPlatform") : t("categoryAgentCapability");

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:px-12">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Lightbulb className="text-primary h-5 w-5" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <Button
          size="sm"
          onClick={() =>
            requireAuth(() => setShowForm((v) => !v), t("signInToSuggest"))
          }
        >
          {t("suggest")}
        </Button>
      </div>

      {showForm && (
        <form
          className="border-border bg-secondary/30 mb-6 space-y-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            requireAuth(
              () =>
                submitMutation.mutate({
                  title: ideaTitle,
                  description: ideaDesc || undefined,
                  category: formCategory,
                }),
              t("signInToSuggest"),
            );
          }}
        >
          <Input
            value={ideaTitle}
            onChange={(e) => setIdeaTitle(e.target.value)}
            placeholder={t("formTitlePlaceholder")}
            minLength={3}
            maxLength={100}
            required
          />
          <Textarea
            value={ideaDesc}
            onChange={(e) => setIdeaDesc(e.target.value)}
            placeholder={t("formDescriptionPlaceholder")}
            maxLength={500}
            rows={3}
          />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              {t("categoryLabel")}
            </span>
            {IDEA_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFormCategory(c)}
                className={`rounded px-2 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors ${
                  formCategory === c
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {categoryLabel(c)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={submitMutation.isPending}>
              {t("submit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowForm(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b pb-3">
        {(["votes", "recent"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`rounded px-3 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors ${
              sort === s
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "votes" ? t("mostVoted") : t("recent")}
          </button>
        ))}
        <span className="text-border mx-1">|</span>
        {(["all", ...IDEA_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategoryFilter(c)}
            className={`rounded px-3 py-1 font-mono text-[10px] font-semibold tracking-widest uppercase transition-colors ${
              categoryFilter === c
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c === "all" ? t("filterAll") : categoryLabel(c)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-muted h-14 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center font-mono text-xs">
          {t("noIdeas")}
        </p>
      ) : (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="border-border bg-secondary/30 flex items-start gap-3 rounded-lg border p-3"
            >
              <button
                onClick={() =>
                  requireAuth(
                    () => voteMutation.mutate({ ideaId: idea.id }),
                    t("signInToVote"),
                  )
                }
                className={`flex shrink-0 flex-col items-center gap-0.5 rounded px-2 py-1.5 font-mono text-[10px] font-bold transition-colors ${
                  idea.hasVoted
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ChevronUp className="h-3 w-3" />
                {idea.voteCount ?? 0}
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-medium">
                  {idea.title}
                </p>
                {idea.description && (
                  <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px] leading-relaxed">
                    {idea.description}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase ${statusStyles[idea.status]}`}
                  >
                    {idea.status === "open"
                      ? t("statusOpen")
                      : idea.status === "implemented"
                        ? t("statusImplemented")
                        : t("statusRejected")}
                  </span>
                  <span className="text-muted-foreground rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase">
                    {categoryLabel(idea.category as IdeaCategory)}
                  </span>
                  {idea.authorName && (
                    <span className="text-muted-foreground text-[10px]">
                      {idea.authorName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

(Hub ideas have no status-change UI — Hub triage happens in the Payload admin panel; `forum.updateIdeaStatus` rejects ideas without a `communityId` by design.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/ideas/hub-ideas.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Create `src/app/[locale]/ideas/page.tsx`**

```tsx
import type { Metadata } from "next";

import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { HubIdeas } from "@/components/ideas/hub-ideas";

export const metadata: Metadata = {
  title: "Ideas",
  description:
    "Suggest and vote on improvements to the AIT Community platform.",
  ...buildOgMeta(
    "Ideas",
    "Suggest and vote on improvements to the AIT Community platform.",
    "Ideas",
  ),
  alternates: buildAlternates("/ideas"),
};

export default async function HubIdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; new?: string }>;
}) {
  const params = await searchParams;
  const initialCategory =
    params.category === "agent-capability" || params.category === "platform"
      ? params.category
      : undefined;

  return (
    <HubIdeas
      initialCategory={initialCategory}
      initialShowForm={params.new === "1"}
    />
  );
}
```

- [ ] **Step 7: Verify**

Run: `npm run check && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/ideas/hub-ideas.tsx src/components/ideas/hub-ideas.test.tsx "src/app/[locale]/ideas/page.tsx" messages/en.json messages/nl.json
git commit -m "feat(ideas): hub-wide /ideas page with category filter and deep-linkable suggest form"
```

---

### Task 7: Public `/agents` page

**Files:**
- Create: `src/app/[locale]/agents/page.tsx`
- Modify: `messages/en.json`, `messages/nl.json`

- [ ] **Step 1: Add translations**

`messages/en.json`, top-level `"agentsCatalog"` namespace:

```json
"agentsCatalog": {
  "title": "Agents",
  "subtitle": "Connect an AI agent to AIT Community and let it work alongside you.",
  "endpointLabel": "MCP endpoint",
  "connectTitle": "Connect your agent",
  "connectStep1": "Point any MCP-capable agent at the endpoint below — no key needed to start.",
  "connectStep2": "Have it call register-agent to receive an API key and a claim link.",
  "connectStep3": "Open the claim link to bind the agent to your account and accept the agent manifest.",
  "manageAgent": "Manage my agent",
  "catalogTitle": "What agents can do",
  "catalogSubtitle": "Every capability below is live on the MCP endpoint. Badges show what each one requires.",
  "suggestTitle": "Missing a capability?",
  "suggestBody": "Tell us what your agent should be able to do — suggestions are voted on by the community.",
  "suggestCta": "Suggest a capability",
  "gates": {
    "public": "No key needed",
    "read": "Read",
    "contribute": "Contribute · manifest",
    "self-profile": "Self-profile",
    "commission": "Commission"
  },
  "surfaces": {
    "registration": "Getting started",
    "feed": "Community feed",
    "forum": "Forum",
    "events": "Events",
    "members": "Members & profile",
    "knowledge": "Knowledge",
    "ideas": "Ideas",
    "inbox": "Owner inbox & briefings",
    "challenges": "Challenges",
    "sessions": "Session memory",
    "communities": "Communities",
    "stewardship": "Community stewardship",
    "commissions": "Commissions & work grid",
    "benchmark": "Benchmark",
    "other": "Other"
  }
}
```

`messages/nl.json`:

```json
"agentsCatalog": {
  "title": "Agents",
  "subtitle": "Verbind een AI-agent met AIT Community en laat hem met je meewerken.",
  "endpointLabel": "MCP-endpoint",
  "connectTitle": "Verbind je agent",
  "connectStep1": "Wijs een MCP-compatibele agent naar het endpoint hieronder — geen sleutel nodig om te starten.",
  "connectStep2": "Laat hem register-agent aanroepen voor een API-sleutel en een claimlink.",
  "connectStep3": "Open de claimlink om de agent aan je account te koppelen en het agent-manifest te accepteren.",
  "manageAgent": "Beheer mijn agent",
  "catalogTitle": "Wat agents kunnen doen",
  "catalogSubtitle": "Elke capaciteit hieronder is live op het MCP-endpoint. Badges tonen wat ervoor nodig is.",
  "suggestTitle": "Mis je een capaciteit?",
  "suggestBody": "Vertel ons wat jouw agent zou moeten kunnen — suggesties worden door de community bestemd.",
  "suggestCta": "Stel een capaciteit voor",
  "gates": {
    "public": "Geen sleutel nodig",
    "read": "Lezen",
    "contribute": "Bijdragen · manifest",
    "self-profile": "Eigen profiel",
    "commission": "Commissie"
  },
  "surfaces": {
    "registration": "Aan de slag",
    "feed": "Community-feed",
    "forum": "Forum",
    "events": "Evenementen",
    "members": "Leden & profiel",
    "knowledge": "Kennis",
    "ideas": "Ideeën",
    "inbox": "Eigenaar-inbox & briefings",
    "challenges": "Challenges",
    "sessions": "Sessiegeheugen",
    "communities": "Communities",
    "stewardship": "Community-beheer",
    "commissions": "Commissies & work grid",
    "benchmark": "Benchmark",
    "other": "Overig"
  }
}
```

- [ ] **Step 2: Create `src/app/[locale]/agents/page.tsx`**

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { Button } from "@/components/ui/button";
import { getToolCatalog } from "@/server/mcp/catalog";
import { groupBySurface, type ToolGate } from "@/server/mcp/catalog-meta";

export const metadata: Metadata = {
  title: "Agents",
  description:
    "Connect an AI agent to AIT Community — browse every capability agents have on the platform.",
  ...buildOgMeta(
    "Agents",
    "Connect an AI agent to AIT Community — browse every capability agents have on the platform.",
    "Agents",
  ),
  alternates: buildAlternates("/agents"),
};

const MCP_ENDPOINT = "https://aitcommunity.org/api/mcp";

const gateStyles: Record<ToolGate, string> = {
  public: "text-green-700 border-green-200 bg-green-50",
  read: "text-zinc-500 border-zinc-200",
  contribute: "text-primary border-primary/30 bg-primary/5",
  "self-profile": "text-zinc-600 border-zinc-300",
  commission: "text-amber-700 border-amber-200 bg-amber-50",
};

export default async function AgentsPage() {
  const t = await getTranslations("agentsCatalog");
  const groups = groupBySurface(await getToolCatalog());

  return (
    <div className="mx-auto max-w-4xl px-6 py-12 sm:px-12">
      {/* Hero */}
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground mt-2 max-w-xl text-sm">
        {t("subtitle")}
      </p>

      {/* Connect */}
      <section className="border-border bg-secondary/30 mt-8 rounded-lg border p-6">
        <h2 className="font-mono text-xs font-semibold tracking-widest uppercase">
          / {t("connectTitle")}
        </h2>
        <ol className="text-muted-foreground mt-3 list-inside list-decimal space-y-1.5 text-sm">
          <li>{t("connectStep1")}</li>
          <li>{t("connectStep2")}</li>
          <li>{t("connectStep3")}</li>
        </ol>
        <div className="mt-4">
          <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
            {t("endpointLabel")}
          </span>
          <code className="bg-foreground text-background mt-1 block w-fit rounded px-3 py-1.5 font-mono text-xs">
            {MCP_ENDPOINT}
          </code>
        </div>
        <div className="mt-4">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/agent">{t("manageAgent")}</Link>
          </Button>
        </div>
      </section>

      {/* Catalog */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">{t("catalogTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("catalogSubtitle")}
        </p>

        {groups.map((group) => (
          <div key={group.surface} className="mt-8">
            <h3 className="text-muted-foreground border-b pb-2 font-mono text-[11px] font-semibold tracking-widest uppercase">
              / {t(`surfaces.${group.surface}`)}
            </h3>
            <ul className="divide-border mt-1 divide-y">
              {group.tools.map((tool) => (
                <li
                  key={tool.name}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-64">
                    <code className="font-mono text-xs font-semibold">
                      {tool.name}
                    </code>
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase ${gateStyles[tool.gate]}`}
                    >
                      {t(`gates.${tool.gate}`)}
                    </span>
                  </div>
                  <p className="text-muted-foreground min-w-0 text-xs leading-relaxed">
                    {tool.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Suggest CTA */}
      <section className="border-primary/30 bg-primary/5 mt-12 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">{t("suggestTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("suggestBody")}</p>
        <div className="mt-4">
          <Button asChild size="sm">
            <Link href="/ideas?category=agent-capability&new=1">
              {t("suggestCta")}
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: PASS

Run: `npm run dev`, open `http://localhost:3000/en/agents`
Expected: hero + connect card + all surface sections render with gate badges; "Suggest a capability" links to `/en/ideas?category=agent-capability&new=1`, which opens the Hub ideas page with the form open and category pre-set. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/agents/page.tsx" messages/en.json messages/nl.json
git commit -m "feat(agents): public /agents page with registry-derived tool catalog"
```

---

### Task 8: Navigation links

**Files:**
- Modify: `src/components/navbar.tsx:30-47`
- Modify: `messages/en.json`, `messages/nl.json` (`nav` namespace)

- [ ] **Step 1: Add nav entries**

In the `navLinks` array in `navbar.tsx`, after the `jobs` entry, add (shortcuts `A` and `D` are unused — taken: C,E,G,L,K,W,M,B,I,P,S):

```typescript
  { href: "/agents", key: "agents", shortcut: "A", primary: false },
  { href: "/ideas", key: "ideas", shortcut: "D", primary: false },
```

- [ ] **Step 2: Add nav translations**

`messages/en.json` → `"nav"`: add `"agents": "Agents", "ideas": "Ideas"`.
`messages/nl.json` → `"nav"`: add `"agents": "Agents", "ideas": "Ideeën"`.

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: PASS (if `navLinks` keys are type-checked against messages, missing-key errors surface here).

- [ ] **Step 4: Commit**

```bash
git add src/components/navbar.tsx messages/en.json messages/nl.json
git commit -m "feat(nav): add Agents and Ideas links"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full test suite with DB env**

Run: `set -a && source .env && set +a && npx vitest run`
Expected: PASS, including the catalog drift test (not skipped).

- [ ] **Step 2: Lint, types, format**

Run: `npm run check && npm run format:write`
Expected: check PASS; commit any formatting changes:

```bash
git add -A && git diff --cached --quiet || git commit -m "style: prettier"
```

- [ ] **Step 3: Manual smoke**

Run `npm run dev` and verify:
1. `/en/agents` — catalog grouped by surface, badges visible, logged out.
2. `/en/agents` → "Suggest a capability" → `/en/ideas` with form open, category "Agent capability" selected.
3. Submit an idea while signed in → appears in list under the Agent capability filter.
4. `/en/communities/<any-slug>/ideas` — community ideas unchanged.
5. MCP endpoint still works: `npx tsx scripts/test-mcp-tools.ts <api-key>` against the dev server (regression check for the Task 1 extraction).

- [ ] **Step 4: Wrap up**

Use the superpowers:finishing-a-development-branch skill (merge vs PR decision is the user's).
