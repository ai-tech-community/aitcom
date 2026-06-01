# Agent Manifest Implementation Plan

> **Historical artifact — superseded in two places by what shipped.** During
> implementation, acceptance moved from an explicit endpoint to **auto-accept at
> owner↔agent binding** (claim, invite-registration, `createAgent`, `quickSetup`)
> plus a backfill — see [ADR-0017](../adr/0017-agent-communication-boundary-and-manifest.md)
> "When acceptance is recorded". And the migration is **not** applied with
> `npm run db:migrate` / `pnpm payload migrate` (data-loss prompt); it is applied
> out-of-band via `src/scripts/apply-manifest-acceptance.ts` (or the matching
> `.sql`). Treat the migration steps below as the original intent, not the final
> procedure.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give agents the Hub-invariant normative layer humans already have — one versioned manifest that the enforcement layer reads, the owner accepts, and `get-agent-guide` serves — and gate the `contribute` scope on that acceptance.

**Architecture:** The manifest is a versioned **code constant** (`MANIFEST_VERSION` + a structured invariant list + a prose renderer). Owner acceptance is recorded in a new Drizzle table `agent_manifest_acceptance`. Enforcement is a **single chokepoint in `validateApiKey`**: if the agent's owner has not accepted the current manifest version, the `contribute`/`contribute-limited` scopes are stripped from the returned scope set (so every existing `requireScope(..., "contribute")` fails with `FORBIDDEN`), while `read`/`self-profile` remain. This auto-handles both registration paths, unclaimed agents (no owner ⇒ read-only), and version bumps (re-acceptance required).

**Tech Stack:** TypeScript, Drizzle ORM (`app` Postgres schema), Payload migrations (`@payloadcms/db-postgres`, raw SQL), tRPC, MCP (`registration-tools.ts`), Vitest.

**Spec:** [ADR-0017](../adr/0017-agent-communication-boundary-and-manifest.md). Glossary terms: [CONTEXT.md](../../CONTEXT.md) — *agent manifest*, *agent communication boundary*, *no-go surface*.

---

## File Structure

- **Create** `src/server/agent/manifest.ts` — `MANIFEST_VERSION`, `AGENT_MANIFEST_INVARIANTS`, `renderManifestText()`, `filterScopesByManifest()`. Pure, no I/O. The single source of truth.
- **Create** `src/server/agent/manifest.test.ts` — unit tests for the pure functions.
- **Create** `src/server/agent/manifest-acceptance.ts` — `hasAcceptedCurrentManifest(db, ownerId)` thin Drizzle query.
- **Create** `src/migrations/20260601a_agent_manifest_acceptance.ts` — creates the table + unique index.
- **Modify** `src/server/db/schema.ts` — add the `agentManifestAcceptances` Drizzle table.
- **Modify** `src/server/agent/api-key.ts` — strip contribute scopes in `validateApiKey` when unaccepted.
- **Modify** `src/server/api/routers/agent-management.ts` — add `getManifest` query + `acceptManifest` mutation (human-authenticated).
- **Modify** `src/app/api/mcp/registration-tools.ts` — append the rendered manifest to `get-agent-guide`.

---

### Task 1: Manifest constant + pure helpers

**Files:**
- Create: `src/server/agent/manifest.ts`
- Test: `src/server/agent/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/agent/manifest.test.ts
import { describe, expect, it } from "vitest";
import {
  AGENT_MANIFEST_INVARIANTS,
  MANIFEST_VERSION,
  filterScopesByManifest,
  renderManifestText,
} from "./manifest";

describe("manifest invariants", () => {
  it("has the six ADR-0017 invariants in order", () => {
    expect(AGENT_MANIFEST_INVARIANTS.map((i) => i.id)).toEqual([
      "owner-only-channel",
      "no-agent-to-agent",
      "no-go-surfaces",
      "draft-dont-publish",
      "read-is-free",
      "one-agent-per-human",
    ]);
  });
});

describe("renderManifestText", () => {
  it("renders the version header and every invariant", () => {
    const text = renderManifestText();
    expect(text).toContain(`Agent Manifest (v${MANIFEST_VERSION})`);
    for (const inv of AGENT_MANIFEST_INVARIANTS) {
      expect(text).toContain(inv.title);
    }
  });
});

describe("filterScopesByManifest", () => {
  it("returns all scopes when accepted", () => {
    expect(
      filterScopesByManifest(["read", "contribute", "self-profile"], true),
    ).toEqual(["read", "contribute", "self-profile"]);
  });
  it("strips contribute and contribute-limited when not accepted", () => {
    expect(
      filterScopesByManifest(["read", "contribute", "self-profile"], false),
    ).toEqual(["read", "self-profile"]);
    expect(
      filterScopesByManifest(["read", "contribute-limited"], false),
    ).toEqual(["read"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/server/agent/manifest.test.ts`
Expected: FAIL — cannot find module `./manifest`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/server/agent/manifest.ts

/**
 * The agent manifest: the Hub-invariant contract every agent operates under.
 * Single source of truth (ADR-0017). Bump MANIFEST_VERSION when invariants
 * change — that suspends every agent's contribute scope until its owner
 * re-accepts (enforced in validateApiKey via filterScopesByManifest).
 */
export const MANIFEST_VERSION = 1;

export interface AgentManifestInvariant {
  id: string;
  title: string;
  rule: string;
}

export const AGENT_MANIFEST_INVARIANTS: AgentManifestInvariant[] = [
  {
    id: "owner-only-channel",
    title: "Owner-only channel",
    rule: "You may exchange messages only with your owner. No other human and no other agent can message you, and you can message no one but your owner.",
  },
  {
    id: "no-agent-to-agent",
    title: "No agent-to-agent communication",
    rule: "There is no channel between agents. You never communicate with another agent, by design.",
  },
  {
    id: "no-go-surfaces",
    title: "No-go surfaces",
    rule: "You have no path — not even a draft — into member-to-member direct messages. You cannot initiate, read, or inject into a private conversation between humans.",
  },
  {
    id: "draft-dont-publish",
    title: "Draft, don't publish",
    rule: "Into community surfaces (forum, feed, ideas, investigations, …) you only produce drafts; a human publishes in their own name.",
  },
  {
    id: "read-is-free",
    title: "Read is free",
    rule: "You may read any public, human-published content. Reading is never communication.",
  },
  {
    id: "one-agent-per-human",
    title: "One agent per human",
    rule: "Each human owns at most one agent.",
  },
];

export function renderManifestText(): string {
  const lines = AGENT_MANIFEST_INVARIANTS.map(
    (inv, i) => `${i + 1}. **${inv.title}.** ${inv.rule}`,
  );
  return [
    `# Agent Manifest (v${MANIFEST_VERSION})`,
    "",
    "Your owner accepted this contract on your behalf. It is enforced — violating it makes your requests fail.",
    "",
    ...lines,
  ].join("\n");
}

/**
 * Scope gate. When the owner has not accepted the current manifest version,
 * all contribute* scopes are removed; read/self-profile remain (ADR-0017:
 * "contribute is suspended until the owner re-accepts; read stays available").
 */
export function filterScopesByManifest(
  scopes: string[],
  accepted: boolean,
): string[] {
  if (accepted) return scopes;
  return scopes.filter((s) => !s.startsWith("contribute"));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/server/agent/manifest.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/agent/manifest.ts src/server/agent/manifest.test.ts
git commit -m "feat(agent): add versioned agent manifest constant + scope gate"
```

---

### Task 2: Acceptance table — Drizzle schema + migration

**Files:**
- Modify: `src/server/db/schema.ts` (add table after the `agentApiKeys` table, ~line 382)
- Create: `src/migrations/20260601a_agent_manifest_acceptance.ts`

- [ ] **Step 1: Add the Drizzle table to `schema.ts`**

Add immediately after the `agentApiKeys` table definition (so it sits with the other agent tables). It references `user` and `agentProfiles`, both already defined above it.

```typescript
// Records which manifest version an owner accepted on behalf of their agent
// (ADR-0017). Lookup keys on (ownerId, manifestVersion); a version bump makes
// the current-version lookup miss until the owner re-accepts.
export const agentManifestAcceptances = appSchema.table(
  "agent_manifest_acceptance",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    agentId: d.varchar({ length: 255 }).references(() => agentProfiles.id),
    manifestVersion: d.integer().notNull(),
    acceptedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
);
```

Note: `d.integer()`, `sql`, and `crypto.randomUUID()` are all already used elsewhere in this file — no new imports needed. The composite uniqueness is enforced by the migration's index (Step 2), not in the Drizzle definition, matching how `20260531c_agent_introductions.ts` declares indexes in SQL.

- [ ] **Step 2: Write the migration**

```typescript
// src/migrations/20260601a_agent_manifest_acceptance.ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."agent_manifest_acceptance" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "owner_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "agent_id" varchar(255) REFERENCES "app"."agent_profile"("id"),
      "manifest_version" integer NOT NULL,
      "accepted_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "agent_manifest_acceptance_owner_version_uidx"
      ON "app"."agent_manifest_acceptance" ("owner_id", "manifest_version");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`DROP TABLE IF EXISTS "app"."agent_manifest_acceptance";`,
  );
}
```

- [ ] **Step 3: Run the migration and typecheck**

Run: `npm run db:migrate && npm run typecheck`
Expected: migration applies cleanly (table created); typecheck passes (the new Drizzle table compiles).

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260601a_agent_manifest_acceptance.ts
git commit -m "feat(agent): add agent_manifest_acceptance table + migration"
```

---

### Task 3: Acceptance query helper

**Files:**
- Create: `src/server/agent/manifest-acceptance.ts`

- [ ] **Step 1: Write the helper**

This is a thin Drizzle query (the repo's tests are pure-function unit tests; the testable logic — the scope filter — was covered in Task 1, so this I/O wrapper is verified by typecheck + the integration wiring in Task 4). Mirror the import/`DB` style already used in `src/server/agent/api-key.ts`.

```typescript
// src/server/agent/manifest-acceptance.ts
import { and, eq } from "drizzle-orm";

import type { DB } from "@/server/db"; // match the DB type import used in api-key.ts
import { agentManifestAcceptances } from "@/server/db/schema";
import { MANIFEST_VERSION } from "./manifest";

/** True iff this owner has accepted the CURRENT manifest version. */
export async function hasAcceptedCurrentManifest(
  db: DB,
  ownerId: string | null,
): Promise<boolean> {
  if (!ownerId) return false;
  const [row] = await db
    .select({ id: agentManifestAcceptances.id })
    .from(agentManifestAcceptances)
    .where(
      and(
        eq(agentManifestAcceptances.ownerId, ownerId),
        eq(agentManifestAcceptances.manifestVersion, MANIFEST_VERSION),
      ),
    )
    .limit(1);
  return Boolean(row);
}
```

Before writing, open `src/server/agent/api-key.ts` and copy its exact `DB` type import (the placeholder `@/server/db` above must match it — e.g. it may be `import type { DB } from "../db"`).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/agent/manifest-acceptance.ts
git commit -m "feat(agent): add hasAcceptedCurrentManifest query helper"
```

---

### Task 4: Enforce — strip contribute scopes in `validateApiKey`

**Files:**
- Modify: `src/server/agent/api-key.ts:26-59`

- [ ] **Step 1: Wire the gate into `validateApiKey`**

The function already returns `{ agentId, ownerId, scopes }`. Compute acceptance and filter the scopes before returning. Locate the final `return { agentId: key.agentId, ownerId: key.ownerId, scopes: key.scopes };` (~line 56) and replace it:

```typescript
  // ADR-0017: contribute is gated on the owner accepting the current manifest
  // version. Unaccepted (incl. unclaimed agents with no owner) ⇒ read-only.
  const accepted = await hasAcceptedCurrentManifest(db, key.ownerId);

  return {
    agentId: key.agentId,
    ownerId: key.ownerId,
    scopes: filterScopesByManifest(key.scopes, accepted),
  };
```

Add the imports at the top of `api-key.ts`:

```typescript
import { filterScopesByManifest } from "./manifest";
import { hasAcceptedCurrentManifest } from "./manifest-acceptance";
```

- [ ] **Step 2: Typecheck + full test run**

Run: `npm run typecheck && npm run test`
Expected: PASS. (No behavior test here beyond Task 1's unit coverage of `filterScopesByManifest`; the wiring is type-checked. Manual verification in Step 3.)

- [ ] **Step 3: Manual verification**

With a local agent API key whose owner has **not** accepted the manifest, call any contribute endpoint (e.g. an MCP `reply-to-thread`) and confirm it returns `FORBIDDEN: Missing required scope: contribute`. Confirm a read endpoint (e.g. `get-briefing`) still succeeds. Document the observed responses in the commit body.

- [ ] **Step 4: Commit**

```bash
git add src/server/agent/api-key.ts
git commit -m "feat(agent): gate contribute scope on manifest acceptance"
```

---

### Task 5: Owner acceptance API — `getManifest` query + `acceptManifest` mutation

**Files:**
- Modify: `src/server/api/routers/agent-management.ts`

- [ ] **Step 1: Add imports**

At the top of `agent-management.ts`, add:

```typescript
import {
  AGENT_MANIFEST_INVARIANTS,
  MANIFEST_VERSION,
  renderManifestText,
} from "@/server/agent/manifest";
import { hasAcceptedCurrentManifest } from "@/server/agent/manifest-acceptance";
import { agentManifestAcceptances, agentProfiles } from "@/server/db/schema";
```

`agentProfiles` is likely already imported in this file — if so, add only the manifest imports and `agentManifestAcceptances`.

- [ ] **Step 2: Add the query + mutation**

Add these two procedures to the router object. Use the **same human-authenticated procedure builder and `ctx` accessors this file already uses** for owner-facing endpoints (open the file and match the existing claim/management mutations — e.g. `protectedProcedure`, `ctx.session.user.id`, `ctx.db`). Adapt the names below to match.

```typescript
  getManifest: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const accepted = await hasAcceptedCurrentManifest(ctx.db, userId);
    return {
      version: MANIFEST_VERSION,
      text: renderManifestText(),
      invariants: AGENT_MANIFEST_INVARIANTS,
      accepted,
    };
  }),

  acceptManifest: protectedProcedure
    .input(z.object({ version: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (input.version !== MANIFEST_VERSION) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "STALE_MANIFEST_VERSION",
        });
      }
      const userId = ctx.session.user.id;
      const [agent] = await ctx.db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      await ctx.db
        .insert(agentManifestAcceptances)
        .values({
          ownerId: userId,
          agentId: agent?.id ?? null,
          manifestVersion: MANIFEST_VERSION,
        })
        .onConflictDoNothing(); // unique (owner_id, manifest_version)

      return { accepted: true, version: MANIFEST_VERSION };
    }),
```

`z`, `TRPCError`, and `eq` are already imported in this router — reuse them.

- [ ] **Step 3: Typecheck + test**

Run: `npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Call `agentManagement.acceptManifest({ version: 1 })` as a logged-in owner, then re-run the contribute endpoint from Task 4 Step 3 and confirm it now **succeeds**. Calling `acceptManifest({ version: 999 })` returns `BAD_REQUEST: STALE_MANIFEST_VERSION`.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/agent-management.ts
git commit -m "feat(agent): add getManifest/acceptManifest owner endpoints"
```

---

### Task 6: Serve the manifest to the agent via `get-agent-guide`

**Files:**
- Modify: `src/app/api/mcp/registration-tools.ts:32-76`

- [ ] **Step 1: Append the rendered manifest to the guide**

Add the import near the top of the file:

```typescript
import { renderManifestText } from "@/server/agent/manifest";
```

In the `get-agent-guide` handler, change the returned text so the manifest is appended after the onboarding guide. Locate the `const guide = \`...\`.trim();` block and update the return:

```typescript
    const guide = `
# Welcome to AIT Community — Agent Onboarding Guide
... (existing content unchanged) ...
`.trim();

    const text = `${guide}\n\n---\n\n${renderManifestText()}`;

    return {
      content: [{ type: "text" as const, text }],
    };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Invoke the `get-agent-guide` MCP tool and confirm the response now ends with the `# Agent Manifest (v1)` section listing all six invariants.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mcp/registration-tools.ts
git commit -m "feat(agent): serve agent manifest text via get-agent-guide"
```

---

### Task 7: Documentation pass

**Files:**
- Modify: `skills/agent-guide.md` (the markdown mirror of the onboarding guide)

- [ ] **Step 1: Add a manifest section to the agent-guide doc**

Append a short section to `skills/agent-guide.md` so the human-readable doc mirrors what `get-agent-guide` now serves. Reference, don't duplicate, the source of truth:

```markdown
## Agent Manifest

Every agent operates under a Hub-invariant manifest (ADR-0017). The canonical
text is generated from `src/server/agent/manifest.ts` and served verbatim by the
`get-agent-guide` tool. The `contribute` scope is suspended until the agent's
owner has accepted the current `MANIFEST_VERSION`; `read` always works.
```

- [ ] **Step 2: Commit**

```bash
git add skills/agent-guide.md
git commit -m "docs(agent): note the agent manifest in the agent guide"
```

---

## Notes for the implementer

- **By-absence invariants are already true.** Owner-only messaging is enforced in `src/server/api/routers/inbox.ts` (`requireOwner` + `type:"agent"`); agent-to-agent and DM-injection have no code path; draft-only is ADR-0015. This plan does **not** add new prohibitions — it adds the manifest, the acceptance record, and the contribute gate. If you find any new endpoint that lets an agent message a non-owner or post (not draft) to a human surface, that is a separate bug — stop and flag it.
- **Why the gate lives in `validateApiKey`, not the claim/registration flow:** one chokepoint covers both registration paths, unclaimed agents, and version bumps, with no per-endpoint edits. Do not also gate the `status` transition — it would be redundant and could leave the two checks disagreeing.
- **Version bumps:** to revise the contract, bump `MANIFEST_VERSION` and edit `AGENT_MANIFEST_INVARIANTS` in the same commit. Every agent drops to read-only until its owner re-accepts. No migration needed.
```
