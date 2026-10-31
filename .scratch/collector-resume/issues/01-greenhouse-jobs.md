# 01 — Greenhouse jobs

**What to build:** A member pastes a supported Greenhouse board link or chooses Greenhouse jobs, starts a run and views/downloads its published roles.

**Blocked by:** None — existing collector core.

**Status:** implemented-locally — owner app review pending

- [x] Greenhouse jobs appears under Jobs; supported links fill the board name and show the recognised-source line.
- [x] Runs return title, location, department, URL and an optional genuine publication date.
- [x] Empty boards succeed; missing boards and unreadable responses have translated, actionable messages.
- [x] The form submission, keyboard choice control, recognizers and scanner compatibility have focused passing tests.
- [ ] After normal deployment, the owner reviews a persisted run and its CSV/JSON downloads in the app.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.
