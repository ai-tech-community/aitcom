# Investigations Edit Log — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polymorphic edit-log table and a service-layer wrapper that all writes to investigation entities go through, then refactor the four existing write procedures to use it. After this phase: zero behaviour change for users, but every write is recorded as an `investigation_edit` row with sources and field-level enforcement.

**Architecture:** Two new tables in `app` schema (`investigation_edit`, `investigation_edit_vote`). One service module (`src/server/investigations/`) exposing `recordedCreate` / `recordedUpdate` / `recordedDelete`. Pure validators (citation rule, field whitelist, admin-only field check) are split out so they can be unit-tested without a DB. Rate limiting reuses the in-memory Map pattern from `src/server/agent/rate-limit.ts`.

**Tech Stack:** TypeScript, Drizzle ORM, Payload-style migrations, tRPC, Vitest.

---

## Spec reference

`docs/superpowers/specs/2026-05-09-investigations-collaborative-editing-design.md` — see §1, §2, §3, §7 (Phase A).

## File structure

**Created:**
- `src/server/investigations/entity-config.ts` — declarative per-entity field config (factual, admin-only, editable whitelist, table reference, PK column).
- `src/server/investigations/validate.ts` — pure validators: `validateFieldWhitelist`, `validateAdminOnlyFields`, `validateCitationRule`. No DB.
- `src/server/investigations/rate-limit.ts` — `checkInvestigationEditLimit(userId)` and `checkInvestigationVoteLimit(userId)`. In-memory Map, mirrors `src/server/agent/rate-limit.ts`.
- `src/server/investigations/recorded-write.ts` — `recordedCreate`, `recordedUpdate`, `recordedDelete`. Calls validators, writes both `investigation_edit` and the canonical row inside one transaction.
- `src/server/investigations/entity-config.test.ts`
- `src/server/investigations/validate.test.ts`
- `src/server/investigations/rate-limit.test.ts`
- `src/migrations/20260509_investigation_edit_log.ts`

**Modified:**
- `src/server/db/schema.ts` — add `investigationEdit`, `investigationEditVote` tables and relations near other investigation tables (around line 2228, after `datacenterFindingVotes`).
- `src/migrations/index.ts` — register new migration.
- `src/server/api/routers/datacenters.ts` — refactor `submit`, `createBrand`, `addSupplier`, `submitFinding` to call `recordedCreate`. Each refactor preserves the proc's output shape.

**Out of scope (Phase B+):**
- New `update*` and `propose*` procedures — Phase B.
- `revertEdit`, vote procs, admin tiebreak — Phase C.
- MCP investigation tools — Phase D.

---

## Task 1: Add schema tables

**Files:**
- Modify: `src/server/db/schema.ts` — add new tables after `datacenterFindingVotes` (around line 2228).

- [ ] **Step 1: Add `investigationEdit` table**

In `src/server/db/schema.ts`, after the `datacenterFindingVotes` declaration, append:

```ts
export const investigationEdit = appSchema.table(
  "investigation_edit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    op: text("op").notNull(),
    patch: jsonb("patch")
      .$type<Record<string, unknown>>()
      .notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    sources: jsonb("sources")
      .$type<{ url: string; title?: string; type?: string; publishedAt?: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),
    agentId: uuid("agent_id"),
    status: text("status").notNull().default("live"),
    trueVotes: integer("true_votes").notNull().default(0),
    falseVotes: integer("false_votes").notNull().default(0),
    revertedByEditId: uuid("reverted_by_edit_id"),
    resolvedByUserId: text("resolved_by_user_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    entityIdx: index("inv_edit_entity_idx").on(t.entityType, t.entityId),
    userIdx: index("inv_edit_user_idx").on(t.userId),
    statusIdx: index("inv_edit_status_idx").on(t.status),
    createdIdx: index("inv_edit_created_idx").on(t.createdAt),
  }),
);
```

- [ ] **Step 2: Add `investigationEditVote` table**

Append immediately after:

```ts
export const investigationEditVote = appSchema.table(
  "investigation_edit_vote",
  {
    editId: uuid("edit_id")
      .notNull()
      .references(() => investigationEdit.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    vote: integer("vote").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex("inv_edit_vote_pk").on(t.editId, t.userId),
  }),
);
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — no compile errors. If errors complain about a missing `text` / `jsonb` / `index` / `uniqueIndex` / `sql` import, those are already imported at the top of `schema.ts`. Confirm by scrolling up.

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(investigations): add investigation_edit and edit_vote drizzle tables"
```

---

## Task 2: Write the migration

**Files:**
- Create: `src/migrations/20260509_investigation_edit_log.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Create migration file**

Create `src/migrations/20260509_investigation_edit_log.ts`:

```ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "app"."investigation_edit" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "entity_type" text NOT NULL,
      "entity_id" text NOT NULL,
      "op" text NOT NULL,
      "patch" jsonb NOT NULL,
      "before" jsonb,
      "sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "user_id" text NOT NULL REFERENCES "app"."user"("id") ON DELETE SET NULL,
      "agent_id" uuid,
      "status" text NOT NULL DEFAULT 'live',
      "true_votes" integer NOT NULL DEFAULT 0,
      "false_votes" integer NOT NULL DEFAULT 0,
      "reverted_by_edit_id" uuid,
      "resolved_by_user_id" text,
      "resolved_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "inv_edit_op_check" CHECK ("op" IN ('create','update','revert','delete')),
      CONSTRAINT "inv_edit_status_check" CHECK ("status" IN ('live','contested','reverted','accepted'))
    );
    CREATE INDEX "inv_edit_entity_idx" ON "app"."investigation_edit" ("entity_type","entity_id");
    CREATE INDEX "inv_edit_user_idx" ON "app"."investigation_edit" ("user_id");
    CREATE INDEX "inv_edit_status_idx" ON "app"."investigation_edit" ("status");
    CREATE INDEX "inv_edit_created_idx" ON "app"."investigation_edit" ("created_at");
  `);

  await db.execute(sql`
    CREATE TABLE "app"."investigation_edit_vote" (
      "edit_id" uuid NOT NULL REFERENCES "app"."investigation_edit"("id") ON DELETE CASCADE,
      "user_id" text NOT NULL REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "vote" integer NOT NULL,
      "reason" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "inv_edit_vote_check" CHECK ("vote" IN (1, -1))
    );
    CREATE UNIQUE INDEX "inv_edit_vote_pk" ON "app"."investigation_edit_vote" ("edit_id","user_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."investigation_edit_vote" CASCADE;`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."investigation_edit" CASCADE;`);
}
```

- [ ] **Step 2: Register the migration**

Modify `src/migrations/index.ts`:

Add the import after the most recent existing import (line 23):

```ts
import * as migration_20260509_investigation_edit_log from "./20260509_investigation_edit_log";
```

Add the entry at the end of the `migrations` array (before the closing `]`):

```ts
{
  up: migration_20260509_investigation_edit_log.up,
  down: migration_20260509_investigation_edit_log.down,
  name: "20260509_investigation_edit_log",
},
```

- [ ] **Step 3: Apply migration locally**

Run: `echo y | pnpm dlx payload migrate`
Expected: log line `Migrated: 20260509_investigation_edit_log` and exit 0.

- [ ] **Step 4: Verify tables exist**

Run a quick connectivity check via `pnpm db:studio` or psql:

```sql
SELECT to_regclass('app.investigation_edit'),
       to_regclass('app.investigation_edit_vote');
```
Expected: both columns return non-null OIDs.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/20260509_investigation_edit_log.ts src/migrations/index.ts
git commit -m "feat(investigations): migration for edit log + edit votes"
```

---

## Task 3: Per-user rate-limit utility

**Files:**
- Create: `src/server/investigations/rate-limit.ts`
- Create: `src/server/investigations/rate-limit.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/server/investigations/rate-limit.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetInvestigationLimits,
  EDIT_LIMIT_PER_HOUR,
  VOTE_LIMIT_PER_HOUR,
  checkInvestigationEditLimit,
  checkInvestigationVoteLimit,
} from "./rate-limit";

afterEach(() => {
  __resetInvestigationLimits();
  vi.useRealTimers();
});

describe("checkInvestigationEditLimit", () => {
  it("allows up to EDIT_LIMIT_PER_HOUR per user", () => {
    for (let i = 0; i < EDIT_LIMIT_PER_HOUR; i++) {
      expect(checkInvestigationEditLimit("user-1").allowed).toBe(true);
    }
    expect(checkInvestigationEditLimit("user-1").allowed).toBe(false);
  });

  it("isolates limits per user", () => {
    for (let i = 0; i < EDIT_LIMIT_PER_HOUR; i++) {
      checkInvestigationEditLimit("user-a");
    }
    expect(checkInvestigationEditLimit("user-a").allowed).toBe(false);
    expect(checkInvestigationEditLimit("user-b").allowed).toBe(true);
  });

  it("resets after the window passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T00:00:00Z"));
    for (let i = 0; i < EDIT_LIMIT_PER_HOUR; i++) {
      checkInvestigationEditLimit("user-x");
    }
    expect(checkInvestigationEditLimit("user-x").allowed).toBe(false);
    vi.setSystemTime(new Date("2026-05-09T01:00:01Z"));
    expect(checkInvestigationEditLimit("user-x").allowed).toBe(true);
  });
});

describe("checkInvestigationVoteLimit", () => {
  it("uses the vote limit independently of the edit limit", () => {
    for (let i = 0; i < EDIT_LIMIT_PER_HOUR; i++) {
      checkInvestigationEditLimit("user-y");
    }
    expect(checkInvestigationEditLimit("user-y").allowed).toBe(false);
    expect(checkInvestigationVoteLimit("user-y").allowed).toBe(true);
  });

  it("allows up to VOTE_LIMIT_PER_HOUR votes", () => {
    for (let i = 0; i < VOTE_LIMIT_PER_HOUR; i++) {
      expect(checkInvestigationVoteLimit("user-z").allowed).toBe(true);
    }
    expect(checkInvestigationVoteLimit("user-z").allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/investigations/rate-limit.test.ts`
Expected: FAIL — "Cannot find module './rate-limit'".

- [ ] **Step 3: Write implementation**

Create `src/server/investigations/rate-limit.ts`:

```ts
const WINDOW_MS = 3_600_000;
export const EDIT_LIMIT_PER_HOUR = 20;
export const VOTE_LIMIT_PER_HOUR = 60;

interface Bucket {
  count: number;
  resetAt: number;
}

const editBuckets = new Map<string, Bucket>();
const voteBuckets = new Map<string, Bucket>();

function check(map: Map<string, Bucket>, key: string, max: number) {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || now >= bucket.resetAt) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: max - 1 };
  }
  if (bucket.count >= max) {
    return { allowed: false, remaining: 0 };
  }
  bucket.count++;
  return { allowed: true, remaining: max - bucket.count };
}

export function checkInvestigationEditLimit(userId: string) {
  return check(editBuckets, userId, EDIT_LIMIT_PER_HOUR);
}

export function checkInvestigationVoteLimit(userId: string) {
  return check(voteBuckets, userId, VOTE_LIMIT_PER_HOUR);
}

export function __resetInvestigationLimits() {
  editBuckets.clear();
  voteBuckets.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/server/investigations/rate-limit.test.ts`
Expected: PASS — 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/server/investigations/rate-limit.ts src/server/investigations/rate-limit.test.ts
git commit -m "feat(investigations): per-user edit and vote rate limit utility"
```

---

## Task 4: Entity config

**Files:**
- Create: `src/server/investigations/entity-config.ts`
- Create: `src/server/investigations/entity-config.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/server/investigations/entity-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  ENTITY_CONFIG,
  ENTITY_TYPES,
  type EntityType,
} from "./entity-config";

describe("ENTITY_CONFIG", () => {
  it("covers all 9 entity types", () => {
    expect(ENTITY_TYPES).toEqual([
      "datacenter",
      "brand",
      "subsidy",
      "permit",
      "energy_deal",
      "ownership_edge",
      "datacenter_supplier",
      "datacenter_status_history",
      "datacenter_finding",
    ]);
    for (const t of ENTITY_TYPES) {
      expect(ENTITY_CONFIG[t]).toBeDefined();
    }
  });

  it("admin-only fields are also in editable fields for every entity", () => {
    for (const t of ENTITY_TYPES) {
      const cfg = ENTITY_CONFIG[t];
      for (const f of cfg.adminOnlyFields) {
        expect(cfg.editableFields.has(f)).toBe(true);
      }
    }
  });

  it("factual fields are a subset of editable fields", () => {
    for (const t of ENTITY_TYPES) {
      const cfg = ENTITY_CONFIG[t];
      for (const f of cfg.factualFields) {
        expect(cfg.editableFields.has(f)).toBe(true);
      }
    }
  });

  it("datacenter has expected admin-only fields per spec", () => {
    const cfg = ENTITY_CONFIG["datacenter" satisfies EntityType];
    expect(cfg.adminOnlyFields.has("verified")).toBe(true);
    expect(cfg.adminOnlyFields.has("slug")).toBe(true);
  });

  it("datacenter has expected factual fields per spec", () => {
    const cfg = ENTITY_CONFIG["datacenter" satisfies EntityType];
    for (const f of [
      "capacityMw",
      "primaryPowerSource",
      "coolingType",
      "operatorId",
      "lat",
      "lng",
    ]) {
      expect(cfg.factualFields.has(f)).toBe(true);
    }
  });

  it("brand has expected admin-only fields", () => {
    const cfg = ENTITY_CONFIG["brand" satisfies EntityType];
    expect(cfg.adminOnlyFields.has("verified")).toBe(true);
    expect(cfg.adminOnlyFields.has("slug")).toBe(true);
  });

  it("datacenter_supplier marks verified as admin-only", () => {
    const cfg = ENTITY_CONFIG["datacenter_supplier" satisfies EntityType];
    expect(cfg.adminOnlyFields.has("verified")).toBe(true);
  });

  it("datacenter_finding marks status as admin-only", () => {
    const cfg = ENTITY_CONFIG["datacenter_finding" satisfies EntityType];
    expect(cfg.adminOnlyFields.has("status")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/investigations/entity-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Create `src/server/investigations/entity-config.ts`:

```ts
import type { PgTable } from "drizzle-orm/pg-core";

import {
  brands,
  datacenters,
  datacenterSuppliers,
  datacenterStatusHistory,
  datacenterFindings,
  energyDeals,
  ownershipEdges,
  permits,
  subsidies,
} from "@/server/db/schema";

export const ENTITY_TYPES = [
  "datacenter",
  "brand",
  "subsidy",
  "permit",
  "energy_deal",
  "ownership_edge",
  "datacenter_supplier",
  "datacenter_status_history",
  "datacenter_finding",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export interface EntityConfig {
  table: PgTable;
  pkColumn: "id";
  factualFields: Set<string>;
  adminOnlyFields: Set<string>;
  editableFields: Set<string>;
}

export const ENTITY_CONFIG: Record<EntityType, EntityConfig> = {
  datacenter: {
    table: datacenters,
    pkColumn: "id",
    factualFields: new Set([
      "capacityMw",
      "capacityMwPlanned",
      "squareFootage",
      "rackCount",
      "primaryPowerSource",
      "coolingType",
      "operatorId",
      "utilityId",
      "lat",
      "lng",
      "puePledged",
      "waterDrawMgd",
      "waterDrawCubicM",
      "wuePledged",
      "announcedDate",
      "groundbreakDate",
      "onlineDate",
      "fullCapacityDate",
      "capexUsd",
      "status",
      "country",
      "region",
      "city",
      "address",
      "gpus",
    ]),
    adminOnlyFields: new Set(["verified", "slug"]),
    editableFields: new Set([
      "name",
      "slug",
      "operatorId",
      "utilityId",
      "status",
      "aiDedicated",
      "lat",
      "lng",
      "address",
      "city",
      "region",
      "country",
      "capacityMw",
      "capacityMwPlanned",
      "squareFootage",
      "rackCount",
      "gpus",
      "primaryPowerSource",
      "coolingType",
      "puePledged",
      "waterDrawMgd",
      "waterDrawCubicM",
      "wuePledged",
      "announcedDate",
      "groundbreakDate",
      "onlineDate",
      "fullCapacityDate",
      "capexUsd",
      "description",
      "sources",
      "verified",
    ]),
  },
  brand: {
    table: brands,
    pkColumn: "id",
    factualFields: new Set([
      "canonicalName",
      "website",
      "jurisdiction",
      "jurisdictionRegion",
      "entityType",
      "ultimateBeneficialOwner",
    ]),
    adminOnlyFields: new Set(["verified", "slug"]),
    editableFields: new Set([
      "canonicalName",
      "slug",
      "website",
      "jurisdiction",
      "jurisdictionRegion",
      "entityType",
      "ultimateBeneficialOwner",
      "verified",
    ]),
  },
  subsidy: {
    table: subsidies,
    pkColumn: "id",
    factualFields: new Set([
      "datacenterId",
      "recipientBrandId",
      "kind",
      "amountUsd",
      "jurisdiction",
      "awardedAt",
    ]),
    adminOnlyFields: new Set([]),
    editableFields: new Set([
      "datacenterId",
      "recipientBrandId",
      "kind",
      "amountUsd",
      "jurisdiction",
      "awardedAt",
      "description",
      "sources",
    ]),
  },
  permit: {
    table: permits,
    pkColumn: "id",
    factualFields: new Set([
      "datacenterId",
      "kind",
      "issuedAt",
      "permitId",
      "issuingAuthority",
    ]),
    adminOnlyFields: new Set([]),
    editableFields: new Set([
      "datacenterId",
      "kind",
      "issuedAt",
      "permitId",
      "issuingAuthority",
      "description",
      "sources",
    ]),
  },
  energy_deal: {
    table: energyDeals,
    pkColumn: "id",
    factualFields: new Set([
      "datacenterId",
      "supplierBrandId",
      "kind",
      "capacityMw",
      "termYears",
      "startDate",
    ]),
    adminOnlyFields: new Set([]),
    editableFields: new Set([
      "datacenterId",
      "supplierBrandId",
      "kind",
      "capacityMw",
      "termYears",
      "startDate",
      "description",
      "sources",
    ]),
  },
  ownership_edge: {
    table: ownershipEdges,
    pkColumn: "id",
    factualFields: new Set([
      "parentBrandId",
      "childBrandId",
      "ownershipPct",
      "kind",
      "asOf",
    ]),
    adminOnlyFields: new Set([]),
    editableFields: new Set([
      "parentBrandId",
      "childBrandId",
      "ownershipPct",
      "kind",
      "asOf",
      "sources",
    ]),
  },
  datacenter_supplier: {
    table: datacenterSuppliers,
    pkColumn: "id",
    factualFields: new Set([
      "datacenterId",
      "supplierId",
      "category",
      "role",
      "contractValueUsd",
    ]),
    adminOnlyFields: new Set(["verified"]),
    editableFields: new Set([
      "datacenterId",
      "supplierId",
      "category",
      "role",
      "contractValueUsd",
      "isLocal",
      "sources",
      "verified",
    ]),
  },
  datacenter_status_history: {
    table: datacenterStatusHistory,
    pkColumn: "id",
    factualFields: new Set(["datacenterId", "status", "occurredAt"]),
    adminOnlyFields: new Set([]),
    editableFields: new Set([
      "datacenterId",
      "status",
      "occurredAt",
      "note",
      "sources",
    ]),
  },
  datacenter_finding: {
    table: datacenterFindings,
    pkColumn: "id",
    factualFields: new Set(["claim", "evidenceUrls", "datacenterId"]),
    adminOnlyFields: new Set(["status"]),
    editableFields: new Set([
      "datacenterId",
      "title",
      "body",
      "claim",
      "evidenceUrls",
      "status",
    ]),
  },
};
```

> Note: field names listed above must exactly match the Drizzle column property names in `schema.ts`. If `pnpm typecheck` complains about an unknown property in a later task, cross-reference against the relevant table definition (`datacenters`, `brands`, etc.) and adjust this set. Do not silently rename — keep the source of truth aligned.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/server/investigations/entity-config.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. If a property name is wrong in a Set, fix it against the schema.

- [ ] **Step 6: Commit**

```bash
git add src/server/investigations/entity-config.ts src/server/investigations/entity-config.test.ts
git commit -m "feat(investigations): per-entity field config (factual/admin-only/editable)"
```

---

## Task 5: Pure validators

**Files:**
- Create: `src/server/investigations/validate.ts`
- Create: `src/server/investigations/validate.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/server/investigations/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ENTITY_CONFIG } from "./entity-config";
import {
  CitationRequiredError,
  FieldNotEditableError,
  AdminOnlyFieldError,
  validateFieldWhitelist,
  validateAdminOnlyFields,
  validateCitationRule,
} from "./validate";

const dcCfg = ENTITY_CONFIG.datacenter;

describe("validateFieldWhitelist", () => {
  it("accepts whitelisted fields", () => {
    expect(() =>
      validateFieldWhitelist(dcCfg, { name: "X", capacityMw: 100 }),
    ).not.toThrow();
  });

  it("rejects unknown fields", () => {
    expect(() =>
      validateFieldWhitelist(dcCfg, { capacityMw: 100, fooBar: "x" }),
    ).toThrow(FieldNotEditableError);
  });
});

describe("validateAdminOnlyFields", () => {
  it("blocks admin-only field for non-admin", () => {
    expect(() =>
      validateAdminOnlyFields(dcCfg, { verified: true }, { isAdmin: false }),
    ).toThrow(AdminOnlyFieldError);
  });

  it("allows admin-only field for admin", () => {
    expect(() =>
      validateAdminOnlyFields(dcCfg, { verified: true }, { isAdmin: true }),
    ).not.toThrow();
  });

  it("ignores non-admin-only fields", () => {
    expect(() =>
      validateAdminOnlyFields(dcCfg, { capacityMw: 100 }, { isAdmin: false }),
    ).not.toThrow();
  });
});

describe("validateCitationRule", () => {
  it("requires sources on create", () => {
    expect(() =>
      validateCitationRule(dcCfg, "create", { name: "X" }, []),
    ).toThrow(CitationRequiredError);
  });

  it("accepts create with sources", () => {
    expect(() =>
      validateCitationRule(
        dcCfg,
        "create",
        { name: "X" },
        [{ url: "https://example.com" }],
      ),
    ).not.toThrow();
  });

  it("requires sources on update of factual field", () => {
    expect(() =>
      validateCitationRule(dcCfg, "update", { capacityMw: 100 }, []),
    ).toThrow(CitationRequiredError);
  });

  it("does not require sources on update of cosmetic field", () => {
    expect(() =>
      validateCitationRule(dcCfg, "update", { description: "tidy text" }, []),
    ).not.toThrow();
  });

  it("requires sources on update touching any factual field even if mixed", () => {
    expect(() =>
      validateCitationRule(
        dcCfg,
        "update",
        { description: "tidy", capacityMw: 100 },
        [],
      ),
    ).toThrow(CitationRequiredError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/investigations/validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Create `src/server/investigations/validate.ts`:

```ts
import type { EntityConfig } from "./entity-config";

export class FieldNotEditableError extends Error {
  constructor(public field: string) {
    super(`Field is not editable: ${field}`);
  }
}

export class AdminOnlyFieldError extends Error {
  constructor(public field: string) {
    super(`Field requires admin: ${field}`);
  }
}

export class CitationRequiredError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type Op = "create" | "update" | "delete" | "revert";

export interface Source {
  url: string;
  title?: string;
  type?: string;
  publishedAt?: string;
}

export function validateFieldWhitelist(
  cfg: EntityConfig,
  patch: Record<string, unknown>,
): void {
  for (const key of Object.keys(patch)) {
    if (!cfg.editableFields.has(key)) {
      throw new FieldNotEditableError(key);
    }
  }
}

export function validateAdminOnlyFields(
  cfg: EntityConfig,
  patch: Record<string, unknown>,
  ctx: { isAdmin: boolean },
): void {
  if (ctx.isAdmin) return;
  for (const key of Object.keys(patch)) {
    if (cfg.adminOnlyFields.has(key)) {
      throw new AdminOnlyFieldError(key);
    }
  }
}

export function validateCitationRule(
  cfg: EntityConfig,
  op: Op,
  patch: Record<string, unknown>,
  sources: Source[],
): void {
  if (op === "create") {
    if (sources.length === 0) {
      throw new CitationRequiredError(
        "At least one source URL is required when creating a new record.",
      );
    }
    return;
  }

  if (op === "update") {
    const touchesFactual = Object.keys(patch).some((f) =>
      cfg.factualFields.has(f),
    );
    if (touchesFactual && sources.length === 0) {
      throw new CitationRequiredError(
        "At least one source URL is required when updating a factual field.",
      );
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/server/investigations/validate.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/server/investigations/validate.ts src/server/investigations/validate.test.ts
git commit -m "feat(investigations): pure validators for citation/field/admin rules"
```

---

## Task 6: `recordedCreate`

**Files:**
- Create: `src/server/investigations/recorded-write.ts`

This task introduces only `recordedCreate`. `recordedUpdate` and `recordedDelete` come in Tasks 7 and 8 to keep diffs small.

- [ ] **Step 1: Write the implementation**

Create `src/server/investigations/recorded-write.ts`:

```ts
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";

import { db as defaultDb } from "@/server/db";
import { investigationEdit } from "@/server/db/schema";

import { ENTITY_CONFIG, type EntityType } from "./entity-config";
import { checkInvestigationEditLimit } from "./rate-limit";
import {
  AdminOnlyFieldError,
  CitationRequiredError,
  FieldNotEditableError,
  validateAdminOnlyFields,
  validateCitationRule,
  validateFieldWhitelist,
  type Source,
} from "./validate";

export interface RecordedWriteCtx {
  userId: string;
  agentId?: string;
  isAdmin: boolean;
  db?: typeof defaultDb;
}

interface RecordedCreateArgs<T extends Record<string, unknown>> {
  entityType: EntityType;
  values: T;
  sources: Source[];
}

export async function recordedCreate<T extends Record<string, unknown>>(
  ctx: RecordedWriteCtx,
  args: RecordedCreateArgs<T>,
): Promise<{ entity: { id: string }; editId: string }> {
  const cfg = ENTITY_CONFIG[args.entityType];
  const dbi = ctx.db ?? defaultDb;

  const rate = checkInvestigationEditLimit(ctx.userId);
  if (!rate.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Edit rate limit exceeded.",
    });
  }

  try {
    validateFieldWhitelist(cfg, args.values);
    validateAdminOnlyFields(cfg, args.values, { isAdmin: ctx.isAdmin });
    validateCitationRule(cfg, "create", args.values, args.sources);
  } catch (e) {
    throw mapValidationError(e);
  }

  return await dbi.transaction(async (tx) => {
    const [created] = await tx
      .insert(cfg.table)
      .values(args.values as never)
      .returning({ id: sql<string>`id` });

    const [edit] = await tx
      .insert(investigationEdit)
      .values({
        entityType: args.entityType,
        entityId: created.id,
        op: "create",
        patch: args.values as Record<string, unknown>,
        before: null,
        sources: args.sources,
        userId: ctx.userId,
        agentId: ctx.agentId ?? null,
        status: "live",
      })
      .returning({ id: investigationEdit.id });

    return { entity: { id: created.id }, editId: edit.id };
  });
}

function mapValidationError(e: unknown): TRPCError {
  if (e instanceof FieldNotEditableError) {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: `Field not editable: ${e.field}`,
    });
  }
  if (e instanceof AdminOnlyFieldError) {
    return new TRPCError({
      code: "FORBIDDEN",
      message: `Field requires admin: ${e.field}`,
    });
  }
  if (e instanceof CitationRequiredError) {
    return new TRPCError({ code: "BAD_REQUEST", message: e.message });
  }
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected validation error.",
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. If `cfg.table` triggers a Drizzle generic-inference issue for `.values()`, the `as never` cast above is the deliberate workaround — type safety comes from the per-entity ENTITY_CONFIG, not from Drizzle's static row type for this polymorphic helper.

- [ ] **Step 3: Commit**

```bash
git add src/server/investigations/recorded-write.ts
git commit -m "feat(investigations): recordedCreate wrapper with validation + edit log"
```

---

## Task 7: `recordedUpdate`

**Files:**
- Modify: `src/server/investigations/recorded-write.ts`

- [ ] **Step 1: Add `recordedUpdate`**

Append to `src/server/investigations/recorded-write.ts`:

```ts
interface RecordedUpdateArgs {
  entityType: EntityType;
  entityId: string;
  patch: Record<string, unknown>;
  sources: Source[];
  reason?: string;
}

export async function recordedUpdate(
  ctx: RecordedWriteCtx,
  args: RecordedUpdateArgs,
): Promise<{ entity: { id: string }; editId: string }> {
  const cfg = ENTITY_CONFIG[args.entityType];
  const dbi = ctx.db ?? defaultDb;

  const rate = checkInvestigationEditLimit(ctx.userId);
  if (!rate.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Edit rate limit exceeded.",
    });
  }

  try {
    validateFieldWhitelist(cfg, args.patch);
    validateAdminOnlyFields(cfg, args.patch, { isAdmin: ctx.isAdmin });
    validateCitationRule(cfg, "update", args.patch, args.sources);
  } catch (e) {
    throw mapValidationError(e);
  }

  return await dbi.transaction(async (tx) => {
    const beforeRow = await tx
      .select()
      .from(cfg.table)
      // @ts-expect-error polymorphic table — id column known via cfg
      .where(eq(cfg.table.id, args.entityId))
      .limit(1);

    if (beforeRow.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found." });
    }

    const before: Record<string, unknown> = {};
    for (const key of Object.keys(args.patch)) {
      before[key] = (beforeRow[0] as Record<string, unknown>)[key];
    }

    await tx
      .update(cfg.table)
      .set(args.patch as never)
      // @ts-expect-error polymorphic table — id column known via cfg
      .where(eq(cfg.table.id, args.entityId));

    const [edit] = await tx
      .insert(investigationEdit)
      .values({
        entityType: args.entityType,
        entityId: args.entityId,
        op: "update",
        patch: args.patch,
        before,
        sources: args.sources,
        userId: ctx.userId,
        agentId: ctx.agentId ?? null,
        status: "live",
      })
      .returning({ id: investigationEdit.id });

    return { entity: { id: args.entityId }, editId: edit.id };
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. The two `@ts-expect-error` comments are intentional — the wrapper is polymorphic over Drizzle tables, and the runtime guarantee comes from `ENTITY_CONFIG`.

- [ ] **Step 3: Commit**

```bash
git add src/server/investigations/recorded-write.ts
git commit -m "feat(investigations): recordedUpdate wrapper with before snapshot"
```

---

## Task 8: `recordedDelete`

**Files:**
- Modify: `src/server/investigations/recorded-write.ts`

- [ ] **Step 1: Add `recordedDelete`**

Append to `src/server/investigations/recorded-write.ts`:

```ts
interface RecordedDeleteArgs {
  entityType: EntityType;
  entityId: string;
  reason: string;
}

export async function recordedDelete(
  ctx: RecordedWriteCtx,
  args: RecordedDeleteArgs,
): Promise<{ editId: string }> {
  if (!ctx.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Delete is admin-only.",
    });
  }

  const cfg = ENTITY_CONFIG[args.entityType];
  const dbi = ctx.db ?? defaultDb;

  return await dbi.transaction(async (tx) => {
    const beforeRow = await tx
      .select()
      .from(cfg.table)
      // @ts-expect-error polymorphic
      .where(eq(cfg.table.id, args.entityId))
      .limit(1);

    if (beforeRow.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found." });
    }

    await tx
      .delete(cfg.table)
      // @ts-expect-error polymorphic
      .where(eq(cfg.table.id, args.entityId));

    const [edit] = await tx
      .insert(investigationEdit)
      .values({
        entityType: args.entityType,
        entityId: args.entityId,
        op: "delete",
        patch: {},
        before: beforeRow[0] as Record<string, unknown>,
        sources: [],
        userId: ctx.userId,
        agentId: ctx.agentId ?? null,
        status: "live",
      })
      .returning({ id: investigationEdit.id });

    return { editId: edit.id };
  });
}
```

> Note: the migration's CHECK constraint on `op` permits `'delete'`. If you adjusted the migration, ensure it still allows this value.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/investigations/recorded-write.ts
git commit -m "feat(investigations): admin-only recordedDelete with snapshot"
```

---

## Task 9: Refactor `datacenters.submit` through `recordedCreate`

**Files:**
- Modify: `src/server/api/routers/datacenters.ts:1438-1537`

The proc currently does direct `db.insert(datacenters).values(...).returning(...)`. After this task it goes through `recordedCreate` and produces an edit-log row alongside the canonical insert.

- [ ] **Step 1: Add the import**

In `src/server/api/routers/datacenters.ts`, add to the existing imports near the top:

```ts
import { recordedCreate } from "@/server/investigations/recorded-write";
```

- [ ] **Step 2: Rewrite the `submit` mutation body**

Replace the body of `submit` (the entire `.mutation(async ({ ctx, input }) => { ... })` block at lines 1473-1537) with:

```ts
.mutation(async ({ ctx, input }) => {
  const existing = await ctx.db
    .select({ id: datacenters.id })
    .from(datacenters)
    .where(eq(datacenters.slug, input.slug))
    .limit(1);
  if (existing.length) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Slug already exists",
    });
  }

  const [op] = await ctx.db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.id, input.operatorBrandId))
    .limit(1);
  if (!op) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Operator brand not found",
    });
  }

  const role = (ctx.session.user as { role?: string }).role;
  const result = await recordedCreate(
    {
      userId: ctx.session.user.id,
      isAdmin: role === "admin",
      db: ctx.db,
    },
    {
      entityType: "datacenter",
      values: {
        name: input.name,
        slug: input.slug,
        operatorId: input.operatorBrandId,
        status: input.status,
        aiDedicated: input.aiDedicated,
        lat: input.lat,
        lng: input.lng,
        address: input.address,
        city: input.city,
        region: input.region,
        country: input.country,
        capacityMw: input.capacityMw,
        capacityMwPlanned: input.capacityMwPlanned,
        squareFootage: input.squareFootage,
        rackCount: input.rackCount,
        gpus: input.gpus,
        primaryPowerSource: input.primaryPowerSource,
        utilityId: input.utilityBrandId,
        puePledged: input.puePledged,
        coolingType: input.coolingType,
        waterDrawMgd: input.waterDrawMgd,
        waterDrawCubicM: input.waterDrawCubicM,
        wuePledged: input.wuePledged,
        announcedDate: input.announcedDate,
        groundbreakDate: input.groundbreakDate,
        onlineDate: input.onlineDate,
        fullCapacityDate: input.fullCapacityDate,
        capexUsd: input.capexUsd,
        description: input.description,
        sources: input.sources satisfies DatacenterSource[],
        verified: false,
      },
      sources: input.sources,
    },
  );

  const [created] = await ctx.db
    .select({ id: datacenters.id, slug: datacenters.slug })
    .from(datacenters)
    .where(eq(datacenters.id, result.entity.id))
    .limit(1);

  return created;
}),
```

> Note 1: `submittedByUserId` was previously set to `ctx.session.user.id`. It is dropped here because `userId` on the edit row already attributes authorship. If a frontend reads `submittedByUserId`, restore it by adding it to `editableFields` for `datacenter` and including it in `values` above. Quick check: `grep -n submittedByUserId src` before deciding.

> Note 2: If `editableFields` for `datacenter` does not yet include `verified`, the call will throw because `verified: false` is in the patch. Verify Task 4 added it. (It did — see the datacenter entry above.)

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. If a property name in `values` does not match the schema, fix the schema property name (not the wrapper).

- [ ] **Step 4: Manual smoke**

In a dev session, run a `submit` mutation through tRPC (e.g. via the existing submit form on `/investigations/datacenters/submit`, or via `pnpm dlx tsx scripts/...` if a script exists). Then confirm:

```sql
SELECT entity_type, op, user_id, status FROM app.investigation_edit ORDER BY created_at DESC LIMIT 1;
```
Expected: row with `entity_type='datacenter'`, `op='create'`, `status='live'`.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/datacenters.ts
git commit -m "refactor(investigations): route datacenters.submit through recordedCreate"
```

---

## Task 10: Refactor `datacenters.createBrand`

**Files:**
- Modify: `src/server/api/routers/datacenters.ts:1571-1604`

- [ ] **Step 1: Rewrite the `createBrand` mutation body**

Replace the body (lines 1578-1604) with:

```ts
.mutation(async ({ ctx, input }) => {
  let slug = slugify(input.canonicalName);
  if (!slug)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid name" });
  const exists = await ctx.db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.slug, slug))
    .limit(1);
  if (exists.length) {
    slug = `${slug}-${Math.floor(Math.random() * 9999)}`;
  }

  const role = (ctx.session.user as { role?: string }).role;
  const isAdmin = role === "admin";

  const result = await recordedCreate(
    { userId: ctx.session.user.id, isAdmin, db: ctx.db },
    {
      entityType: "brand",
      values: {
        slug,
        canonicalName: input.canonicalName,
        website: input.website,
        verified: false,
      },
      // createBrand has no input.sources today. To satisfy the citation
      // rule we pass the website as the canonical source if provided,
      // otherwise we accept the empty source list and bump up against the
      // citation rule. The brand creation endpoint will be retired in
      // Phase B and replaced by an explicit propose-brand endpoint that
      // requires sources. For now, treat website as the source.
      sources: input.website ? [{ url: input.website, type: "operator" }] : [],
    },
  );

  const [row] = await ctx.db
    .select({
      id: brands.id,
      slug: brands.slug,
      canonicalName: brands.canonicalName,
    })
    .from(brands)
    .where(eq(brands.id, result.entity.id))
    .limit(1);

  return row;
}),
```

> Note: this proc does not currently accept `sources` from the client. Phase B introduces `propose-brand` with a real `sources` array. To preserve current behaviour for callers that do not pass a website, you have two options: (a) accept that those callers will now get a `BAD_REQUEST` (the citation rule says "new row needs source" — applying it consistently has value), or (b) extend the input to accept an optional `sources` array and keep website as a fallback.
>
> Decision: go with (a). It is one of the goals of this refactor to start enforcing citations. Frontend consumers must be updated; track via `grep -rn createBrand src/components` and adjust call sites in a follow-up commit if any break.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Audit existing call sites**

Run:
```bash
grep -rn "datacenters.createBrand\|api\.datacenters\.createBrand" src/components src/app
```
For each hit, decide whether to extend the call site to pass `sources` (Phase B) or accept the new `BAD_REQUEST` for unsourced creations.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/datacenters.ts
git commit -m "refactor(investigations): route datacenters.createBrand through recordedCreate"
```

---

## Task 11: Refactor `datacenters.addSupplier`

**Files:**
- Modify: `src/server/api/routers/datacenters.ts:1607-1652` (approximate; confirm range with `grep -n "addSupplier" src/server/api/routers/datacenters.ts`).

- [ ] **Step 1: Tighten the input schema**

Today the `addSupplier` input has `sources: z.array(sourceSchema).max(20).default([])`. The citation rule rejects an empty source list, so make the requirement explicit at the input boundary. Change that line to:

```ts
sources: z.array(sourceSchema).min(1).max(20),
```

- [ ] **Step 2: Replace the mutation body**

Replace the entire `.mutation(async ({ ctx, input }) => { ... })` block (lines 1619-1651, the `addSupplier` proc body — the existing pre-insert dup-check via `datacenterSuppliers.datacenterId/supplierId/category` is preserved) with:

```ts
.mutation(async ({ ctx, input }) => {
  const dup = await ctx.db
    .select({ id: datacenterSuppliers.id })
    .from(datacenterSuppliers)
    .where(
      and(
        eq(datacenterSuppliers.datacenterId, input.datacenterId),
        eq(datacenterSuppliers.supplierId, input.supplierBrandId),
        eq(datacenterSuppliers.category, input.category),
      ),
    )
    .limit(1);
  if (dup.length) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Supplier already linked with that category",
    });
  }

  const role = (ctx.session.user as { role?: string }).role;
  const isAdmin = role === "admin";

  const result = await recordedCreate(
    { userId: ctx.session.user.id, isAdmin, db: ctx.db },
    {
      entityType: "datacenter_supplier",
      values: {
        datacenterId: input.datacenterId,
        supplierId: input.supplierBrandId,
        category: input.category,
        role: input.role,
        contractValueUsd: input.contractValueUsd,
        isLocal: input.isLocal,
        sources: input.sources satisfies DatacenterSource[],
        verified: false,
      },
      sources: input.sources,
    },
  );

  return { id: result.entity.id };
}),
```

The original returned `{ id: datacenterSuppliers.id }` from `.returning(...)`; the wrapper returns `result.entity.id` so the public shape is identical.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Audit call sites**

Run: `grep -rn "addSupplier" src/components src/app`
Confirm callers pass at least one source. If they default to empty, fix the call site (most likely `src/components/datacenters/add-supplier-dialog.tsx`).

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/datacenters.ts src/components/datacenters/add-supplier-dialog.tsx
git commit -m "refactor(investigations): route datacenters.addSupplier through recordedCreate"
```

---

## Task 12: Refactor `datacenters.submitFinding`

**Files:**
- Modify: `src/server/api/routers/datacenters.ts` — `submitFinding` block (use `grep -n "submitFinding:" src/server/api/routers/datacenters.ts` to locate).

The proc body to replace is in `src/server/api/routers/datacenters.ts`, the `submitFinding` proc (lines 1681-1706). Input zod already enforces `evidenceUrls: z.array(z.string().url()).min(1).max(10)`, so the citation rule is naturally satisfiable.

- [ ] **Step 1: Extend `datacenter_finding.editableFields` to include `userId`**

The wrapper's field whitelist will reject `userId` in the patch unless it is editable. Findings need `userId` set on insert (the column is `notNull`). Add `"userId"` to the `editableFields` set for `datacenter_finding` in `src/server/investigations/entity-config.ts`, plus a one-line comment:

```ts
datacenter_finding: {
  table: datacenterFindings,
  pkColumn: "id",
  factualFields: new Set(["claim", "evidenceUrls", "datacenterId"]),
  adminOnlyFields: new Set(["status"]),
  // userId is create-only provenance. Phase B's update-finding proc will not pass it.
  editableFields: new Set([
    "datacenterId",
    "userId",
    "title",
    "body",
    "claim",
    "evidenceUrls",
    "status",
  ]),
},
```

- [ ] **Step 2: Replace the mutation body**

Replace the `submitFinding` `.mutation(async ({ ctx, input }) => { ... })` block (lines 1691-1706) with:

```ts
.mutation(async ({ ctx, input }) => {
  const role = (ctx.session.user as { role?: string }).role;
  const isAdmin = role === "admin";

  const result = await recordedCreate(
    { userId: ctx.session.user.id, isAdmin, db: ctx.db },
    {
      entityType: "datacenter_finding",
      values: {
        datacenterId: input.datacenterId,
        userId: ctx.session.user.id,
        title: input.title,
        claim: input.claim,
        body: input.body,
        evidenceUrls: input.evidenceUrls,
        status: "review",
      },
      sources: input.evidenceUrls.map((url) => ({ url })),
    },
  );

  return { id: result.entity.id };
}),
```

The original returned `{ id }`; the wrapper returns the same shape via `result.entity.id`. The `upvotes: 0` default that the original passed is the column default in the schema, so it is no longer needed in the explicit `values`.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Audit call sites**

Run: `grep -rn "submitFinding" src/components src/app`
Likely hit: `src/components/datacenters/submit-finding-dialog.tsx`. Confirm `evidenceUrls` is required there.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/datacenters.ts src/server/investigations/entity-config.ts
git commit -m "refactor(investigations): route datacenters.submitFinding through recordedCreate"
```

---

## Task 13: Final verification

**Files:**
- (Verification only — no edits.)

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Run all investigations tests**

Run: `pnpm test src/server/investigations`
Expected: PASS — all suites green.

- [ ] **Step 3: Manual smoke through the UI**

Start `pnpm dev`, log in as a non-admin user, and:
1. Submit a datacenter via the existing submit form. Confirm a row is created.
2. Run `SELECT entity_type, op, status, user_id FROM app.investigation_edit ORDER BY created_at DESC LIMIT 5;` — confirm the edit row exists and `op='create'`.
3. Submit a finding. Confirm a second edit row appears.
4. Try to submit a datacenter without sources — expect `BAD_REQUEST` from the wrapper.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit smoke notes (if any updates needed)**

If steps 1-4 surfaced any fixes, commit them. Otherwise no commit needed for verification.

---

## Acceptance criteria for Phase A

- `app.investigation_edit` and `app.investigation_edit_vote` exist in the local database.
- `recordedCreate`, `recordedUpdate`, `recordedDelete` exported from `@/server/investigations/recorded-write`.
- All four pre-existing direct-write procs (`submit`, `createBrand`, `addSupplier`, `submitFinding`) route through `recordedCreate`.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test src/server/investigations` all pass.
- Manual smoke produces an edit row for every successful write.
- No new procedures are exposed yet (no `update*`, no `propose*`, no `voteEdit`, no MCP tools — those are Phases B/C/D).

## Phase B preview (do not implement yet)

Phase B will add: `updateDatacenter`, `updateBrand`, `updateSupplierLink`, `proposeSubsidy`, `proposePermit`, `proposeEnergyDeal`, `proposeOwnershipEdge`, `addStatusHistory`. All will call the wrapper from Phase A. A separate plan file will land before that phase begins.
