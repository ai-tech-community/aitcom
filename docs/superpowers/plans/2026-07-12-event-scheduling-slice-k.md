# Slice K (scoped) — Luma → Conflict Corpus + Heuristic Audience Classification (Plan)

Spec: `docs/superpowers/specs/2026-07-07-event-scheduling-conflicts-design.md` (Phase 3, scoped). ADR-0035.
GitHub: epic #199 (see the 2026-07-12 scope comment). Branch: `feat/luma-discovery-ingestion`. Three tasks.

## What this slice does (and the gap it closes)
Today Luma events are fetched live and merged **only at display time** (`getCommunityEvents`) — they are **never written to `events`, so they are not in the conflict corpus**. This slice makes each connected community's Luma calendar events real **discovered events** in the `events` collection, classified onto the Hub audience vocabulary by a heuristic (no LLM), so they finally participate in conflict detection. Deferred to K2: LLM classification, learned preferred-slots.

## KEY DECISION (reversible; flagged for review)
**Ingested Luma events are `reviewStatus: "approved"` — they enter the conflict corpus immediately.** `fetchCorpus` includes only `reviewStatus` approved-or-unset (`corpus.ts:123-128`), so "discovered" would keep them OUT of the corpus until a human reviews each — inert for an automated feed. Rationale for auto-approve: the source is the **community's own opted-in Luma calendar** (high trust, not scraped), and conflicts are **advisory/non-blocking** (ADR-0035), so a mis-classified audience only yields a slightly-off advisory. The ADR-0011 review queue becomes an **after-the-fact correction** surface for the audience classification, not a pre-gate. (If a future agent-scraped/low-trust source is added, it should ingest as `"discovered"` and be review-gated — a per-source-trust distinction.)

## Global Constraints
- **NO schema migration this slice** — reuse the existing dormant curation fields (`discoverySource`, `curatedByAgent`, `confidenceScore`, `lastVerifiedAt`, `reviewStatus`, `sourceUrl`) and the `audience` relationship. Dedupe key = (`communityId` [indexed] + `sourceUrl`). **NEVER run `pnpm db:apply` / `db:push` / `payload migrate` — `.env` is PRODUCTION.** (If you discover a migration is truly needed, STOP and report — do not add one silently; the dev-branch verify path exists via `pnpm db:apply:dev` but this slice is designed to need none.)
- **No new dependencies. No LLM** — classification is a pure keyword/token heuristic. (`ai`/`@anthropic-ai/sdk` are installed but unused; do not introduce inference here.)
- Never `git checkout`/`switch`/branch mutation. Work on `feat/luma-discovery-ingestion`.
- Reuse existing Luma plumbing: `src/server/luma/client.ts` (`getCalendarEvents`), `normalize.ts` (`normalizeLumaEvent` → `NormalizedEvent`), `crypto.ts` (`decryptApiKey`), the `communityLumaIntegrations` table (enabled + `calendarApiId`). `getPayloadClient` + `db` for I/O. Cron auth pattern: Bearer `CRON_SECRET`, `runtime="nodejs"`, `dynamic="force-dynamic"`, `maxDuration=300` (mirror `event-reminders`/`event-conflict-monitor`).
- Pure modules pure (no I/O/Date). Verification gates per task: `pnpm typecheck`, full `pnpm test` once before commit, `pnpm check`, `prettier --write` on touched files.
- CONTEXT.md: [[discovered-event]], [[audience]], [[scheduling-conflict]]. Discovered events are rows in the existing `events` collection (no parallel model).

## `NormalizedEvent` (from `normalize.ts:5-24`, verbatim relevant fields)
`{ id, title, slug, description, type, date, startTime, endTime, timezone, location, maxAttendees, image, status, communityId, source: "native"|"luma", lumaUrl, coverImageId?, coverImageUrl? }`. Times are `"HH:MM"` wall-clock or null; `date` ISO; `lumaUrl` is the stable per-event URL (dedupe key source).

## Task 1 — Pure heuristic audience classifier (`classify.ts`)
**Files:** create `src/server/events/discovery/classify.ts` + `classify.test.ts`.
```ts
export interface ClassifiableAudience { id: number; slug: string; name: string; interests: string[]; }
export interface ClassificationResult { audienceIds: number[]; confidence: number; } // confidence 0..1
export function classifyAudiences(
  text: { title: string; description?: string | null; location?: string | null },
  audiences: ClassifiableAudience[],
): ClassificationResult
```
- Normalize the event text (lowercase, strip punctuation → token set). For each audience, count how many of its `interests` tags (also normalized; multi-word tags matched as substrings/phrase on the joined text) appear. An audience **matches** if ≥1 interest tag hits. Also match on the audience `name`/`slug` appearing verbatim (e.g. title contains "founders").
- `audienceIds` = all matching audience ids. `confidence` = a simple bounded score, e.g. `min(1, totalTagHits / 3)` or `matchedAudiences>0 ? 0.4 + 0.15*distinctMatches capped at 0.9 : 0` — pick one, document it, keep it deterministic and defensible (it feeds `confidenceScore`). No match → `{ audienceIds: [], confidence: 0 }`.
- Audiences with **empty `interests`** (several seed audiences have none) can only match by name/slug — that's expected; note the seed-interests gap as a content follow-up (do NOT edit the seed here).
- Pure: no I/O, no Date.

**Tests (TDD):** title with an interest keyword → that audience id; multi-word interest phrase match; name/slug match ("Founders Breakfast" → founders); no match → empty + confidence 0; multiple audiences matched; empty-interests audience only matches by name; confidence monotonic with hits; case/punctuation-insensitive.

## Task 2 — Luma→event upsert module (`ingest.ts`)
**Files:** create `src/server/events/discovery/ingest.ts` + `ingest.test.ts` (mock payload, mirror `corpus.test.ts`/`audience-resolve.test.ts` style).
```ts
// Pure mapping: NormalizedEvent (+ classification, +now) → the payload create/update data.
export function buildDiscoveredEventData(
  n: NormalizedEvent, classification: ClassificationResult, nowIso: string,
): Record<string, unknown>
// sets: title, description, date, startTime, endTime, timezone, location, format (derive: normalize gives none — default "online" unless location looks physical; keep simple: "in-person" if location non-empty & not a URL, else "online" — document the heuristic), type ("meetup" per normalize), status "published", communityId,
//       discoverySource "luma", curatedByAgent true, sourceUrl (lumaUrl), reviewStatus "approved", lastVerifiedAt nowIso, confidenceScore (classification.confidence), audience (classification.audienceIds), coverImage (coverImageId ?? undefined).

// I/O: idempotent upsert of ONE normalized event. Returns "created"|"updated"|"skipped".
export async function upsertDiscoveredEvent(
  payload, n: NormalizedEvent, classification, nowIso,
): Promise<{ action: "created" | "updated"; eventId: number }>
// dedupe: payload.find events where { and: [ {communityId equals n.communityId}, {sourceUrl equals n.lumaUrl}, {discoverySource equals "luma"} ], limit:1, depth:0 }.
//   found → payload.update(id, buildDiscoveredEventData(...)) (re-approves if it was archived); not found → payload.create. Skip if n.lumaUrl is null (no dedupe key).

// Staleness: given the set of lumaUrls seen this run for a community, archive previously-ingested luma events not in the set.
export async function archiveStaleDiscoveredEvents(
  payload, communityId: string, seenSourceUrls: Set<string>,
): Promise<number> // find luma discovered events for the community with sourceUrl NOT in seen → update reviewStatus "archived" (leaves the corpus). Returns count archived.
```
**Tests:** `buildDiscoveredEventData` field mapping incl. reviewStatus="approved", curatedByAgent true, audience ids, confidenceScore, format heuristic, null-endTime passthrough; upsert create-vs-update path (mock find empty vs hit); skip when lumaUrl null; archive marks only un-seen luma events of that community (assert the where clause). Keep `buildDiscoveredEventData` pure/tested; the async fns get mock-payload tests.

## Task 3 — Discovery sync cron (`event-discovery-sync`)
**Files:** create `src/app/api/cron/event-discovery-sync/route.ts`; modify `vercel.json` (add `{ "path": "/api/cron/event-discovery-sync", "schedule": "0 5 * * *" }` — daily 05:00, before the 06:00 conflict-monitor so the corpus is fresh when it runs).
Route (mirror `event-conflict-monitor` structure, auth Bearer CRON_SECRET, nodejs/force-dynamic/maxDuration 300):
1. Load all audiences once (`payload.find({ collection: "audiences", limit: 200, depth: 0 })`) → `ClassifiableAudience[]` (map interests `{tag}[]`→string[]).
2. `db.select` enabled `communityLumaIntegrations` (isEnabled true, calendarApiId non-empty). Per integration, wrapped in try/catch (one community's failure must not abort the run):
   a. `decryptApiKey`, `getCalendarEvents(apiKey, calendarApiId)`, `normalizeLumaEvent(e, communityId)` per event.
   b. For each normalized event: `classifyAudiences(...)` → `upsertDiscoveredEvent(...)`; collect its lumaUrl into `seen`.
   c. `archiveStaleDiscoveredEvents(payload, communityId, seen)`.
   d. Update `communityLumaIntegrations.lastSyncCheck = now` (mirror the existing write at events.ts ~561).
3. Return `{ communities, created, updated, archived }`.
- No live external call is a problem here — this is INGESTION (write path), distinct from ADR-0035's rule that the conflict CHECK never calls external APIs. The check still only reads our `events`. Document that distinction in a route comment.
- Freshness: `lastVerifiedAt` set on every upsert; stale (removed-from-Luma) events archived → they leave the corpus, addressing the ADR-0035 false-positive concern.
**Tests:** no cron route test (repo convention) — logic lives in classify.ts/ingest.ts. Optional mock-boundary test only if cheap; note the decision.

**Acceptance (#199 scoped):** connected-community Luma events become `events` rows with `discoverySource:"luma"`, `reviewStatus:"approved"`, classified audiences, and enter the conflict corpus (verifiable: after a sync, `fetchCorpus` returns them); re-sync is idempotent (no duplicates); removed Luma events archive out of the corpus; no LLM; no schema migration; per-community failure isolation.
