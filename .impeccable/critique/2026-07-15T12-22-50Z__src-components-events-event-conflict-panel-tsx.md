---
target: event scheduling conflicts epic UI (post-remediation)
total_score: 30
p0_count: 1
p1_count: 3
timestamp: 2026-07-15T12-22-50Z
slug: src-components-events-event-conflict-panel-tsx
---
# Critique #3 — Event Scheduling Conflicts UI (post-remediation, main)

Target: same surface as prior snapshots. Reviewed blind on merged main (after PRs #225–#229). Detector (Assessment B): 0 findings across all four files including the events page. Browser inspection unavailable.

## Design Health Score: 30/40 (trend 28 → 29 → 30)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of status | 3 | Panel is 5-state + "/ RECHECKING" aria-busy; but Pending tab renders NOTHING on fetch error (page.tsx:522) |
| 2 | Match real world | 3 | Grades excellent; "tentative hold", bare "AIT" chip, "Preferred by {audience}" are internal vocabulary leaking |
| 3 | User control/freedom | 3 | Slot apply has no undo; suggestions 4–5 unreachable; Reject fires with no confirm while Cancel gets one |
| 4 | Consistency | 3 | Shared grade maps praised; chips print 24h times vs locale-aware rows; queue date "2026.7.05" unpadded |
| 5 | Error prevention | 3 | Feature-side excellent; Reject-no-confirm + unmarked required audience field are host gaps |
| 6 | Recognition over recall | 3 | Scoped clear message excellent; severity ranking implicit in sort+tint only, no legend |
| 7 | Flexibility/efficiency | 3 | One-click slot apply + flash praised; queue has no bulk expand/approve, N rows = N queries; 400-option timezone Select |
| 8 | Aesthetic/minimalist | 3 | Panel disciplined (3 rows, 3 chips, ~246px ceiling); host dialog is a 20-field 90vh modal |
| 9 | Error recovery | 4 | n/a — solid: retry + "you can still submit", retryable badge chip, zod field messages |
| 10 | Help/docs | 2 | Good inline hints; grade taxonomy, tentative-hold meaning, and reviewer guidance still untaught |

## Verdict
"Not slop — the opposite of slop… high-craft feature embedded in a mediocre host." All prior fixes independently confirmed: recheck continuity system, No-Silent-Failure badge contract, stable live region, 24px targets inside 18px chrome, warning-token pending count with documented One Voice rationale, chip cap with rationale, full EN/NL parity with native-grade NL. Detector: clean on all 4 files (page.tsx raw palette gone).

## Priority Issues (current)
1. **[P0] Audience toggles invisible to AT / color-blind users** — `event-form-dialog.tsx:786-795`: no `aria-pressed`, selected state by fill inversion only. This is the gate input for the whole feature; WCAG 4.1.2 + 1.4.1, Pair-With-A-Cue violation. Fix: `aria-pressed`, Check icon on active chips, `role="group"` + label.
2. **[P1] Pending/mine tabs silently blank on fetch error** — `page.tsx:522, 550`: `!pendingError` renders nothing; a moderator reads an empty pane as "queue clear". Fix: `<ErrorState onRetry>` like the Published tab.
3. **[P1] formatDate shifts dates a day early for UTC-negative viewers** — `page.tsx:34-37`: `new Date("YYYY-MM-DD")` parses UTC midnight then reads local getters; also unpadded month. Reviewers judge conflicts against a wrong date. Fix: Intl.DateTimeFormat in event timezone.
4. **[P1] Reject has no confirmation** — `page.tsx:338-350` fires instantly while Cancel gets a destructive confirm. Fix: same confirm or undo toast.
5. **[P2] Conflicts state never says submission is allowed; severity unexplained** — reassurance only exists in the error state; grades have no legend. Fix: one line under the honesty line + grade tooltips.

## Notable minors
- Clear→recheck still drops to skeleton (anti-jump protects only the conflicts branch).
- Live region wraps interactive content; "+N more" expansion narrates all rows; consider sr-only summary count.
- Chips 24h times vs locale rows; badge error chip can't wrap (nowrap base) — NL "Controle niet beschikbaar" on narrow screens.
- `typeLabels` + EVENT_FOCUS/LEVEL/FORMAT_LABELS still hardcoded English (event-metadata.ts) feeding the dialog Selects.
- Pending-count bubble fixed 16px — overflows at 2+ digits.
- Published-tab rows still nest Edit/Cancel/Manage buttons inside the row Link (fixed for pending, not for published).
- Format silently defaults to "online" for the check before the organizer picks format.
- Verify AA contrast for `text-warning`/`text-info` on /15 tints at 10px in both themes.

## Provocative questions
1. A reviewer can Approve an event wearing a red CLASH · 3 chip without expanding it — should a clash-grade result require one acknowledgment click before Approve?
2. A 22-line comment defends a 250px budget inside a 20-field 90vh modal that violates the modal-as-first-thought ban — is the discipline at the wrong altitude? Dedicated create-event page?
3. Should a partial-knowledge system render "no conflicts" with a confident green check, or should the clear state be as humble as the honesty line?
4. Is the 3-chip cap worth silently discarding the two slots that might be the only ones a venue-constrained organizer can use?

## Strengths
1. The re-check continuity system — solves layout jump, comparison loss, and stale-action application at once; "most teams don't notice they have" these problems.
2. Trust calibration in copy — honesty line, scoped clear, No-Silent-Failure badge contract.
3. "Accessibility as architecture, not garnish" — stable live region with documented rationale, sr-only status on every skeleton, engineered 24px targets.
