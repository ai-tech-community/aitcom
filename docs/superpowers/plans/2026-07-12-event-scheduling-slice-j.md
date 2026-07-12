# Slice J — Conflict Monitoring Cron + Notifications (Plan)

Spec: `docs/superpowers/specs/2026-07-07-event-scheduling-conflicts-design.md` (Phase 2 — monitoring).
GitHub: epic #198. Branch: `feat/conflict-monitor`. Two tasks (T1 pure module, T2 cron route).

## What this slice does
A scheduled scan re-checks upcoming **published native events** against the conflict engine and notifies the organizer when a **new material conflict** appears (a competitor ingested/created after the event was scheduled). Advisory only — no auto-reschedule. Mirrors the proven `event-reminders` cron: claim-before-send dedupe, transactional (ceiling-exempt), in-app notification + optional email.

## Global Constraints

- **NO database schema changes, NO migrations. NEVER run `pnpm db:apply`, `db:push`, `payload migrate` — the `.env` `DATABASE_URL` is the PRODUCTION database.** This slice reuses existing tables only: `notifications` (extend the `type` string to `"event_conflict"` — it's a free varchar, NOT a pg enum) and `broadcastDeliveries` (dedupe via the existing partial unique index on `(userId, dedupeKey)`). Verify no new column is needed before writing any migration — you should need none.
- **Never `git checkout` / `git switch` / branch mutation.** Work on `feat/conflict-monitor`.
- **No new dependencies.** Reuse the conflict engine (`src/server/events/conflicts/{rule,corpus,suggest}.ts`), `getPayloadClient` (`@/server/payload`), `db` (`@/server/db`), notification/email helpers, and `src/server/notifications/constants.ts`.
- Pure modules stay pure: `monitor.ts` does zero I/O (no payload/db/Date.now()); the route owns all I/O and `new Date()`.
- Verification gates per task: `pnpm typecheck`, full `pnpm test` once before committing, `pnpm check` before final commit, `prettier --write` on touched files.
- Domain (CONTEXT.md): [[scheduling-conflict]]; the monitor consumes the same engine as the live check but with coordinates (geocoded events have lat/lng, so catchment is more precise than the form).

## Key decisions (baked into this plan)

1. **Material conflict = non-tentative, grade ∈ {`clash`, `same-evening`}.** Same-day is too weak to alert on; tentative holds are anonymized (can't name the competitor) and low-signal — never notify on them. (They still exist in the corpus; we just don't alert.)
2. **Organizer = `event.submittedBy`** (text user id). Events with empty `submittedBy` (discovered/imports) are **skipped** — no owner to notify.
3. **Dedupe forever-per-pair:** claim `broadcastDeliveries` row with `dedupeKey = event-conflict:{eventId}:{conflictingEventId}`, `class: "transactional"`, `onConflictDoNothing().returning()`. Empty return = already alerted for this pair → skip. The unique index is `(userId, dedupeKey)` (window-agnostic) → each competitor pair alerts exactly once, ever. `userId` in the row is the organizer.
4. **Consolidated send:** per event per run, claim each new material pair; if ≥1 pair newly claimed, send **one** in-app notification summarizing the N newly-appeared conflicts (not N notifications). Small at-least-once gap (claims win, then the single insert fails → those pairs never alert) is the same risk `event-reminders` accepts; document it. Claim → in-app insert → optional email, in that order.
5. **Scope:** scan published events with a non-empty audience, `date` in `(now, now + MONITOR_HORIZON_DAYS]`. `MONITOR_HORIZON_DAYS = 30`. Schedule **daily** (`0 6 * * *`) — the corpus changes slowly (via ingestion), organizers react over days, and forever-dedupe makes daily re-scans cheap (only new pairs notify). `limit: 200`, `depth: 1` (need audience slugs), warn on page-cap like event-reminders.
6. **Ceiling-exempt** (transactional, about the organizer's own event) — do NOT call `allowPromotional`, matching event-reminders.

## Task 1 — Pure monitoring module (`monitor.ts`)

**Files:** create `src/server/events/conflicts/monitor.ts` + `monitor.test.ts`.

Exports (pure — no I/O, `now` injected where needed):

```ts
export const MONITOR_HORIZON_DAYS = 30;
export const MATERIAL_GRADES: readonly ConflictGrade[]; // ["clash","same-evening"]

// Map a published event doc (depth:1) → the engine candidate + its audience slugs.
// Returns null when the event can't be monitored: no submittedBy, or no audience.
export function buildMonitorTarget(eventDoc): {
  candidate: ConflictCandidate;   // date/startTime/endTime/timezone/format/city/lat/lng/audienceIds
  audienceSlugs: string[];
  organizerId: string;            // event.submittedBy
  eventId: number;
  eventTitle: string;
} | null

// Filter engine verdicts to the ones worth alerting on.
export function selectMaterialConflicts(verdicts: ConflictVerdict[]): ConflictVerdict[]
// non-tentative AND grade ∈ MATERIAL_GRADES; sorted by CONFLICT_GRADE_ORDER then date.

export function conflictDedupeKey(eventId: number, conflictingEventId: number): string
// `event-conflict:${eventId}:${conflictingEventId}` — ≤255 chars.

// Build the single consolidated notification payload for one event's newly-appeared conflicts.
export function buildConflictNotification(target, newConflicts: ConflictVerdict[]): {
  title: string;    // e.g. `Schedule conflict for "${eventTitle}"`
  content: string;  // English (crons have no locale); names count + the top competitor + date, e.g.
                    // `2 events now compete for your audience around ${date}, including "${topTitle}".`
  metadata: Record<string, unknown>;  // { eventId, conflictingEventIds: number[], topGrade }
}
```

- `buildMonitorTarget`: read `audience` from the depth:1 doc (array of populated `{id,slug}` — map defensively like getEventForEdit; if any entries are bare numbers at unexpected depth, that event is unmonitorable → still needs slugs, so treat missing slugs as skip). `audienceIds` on the candidate = the populated audience ids. Include `latitude`/`longitude` when present (numbers), `city`, `format` (fallback `"online"` when null), `timezone` (fallback `DEFAULT_EVENT_TIMEZONE`).
- Keep `buildConflictNotification` copy plain, factual, English; put identifiers in `metadata` (the client renders the manage-page link from `eventId`).

**Tests (TDD, house style — explicit `it()` cases):** buildMonitorTarget maps a full doc (coords, city, slugs) correctly; returns null on empty submittedBy; returns null on empty/absent audience; format/timezone fallbacks. selectMaterialConflicts keeps clash+same-evening non-tentative, drops same-day, drops tentative, sorts by grade. conflictDedupeKey format + stability. buildConflictNotification: singular vs plural content, metadata carries all conflicting ids + topGrade, title includes the event name.

**Acceptance:** module pure (no payload/db/Date import); every behavior above tested; `pnpm typecheck` clean.

## Task 2 — Cron route + notification dispatch

**Files:** create `src/app/api/cron/event-conflict-monitor/route.ts`; modify `vercel.json` (add the cron entry); modify `src/server/db/schema.ts` (extend the `notifications.type` doc-comment union with `"event_conflict"` — comment only, no schema change).

**Route** (`GET`, `runtime="nodejs"`, `dynamic="force-dynamic"`, `maxDuration=300`; mirror `event-reminders/route.ts` structure exactly):
1. Auth: `if (req.headers.get("authorization") !== \`Bearer ${process.env.CRON_SECRET}\`) return 401` — verbatim pattern.
2. `const payload = await getPayloadClient(); const now = new Date();` `horizon = now + MONITOR_HORIZON_DAYS*86400000`.
3. `payload.find({ collection: "events", where: { and: [ {status:{equals:"published"}}, {date:{greater_than: now.toISOString()}}, {date:{less_than: horizon.toISOString()}}, {audience:{exists:true}} ] }, limit: 200, depth: 1 })` — warn if `totalDocs > 200`.
4. Per event:
   a. `const target = buildMonitorTarget(doc)`; `if (!target) continue`.
   b. `const { direct, relatedIdSet } = await expandAudiences(payload, target.audienceSlugs)`; `if (!direct.length) continue`. Set `target.candidate.audienceIds = direct.map(a => a.id)`.
   c. `const { dateFrom, dateTo } = corpusDateWindow(target.candidate.date)`; `const corpus = await fetchCorpus(payload, { dateFrom, dateTo, audienceIdsExpanded: unique([...direct.map(a=>a.id), ...relatedIdSet]), excludeEventId: target.eventId })`. (Skip `resolveExcludeEventId` — trusted cron passes the id directly.)
   d. `const verdicts = corpus.map(e => evaluateConflict(target.candidate, e, relatedIdSet)).filter(Boolean)`; `const material = selectMaterialConflicts(verdicts)`.
   e. For each `v` in material: claim `db.insert(broadcastDeliveries).values({ userId: target.organizerId, class: "transactional", emailSent: false, windowKey: currentWindowKey(now), dedupeKey: conflictDedupeKey(target.eventId, v.event.id) }).onConflictDoNothing().returning({ id })`. Collect `v` where claim returned a row (newly appeared).
   f. If `newlyClaimed.length`: `const notif = buildConflictNotification(target, newlyClaimed)`; `db.insert(notifications).values({ userId: target.organizerId, type: "event_conflict", title: notif.title, content: notif.content, metadata: notif.metadata, communityId: doc.communityId ?? null })`. Then optional email: join `user` on `target.organizerId` for the address; if present and Resend configured, `sendBroadcastEmail(email, notif.title, notif.content)` (transactional; no ceiling). Wrap email in try/catch — email failure must not abort the scan.
5. Return `NextResponse.json({ scanned, eventsNotified, pairsAlerted })`.

**vercel.json:** add `{ "path": "/api/cron/event-conflict-monitor", "schedule": "0 6 * * *" }` to the `crons` array (consistent formatting with neighbors).

**Tests:** no cron route has a sibling test in this repo (confirmed) — keep the route a thin shell and rely on Task 1's `monitor.test.ts` for logic. Do NOT invent a route test harness; if a cheap mock-boundary test is genuinely low-effort (mirroring `deadline-enforcement.test.ts`'s vi.mock of `@/server/db` + `@/server/payload`), it's welcome but optional — note the choice in the report.

**Acceptance (#198):** upcoming published events re-checked against the engine; one deduped advisory notification per event per run summarizing newly-appeared material conflicts; never re-alerts a pair (forever dedupe); events without an organizer or audience skipped; ceiling-exempt; no live external calls; no schema migration.
