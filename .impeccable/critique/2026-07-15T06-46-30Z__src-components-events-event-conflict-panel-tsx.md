---
target: event scheduling conflicts epic UI (post-P1 fixes)
total_score: 29
p0_count: 1
p1_count: 2
timestamp: 2026-07-15T06-46-30Z
slug: src-components-events-event-conflict-panel-tsx
---
# Re-critique — Event Scheduling Conflicts UI (post-P1-fixes)

Target: same surface as 2026-07-14 baseline (28/40). Reviewed on branch `fix/conflict-ui-critique-p1s` at commit 9fb4b48 (the three P1 fixes), blind to the prior critique. Detector (Assessment B): 0 findings on the three conflict files. Browser inspection unavailable.

**Note:** three findings below (badge skeleton silent to SR, chips clickable mid-recheck, per-state aria-live divs) were fixed the same day in commit f792bbe, after this snapshot's review ran.

## Design Health Score: 29/40 (baseline 28)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of status | 3 | Five explicit states + "/ RECHECKING" relabel strong; badge loading skeleton was aria-hidden with no text (fixed in f792bbe) |
| 2 | Match real world | 3 | "AIT" source chip is insider shorthand; "tentative hold" is registrar-speak |
| 3 | User control/freedom | 3 | Non-blocking, retry everywhere; no undo after applying a slot |
| 4 | Consistency | 2 | Feature exemplary (shared maps); host page raw green/red/orange/zinc palette next to token-correct badges |
| 5 | Error prevention | 4 | n/a — solid |
| 6 | Recognition over recall | 3 | Dimmed previous results = compare not remember; reviewer must expand a 10px chip before one-click Approve |
| 7 | Flexibility/efficiency | 3 | Auto-debounce + one-click chips; every City keystroke restarts the cycle, no force-check |
| 8 | Aesthetic/minimalist | 3 | Panel disciplined; 10px/11px type at legibility floor; host form dwarfs it |
| 9 | Error recovery | 3 | Retry in panel and badge; sourceUrl links dead in queue expansion (P0, = #214) |
| 10 | Help/docs | 2 | Good micro-help; grade semantics and tentative-hold implications untaught |

## Confirmed fixed from baseline
- Silent-on-error queue badge → retryable "check unavailable" chip + skeleton slot (No-Silent-Failure now holds visually).
- Layout thrash → recheck keeps previous frame dimmed under "/ RECHECKING"; cited as "a masterclass in continuity" and the flow's strongest moment.
- Panel/audience distance → audience picker now directly above the panel; placement checklist item passes.
- In-panel targets now meet WCAG 2.5.8 (expander min-h-6, source link 24px, retry h-6).

## Priority Issues (current)
1. **[P0] Pending-queue row interaction structurally broken** (= tracked #214): rows are `<Link>`s that 404 for drafts; the `preventDefault` wrapper kills sourceUrl links inside the expansion; buttons/links nest inside the row anchor. Fix: pending rows stop being anchors; interactive children become top-level siblings.
2. **[P1] Live-region architecture** — per-state aria-live divs never reliably announce (fixed same day: single persistent wrapper, f792bbe; badge sr-only checking text added).
3. **[P1] Host queue chrome violates Semantic-Status + 2.5.8** — raw `green-600/red-500/orange-500/zinc-*` at page.tsx:246-429; Approve/Reject ≈22px, badge trigger ≈18px targets.
4. **[P2] Bilingual coverage stops at the feature's edge** — dozens of hardcoded EN strings in dialog + page, including the "Audience" label on the feature's own gate input.
5. **[P2] Suggestion chips** — can't wrap (whitespace-nowrap + long NL reasons overflow narrow dialogs); up to 5 undifferentiated options (cap at 3, best first); were clickable mid-recheck (fixed same day, f792bbe).

## Notable minors
- Recheck from a previous *clear* state still falls to the skeleton branch (small clear↔skeleton pulse); dim the clear line like the conflicts frame.
- Conflict check silently assumes `format: "online"` when the Format field shows "None" — a same-city physical event could be graded as online.
- `formatDate` (page.tsx:34) parses as UTC midnight but reads local getters — dates shift a day for negative-UTC users.
- Audience toggle chips have no `aria-pressed`; selected state is fill-color only (Pair-With-A-Cue gap on the feature's own gate).
- Chip times always 24h; inconsistent with Intl-formatted row times.

## Provocative questions
1. If a `clash` grade doesn't gate — or at least interrupt — one-click Approve, what is the grade for?
2. The queue re-checks live, but the organizer never learns a conflict appeared after submission — why is the person who can move the event the last to know?
3. Should Format/City/Timezone be one composed "where does this happen" input so the check never guesses?

## Strengths
1. Recheck continuity solved at the state-derivation level, not patched in render.
2. Calibrated honesty copy throughout (scoped clears, honesty line, non-blocking failure).
3. Consistency by construction: exported grade maps make the badge unable to drift from the panel.
