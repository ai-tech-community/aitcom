# Investigations Edit Log — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand investigation write coverage from "submit / addSupplier / submitFinding / createBrand only" to the full set declared in the spec — three update procs and five propose procs — all routed through the Phase A wrapper. Add a `adminOnlyOnUpdate` permission split so post-create slug edits can be admin-gated without blocking creates. Add DB-backed integration tests for `recordedCreate` / `recordedUpdate` / `recordedDelete` using in-process pglite.

**Architecture:** All new procs are thin tRPC wrappers around `recordedCreate` (for proposes) or `recordedUpdate` (for updates). The wrapper itself gains a small extension: `EntityConfig` adds `adminOnlyOnUpdate: Set<string>`, and `validateAdminOnlyFields` accepts an `op` argument so it can union the two sets on update. Test infra adds an in-memory pglite-backed Drizzle factory (`createTestDb()`) that callers reuse per test file. The drift test from Phase A.5 extends to cover the new field set.

**Tech Stack:** TypeScript, Drizzle ORM, tRPC, Zod, Vitest, `@electric-sql/pglite` + drizzle's pglite driver.

---

## Spec / plan reference

- Spec: `docs/superpowers/specs/2026-05-09-investigations-collaborative-editing-design.md` (§7 Phase B).
- Phase A plan: `docs/superpowers/plans/2026-05-09-investigations-edit-log-phase-a.md`.
- Phase A.5 plan: `docs/superpowers/plans/2026-05-09-investigations-edit-log-phase-a5-hotfix.md`.

## File structure

**Modified:**
- `src/server/investigations/entity-config.ts` — add `adminOnlyOnUpdate: Set<string>` to `EntityConfig`; populate `slug` for `datacenter` and `brand`.
- `src/server/investigations/entity-config.test.ts` — extend assertions for the new set.
- `src/server/investigations/entity-config-drift.test.ts` — extend drift coverage.
- `src/server/investigations/validate.ts` — `validateAdminOnlyFields` takes an `op` parameter.
- `src/server/investigations/validate.test.ts` — update tests to cover `op='create'` vs `op='update'` admin-field behaviour.
- `src/server/investigations/recorded-write.ts` — pass `op` into `validateAdminOnlyFields`.
- `src/server/api/routers/datacenters.ts` — add eight new procedures.

**Created:**
- `src/server/investigations/test-db.ts` — pglite-backed test helper.
- `src/server/investigations/recorded-write.test.ts` — integration tests for the wrapper.

**New tRPC procedures** (all on the `datacenters` router; could be split later if it grows past ~3000 lines):
- `updateDatacenter`
- `updateBrand`
- `updateSupplierLink`
- `proposeSubsidy`
- `proposePermit`
- `proposeEnergyDeal`
- `proposeOwnershipEdge`
- `addStatusHistory`

**Out of scope (Phase C):**
- Vote / dispute procs (`voteEdit`, `editFeed`, `editById`, `myEdits`, `editsForEntity`).
- Admin tiebreak (`resolveEdit`, `banUser`, `massRevert`).
- Frontend dispute panels.
- MCP tools.

---

## Task 1: Add `adminOnlyOnUpdate` to entity config

**Files:**
- Modify: `src/server/investigations/entity-config.ts`
- Modify: `src/server/investigations/entity-config.test.ts`

- [ ] **Step 1: Extend the `EntityConfig` interface and seed defaults**

In `src/server/investigations/entity-config.ts`, change the interface:

```ts
export interface EntityConfig {
  table: PgTable;
  pkColumn: "id";
  factualFields: Set<string>;
  adminOnlyFields: Set<string>;        // blocked for non-admins on every op
  adminOnlyOnUpdate: Set<string>;      // additionally blocked on update only
  editableFields: Set<string>;
}
```

For each entity in `ENTITY_CONFIG`, add `adminOnlyOnUpdate`. Default is `new Set()`. Two entities get a populated set:

- `datacenter`: `adminOnlyOnUpdate: new Set(["slug"])` (slug is set on create by users; rotating it post-create is admin-only because it would break URLs).
- `brand`: `adminOnlyOnUpdate: new Set(["slug"])` (same rationale).

All other entities: `adminOnlyOnUpdate: new Set([])`.

- [ ] **Step 2: Update the entity-config tests**

In `src/server/investigations/entity-config.test.ts`, add assertions:

```ts
it("admin-only-on-update fields are also in editable fields", () => {
  for (const t of ENTITY_TYPES) {
    const cfg = ENTITY_CONFIG[t];
    for (const f of cfg.adminOnlyOnUpdate) {
      expect(cfg.editableFields.has(f)).toBe(true);
    }
  }
});

it("datacenter locks slug on update", () => {
  expect(ENTITY_CONFIG.datacenter.adminOnlyOnUpdate.has("slug")).toBe(true);
});

it("brand locks slug on update", () => {
  expect(ENTITY_CONFIG.brand.adminOnlyOnUpdate.has("slug")).toBe(true);
});
```

- [ ] **Step 3: Extend the drift test**

In `src/server/investigations/entity-config-drift.test.ts`, add a fourth assertion block per entity that mirrors the existing factualFields / editableFields / adminOnlyFields ones, for `adminOnlyOnUpdate`:

```ts
it(`${entityType}: every adminOnlyOnUpdate entry is a real column`, () => {
  const missing: string[] = [];
  for (const field of cfg.adminOnlyOnUpdate) {
    if (!realColumns.has(field)) missing.push(field);
  }
  expect(missing).toEqual([]);
});
```

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm test src/server/investigations
pnpm typecheck
```
Expected: 50 prior tests + 3 new entity-config tests + 9 new drift tests = 62 total green; 0 typecheck errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/investigations/entity-config.ts src/server/investigations/entity-config.test.ts src/server/investigations/entity-config-drift.test.ts
git commit -m "feat(investigations): adminOnlyOnUpdate split for create-vs-update gating"
```

---

## Task 2: Wire `adminOnlyOnUpdate` into the validators and wrapper

**Files:**
- Modify: `src/server/investigations/validate.ts`
- Modify: `src/server/investigations/validate.test.ts`
- Modify: `src/server/investigations/recorded-write.ts`

- [ ] **Step 1: Update `validateAdminOnlyFields` signature**

Change the function in `src/server/investigations/validate.ts`:

```ts
export function validateAdminOnlyFields(
  cfg: EntityConfig,
  patch: Record<string, unknown>,
  ctx: { isAdmin: boolean; op: Op },
): void {
  if (ctx.isAdmin) return;
  const blocked =
    ctx.op === "update"
      ? new Set([...cfg.adminOnlyFields, ...cfg.adminOnlyOnUpdate])
      : cfg.adminOnlyFields;
  for (const key of Object.keys(patch)) {
    if (blocked.has(key)) {
      throw new AdminOnlyFieldError(key);
    }
  }
}
```

- [ ] **Step 2: Update `validateAdminOnlyFields` tests**

In `src/server/investigations/validate.test.ts`, every existing call to `validateAdminOnlyFields(...)` must now pass `op`. Update the three existing tests to pass `op: "create"` (preserves current behaviour) and add three new tests:

```ts
it("blocks adminOnlyOnUpdate field on update for non-admin", () => {
  expect(() =>
    validateAdminOnlyFields(
      dcCfg,
      { slug: "renamed" },
      { isAdmin: false, op: "update" },
    ),
  ).toThrow(AdminOnlyFieldError);
});

it("allows adminOnlyOnUpdate field on create for non-admin", () => {
  expect(() =>
    validateAdminOnlyFields(
      dcCfg,
      { slug: "newdc" },
      { isAdmin: false, op: "create" },
    ),
  ).not.toThrow();
});

it("allows adminOnlyOnUpdate field on update for admin", () => {
  expect(() =>
    validateAdminOnlyFields(
      dcCfg,
      { slug: "renamed" },
      { isAdmin: true, op: "update" },
    ),
  ).not.toThrow();
});
```

- [ ] **Step 3: Update `recorded-write.ts` callers**

Two call sites (one in `recordedCreate`, one in `recordedUpdate`). Update each to pass the new `ctx`:

`recordedCreate`:
```ts
validateAdminOnlyFields(cfg, args.values, { isAdmin: ctx.isAdmin, op: "create" });
```

`recordedUpdate`:
```ts
validateAdminOnlyFields(cfg, args.patch, { isAdmin: ctx.isAdmin, op: "update" });
```

- [ ] **Step 4: Tests + typecheck**

```bash
pnpm test src/server/investigations
pnpm typecheck
```
Expected: 65 tests green (add 3 new validator tests). 0 typecheck errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/investigations/validate.ts src/server/investigations/validate.test.ts src/server/investigations/recorded-write.ts
git commit -m "feat(investigations): wire adminOnlyOnUpdate into validator and wrapper"
```

---

## Task 3: pglite test-db helper

**Files:**
- Create: `src/server/investigations/test-db.ts`

- [ ] **Step 1: Add the pglite dependencies**

```bash
pnpm add -D @electric-sql/pglite drizzle-orm @types/pg
```

`drizzle-orm` is already a dep — `pnpm add -D` will deduplicate. `@types/pg` is required by some Drizzle pglite glue; add it if missing.

- [ ] **Step 2: Write the helper**

Create `src/server/investigations/test-db.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";

import * as schema from "@/server/db/schema";

/**
 * Build an ephemeral, in-memory Postgres database with the same `app` schema
 * the production app uses. Each call returns an isolated DB — caller is
 * responsible for tearing it down (await client.close()).
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Replicate the migration's `app` schema and the subset of tables this
  // suite needs. We deliberately do NOT run the production migrations file —
  // pglite is a different runtime from neon and several payload migrations
  // contain neon-specific quirks. Instead we apply only the schema we test.
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS app;`);
  await db.execute(sql`
    CREATE TABLE app."user" (
      id text PRIMARY KEY,
      name text NOT NULL DEFAULT 'test'
    );
  `);
  await db.execute(sql`
    CREATE TABLE app.brand (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL UNIQUE,
      canonical_name text NOT NULL,
      aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
      website text,
      category_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
      commitment_renewable_pct numeric,
      commitment_target_year integer,
      commitment_source_url text,
      commitment_notes text,
      jurisdiction text,
      jurisdiction_region text,
      entity_type text,
      ultimate_beneficial_owner text,
      verified boolean NOT NULL DEFAULT false,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE TABLE app.investigation_edit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      op text NOT NULL,
      patch jsonb NOT NULL,
      "before" jsonb,
      sources jsonb NOT NULL DEFAULT '[]'::jsonb,
      user_id text REFERENCES app."user"(id) ON DELETE SET NULL,
      agent_id text,
      status text NOT NULL DEFAULT 'live',
      true_votes integer NOT NULL DEFAULT 0,
      false_votes integer NOT NULL DEFAULT 0,
      reverted_by_edit_id uuid,
      resolved_by_user_id text,
      resolved_at timestamp with time zone,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    );
  `);

  // Seed one user — every wrapper call expects a real userId.
  await db.execute(sql`
    INSERT INTO app."user" (id, name) VALUES ('test-user-1', 'Test User');
  `);

  return { db, client };
}
```

> Note: this helper deliberately scopes the schema to the tables the wrapper actually touches in tests (`brand`, `investigation_edit`, `user`). Adding more tables (datacenters, suppliers, etc.) is straightforward when a test needs them — copy from `src/server/db/schema.ts` columns. Keep the helper lean.

- [ ] **Step 3: Smoke-check the helper**

Add a single sanity test inside the helper file (this exercises the import surface without committing the file as a test-only file):

Actually keep the helper as a non-test module; the smoke comes from the integration tests in Task 4 which import it. Skip.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```
Expected: 0 errors. If `drizzle-orm/pglite` import fails, double-check the installed drizzle-orm version supports it (≥ 0.30 — repo is on 0.41 per package.json). If the pg-orm version doesn't expose `pglite`, fall back to:
```ts
import { drizzle } from "drizzle-orm/pg-proxy";
```
and report DONE_WITH_CONCERNS — the controller will pin a compatible version.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/server/investigations/test-db.ts
git commit -m "feat(investigations): pglite-backed test-db helper for wrapper integration tests"
```

---

## Task 4: Integration tests for `recordedCreate` / `recordedUpdate` / `recordedDelete`

**Files:**
- Create: `src/server/investigations/recorded-write.test.ts`

The pure unit tests in Phase A cover validators and rate limit. These integration tests cover the parts that require real SQL: transaction discipline, before-snapshot accuracy, FK behaviours, and end-to-end edit-log row creation.

- [ ] **Step 1: Write the integration tests**

Create `src/server/investigations/recorded-write.test.ts`. Each test uses the `createTestDb()` helper and exercises the wrapper through the Drizzle client. Use `brand` as the test entity since it has the smallest column footprint and a representative shape (factual, editable, admin-only, adminOnlyOnUpdate fields).

```ts
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import {
  brands as _brands,
  investigationEdit as _investigationEdit,
} from "@/server/db/schema";
import {
  recordedCreate,
  recordedUpdate,
  recordedDelete,
} from "./recorded-write";
import { createTestDb } from "./test-db";
import {
  __resetInvestigationLimits,
  EDIT_LIMIT_PER_HOUR,
} from "./rate-limit";

afterEach(() => {
  __resetInvestigationLimits();
});

describe("recordedCreate (integration)", () => {
  it("inserts both canonical and edit row in a single transaction", async () => {
    const { db, client } = await createTestDb();
    try {
      const result = await recordedCreate(
        { userId: "test-user-1", isAdmin: false, db: db as never },
        {
          entityType: "brand",
          values: { slug: "acme", canonicalName: "Acme Inc" },
          sources: [{ url: "https://acme.example" }],
        },
      );
      expect(result.entity.id).toBeTruthy();
      expect(result.editId).toBeTruthy();

      const brandRows = await db.execute(
        sql`SELECT slug, canonical_name FROM app.brand WHERE id = ${result.entity.id}`,
      );
      expect(brandRows.rows).toHaveLength(1);
      expect(brandRows.rows[0]).toMatchObject({
        slug: "acme",
        canonical_name: "Acme Inc",
      });

      const editRows = await db.execute(
        sql`SELECT op, status, entity_type, sources FROM app.investigation_edit WHERE id = ${result.editId}`,
      );
      expect(editRows.rows[0]).toMatchObject({
        op: "create",
        status: "live",
        entity_type: "brand",
      });
    } finally {
      await client.close();
    }
  });

  it("rejects empty sources on create with BAD_REQUEST", async () => {
    const { db, client } = await createTestDb();
    try {
      await expect(
        recordedCreate(
          { userId: "test-user-1", isAdmin: false, db: db as never },
          {
            entityType: "brand",
            values: { slug: "noref", canonicalName: "No Ref" },
            sources: [],
          },
        ),
      ).rejects.toThrow(/source URL is required/);

      // Verify nothing was written.
      const rows = await db.execute(
        sql`SELECT count(*)::int as n FROM app.brand`,
      );
      expect((rows.rows[0] as { n: number }).n).toBe(0);
    } finally {
      await client.close();
    }
  });

  it("rejects admin-only field for non-admin", async () => {
    const { db, client } = await createTestDb();
    try {
      await expect(
        recordedCreate(
          { userId: "test-user-1", isAdmin: false, db: db as never },
          {
            entityType: "brand",
            values: {
              slug: "verified-anon",
              canonicalName: "X",
              verified: true,
            },
            sources: [{ url: "https://x.example" }],
          },
        ),
      ).rejects.toThrow(/Field requires admin: verified/);
    } finally {
      await client.close();
    }
  });

  it("hits TOO_MANY_REQUESTS at the rate limit", async () => {
    const { db, client } = await createTestDb();
    try {
      for (let i = 0; i < EDIT_LIMIT_PER_HOUR; i++) {
        await recordedCreate(
          { userId: "rate-user", isAdmin: false, db: db as never },
          {
            entityType: "brand",
            values: { slug: `rate-${i}`, canonicalName: `R${i}` },
            sources: [{ url: "https://r.example" }],
          },
        );
      }
      await expect(
        recordedCreate(
          { userId: "rate-user", isAdmin: false, db: db as never },
          {
            entityType: "brand",
            values: { slug: "overflow", canonicalName: "Over" },
            sources: [{ url: "https://o.example" }],
          },
        ),
      ).rejects.toThrow(/rate limit/);
    } finally {
      await client.close();
    }
  });
});

describe("recordedUpdate (integration)", () => {
  it("captures sparse before snapshot and applies patch", async () => {
    const { db, client } = await createTestDb();
    try {
      const create = await recordedCreate(
        { userId: "test-user-1", isAdmin: false, db: db as never },
        {
          entityType: "brand",
          values: {
            slug: "u1",
            canonicalName: "Original",
            jurisdiction: "US",
          },
          sources: [{ url: "https://x.example" }],
        },
      );

      const update = await recordedUpdate(
        { userId: "test-user-1", isAdmin: false, db: db as never },
        {
          entityType: "brand",
          entityId: create.entity.id,
          patch: { jurisdiction: "DE" },
          sources: [{ url: "https://x.example/de" }],
        },
      );

      const editRows = await db.execute(
        sql`SELECT op, "before", patch FROM app.investigation_edit WHERE id = ${update.editId}`,
      );
      const row = editRows.rows[0] as {
        op: string;
        before: Record<string, unknown>;
        patch: Record<string, unknown>;
      };
      expect(row.op).toBe("update");
      expect(row.before).toEqual({ jurisdiction: "US" });
      expect(row.patch).toEqual({ jurisdiction: "DE" });
    } finally {
      await client.close();
    }
  });

  it("rejects update of admin-only-on-update field for non-admin", async () => {
    const { db, client } = await createTestDb();
    try {
      const create = await recordedCreate(
        { userId: "test-user-1", isAdmin: false, db: db as never },
        {
          entityType: "brand",
          values: { slug: "before", canonicalName: "B" },
          sources: [{ url: "https://b.example" }],
        },
      );
      await expect(
        recordedUpdate(
          { userId: "test-user-1", isAdmin: false, db: db as never },
          {
            entityType: "brand",
            entityId: create.entity.id,
            patch: { slug: "after" },
            sources: [{ url: "https://b.example/r" }],
          },
        ),
      ).rejects.toThrow(/Field requires admin: slug/);
    } finally {
      await client.close();
    }
  });

  it("rejects factual update with no sources", async () => {
    const { db, client } = await createTestDb();
    try {
      const create = await recordedCreate(
        { userId: "test-user-1", isAdmin: false, db: db as never },
        {
          entityType: "brand",
          values: { slug: "f", canonicalName: "F" },
          sources: [{ url: "https://f.example" }],
        },
      );
      await expect(
        recordedUpdate(
          { userId: "test-user-1", isAdmin: false, db: db as never },
          {
            entityType: "brand",
            entityId: create.entity.id,
            patch: { canonicalName: "F2" },
            sources: [],
          },
        ),
      ).rejects.toThrow(/source URL is required/);
    } finally {
      await client.close();
    }
  });

  it("returns NOT_FOUND for unknown entityId", async () => {
    const { db, client } = await createTestDb();
    try {
      await expect(
        recordedUpdate(
          { userId: "test-user-1", isAdmin: false, db: db as never },
          {
            entityType: "brand",
            entityId: "00000000-0000-0000-0000-000000000000",
            patch: { canonicalName: "X" },
            sources: [{ url: "https://x.example" }],
          },
        ),
      ).rejects.toThrow(/not found/i);
    } finally {
      await client.close();
    }
  });
});

describe("recordedDelete (integration)", () => {
  it("admin can delete; edit row captures full before snapshot", async () => {
    const { db, client } = await createTestDb();
    try {
      const create = await recordedCreate(
        { userId: "admin-user", isAdmin: true, db: db as never },
        {
          entityType: "brand",
          values: { slug: "del", canonicalName: "Del" },
          sources: [{ url: "https://d.example" }],
        },
      );
      const del = await recordedDelete(
        { userId: "admin-user", isAdmin: true, db: db as never },
        { entityType: "brand", entityId: create.entity.id, reason: "merge" },
      );

      const brandRows = await db.execute(
        sql`SELECT count(*)::int as n FROM app.brand WHERE id = ${create.entity.id}`,
      );
      expect((brandRows.rows[0] as { n: number }).n).toBe(0);

      const editRows = await db.execute(
        sql`SELECT op, "before" FROM app.investigation_edit WHERE id = ${del.editId}`,
      );
      const row = editRows.rows[0] as {
        op: string;
        before: { slug: string; canonical_name: string };
      };
      expect(row.op).toBe("delete");
      expect(row.before.slug).toBe("del");
    } finally {
      await client.close();
    }
  });

  it("non-admin gets FORBIDDEN", async () => {
    const { db, client } = await createTestDb();
    try {
      const create = await recordedCreate(
        { userId: "test-user-1", isAdmin: false, db: db as never },
        {
          entityType: "brand",
          values: { slug: "fb", canonicalName: "Fb" },
          sources: [{ url: "https://fb.example" }],
        },
      );
      await expect(
        recordedDelete(
          { userId: "test-user-1", isAdmin: false, db: db as never },
          { entityType: "brand", entityId: create.entity.id, reason: "x" },
        ),
      ).rejects.toThrow(/admin/i);
    } finally {
      await client.close();
    }
  });
});
```

The `db as never` cast is a deliberate workaround because the wrapper's `RecordedWriteCtx.db` is typed against the production `db` instance and the pglite client is a different (but compatible-at-runtime) shape.

- [ ] **Step 2: Run the new integration tests**

```bash
pnpm test src/server/investigations/recorded-write.test.ts
```
Expected: PASS — all integration tests green. If pglite fails to import or initialize, fall back to skipping the test file with a TODO and report DONE_WITH_CONCERNS.

- [ ] **Step 3: Run the full investigations suite**

```bash
pnpm test src/server/investigations
```
Expected: 65 prior + 9 new = 74 tests green.

- [ ] **Step 4: Commit**

```bash
git add src/server/investigations/recorded-write.test.ts
git commit -m "test(investigations): integration tests for recordedCreate/Update/Delete via pglite"
```

---

## Task 5: `proposeSubsidy` procedure

**Files:**
- Modify: `src/server/api/routers/datacenters.ts`

- [ ] **Step 1: Add the procedure**

In `src/server/api/routers/datacenters.ts`, add a new procedure inside the existing `createTRPCRouter({ ... })`. Place it grouped with other write procs (near `createBrand`/`addSupplier`):

```ts
proposeSubsidy: protectedProcedure
  .input(
    z.object({
      datacenterId: z.string().uuid().optional(),
      recipientBrandId: z.string().uuid().optional(),
      kind: z.enum(SUBSIDY_KINDS),
      awardedBy: z.string().min(1).max(200),
      jurisdiction: z.string().min(1).max(200),
      amountUsd: z.number().nonnegative().optional(),
      announcedDate: z.string().optional(),
      effectiveDate: z.string().optional(),
      termYears: z.number().int().nonnegative().optional(),
      claimedJobs: z.number().int().nonnegative().optional(),
      claimedCapexUsd: z.number().nonnegative().optional(),
      sources: z.array(sourceSchema).min(1).max(20),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const role = (ctx.session.user as { role?: string }).role;
    const result = await recordedCreate(
      { userId: ctx.session.user.id, isAdmin: role === "admin", db: ctx.db },
      {
        entityType: "subsidy",
        values: {
          datacenterId: input.datacenterId,
          recipientBrandId: input.recipientBrandId,
          kind: input.kind,
          awardedBy: input.awardedBy,
          jurisdiction: input.jurisdiction,
          amountUsd: input.amountUsd,
          announcedDate: input.announcedDate,
          effectiveDate: input.effectiveDate,
          termYears: input.termYears,
          claimedJobs: input.claimedJobs,
          claimedCapexUsd: input.claimedCapexUsd,
          sources: input.sources satisfies DatacenterSource[],
        },
        sources: input.sources,
      },
    );
    return { id: result.entity.id };
  }),
```

`SUBSIDY_KINDS` is already exported from `src/server/db/schema.ts`. Ensure it is in the existing import block in this file — if not, add it.

`verified` is admin-only and not passed; defaults to `false`.

- [ ] **Step 2: Typecheck and tests**

```bash
pnpm typecheck
pnpm test src/server/investigations
```
Expected: 0 errors. Tests still 74/74.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/datacenters.ts
git commit -m "feat(investigations): proposeSubsidy procedure routed through wrapper"
```

---

## Task 6: `proposePermit` procedure

**Files:**
- Modify: `src/server/api/routers/datacenters.ts`

- [ ] **Step 1: Add the procedure**

```ts
proposePermit: protectedProcedure
  .input(
    z.object({
      datacenterId: z.string().uuid(),
      kind: z.enum(PERMIT_KINDS),
      issuingBody: z.string().min(1).max(200),
      appliedDate: z.string().optional(),
      issuedDate: z.string().optional(),
      status: z.enum(PERMIT_STATUS).default("granted"),
      sources: z.array(sourceSchema).min(1).max(20),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const role = (ctx.session.user as { role?: string }).role;
    const result = await recordedCreate(
      { userId: ctx.session.user.id, isAdmin: role === "admin", db: ctx.db },
      {
        entityType: "permit",
        values: {
          datacenterId: input.datacenterId,
          kind: input.kind,
          issuingBody: input.issuingBody,
          appliedDate: input.appliedDate,
          issuedDate: input.issuedDate,
          status: input.status,
          sources: input.sources satisfies DatacenterSource[],
        },
        sources: input.sources,
      },
    );
    return { id: result.entity.id };
  }),
```

`PERMIT_KINDS` and `PERMIT_STATUS` are already exported from `schema.ts`; ensure they are imported.

- [ ] **Step 2: Typecheck and tests**

```bash
pnpm typecheck
pnpm test src/server/investigations
```
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/datacenters.ts
git commit -m "feat(investigations): proposePermit procedure routed through wrapper"
```

---

## Task 7: `proposeEnergyDeal` procedure

**Files:**
- Modify: `src/server/api/routers/datacenters.ts`

- [ ] **Step 1: Add the procedure**

```ts
proposeEnergyDeal: protectedProcedure
  .input(
    z.object({
      title: z.string().min(2).max(300),
      datacenterId: z.string().uuid().optional(),
      buyerId: z.string().uuid(),
      counterpartyId: z.string().uuid(),
      type: z.string().min(1).max(80),
      energyType: z.string().max(80).optional(),
      mw: z.number().nonnegative().optional(),
      termYears: z.number().nonnegative().optional(),
      signedDate: z.string().optional(),
      startDate: z.string().optional(),
      valueUsd: z.number().nonnegative().optional(),
      sources: z.array(sourceSchema).min(1).max(20),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const role = (ctx.session.user as { role?: string }).role;
    const result = await recordedCreate(
      { userId: ctx.session.user.id, isAdmin: role === "admin", db: ctx.db },
      {
        entityType: "energy_deal",
        values: {
          title: input.title,
          datacenterId: input.datacenterId,
          buyerId: input.buyerId,
          counterpartyId: input.counterpartyId,
          type: input.type,
          energyType: input.energyType,
          mw: input.mw,
          termYears: input.termYears,
          signedDate: input.signedDate,
          startDate: input.startDate,
          valueUsd: input.valueUsd,
          sources: input.sources satisfies DatacenterSource[],
        },
        sources: input.sources,
      },
    );
    return { id: result.entity.id };
  }),
```

- [ ] **Step 2: Typecheck and tests; commit**

```bash
pnpm typecheck
pnpm test src/server/investigations
git add src/server/api/routers/datacenters.ts
git commit -m "feat(investigations): proposeEnergyDeal procedure routed through wrapper"
```

---

## Task 8: `proposeOwnershipEdge` procedure

**Files:**
- Modify: `src/server/api/routers/datacenters.ts`

- [ ] **Step 1: Add the procedure**

```ts
proposeOwnershipEdge: protectedProcedure
  .input(
    z.object({
      parentBrandId: z.string().uuid(),
      childBrandId: z.string().uuid(),
      ownershipPct: z.number().min(0).max(100).optional(),
      effectiveFrom: z.string().optional(),
      effectiveTo: z.string().optional(),
      sourceUrl: z.string().url(),
      notes: z.string().max(2000).optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    if (input.parentBrandId === input.childBrandId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "parent and child brand must differ",
      });
    }
    const role = (ctx.session.user as { role?: string }).role;
    const result = await recordedCreate(
      { userId: ctx.session.user.id, isAdmin: role === "admin", db: ctx.db },
      {
        entityType: "ownership_edge",
        values: {
          parentBrandId: input.parentBrandId,
          childBrandId: input.childBrandId,
          ownershipPct: input.ownershipPct,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          sourceUrl: input.sourceUrl,
          notes: input.notes,
        },
        sources: [{ url: input.sourceUrl }],
      },
    );
    return { id: result.entity.id };
  }),
```

> Note: `ownership_edge` is the one entity that doesn't have a `sources jsonb`; it has a singular `sourceUrl` text. We adapt by lifting `sourceUrl` into the wrapper's `sources` array so the citation rule still works.

- [ ] **Step 2: Typecheck/tests/commit**

```bash
pnpm typecheck
pnpm test src/server/investigations
git add src/server/api/routers/datacenters.ts
git commit -m "feat(investigations): proposeOwnershipEdge procedure routed through wrapper"
```

---

## Task 9: `addStatusHistory` procedure

**Files:**
- Modify: `src/server/api/routers/datacenters.ts`

- [ ] **Step 1: Add the procedure**

```ts
addStatusHistory: protectedProcedure
  .input(
    z.object({
      datacenterId: z.string().uuid(),
      status: z.enum(DATACENTER_STATUS),
      effectiveDate: z.string().min(1),
      sourceUrl: z.string().url(),
      notes: z.string().max(2000).optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const role = (ctx.session.user as { role?: string }).role;
    const result = await recordedCreate(
      { userId: ctx.session.user.id, isAdmin: role === "admin", db: ctx.db },
      {
        entityType: "datacenter_status_history",
        values: {
          datacenterId: input.datacenterId,
          status: input.status,
          effectiveDate: input.effectiveDate,
          sourceUrl: input.sourceUrl,
          notes: input.notes,
        },
        sources: [{ url: input.sourceUrl }],
      },
    );
    return { id: result.entity.id };
  }),
```

`DATACENTER_STATUS` is already imported in this router file from Phase A.

- [ ] **Step 2: Typecheck/tests/commit**

```bash
pnpm typecheck
pnpm test src/server/investigations
git add src/server/api/routers/datacenters.ts
git commit -m "feat(investigations): addStatusHistory procedure routed through wrapper"
```

---

## Task 10: `updateDatacenter` procedure

**Files:**
- Modify: `src/server/api/routers/datacenters.ts`

The update procs accept a partial patch — every field is optional. The wrapper enforces field whitelist, admin-only checks (now including `slug` for non-admins), and the citation rule.

- [ ] **Step 1: Add the procedure**

```ts
updateDatacenter: protectedProcedure
  .input(
    z.object({
      id: z.string().uuid(),
      patch: z
        .object({
          name: z.string().min(2).max(200).optional(),
          slug: z.string().min(2).max(100).regex(SLUG_RE).optional(),
          operatorId: z.string().uuid().optional(),
          utilityId: z.string().uuid().optional(),
          status: z.enum(DATACENTER_STATUS).optional(),
          aiDedicated: z.boolean().optional(),
          lat: z.number().min(-90).max(90).optional(),
          lng: z.number().min(-180).max(180).optional(),
          address: z.string().max(300).optional(),
          city: z.string().max(120).optional(),
          region: z.string().max(120).optional(),
          country: z.string().length(2).toUpperCase().optional(),
          capacityMw: z.number().nonnegative().optional(),
          capacityMwPlanned: z.number().nonnegative().optional(),
          squareFootage: z.number().nonnegative().optional(),
          rackCount: z.number().int().nonnegative().optional(),
          gpus: z.array(gpuSchema).max(20).optional(),
          primaryPowerSource: z.enum(POWER_SOURCE).optional(),
          coolingType: z.enum(COOLING_TYPE).optional(),
          puePledged: z.number().positive().optional(),
          waterDrawMgd: z.number().nonnegative().optional(),
          waterDrawCubicM: z.number().nonnegative().optional(),
          wuePledged: z.number().nonnegative().optional(),
          announcedDate: z.string().optional(),
          groundbreakDate: z.string().optional(),
          onlineDate: z.string().optional(),
          fullCapacityDate: z.string().optional(),
          capexUsd: z.number().nonnegative().optional(),
          description: z.string().max(5000).optional(),
        })
        .refine((p) => Object.keys(p).length > 0, {
          message: "patch must contain at least one field",
        }),
      sources: z.array(sourceSchema).max(20).default([]),
      reason: z.string().max(500).optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const role = (ctx.session.user as { role?: string }).role;
    const result = await recordedUpdate(
      { userId: ctx.session.user.id, isAdmin: role === "admin", db: ctx.db },
      {
        entityType: "datacenter",
        entityId: input.id,
        patch: input.patch as Record<string, unknown>,
        sources: input.sources,
        reason: input.reason,
      },
    );
    return { id: result.entity.id, editId: result.editId };
  }),
```

`recordedUpdate` is exported alongside `recordedCreate` — add it to the existing import line at the top of the file:

```ts
import {
  recordedCreate,
  recordedUpdate,
} from "@/server/investigations/recorded-write";
```

- [ ] **Step 2: Typecheck/tests/commit**

```bash
pnpm typecheck
pnpm test src/server/investigations
git add src/server/api/routers/datacenters.ts
git commit -m "feat(investigations): updateDatacenter procedure routed through wrapper"
```

---

## Task 11: `updateBrand` procedure

**Files:**
- Modify: `src/server/api/routers/datacenters.ts`

- [ ] **Step 1: Add the procedure**

```ts
updateBrand: protectedProcedure
  .input(
    z.object({
      id: z.string().uuid(),
      patch: z
        .object({
          slug: z.string().min(2).max(80).regex(SLUG_RE).optional(),
          canonicalName: z.string().min(2).max(120).optional(),
          aliases: z.array(z.string().max(120)).max(20).optional(),
          website: z.string().url().optional(),
          jurisdiction: z.string().max(80).optional(),
          jurisdictionRegion: z.string().max(80).optional(),
          entityType: z.string().max(80).optional(),
          ultimateBeneficialOwner: z.string().max(200).optional(),
          commitmentRenewablePct: z.number().min(0).max(100).optional(),
          commitmentTargetYear: z.number().int().min(2000).max(2100).optional(),
          commitmentSourceUrl: z.string().url().optional(),
          commitmentNotes: z.string().max(2000).optional(),
        })
        .refine((p) => Object.keys(p).length > 0, {
          message: "patch must contain at least one field",
        }),
      sources: z.array(sourceSchema).max(20).default([]),
      reason: z.string().max(500).optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const role = (ctx.session.user as { role?: string }).role;
    const result = await recordedUpdate(
      { userId: ctx.session.user.id, isAdmin: role === "admin", db: ctx.db },
      {
        entityType: "brand",
        entityId: input.id,
        patch: input.patch as Record<string, unknown>,
        sources: input.sources,
        reason: input.reason,
      },
    );
    return { id: result.entity.id, editId: result.editId };
  }),
```

- [ ] **Step 2: Typecheck/tests/commit**

```bash
pnpm typecheck
pnpm test src/server/investigations
git add src/server/api/routers/datacenters.ts
git commit -m "feat(investigations): updateBrand procedure routed through wrapper"
```

---

## Task 12: `updateSupplierLink` procedure

**Files:**
- Modify: `src/server/api/routers/datacenters.ts`

- [ ] **Step 1: Add the procedure**

```ts
updateSupplierLink: protectedProcedure
  .input(
    z.object({
      id: z.string().uuid(),
      patch: z
        .object({
          role: z.string().max(200).optional(),
          contractValueUsd: z.number().nonnegative().optional(),
          isLocal: z.boolean().optional(),
        })
        .refine((p) => Object.keys(p).length > 0, {
          message: "patch must contain at least one field",
        }),
      sources: z.array(sourceSchema).max(20).default([]),
      reason: z.string().max(500).optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const role = (ctx.session.user as { role?: string }).role;
    const result = await recordedUpdate(
      { userId: ctx.session.user.id, isAdmin: role === "admin", db: ctx.db },
      {
        entityType: "datacenter_supplier",
        entityId: input.id,
        patch: input.patch as Record<string, unknown>,
        sources: input.sources,
        reason: input.reason,
      },
    );
    return { id: result.entity.id, editId: result.editId };
  }),
```

> Note: `category`, `datacenterId`, `supplierId` are intentionally NOT in the update patch — those define the row's identity. Changing them should be done by deleting and re-creating.

- [ ] **Step 2: Typecheck/tests/commit**

```bash
pnpm typecheck
pnpm test src/server/investigations
git add src/server/api/routers/datacenters.ts
git commit -m "feat(investigations): updateSupplierLink procedure routed through wrapper"
```

---

## Task 13: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Run all checks**

```bash
pnpm typecheck
pnpm lint
pnpm test src/server/investigations
```

Expected: 0 typecheck errors, 0 lint warnings, 74/74 investigation tests green.

- [ ] **Step 2: Confirm router export surface**

Open `src/server/api/routers/datacenters.ts` and verify the new procedures appear in the router and are exposed via the tRPC tree. Use a quick consumer-side typecheck:

```bash
grep -n "proposeSubsidy\|proposePermit\|proposeEnergyDeal\|proposeOwnershipEdge\|addStatusHistory\|updateDatacenter\|updateBrand\|updateSupplierLink" src/server/api/routers/datacenters.ts
```

Expected: each name appears at least once (the procedure declaration itself).

- [ ] **Step 3: Manual smoke (optional, deferred to user)**

For each new procedure, the recommended manual smoke is:
1. Open Postman or the in-app tRPC dev panel.
2. Call the procedure with valid input as a non-admin → expect a row in `app.investigation_edit` with the right `entity_type` and `op`.
3. Call again with a deliberately bad payload (missing source, admin-only field, etc.) → expect the matching `BAD_REQUEST` / `FORBIDDEN`.

This is documented as a Phase B follow-up — automated coverage would require either expanding the pglite test-DB to include all entity tables (mechanical), or wiring tRPC integration tests against the actual `caller`. Defer to a Phase B+ cleanup pass.

---

## Acceptance criteria for Phase B

- `EntityConfig.adminOnlyOnUpdate` exists and is honoured by the wrapper.
- Five new propose procedures and three new update procedures live on the `datacenters` tRPC router.
- All new procs route through `recordedCreate` / `recordedUpdate` — no direct INSERT/UPDATE on canonical investigation tables.
- pglite-backed integration tests exist for `recordedCreate` / `recordedUpdate` / `recordedDelete`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test src/server/investigations` all pass.

## Phase C preview

Phase C will land: voting (`voteEdit`), edit feeds (`editFeed`, `editById`, `editsForEntity`, `myEdits`), admin tiebreak (`resolveEdit`, `banUser`, `massRevert`), notification kinds, and the `revertEdit` helper that closes the dispute loop. Frontend dispute panels are also Phase C.
