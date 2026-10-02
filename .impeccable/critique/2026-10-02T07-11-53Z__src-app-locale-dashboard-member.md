---
target: member dashboard
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-10-02T07-11-53Z
slug: src-app-locale-dashboard-member
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped: no browser tool; local dev server hits prod DB.

Score 19/40 (Poor). H1 2, H2 2, H3 2, H4 1, H5 2, H6 2, H7 3, H8 1, H9 2, H10 2.
Detector: 0 findings across 12 route files + 31 components (canary test confirmed it works). Problems are structural, not pattern-level.

P0 "Feed" tab is not a feed; next action buried. page.tsx:24-37 stacks Boost, Profile, Checklist, Streak, Points, Challenges, Activity (7th), Suggestions. Fix: rename Home; order Next up -> community activity -> people; compact /PROGRESS strip.
P1 Tab names clash with global nav (EVENTS/JOBS mean public in navbar, "mine" in tabs). Dashboard only in avatar menu. Quick links row duplicates bell. Fix: My events / My communities / Job tracker; Notifications as a tab; drop Quick links.
P1 Five tabs look like five products: different headers, empty states, loading, filters (Events pills vs SegmentedControl), widths, card radii. Fix: one DashboardSection wrapper.
P1 Silent failures + English-only: communities/page.tsx:14,31 error reads as empty; activity-feed has no error branch; hard-coded "Dashboard / Welcome back", activity verbs, notification buttons. Clear all deletes with no confirm (notifications-page-content.tsx:101-110).
P2 Color/type drift: green flame + green checks, hand-rolled orange XP bar, 3 progress bar styles, mono on human copy (Quick links, badge names), unexplained dashed borders.
P2 A11y: tabs no aria-current (dashboard-tabs.tsx:38-49); hover-only notification actions; nested links in communities rows; two h1 on onboarding; XP bar no progressbar role.
