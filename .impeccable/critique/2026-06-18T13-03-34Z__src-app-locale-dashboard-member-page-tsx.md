---
target: member dashboard
total_score: 26
p0_count: 2
p1_count: 2
timestamp: 2026-06-18T13-03-34Z
slug: src-app-locale-dashboard-member-page-tsx
---
# Design Critique — Member Dashboard

Target: src/app/[locale]/dashboard/(member)/page.tsx + layouts + 6 rendered widgets

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Inconsistent load states — some "Loading…", some silently render null |
| 2 | Match System / Real World | 3 | Raw enum strings leak (platform-action, peer-review) unlocalized |
| 3 | User Control and Freedom | 3 | Dismissed onboarding checklist can never be reopened |
| 4 | Consistency and Standards | 1 | Hardcoded Tailwind green/red colors, duplicated avatar/progress patterns, mixed card radii |
| 5 | Error Prevention | 3 | Little destructive action; reversible edits |
| 6 | Recognition Rather Than Recall | 3 | Status tokens (PASS/FAIL, verification enums) shown with no legend |
| 7 | Flexibility and Efficiency | 3 | Infinite scroll, toggle, quick links — solid |
| 8 | Aesthetic and Minimalist Design | 3 | Five equal-weight stacked sections read monotonous |
| 9 | Error Recovery | 2 | tRPC query errors unhandled everywhere — a failed load looks like empty |
| 10 | Help and Documentation | 2 | Onboarding is the only guidance; no help on XP/levels/challenges |
| Total | | 26/40 | Acceptable — real gaps in consistency & error handling |

## Anti-Patterns Verdict

Does it look AI-generated? No. No cream background, no gradient text, no hero-metric block, no identical card grid. House kicker applied consistently, mono reserved for machine voice, agents rendered as peers. The real risk is the opposite of slop: it leans toward the cold/sterile dashboard anti-reference — a stack of gray mono-labeled lists with no imagery, no warmth, no closing invitation.

Deterministic scan: detector returned 0 findings across all 9 dashboard files (exit 0), confirmed real via positive control (fires design-system-color on datacenters-map-view.tsx:81 #0ea5e9 and events-map-view.tsx).

Divergence: the design review flagged a P0 for hardcoded bg-green-500/text-green-600/text-red-500 in challenge widgets, but the detector did NOT catch them because it flags literal hex/rgba, not Tailwind palette utility classes. The LLM caught a real token-discipline breach the scan is blind to. "Clean" detector result = "no raw hex," not "fully on-system."

## Overall Impression

Structurally disciplined and on-brand at component level, but under-delivers on consistency (heuristic #4 = 1) and warmth (colder than "town square" promises). Biggest opportunity: rein improvised status colors and one-off components back onto the shared system, then give the page real hierarchy.

## What's Working

1. House Kicker Rule applied consistently — every section opens with font-mono text-xs tracking-wider text-muted-foreground + border-b. No competing eyebrows.
2. Mono-Is-Machine respected — stats/XP/timestamps in Geist Mono; names/bios in Geist Sans (social-suggestions.tsx:121).
3. Agents as peers — Suggested Agents mirror Suggested Members structurally.

## Priority Issues

- [P0] Hardcoded Tailwind palette colors break token discipline. bg-green-500/15 text-green-600, text-red-500 in active-challenges-widget.tsx:10-15 and challenge-progress.tsx:111-139. Violates Chart-Containment Rule, unverified AA/color-blind. Fix: semantic tokens + non-color cues; difficulty -> Badge. Command: /colorize then /audit.
- [P0] tRPC query errors render as silent emptiness. Every widget does if (!data) return null with no isError branch (active-challenges-widget.tsx:26, social-suggestions, challenge-progress, dashboard-profile). Fix: per-section error state with retry; section error boundary. Command: /harden.
- [P1] Flat, equal-weight hierarchy reads as cold list-stack. Five sections uniform space-y-8; off-scale font-extrabold text-3xl "Dashboard" H1 ((member)/layout.tsx:18). Fix: give profile/onboarding primacy (2-col wide), drop H1 to font-semibold. Command: /layout then /typeset.
- [P1] Hardcoded English bypasses i18n. "Loading…", "Load More", / ACTIVITY, / ACTIVE CHALLENGES, empty-state prose literal English despite next-intl. Fix: route all user-facing strings through next-intl. Command: /clarify.
- [P2] Duplicated patterns that should be shared. Two avatar-fallback impls, three hand-rolled progress bars (h-1 vs h-1.5), bespoke segmented toggle, [CLOSE] bracket-button not in spec. Fix: extract Avatar, ProgressBar, SegmentedControl; replace bracket-buttons with Button ghost xs. Command: /distill.

## Persona Red Flags

- Alex (power user): sections vanish silently on error; dismissed onboarding irreversible; no keyboard-jump/density control on feed.
- Sam (accessibility): color-as-meaning in text-green-600/text-red-500 (unaudited); toggle pills and [CLOSE] button raw <button>s missing focus ring; icon-only onboarding link no aria-label; progress bars plain <div>s no role=progressbar/aria-valuenow.
- "Pim," returning Dutch member: greeted by extrabold "Dashboard"; half the UI untranslated; page dead-ends in gray list with no warm CTA back into the square.

## Minor Observations

- font-extrabold off-scale (DESIGN.md max 600); card radii mix rounded/rounded-lg/rounded-xl (spec: cards = rounded-xl).
- Arbitrary text-[10px]/text-[11px] mono labels drift below documented 12px label size, risk AA floor.
- border-dashed border-primary/30 bg-primary/5 passive cards spend One Voice orange budget on containers.
- timeAgo hardcodes English ("just now", "m ago"), no NL pluralization.

## Questions to Consider

1. If you removed the orange dot, would anything distinguish this from the cold sterile dashboard you reject?
2. When every section is a peer-weight / LABEL, has the kicker stopped creating hierarchy and started flattening it?
3. For a Netherlands-born, Dutch-first product, which is the real default language here?
