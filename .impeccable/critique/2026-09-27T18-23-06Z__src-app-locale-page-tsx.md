---
target: homepage
total_score: 26
max_score: 36
na_heuristics: 7
p0_count: 1
p1_count: 2
timestamp: 2026-09-27T18-23-06Z
slug: src-app-locale-page-tsx
---
# Critique — Homepage round 2 (live, after #344 #345 #348 #350)

Method: dual-agent (A design review on live site, B detector CLI on origin/main + live browser probe)

## Design Health Score: 26/36 (72%, Good) — H7 n/a
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | PEOPLE 32 vs featured card 38 members |
| 2 | Match real world | 3 | conferences typed MEETUP |
| 3 | User control | 3 | low stakes |
| 4 | Consistency | 2 | 3 CTA styles; "Host your community" two destinations; stat labels EN on /nl |
| 5 | Error prevention | 2 | Host card -> /sponsors; sponsor logo href="#" |
| 6 | Recognition | 3 | labelled rows |
| 7 | Flexibility | n/a | landing page |
| 8 | Aesthetic/minimalist | 2 | ~40 links, 9 sections, page restates itself 3x |
| 9 | Error recovery | 3 | calm empty board |
| 10 | Help | 3 | START HERE guidance |

## Specificity
Top half authored (town square w/ real next event, ASCII community houses, honest timetable); orange = logo dot + board `*` only. Bottom half generic template (Why AI+Humans slogans, lone faded sponsor, 3 duplicate CTA cards).
Measured: subtitle worst contrast 4.74:1 (was 1.0:1), reduced motion stops hero, no overflow 390/320, no page errors.
Detector: CLI 2 advisory (10px ASCII, false positive). Live: footer low-contrast 4.2:1 x6 and skipped heading h2->h4 (shared layout, real); tight-leading/cramped/occlusion from ASCII pre layers (false positives).

## Priority issues
1. [P0] "Host Your Community" card links to /sponsors (page.tsx:349-351, join.partner). Fix: CREATE_COMMUNITY_HREF, or remove closing cards. -> clarify/polish
2. [P1] Template ending (page.tsx:254-369): slogans, 3 uppercase props, lone 60% sponsor logo, 3 duplicate CTA cards. Fix: delete cards; replace Why AI+Humans with evidence (challenge result / impact numbers); close on town square + hero actions; sponsors as plain line until >=3. -> distill
3. [P1] Choice overload mid-page: What we do 14 links + START 5 before events. Fix: move Upcoming events under Featured; collapse What we do to 4 rows w/ one link each. -> distill/layout
4. [P2] Hero weak on mobile: plaza shrunk below buttons, board title truncated. Fix: narrow-screen close-up of fountain+board at full cell size; board title wraps 2 lines. -> adapt
5. [P2] Mixed language + untrusted numbers: stat labels hard-coded EN (page.tsx:236-241); PEOPLE 32 < 38 members; conferences as MEETUP. -> clarify

## Persona red flags
- Jordan: heading is a name not a promise; Join vs Explore unclear; xxx.AI looks like test data.
- Casey: ~10.5 screens; text links 16px tall (<24px WCAG 2.5.8); hero play only via tiny glyphs.
- Riley: 32 vs 38; sponsor href="#"; NL title case; 1-sponsor centered grid.
- Organizer: only bottom organizer CTA goes to sponsors; no preview of organizer tools.

## Minor
- Footer contrast 4.2:1 and h2->h4 (shared layout). "AI SPEED" mono for human copy. Two local SectionLabel copies. ArrowUpRight on internal links. Sponsor heading targets sponsors under "/ OUR SPONSORS".

## Questions
- Why leave the square after the first screen?
- Members or organizers first below the fold?
- One real story vs six small numbers?
