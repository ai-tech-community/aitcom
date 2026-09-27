---
target: homepage
total_score: 18
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 3
timestamp: 2026-09-27T06-47-24Z
slug: src-app-locale-page-tsx
---
# Critique — Homepage (src/app/[locale]/page.tsx)

Method: dual-agent (A design review, B detector + prod browser probe on aitcommunity.org/en)

## Design Health Score: 18/32 (56%, Acceptable) — H7, H10 n/a (Persuade surface)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 2 | hero slogan "500+ members" vs stats "PEOPLE: 32" |
| 2 | Match real world | 2 | nav letters [C][W][U][G]; MCP jargon in START; all events typed MEETUP |
| 3 | User control | 3 | bare single-key shortcuts fire by accident |
| 4 | Consistency | 1 | cream gradient (No-Cream), orange on data (One Voice), [ FIG. n ] markers, max-w-6xl section misaligned |
| 5 | Error prevention | 2 | test community xxx.AI featured publicly |
| 6 | Recognition | 3 | letter shortcuts recall-only |
| 7 | Flexibility | n/a | landing page |
| 8 | Aesthetic/minimalist | 2 | slogans, ghost AIT., clouds, cacti, runner behind text |
| 9 | Error recovery | 3 | events empty state ok |
| 10 | Help | n/a | landing page |

## Design specificity
Half. Mono /LABEL, events table, ASCII craft are ownable. Hero story (cartoon runner, drifting slogans) and below-fold blocks (stats strip, 3 feature cards, Better Together, 3 duplicate CTA cards) are category-generic.
Detector: CLI clean on page + 8 components. Browser: 15 findings — real: footer low-contrast 4.2:1 x5, skipped heading h2->h4, 2 long lines; false positive: tight-leading on ASCII <pre>, overused-font (brand Geist), em-dash count (includes CMS text).

## Priority issues
1. [P0] Bart Simpson ASCII figure in hero (ascii-landscape.tsx:5-68, 477-513) — copyright/trust risk, off-brand, covers headline on mobile. Remove Bart, cacti, THOUGHTS slogans (:101-120). Replace with ASCII town square (humans + labelled agent glyphs in same groups, real next-event on notice board). Alternatives: build site with real community names; static NL/Europe community constellation. -> shape, overdrive
2. [P1] No primary CTA in first viewport (page.tsx:180-193); first actionable is JOIN after 10 tab stops. Add orange "Join a community" + outline "Host yours". -> layout
3. [P1] Cream gradient on <main> site-wide (layout.tsx:97 from-orange-50/60 via-amber-50/30); measured rgb(255,250,244). Remove. -> polish
4. [P1] Hero subtitle contrast over ASCII art: worst 3.28:1 desktop, 1.0:1 mobile (4.09% pixels <4.5). Clear zone/mask, darker subtitle, drop ghost AIT. watermark. -> layout
5. [P2] Reduced motion ignored (confirmed live); 4 rAF loops run forever off-screen (ascii-landscape.tsx:526, ascii-scene.ts:40-78); getComputedStyle every frame. Stats in text-primary (page.tsx:61) break One Voice; small numbers undersell. -> animate, colorize

## Persona red flags
- Jordan: unclear what site is; Bart reads as joke; START leads with Hub/MCP jargon; "Build With AI" goes different places for guest vs member.
- Casey: art behind headline; no CTA in thumb zone; stats grid eats fold; 4 animation loops drain battery.
- Riley: xxx.AI featured; 32 people vs 38 members; "G" key jumps to Challenges (WCAG 2.1.4, navbar.tsx:104-124).
- Organizer: "can I host here?" answered only by last card; no organizer tool screenshots; 1 sponsor/32 people looks early.

## Minor
- h1 up to 4.5rem > DESIGN.md 3.5rem cap; "Welcome to" filler.
- Best line "Where Engineers and AI Agents Build Together" unused on page.
- Footer gray text 4.2:1. No skip link. GridMarkers + rows add noise over art.

## Questions
- Brand says humans and agents are peers; why zero agents and zero real people on first screen?
- What if everything moving in the hero were real data?
- Organizers or members first? Fold serves neither.
