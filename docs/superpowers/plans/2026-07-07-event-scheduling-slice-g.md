# Slice G — Audience Foundation (Plan)

Spec: `docs/superpowers/specs/2026-07-07-event-scheduling-conflicts-design.md`
GitHub: epic #195, tasks #200 (T1), #201 (T2), #202 (T3). Branch: `feat/audience-foundation`.

## Global Constraints

- **Migrations are hand-written Payload migrations** in `src/migrations/` applied via `pnpm db:apply` — NEVER `drizzle-kit push` / `db:push`. Every migration: `YYYYMMDD[letter]_snake_name.ts` with `up`/`down` using the `sql` tagged template from `@payloadcms/db-postgres`, additive `IF NOT EXISTS` / `IF EXISTS` style, AND registered twice in `src/migrations/index.ts` (import + `migrations` array entry `{ up, down, name }`).
- **`events` has `versions: { drafts: true }`** — any events schema/data migration must handle BOTH the live tables (`events_audience`, `enum_events_audience`) and the version twins (`_events_v_version_audience`, `enum__events_v_version_audience`).
- After ANY collection field change: run `npx payload generate:types` and commit the regenerated `src/payload-types.ts`; fix all consumer type breaks in the same task.
- **Never run `git checkout`, `git switch`, or any branch/HEAD mutation.** You work on the already-checked-out branch `feat/audience-foundation` in the shared working tree.
- Audience slugs are the STABLE public vocabulary: `engineers`, `founders`, `marketers`, `product`, `researchers`, `mixed`, `executives`. The first six MUST equal the legacy enum values exactly (data migration maps enum value → audience with the same slug).
- API boundary uses **slugs, not IDs**: tRPC/zod inputs accept audience slugs (`z.array(z.string())`, max 8); the server resolves slugs → Payload relationship IDs and silently drops unknown slugs. Read paths return slugs + display names to the client.
- Verification gates per task: `pnpm typecheck` clean, `pnpm test` green (no new failures; DB-gated suites may skip), `pnpm format:check` clean on touched files (run `prettier --write` on files you create/edit). Full `pnpm check` (lint + tsc) before the final commit of each task.
- UI copy through `next-intl` where the touched component already uses it; follow DESIGN.md (no new Signal Orange, mono only for machine labels, flat surfaces).

## Task 1 — `audiences` collection + seed migration (#200)

**Files:**
- Create `src/collections/Audiences.ts`
- Modify `src/payload.config.ts` (import + `collections` array entry, alongside the other collection imports at the top and the array at lines ~77–127)
- Create `src/migrations/20260707a_audiences_collection_seed.ts`
- Modify `src/migrations/index.ts` (register)
- Regenerate `src/payload-types.ts`
- Create `src/lib/audience-seed.ts` (seed data constant shared by migration + tests) with colocated `src/lib/audience-seed.test.ts`

**Collection spec** (mirror house style of `src/collections/CommunityTopics.ts` / `Speakers.ts`; slug `"audiences"`; `admin.useAsTitle: "name"`, `defaultColumns: ["name", "slug"]`; `access: { read: () => true }` (public read — the event form and public pages consume it); `timestamps: true`):
- `name`: text, required (e.g. "Engineers", "Executives")
- `slug`: text, required, unique, `index: true`
- `interests`: array of `{ tag: text (required) }` — the classifier vocabulary (Slice K consumes; empty arrays fine for now)
- `preferredSlots`: array of `{ weekdays: select hasMany (options mon,tue,wed,thu,fri,sat,sun), startTime: text "HH:MM" (required), endTime: text "HH:MM" (required) }` with `admin.description` noting times are interpreted in the event's local timezone (CONTEXT.md [[preferred-time-slot]])
- `relatedAudiences`: relationship to `audiences`, hasMany (curated overlap links, e.g. Executives ↔ Founders; NOT required to be symmetric in data — the conflict engine treats links as bidirectional)

**Seed data** (in `src/lib/audience-seed.ts`, imported by the migration; editorial defaults, hub-editable later):
- engineers "Engineers" — slots: tue,wed,thu 18:00–21:00; sat 10:00–13:00
- founders "Founders" — slots: tue,wed,thu 17:00–20:00 — related: executives
- marketers "Marketers" — slots: tue,wed,thu 16:00–18:00
- product "Product" — slots: tue,wed,thu 17:00–19:00
- researchers "Researchers" — slots: wed,thu 15:00–18:00
- mixed "Mixed" — slots: tue,wed,thu 18:00–20:00
- executives "Executives" — slots: tue,wed,thu 08:00–10:00 and tue,wed,thu 17:00–19:00 — related: founders
- Interests: engineers [ai, engineering, llms]; founders [startups, fundraising, ai]; executives [leadership, strategy, ai]; others [] — placeholder vocabulary, Slice K refines.

**Migration approach:** the migration must create the Payload-postgres tables for the collection by hand (house precedent: `src/migrations/20260420_events_summary_audience_backfill.ts` hand-writes Payload-shaped SQL). To get the exact table/column/enum shapes Payload's postgres adapter expects for this collection (array fields → child tables like `audiences_interests`, `audiences_preferred_slots`; hasMany select inside array → its own table/enum; self relationship hasMany → `audiences_rels`), derive them by inspecting the adapter's generated schema for existing analogous structures in migrations/DB (e.g. `events_audience` for hasMany-select shape, `*_rels` tables for relationships). If a local DB is reachable (`pnpm dev:db` + `.env`), you may verify by running `pnpm db:apply` and then booting Payload types generation; if you cannot verify the physical shape confidently, STOP and report BLOCKED with what you found rather than guessing. Then seed the 7 audiences (idempotent `ON CONFLICT (slug) DO NOTHING` or NOT EXISTS guards) including slots/interests/related links. `down()` drops the created tables/enums.

**Tests (TDD):** `src/lib/audience-seed.test.ts` — pure: slugs unique; first six slugs exactly equal the legacy `EVENT_AUDIENCE_OPTIONS` values (import from `src/lib/event-metadata.ts` to lock the invariant); every slot has valid HH:MM with start < end; related links reference existing slugs; executives↔founders linked both ways.

**Acceptance (from #200):** seeded entries match enum values 1:1 (+ executives) with stable slugs; `npx payload generate:types` clean and committed; migration registered and applies via `db:apply` (or BLOCKED-with-findings if no DB reachable); Payload admin can edit slots/interests/related links (follows from collection def).

## Task 2 — `events.audience` select → relationship migration (#201)

**Files:**
- Modify `src/collections/Events.ts` — replace the `audience` select field (lines ~319–327) with `{ name: "audience", type: "relationship", relationTo: "audiences", hasMany: true }` (mirror the `speakers` field at ~406–411); keep the field in the same tab/position
- Create `src/migrations/20260707b_events_audience_relationship.ts` + register in `src/migrations/index.ts`
- Regenerate `src/payload-types.ts` and fix ALL resulting type breaks minimally (temporary shims/guards are acceptable ONLY if Task 3 will replace them; note any in the report)

**Migration approach:** Payload stores hasMany relationships in the `events_rels` table (`parent_id`, `order`, `path`, `audiences_id`) — inspect the existing `events_rels` shape from prior migrations or DB (the `speakers` relationship already uses it; if `events_rels` lacks an `audiences_id` column, add it with `IF NOT EXISTS` + FK + index). Data migration: for each row in `events_audience`, insert into `events_rels` (`parent_id` = event, `path` = 'audience', `audiences_id` = the seeded audience's id via slug = enum value, preserving `order`). Same for `_events_v_version_audience` → `_events_v_rels`. Then drop the old junction tables and enums (`events_audience`, `enum_events_audience`, `_events_v_version_audience`, `enum__events_v_version_audience`) with `IF EXISTS`. `down()` best-effort recreates the enum/junction shape. Verify counts match (SELECT count comparison inside the migration, raise on mismatch) before dropping.

**Tests:** no DB-gated test required; add a pure test only if you extract mapping logic. The migration's internal count assertion is the safety net. Run `pnpm typecheck` + full suite.

**Acceptance (from #201):** every existing event keeps equivalent audience data after `db:apply`; types regenerated + committed; typecheck clean.

## Task 3 — Update audience consumers (#202)

**Files (from the audit — complete list of audience consumers):**
- Create `src/server/api/routers/audiences.ts` — tRPC `audiences.list` public query returning `{ id, slug, name }[]` ordered by name (cacheable; no auth). Register in the root router (`src/server/api/root.ts`).
- Modify `src/server/api/routers/event-upsert-data.ts` — zod line ~46: `audience: z.array(z.string()).max(8).optional()` (slugs); `buildEventPayloadData` line ~84: resolve slugs → audience IDs via a new helper `resolveAudienceIds(payload, slugs)` (single `where: { slug: { in } }` query; unknown slugs dropped).
- Modify `src/server/api/routers/events.ts` — lines ~705 and ~1468 (assign resolved IDs via the same helper); line ~1202 (admin/list projection): map populated relationship docs (or IDs) → `{ slug, name }[]`; expose slugs to the form.
- Modify `src/lib/event-draft-import.ts` — zod line ~30 → slugs (`z.array(z.string())`), mapping line ~98 unchanged semantics (slugs pass through to upsert-data which resolves).
- Modify `src/components/communities/event-form-dialog.tsx` — audience chips (state ~113/143/216/302, toggle ~333–338, render ~726–735): fetch options from `api.audiences.list` instead of `EVENT_AUDIENCE_OPTIONS`/`LABELS`; form state becomes `string[]` of slugs; loading state = disabled chip row skeleton; everything else (styling, toggle behavior) unchanged.
- Modify `src/app/[locale]/events/[slug]/page.tsx` — lines ~80–86 (SEO text), ~198, ~359–368, ~718–727: read populated audience relationship docs (`depth` permitting) and render `doc.name`; guard non-populated (number) entries.
- Modify `src/lib/event-metadata.ts` — remove `EVENT_AUDIENCE_OPTIONS`/`EVENT_AUDIENCE_LABELS`/`EventAudience` ONLY if no importers remain besides the seed test (which locks the legacy invariant — move the literal list into that test or `audience-seed.ts` and delete from event-metadata). Zero remaining imports of the removed names (acceptance on #202).

**Tests (TDD where behavior changes):** extend/adjust existing colocated tests: `src/lib/event-draft-import.test.ts` (slug schema accepts arbitrary known slugs, drops nothing client-side); new `src/server/api/routers/audience-resolve.test.ts` for `resolveAudienceIds` (mock payload.find; unknown slugs dropped, empty → undefined); form dialog test if one exists (audit found none — add a minimal chips render test only if cheap with existing test setup, else note).

**Acceptance (from #202):** creating/editing/filtering events works against the collection; EN/NL via next-intl where already used; `pnpm typecheck` + lint clean; no remaining imports of removed enum names.
