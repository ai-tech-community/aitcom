# Slice H — Conflict Engine + Tentative Holds (Plan)

Spec: `docs/superpowers/specs/2026-07-07-event-scheduling-conflicts-design.md`
GitHub: epic #196, tasks #203 (T1), #204 (T2), #205 (T3). Branch: `feat/conflict-engine`.

**Scope deviation (recorded on epic):** the spec's Phase-1 corpus listed "connected Luma calendars", but Luma events are never persisted — they live in a 5-minute in-memory per-community cache merged at read time (`src/server/luma/cache.ts`, `events.ts getCommunityEvents`). The conflict corpus is therefore the `events` collection only (native published + draft tentative holds + review-approved discovered events, incl. URL imports which create draft events). Luma joins the corpus when Slice K persists discovered events.

## Global Constraints

- **NO database schema changes and NO migrations in this slice. NEVER run `pnpm db:apply`, `db:push`, `payload migrate`, or any schema/data-mutating command — the `.env` `DATABASE_URL` is the PRODUCTION database.** Read-only queries through the app's Payload local API (`payload.find`) are fine; do not `payload.create/update/delete` outside tests with mocks.
- **Never run `git checkout`, `git switch`, or any branch/HEAD mutation.** Work on the already-checked-out `feat/conflict-engine` in the shared working tree.
- **No new dependencies.** All date/timezone math via the existing zero-dep helpers: `eventWallTimeToUtc(date, "HH:MM", timezone)` from `src/lib/event-time.ts` (DST-safe wall-clock→UTC), `haversineDistanceKm` from `src/lib/geo.ts`, `WEEKDAY_VALUES`/`Weekday` from `src/lib/audience-seed.ts`.
- **Pure modules stay pure:** no `Date.now()` / argless `new Date()` / I/O inside `rule.ts` and `suggest.ts`; anything time-relative takes an explicit `now: Date` parameter. All Payload access lives in `corpus.ts` / the router.
- Event time model facts (verified): `date` is date-only-authoritative ISO; `startTime`/`endTime` are `"HH:MM"` wall-clock strings or null; `timezone` is IANA (fallback `DEFAULT_EVENT_TIMEZONE`). Publish gating uses the custom `status` select (`draft|published|cancelled|completed|rejected`) with `draft: false` in queries — NOT Payload `_status`. Curation gate: `reviewStatus` (`discovered|reviewing|approved|archived`, default approved).
- `relatedAudiences` links are **bidirectional by contract** (documented on the field) even when stored one-way — the engine must expand symmetrically.
- Verification gates per task: `pnpm typecheck` clean, `pnpm test` green (full suite once before committing), `pnpm check` before final commit, `prettier --write` on touched files. Tests: colocated vitest, `describe` per exported function, explicit named `it()` cases (house style — not `it.each`), literal expected values, DST/timezone edge cases where relevant.
- Domain language (CONTEXT.md): [[scheduling-conflict]], [[tentative-hold]], [[preferred-time-slot]], [[audience]]. ADR-0035 binds: no live external API calls anywhere in the check path.

## Shared vocabulary for this slice (exact contracts)

```ts
// rule.ts — pure input shapes (no Payload imports)
export interface ConflictCandidate {
  date: string;                 // ISO or YYYY-MM-DD, calendar date authoritative
  startTime?: string | null;    // "HH:MM"
  endTime?: string | null;      // "HH:MM"
  timezone: string;             // IANA, caller applies DEFAULT_EVENT_TIMEZONE fallback
  format: "online" | "in-person" | "hybrid";
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  audienceIds: number[];        // direct target audiences
}
export interface CorpusEvent extends Omit<ConflictCandidate, "audienceIds"> {
  id: number;
  title: string;
  audienceIds: number[];
  tentative: boolean;           // status === "draft"
  sourceUrl?: string | null;    // discovered/import provenance (for UI badge later)
  communityId?: string | null;
}
export type ConflictGrade = "clash" | "same-evening" | "same-day";
export interface ConflictVerdict {
  event: CorpusEvent;
  grade: ConflictGrade;         // final grade AFTER related-audience downgrade
  audienceMatch: "direct" | "related";
  tentative: boolean;
  overlapMinutes: number | null; // when a padded time overlap exists
}
```

**The rule (evaluateConflict(candidate, corpusEvent, relatedIdSet) → ConflictVerdict | null):**
1. **Audience gate:** shared id in `audienceIds` → `direct`; else shared id when candidate's set is expanded with `relatedIdSet` → `related`; else **no conflict (null)**.
2. **Catchment gate:** `online` matches any catchment (an online event competes with everything its audience could attend). Both sides effectively in-person (`in-person`, or `hybrid` on its in-person side) → same catchment iff (a) both have coords and `haversineDistanceKm ≤ 50`, or (b) coords missing on either and both `city` non-empty and equal case-insensitively (trimmed). In-person with no coords AND no city on either side → **not** same catchment (conservative: no false positives from unknown geography). Fail gate → null.
3. **Time grade** (all instants via `eventWallTimeToUtc`; precedence refined during T1 review — this text is authoritative, implemented in `rule.ts computeTimeGrade`):
   - Missing `endTime` → assume 120-minute duration. Pad both intervals ±60 minutes when either side is in-person/hybrid; no padding online↔online.
   - **(i) Clash:** padded intervals overlap → `clash` (+ raw unpadded overlap minutes, 0 if only pads touch).
   - **(ii) Same-evening:** real-instant start-to-start gap ≤ 4h → `same-evening`, **day-independent** (two events 30 real minutes apart across local midnight/timezones are adjacent regardless of calendar labels).
   - **(iii) Same-day:** both start instants projected into the **candidate's timezone** fall on the same calendar date → `same-day`. Else null.
   - **All-day handling** (missing `startTime`): both sides all-day → raw date-string equality → `same-day` (only coherent option, no instants exist). Mixed: project the timed side's instant into the candidate's timezone and compare with the all-day side's authoritative date → `same-day` or null. All-day grades are capped at `same-day` with `overlapMinutes: null`.
4. **Related downgrade:** `audienceMatch === "related"` lowers the grade one step (`clash`→`same-evening`, `same-evening`→`same-day`, `same-day` stays — the floor).
5. Grade ordering export: `CONFLICT_GRADE_ORDER = ["clash", "same-evening", "same-day"]` (most severe first) for sorting.

## Task 1 — Pure conflict rule module (#203)

**Files:** create `src/server/events/conflicts/rule.ts` + `src/server/events/conflicts/rule.test.ts` (nothing else).

Implement the shared vocabulary above exactly (types + `evaluateConflict` + `CONFLICT_GRADE_ORDER` + any small internal helpers). Zero I/O, zero Payload imports; imports allowed: `event-time.ts`, `geo.ts` only.

**Tests (TDD, explicit `it()` cases):** exact UTC overlap same tz → clash with overlapMinutes; cross-timezone overlap (18:00 Amsterdam vs 17:00 London same instant window) → clash; in-person pad-only touch (ends 18:00, starts 18:45, both in-person, same city) → clash with overlapMinutes 0; online↔online no pad (ends 18:00, starts 18:30 → not clash, same-evening); same local day >4h apart → same-day; different city in-person both-with-coords 300km → null; ≤50km coords → passes catchment; coords-missing city-equal case-insensitive → passes; coords-and-city-missing in-person → null; online vs in-person different countries overlapping instants → clash; related-only audience → downgrade applied (clash→same-evening); no shared audience → null; missing startTime same day → same-day; missing startTime different day → null; missing endTime 120-min default demonstrated; DST boundary case (reuse an event-time.test.ts DST date) sanity.

**Acceptance (#203):** table of behaviors above green; module pure (no I/O); `pnpm typecheck` clean.

## Task 2 — Suggested-slot ranking (#204)

**Files:** create `src/server/events/conflicts/suggest.ts` + `suggest.test.ts`.

```ts
export interface SlotSuggestion {
  date: string;        // YYYY-MM-DD in the event's timezone
  startTime: string;   // "HH:MM"
  endTime: string;
  reasons: string[];   // machine-readable: "clear", "preferred:<audience-slug>", "original-time"
  dayOffset: number;   // signed days from the organizer's chosen date
}
export function suggestSlots(input: {
  candidate: ConflictCandidate;
  corpus: CorpusEvent[];
  relatedIdSet: Set<number>;
  audiences: { id: number; slug: string; preferredSlots: { weekdays: Weekday[]; startTime: string; endTime: string }[] }[];
  now: Date;
  windowDays?: number;   // default 7
  maxResults?: number;   // default 5
}): SlotSuggestion[]
```

Candidate generation: for each day in `[chosenDate - windowDays, chosenDate + windowDays]` (skip days strictly before `now` in the event's timezone, skip the exact original date+time), for each target audience's `preferredSlots` whose `weekdays` include that day's weekday (weekday computed in the event's timezone) → slot candidate; plus the organizer's original `startTime`/`endTime` on each other day as a fallback candidate (reason `original-time`). De-dupe identical (date,start,end).

Scoring/filtering: evaluate each candidate against the corpus with `evaluateConflict`; **discard** any with a `clash` or `same-evening` verdict; a candidate with zero verdicts gets reason `clear`; remaining `same-day`-only candidates are kept but rank below fully clear ones. Rank: (1) clear before same-day-only, (2) preferred-slot candidates before original-time fallbacks, (3) smaller `|dayOffset|`, (4) earlier date, (5) earlier startTime. Return top `maxResults`. Deterministic — no randomness, `now` injected.

**Tests (TDD):** crowded week (clear slot on +2 wins over same-day-only on +1); weekday matching respects event timezone; past days skipped relative to injected `now`; original-time fallback used when audience has no preferredSlots; de-dupe when two audiences share a slot (reasons merged: both `preferred:` entries); maxResults honored; empty corpus → nearest preferred slots by |dayOffset|; determinism (same input twice → identical output).

**Acceptance (#204):** deterministic ordering per rules; no-preferred-slots fallback works; empty corpus / crowded week / timezone edges covered.

## Task 3 — Corpus + tRPC endpoint + tentative-hold anonymization (#205)

**Files:** create `src/server/events/conflicts/corpus.ts` (+ `corpus.test.ts` with mocked payload), modify `src/server/api/routers/events.ts` (thin glue only — all logic in conflicts/*).

**corpus.ts:**
- `expandAudiences(payload, slugs: string[])` → `{ direct: {id,slug,name,preferredSlots}[], relatedIdSet: Set<number> }`: one `payload.find({ collection: "audiences", where: { slug: { in } }, depth: 0 })` for direct; symmetric expansion needs audiences that LIST a direct id in their `relatedAudiences` too — fetch all audiences (tiny collection, ≤ dozens; single `find` with high limit) and compute both directions in code. Unknown slugs dropped (Slice G convention).
- `fetchCorpus(payload, { dateFrom, dateTo, audienceIdsExpanded, excludeEventId? })` → `CorpusEvent[]`: single `payload.find({ collection: "events", draft: false, depth: 0, limit: 300, where: { and: [ { date: { greater_than_equal } }, { date: { less_than_equal } }, { status: { in: ["published", "draft"] } }, { or: [{ reviewStatus: { equals: "approved" } }, { reviewStatus: { exists: false } }] }, { audience: { in: audienceIdsExpanded } }, ...(excludeEventId ? [{ id: { not_equals: excludeEventId } }] : []) ] } })`. Window: candidate date ± (windowDays + 1) days. Map docs → `CorpusEvent` (audience relationship at depth 0 = ids; `tentative: status === "draft"`; timezone fallback `DEFAULT_EVENT_TIMEZONE`; format fallback `"online"` when null — online is the conservative widest-competition default).
- `log`-free; exceptions bubble to the router.

**Router (events.ts):** `checkConflicts: protectedProcedure.input(z.object({ date: z.string().min(8), startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(), timezone: z.string().optional(), format: z.enum(["online","in-person","hybrid"]).default("online"), city: z.string().optional(), latitude: z.number().optional(), longitude: z.number().optional(), audience: z.array(z.string()).min(1).max(8), excludeEventId: z.number().optional() })).query(...)`:
1. Validate timezone with `isValidTimeZone`, else fall back to `DEFAULT_EVENT_TIMEZONE`.
2. `expandAudiences` → empty direct set → return `{ conflicts: [], suggestions: [], checkedAudiences: [] }` (nothing to check).
3. `fetchCorpus` → `evaluateConflict` per corpus event → sort by `CONFLICT_GRADE_ORDER` then tentative-last then date.
4. `suggestSlots` with `now: new Date()` (router layer owns real time).
5. **Anonymize tentative holds server-side:** for verdicts with `tentative: true`, the wire row is `{ tentative: true, grade, audienceMatch, date: <YYYY-MM-DD only>, sourceType: "hold" }` — NO id, title, times, communityId, or sourceUrl. Non-tentative rows: `{ tentative: false, grade, audienceMatch, overlapMinutes, id, title, date, startTime, endTime, timezone, sourceType: "native" | "import", sourceUrl }` (`sourceType: "import"` when `sourceUrl` non-empty). Assert the anonymization in a test (serialize wire row for a tentative event, expect no leaking keys).
6. Response also includes `checkedAudiences: { slug, name }[]` (the resolved direct audiences — the UI's "No conflicts for Executives" line).

**Tests:** corpus mapping (mock `payload.find` — house style per `audience-resolve.test.ts`): status/reviewStatus filtering encoded in the where (assert the where clause), doc→CorpusEvent mapping incl. fallbacks; symmetric related expansion (A lists B, B doesn't list A → both directions found); tentative anonymization leak test; empty-audience early return. Router glue itself needs no dedicated test beyond these (thin).

**Acceptance (#205):** tentative holds never leak identifying fields (asserted); own event excluded when editing; no live external calls; single indexed corpus query per check.
