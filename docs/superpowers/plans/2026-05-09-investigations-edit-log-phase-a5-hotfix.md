# Investigations Edit Log — Phase A.5 Hotfix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the supplier-add UX broken by Phase A's citation rule, and add a cheap regression-prevention test that verifies the entity-config field whitelists agree with the actual Drizzle schema columns. Lands before Phase B grows the wrapper's surface.

**Architecture:** Two surgical changes. The supplier dialog (`src/components/datacenters/add-supplier-dialog.tsx`) becomes the source-aware form: a single source URL is collected once and reused for both the brand-create (when needed) and the supplier-link create. A new test (`src/server/investigations/entity-config-drift.test.ts`) iterates over every entity in `ENTITY_CONFIG` and asserts every member of `editableFields` is a real column on the corresponding Drizzle table.

**Tech Stack:** TypeScript, Drizzle ORM, React (Radix dialog), Vitest.

---

## Spec / plan reference

- Spec: `docs/superpowers/specs/2026-05-09-investigations-collaborative-editing-design.md`
- Phase A plan: `docs/superpowers/plans/2026-05-09-investigations-edit-log-phase-a.md`
- Final code review (in conversation): flagged C2 (dialog regression) and I2 (schema drift test).

## File structure

**Modified:**
- `src/components/datacenters/add-supplier-dialog.tsx` — make source URL required, pass it to both `createBrand` (as `website` fallback) and `addSupplier`.

**Created:**
- `src/server/investigations/entity-config-drift.test.ts` — pure unit test verifying every `editableFields` entry maps to a real Drizzle column.

**Out of scope:**
- Wrapper integration tests with a real DB — deferred to early Phase B (the spec's Phase B scope already implies broader test surface).
- The new `update*` / `propose*` procs — Phase B.
- The `adminOnlyOnUpdate` field-permission split — Phase B (decided during Phase B planning).

---

## Task 1: Schema-vs-entity-config drift test

**Files:**
- Create: `src/server/investigations/entity-config-drift.test.ts`

This test fails fast at CI time if anyone adds a column to a Drizzle table without updating the entity-config whitelist (or vice versa).

- [ ] **Step 1: Write the failing test**

Create `src/server/investigations/entity-config-drift.test.ts`:

```ts
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ENTITY_CONFIG, ENTITY_TYPES } from "./entity-config";

describe("ENTITY_CONFIG drift vs Drizzle schema", () => {
  for (const entityType of ENTITY_TYPES) {
    const cfg = ENTITY_CONFIG[entityType];
    const realColumns = new Set(Object.keys(getTableColumns(cfg.table)));

    it(`${entityType}: every editableFields entry is a real column`, () => {
      const missing: string[] = [];
      for (const field of cfg.editableFields) {
        if (!realColumns.has(field)) missing.push(field);
      }
      expect(
        missing,
        `Fields in editableFields not present on table: ${missing.join(", ")}`,
      ).toEqual([]);
    });

    it(`${entityType}: every factualFields entry is a real column`, () => {
      const missing: string[] = [];
      for (const field of cfg.factualFields) {
        if (!realColumns.has(field)) missing.push(field);
      }
      expect(missing).toEqual([]);
    });

    it(`${entityType}: every adminOnlyFields entry is a real column`, () => {
      const missing: string[] = [];
      for (const field of cfg.adminOnlyFields) {
        if (!realColumns.has(field)) missing.push(field);
      }
      expect(missing).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm test src/server/investigations/entity-config-drift.test.ts
```
Expected: all 27 tests (9 entities × 3 sets) PASS, because the Phase A entity config was already verified against the schema. If a test fails it means a real drift exists — investigate, then either remove the offending field from the entity-config or rename it to the actual column property.

- [ ] **Step 3: Run the full investigations suite**

```bash
pnpm test src/server/investigations
```
Expected: PASS — 23 prior tests + 27 drift tests = 50 total.

- [ ] **Step 4: Commit**

```bash
git add src/server/investigations/entity-config-drift.test.ts
git commit -m "test(investigations): drift test for entity-config vs Drizzle schema"
```

---

## Task 2: Survey the supplier-add dialog

**Files:**
- Read: `src/components/datacenters/add-supplier-dialog.tsx`

This is a survey task only — no edits yet. The next task makes the changes.

- [ ] **Step 1: Read the current dialog**

```bash
cat src/components/datacenters/add-supplier-dialog.tsx
```

Note where:
- The form fields are declared (likely `useState` calls).
- `createBrand.mutateAsync({ canonicalName })` is called — confirm it does NOT pass `website`.
- `addSupplier.mutateAsync({ ..., sources: ... })` is called — confirm it conditionally passes `[]`.
- The "Source URL (optional)" label appears.

Report the line numbers in your task notes so the next task can target precisely.

- [ ] **Step 2: No commit**

This task only collects information. Move to Task 3.

---

## Task 3: Make source URL required and reuse it for brand-create

**Files:**
- Modify: `src/components/datacenters/add-supplier-dialog.tsx`

This task fixes both regressions in one edit: the brand-create needs a source (use the URL the user is already typing), and the supplier-link create needs `min(1)` sources (the same URL).

- [ ] **Step 1: Tighten the source URL state**

In the dialog component, locate the source URL state — likely something like:

```tsx
const [sourceUrl, setSourceUrl] = useState("");
```

Below it, add a derived validity flag near the other validity flags:

```tsx
const sourceUrlTrimmed = sourceUrl.trim();
const sourceUrlValid =
  sourceUrlTrimmed.length > 0 &&
  /^https?:\/\//.test(sourceUrlTrimmed);
```

- [ ] **Step 2: Block submit when source URL is invalid**

Find the existing `disabled` predicate on the dialog's submit button (`<Button>` or `<button type="submit">`) — there is almost certainly already one combining the other field validations. Add `|| !sourceUrlValid` to the existing `disabled` expression. Example pattern:

```tsx
<Button
  type="submit"
  disabled={
    isSubmitting ||
    !category ||
    !supplier ||
    !sourceUrlValid
  }
>
```

If the existing `disabled` expression has different shape, add the `!sourceUrlValid` clause without changing the others.

- [ ] **Step 3: Update the source URL input copy**

Find the input label `Source URL (optional)` (Phase A 11 review noted it lives near line 224). Change it to `Source URL (required)`. Also add `required` and `aria-required="true"` to the underlying `<input>` for accessibility:

```tsx
<label htmlFor="source-url">Source URL (required)</label>
<input
  id="source-url"
  type="url"
  value={sourceUrl}
  onChange={(e) => setSourceUrl(e.target.value)}
  required
  aria-required="true"
  placeholder="https://example.com/announcement"
/>
```

If the existing JSX uses different prop names or component (e.g. a `<TextField />` wrapper from the design system), keep the existing component but change the label string, add `required={true}`, and ensure `aria-required="true"` is present.

- [ ] **Step 4: Pass the source URL into `createBrand` when creating a new brand**

Find the call site that does (per the Task 10 review):

```tsx
await createBrand.mutateAsync({ canonicalName: ... });
```

Change it to pass `website` so the citation rule is satisfied:

```tsx
await createBrand.mutateAsync({
  canonicalName: ...,
  website: sourceUrlTrimmed,
});
```

The `website` field is part of `createBrand`'s input zod and gets reused as the canonical source by the wrapper.

- [ ] **Step 5: Pass non-empty `sources` to `addSupplier`**

Find the call site that does (per the Task 11 review at line 104):

```tsx
sources: sourceUrl.trim() ? [{ url: sourceUrl.trim() }] : []
```

Change to use the trimmed value unconditionally — the form-level validation guarantees it's non-empty:

```tsx
sources: [{ url: sourceUrlTrimmed }]
```

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```
Expected: 0 errors.

- [ ] **Step 7: Run lint**

```bash
pnpm lint
```
Expected: 0 warnings.

- [ ] **Step 8: Manual smoke through the UI**

Start `pnpm dev`, log in as a non-admin user, navigate to a datacenter detail page, open the "Add supplier" dialog. Verify:

1. Submit button is disabled until both supplier/category and source URL are valid.
2. Adding a brand-new supplier (one not in the DB) succeeds — the brand is created and the supplier link is created in one click. Confirm via:
   ```sql
   SELECT entity_type, op, status FROM app.investigation_edit
   ORDER BY created_at DESC LIMIT 5;
   ```
   Expect two rows: one `brand` create and one `datacenter_supplier` create, both with the URL captured in `sources`.
3. Adding an existing supplier (skipping brand-create) also succeeds.
4. Empty source URL keeps the submit button disabled — no console errors.

If any step fails, debug and re-run.

- [ ] **Step 9: Commit**

```bash
git add src/components/datacenters/add-supplier-dialog.tsx
git commit -m "fix(investigations): supplier dialog requires source URL, reuses it for brand create"
```

---

## Task 4: Final verification

**Files:**
- (Verification only — no edits.)

- [ ] **Step 1: Run all investigations tests**

```bash
pnpm test src/server/investigations
```
Expected: PASS — 50/50.

- [ ] **Step 2: Run typecheck and lint**

```bash
pnpm typecheck
pnpm lint
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Confirm the dialog round-trips one more time**

Repeat the manual smoke from Task 3 step 8 once more from a clean dev server start to make sure no regression slipped in between.

---

## Acceptance criteria for Phase A.5

- The supplier-add dialog cannot be submitted without a valid source URL.
- New-brand creates from the dialog pass `website` so the citation rule is satisfied.
- Supplier-link creates from the dialog pass `[{ url }]` so the wrapper's `min(1)` zod is satisfied.
- `entity-config-drift.test.ts` exists and PASSes.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test src/server/investigations` all pass.

## Phase B preview

Phase B will land: `update-datacenter`, `update-brand`, `update-supplier-link`, `propose-subsidy`, `propose-permit`, `propose-energy-deal`, `propose-ownership-edge`, `add-status-history`. Plus the `adminOnlyOnUpdate` field-permission split (so `slug` can be locked on update without breaking creates), and DB-backed integration tests for `recordedCreate` / `recordedUpdate` / `recordedDelete`.
