---
target: event scheduling conflicts epic UI
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-07-14T16-26-35Z
slug: src-components-events-event-conflict-panel-tsx
---
# Critique — Event Scheduling Conflicts UI (Slices G–K epic)

Target: `src/components/events/event-conflict-panel.tsx` (+ `pending-event-conflict-badge.tsx`, `event-form-dialog.tsx` integration, events page approval queue). Source-level review; browser inspection unavailable (non-interactive session).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Dialog panel covers all 5 states; queue badge invisible while loading — "no badge" reads as "no conflicts" until it pops in |
| 2 | Match System / Real World | 3 | "Clash / Same evening / Same day" is good plain language; "tentative hold" + raw ISO date is systems-speak |
| 3 | User Control and Freedom | 3 | Advisory, never blocking; Retry offered. Slot chip apply has no undo unless server suggests "Original time" |
| 4 | Consistency and Standards | 3 | Panel is on-system; host page uses raw `zinc-*` hovers and hardcoded status strings |
| 5 | Error Prevention | 4 | n/a — solid; the feature *is* error prevention (pre-submit check, self-exclusion, stale-debounce guard) |
| 6 | Recognition Rather Than Recall | 3 | Chips show full date+time+reason; EN reason "Clear" is ambiguous (NL "Vrij" is better) |
| 7 | Flexibility and Efficiency | 3 | Auto-debounced check + one-click chips; no power-user accelerators beyond defaults |
| 8 | Aesthetic and Minimalist Design | 2 | Panel disciplined (3 rows + expander + capped scroll); host is a ~25-field single-scroll modal |
| 9 | Error Recovery | 2 | Dialog error state is a model ("you can still submit" + Retry); queue badge renders null on error — indistinguishable from "no conflicts" |
| 10 | Help and Documentation | 2 | Good contextual hint + honesty line; no explanation of what grades mean or what a reviewer should do about a tentative hold |
| **Total** | | **28/40** | **Good — solid foundation, address weak areas** |

## Anti-Patterns Verdict

**Not AI slop — the opposite.** LLM assessment: this is the most deliberately-crafted surface in the codebase (documented ~240px vertical budget arithmetic, calibrated honesty copy, anonymized tentative-hold contract). Deterministic scan: **0 findings** across all three conflict files (verified with and without project config) — zero raw palette classes, banned patterns, or provider tells. Note the scan covered the three components only; the host `events/page.tsx` has raw `zinc-*` classes the scan didn't see. Browser overlay skipped: no browser automation in this session.

## Priority Issues

1. **[P1] Approval-queue badge fails silent on error** — `pending-event-conflict-badge.tsx:81` returns null on error AND loading; a reviewer reads absence as "no conflicts" and approves on false reassurance at the exact moment the org relies on the signal. No-Silent-Failure violation. **Fix:** error → neutral outline chip reusing `conflictCheckFailed`/`conflictRetry`; loading → chip-sized `<Skeleton>`. → `/impeccable harden`
2. **[P1] Layout thrash on every re-check in the dialog** — `checking` swaps the ~238px conflicts frame for a ~66px skeleton (`event-conflict-panel.tsx:369-377`), so fields below jump ~170px per debounce cycle and the previous result — the thing the user compares against after applying a chip — vanishes. **Fix:** during `conflicts → checking`, keep the previous frame at reduced opacity with a "/ RECHECKING" mono indicator; reserve min-height. → `/impeccable polish`
3. **[P1] Gate inputs and results panel at opposite ends of the form** — panel slot at `event-form-dialog.tsx:750`, required audience picker + hint at 926-956. First-run organizers trigger the check only after scrolling past the panel; it materializes off-screen above them. **Fix:** co-locate audience chips with the scheduling block, or render the panel below the audience section; use `conflictHintIncomplete` as the panel's idle state instead of `return null`. → `/impeccable layout`
4. **[P2] WCAG 2.2 target-size + SR-status gaps** — "+N more" expander (~16px tall) and 14px external-link anchor under 24×24 (2.5.8); `checking` live region contains only a skeleton, announcing nothing; slot chips' accessible name is a fact, not an action ("Wed, Jul 15 · 18:00–20:00 Clear") — needs "Apply suggested time…" aria-label. Plus the known #214 anchor-in-anchor: badge `<button>` inside the row `<Link>` via `span.contents` + blanket `preventDefault` makes sourceUrl links inert and invalid HTML. → `/impeccable harden`
5. **[P2] Bilingual debt in the host flow + unlocalized machine values** — ~25 hardcoded English strings in the dialog and queue rows (submit states, Format/Region/City labels, "REJECTED — edit and resubmit", "PENDING APPROVAL") around a fully-translated feature; `conflictTentativeHold` interpolates raw `YYYY-MM-DD`; chip times always 24h regardless of locale. → `/impeccable clarify` + `/impeccable harden`

## Persona Red Flags

**Alex (power organizer):** panel thrash on every settled edit (~170px jump → misclicks); previous conflicts destroyed during re-check so he can't verify "the clash is gone"; queue badges pop in staggered (one query per row) — may approve before the badge lands. Positive: the flash ring on date/start/end after applying a chip is exactly the right confirmation.

**Sam (screen reader + keyboard):** "checking" is silent (skeleton-only live region), then the entire frame is re-announced each debounce cycle; slot chips lack action semantics; nested interactive controls in the queue row; sub-24px targets. Solid: `aria-expanded`/`aria-controls` both expanders, plural-aware badge aria-label, icons pair every grade color (Pair-With-A-Cue holds).

**Jordan (first-time organizer):** "An unpublished event has a tentative hold on 2026-07-15" — internal vocabulary, raw ISO date, no "so what do I do?"; grades carry no stakes (is info-blue "Same day" a warning or trivia?); "Import" source badge tells them nothing; the panel may appear behind them (see P1 #3).

## Minor Observations

- `hover:bg-zinc-100`/`text-zinc-400` on queue row actions (`page.tsx:246-291`) — raw palette, broken in dark mode.
- Tentative row = dashed bordered box inside the bordered frame — brushes the nested-card edge of Flat-By-Default.
- `text-[10px]`/`text-[11px]` arbitrary values below the type scale.
- Slot chips cram mono datetime + up to 3 sans reasons into one `size="sm"` button — long in NL.
- Cognitive load: conflicts state can present up to 10 elements / 6+ actionable choices (3 rows + expander + 5 chips + implicit "keep my time"); consider capping chips at 3.
- The `/` prefix on grade badges duplicates the House Kicker glyph outside its sanctioned role — canonize or strip.

## Questions to Consider

1. Should a `clash` really be zero-friction at submit? One confirm step on clash grade only might be worth it, given the community-wide cost of double-booked evenings.
2. Is the `/` becoming an unregulated house ornament? Either DESIGN.md canonizes "slash = machine-status prefix" or the badges drop it before it metastasizes.
3. Does per-row fresh checking scale? At 15 pending events, is a queue-level conflicts summary (one query, one banner) a better mental model than 15 independently-popping chips?

## What's Working

1. **Calibrated honesty as a trust posture** — "Based on events AIT knows about" + the scoped clear message that refuses to overclaim + "you can still submit" error copy.
2. **The stale-flash fix is real UX engineering** — `deriveConflictPanelState` makes `debouncePending` win over leftover results, extracted pure and unit-tested.
3. **Design-system fluency under constraint** — semantic badge variants only, icons paired with every status color, `SectionLabel` reused, documented vertical budget. The detector's zero findings confirm it.
