# Slice I — Creation-Flow Conflict UI + Approval Queue (Plan)

Spec: `docs/superpowers/specs/2026-07-07-event-scheduling-conflicts-design.md` (§UI brief — the confirmed /impeccable design brief; binding).
GitHub: epic #197, tasks #212 (T1 prerequisite), #206 (T2), #207 (T3), #208 (T4); #210 folded into T1 (server) + T3 (form). Branch: `feat/conflict-ui`.

## Global Constraints

- **NO database schema changes, NO migrations. NEVER run `pnpm db:apply`, `db:push`, `payload migrate` — the `.env` `DATABASE_URL` is the PRODUCTION database.** App-level reads via `payload.find` are fine; tests mock payload/tRPC.
- **Never `git checkout` / `git switch` / any branch mutation.** Work on the checked-out `feat/conflict-ui`.
- **DESIGN.md rules bind all UI** (read DESIGN.md + PRODUCT.md before writing any component): One Voice Rule — zero new Signal Orange; Flat-By-Default — 1px borders, no shadows; Mono-Is-Machine — `font-mono` only for grade labels, source badges, timestamps; House Kicker — `SectionLabel` (src/components/ui/section-label.tsx) is the only section marker; No-Cream — neutral surfaces only. Severity colors use existing Badge variants: `clash`→`destructive`, `same-evening`→`warning`, `same-day`→`info` (badge.tsx has tinted `bg-*/15 text-*` variants). Color never alone: every grade pairs icon + text label.
- **i18n:** every user-visible string via `next-intl` — add keys under the `events` namespace in BOTH `messages/en.json` and `messages/nl.json` (dialog uses `useTranslations("events")`). No fixed-width layouts (Dutch runs long).
- **A11y:** results region `aria-live="polite"`; chips/expanders are real `<button>`s, keyboard-reachable, visible focus; `motion-reduce:transition-none` on any transition (Skeleton idiom).
- Client patterns (verified): tRPC via `api.<r>.<p>.useQuery(input, { enabled })` from `@/trpc/react`; NO house debounce hook — replicate the `communities-directory.tsx` `setTimeout`+state pattern locally (~600ms). Component tests mirror `src/components/communities/discover/community-card.test.tsx` (mock `@/trpc/react`, `next-intl`, jsdom + @testing-library/react).
- Wire contract (verified, do not change shapes in UI tasks): `events.checkConflicts` input `{ date, startTime?, endTime?, timezone?, format (default "online"), city?, latitude?, longitude?, audience: string[] (min 1), excludeEventId? }`; response `{ conflicts: WireConflict[], suggestions: SlotSuggestion[], checkedAudiences: {slug,name}[] }`; `WireConflict` discriminates on `tentative` (TentativeWireConflict = `{tentative:true, grade, audienceMatch, date, sourceType:"hold"}` only); `SlotSuggestion = { date, startTime, endTime, reasons: ("clear"|"preferred:<slug>"|"original-time")[], dayOffset }`. Conflicts arrive pre-sorted.
- The dialog has NO latitude/longitude (server-side geocoding only) — the check sends `city` only. `form.format` may be `""` → send `form.format || "online"`.
- Verification gates per task: `pnpm typecheck`, full `pnpm test` once before committing, `pnpm check` before final commit, `prettier --write` on touched files.

## Task 1 — Endpoint hardening: #212 ownership check + #210 server semantics + tz guard

**Files:** modify `src/server/api/routers/events.ts`, `src/server/api/routers/audience-resolve.ts` (+ its test), `src/server/events/conflicts/corpus.ts` (+ its test). New test file only if a seam demands it.

1. **#212 — `excludeEventId` ownership:** in `checkConflicts`, before honoring `excludeEventId`, `payload.findByID({ collection: "events", id, depth: 0 })` (wrap: not-found → ignore the param, don't throw). Honor ONLY if `event.submittedBy === ctx.session.user.id` OR the caller holds role owner/admin in `event.communityId` (find the existing membership-role lookup used elsewhere in events.ts — e.g. the guard inside getPendingCommunityEvents ~1016-1027 — and reuse/extract it). Otherwise silently ignore the param (same response as if omitted). Tests (mocked payload): non-owner exclude has no effect on the where clause; owner exclude works; admin-of-community exclude works; nonexistent id ignored.
2. **#210 server — explicit clear:** `resolveAudienceIds` returns `[]` (not `undefined`) when input is a **defined empty array**; `undefined` stays "not provided". Update its tests. At the update/resubmit call sites (`events.ts` ~707 and ~1482): `if (input.audience !== undefined) data.audience = await resolveAudienceIds(...)` so a defined `[]` clears. Create paths keep omit-when-empty.
3. **Corpus tz guard (H review minor):** in the doc→CorpusEvent mapping, `isValidTimeZone(doc.timezone) ? doc.timezone : DEFAULT_EVENT_TIMEZONE` (import from `src/lib/event-time.ts`) so one garbage legacy row can't 500 a check. One mapping test.

**Acceptance (#212):** non-owner excludeEventId does not alter results (tested); owner editing still excludes own event. (#210 server): resolveAudienceIds `[]`→`[]`, `undefined`→`undefined` (tested).

## Task 2 — #206 Inline conflict panel

**Files:** create `src/components/events/event-conflict-panel.tsx` + `event-conflict-panel.test.tsx`; modify `src/components/communities/event-form-dialog.tsx`; add i18n keys to `messages/en.json` + `messages/nl.json`.

**Component contract** (panel owns display; dialog owns data):
```tsx
export interface ConflictCheckInput { /* the checkConflicts input shape */ }
export function EventConflictPanel(props: {
  state: "idle" | "checking" | "clear" | "conflicts" | "error";
  conflicts: WireConflict[];          // pre-sorted from server
  checkedAudiences: { slug: string; name: string }[];
  onRetry: () => void;
  children?: React.ReactNode;         // T3 mounts the slot-chip row here
})
```
Also export `ConflictRow` (single row renderer) — T4 reuses it read-only in the approval queue.

**Dialog wiring:** debounce (~600ms, `setTimeout` pattern) the tuple (date, startTime, endTime, timezone, format, city, audience) into `debouncedCheckInput`; `api.events.checkConflicts.useQuery(debouncedCheckInput, { enabled: open && !!form.date && form.audience.length >= 1, retry: 1 })`; `excludeEventId: isEditing ? eventId : undefined`. Derive panel state: gate unmet → `idle`; isFetching → `checking`; error → `error`; data.conflicts.length ? `conflicts` : `clear`. Mount the panel as a `sm:col-span-2` row directly AFTER the timezone field (after the date/time cluster ~line 568, inside the existing grid).

**Visuals (per the confirmed brief — binding):**
- Idle: render nothing except a single muted hint line under the audience chips when date or audience missing: `t("conflictHintIncomplete")` ("Pick a date and audience to check for schedule conflicts.").
- Checking: one `Skeleton` line inside the panel frame (h-10, `motion-reduce:animate-none` comes free from Skeleton).
- Clear: success-toned single line — check icon (lucide `CheckCircle2`, `text-success`) + `t("conflictClear", { audiences, scope })` naming `checkedAudiences` (and city when present). Quiet; no frame growth.
- Conflicts: panel frame = `rounded-lg border bg-muted/40 p-3` (flat, 1px). Header `<SectionLabel bordered={false}>` "/ SCHEDULE CHECK". Rows (max 3 visible; more inside a `max-h` internal scroll area with a "+N more" real-button expander): grade Badge (`destructive|warning|info` variant) + mono uppercase grade label (`/ CLASH`, `/ SAME EVENING`, `/ SAME DAY` — i18n'd), title, time relation line (`formatEventTimeRange` from `src/lib/event-time.ts` on the row's own fields + `overlapMinutes` when present), mono source badge (`AIT`/`IMPORT` — outline Badge, font-mono), external link icon when `sourceUrl` (rel noopener, aria-label). `audienceMatch === "related"` → appended muted `t("conflictRelatedAudience")` note.
- Tentative row (`tentative: true`): info-toned, `border border-dashed`, lucide `Lock` icon, copy `t("conflictTentativeHold", { date })` — renders NOTHING else (no title/link by wire contract).
- Honesty line whenever conflicts render: muted xs `t("conflictHonesty")` ("Based on events AIT knows about.").
- Error: muted line + inline retry button: `t("conflictCheckFailed")` ("Conflict check unavailable right now — you can still submit."). Never blocks submit.
- Results wrapper: `aria-live="polite"`. Panel total height ≤ ~240px (internal scroll beyond).

**Tests (component, mocked trpc/next-intl per house pattern):** each state renders (checking skeleton, clear line names audiences, error retry fires onRetry); conflict row shows grade label + title + source badge; tentative row shows lock + date and does NOT render title/link keys; +N expander reveals rows; aria-live present. Assert against mocked-echo i18n keys.

**Acceptance (#206):** aria-live polite; color never sole signal (icon+label per grade); tentative anonymized rendering; EN+NL keys present; vertical budget respected.

## Task 3 — #207 Slot chips + apply-to-form + #210 form-side

**Files:** modify `src/components/events/event-conflict-panel.tsx` (chip row lives in the panel file as `SlotSuggestionChips`, rendered via the panel's `children` or an explicit prop — implementer's call, keep one file), `event-form-dialog.tsx`, i18n catalogs, extend the panel test file.

- Chip row under the conflict list, headed `<SectionLabel bordered={false}>` "/ SUGGESTED TIMES" (i18n). 3–5 chips (server caps at 5): outline `<Button size="sm" variant="outline">` with `font-mono` date+time (`Wed 11 Jun · 18:00–20:00` — format via `Intl.DateTimeFormat` with the event timezone + locale from `useLocale()`) and a muted annotation from `reasons`: `clear`→`t("slotReasonClear")`, `preferred:<slug>`→`t("slotReasonPreferred", { audience })` (resolve slug→name via `checkedAudiences`), `original-time`→`t("slotReasonOriginalTime")`. Chips render only in `conflicts` state and only when suggestions exist.
- Click → dialog callback `applySuggestion({ date, startTime, endTime })` sets the three form fields, then the debounced query re-runs naturally. Flash the three inputs: add a temporary class (`ring-2 ring-success/60 transition-shadow duration-200 motion-reduce:transition-none`, cleared after ~1s via timeout ref) — instant appearance under reduced motion is inherent (transition-none).
- **#210 form-side:** in the submit mapping (~line 307 area, `audience: form.audience.length ? form.audience : undefined`): when `isEditing`, send `form.audience` ALWAYS (empty array = explicit clear, now honored by T1's server change); when creating, keep omit-when-empty. Remove/adjust the stale comment.
- **Tests:** chip click calls applySuggestion with exact triple; reasons render (clear/preferred/original-time); no chips in clear state; edit-mode submit sends `[]` when all chips cleared (extend existing dialog behavior test or add a focused mapping unit — if the dialog is too heavy to test cheaply, extract the submit-mapping into a small exported pure helper `buildEventSubmitPayload(form, mode)` in the dialog file or a sibling and unit-test that; note which you did).

**Acceptance (#207):** chips are real buttons, keyboard-reachable, visible focus; applying yields a clear check in the normal case (covered by re-query wiring); reduced-motion fallback. (#210): clearing every audience chip and saving an edit persists an empty audience list.

## Task 4 — #208 Approval-queue conflict state

**Files:** modify `src/server/api/routers/events.ts` (`getPendingCommunityEvents` ~1012-1078), `src/app/[locale]/communities/[slug]/events/page.tsx`, create `src/components/events/pending-event-conflict-badge.tsx` (+ test), i18n keys.

- **Proc extension:** add to each pending row: `startTime`, `endTime`, `timezone`, `format`, `city`, `audience: { slug, name }[]` (map populated docs defensively like getEventForEdit; the query needs `depth: 1` for audience — check current depth). No schema change; projection only.
- **Badge component:** `PendingEventConflictBadge({ event })` — calls `api.events.checkConflicts.useQuery` with the row's own fields (`audience: slugs`, `excludeEventId: event.id` — legitimate: the caller is a community admin, honored per T1), `enabled: audienceSlugs.length >= 1`. Renders: nothing while loading or when zero conflicts (no noise per the brief); else a severity Badge (highest grade = `conflicts[0].grade`, pre-sorted) with mono label + count (`/ CLASH · 2`). Clicking the badge toggles an inline read-only expansion under the row rendering `ConflictRow` (exported from the panel file) for each conflict + the honesty line. Real button, aria-expanded.
- **Mount:** in `renderEventRow`'s status-chip region (~after line 186), pending tab only (`showApproveReject` rows). The expansion renders in a full-width block under the row.
- **Tests:** badge renders highest grade + count from mocked query; zero conflicts renders nothing; expansion toggles and lists rows (reusing ConflictRow); no-audience rows never fire the query (assert enabled gating by mocking useQuery and inspecting the call).

**Acceptance (#208):** badge reflects highest-severity current conflict (fresh check at review time, not stored); zero-conflict rows silent; typecheck + lint clean.
