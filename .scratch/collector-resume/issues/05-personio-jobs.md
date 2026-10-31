# 05 — Personio jobs

**What to build:** A member supplies a Personio company board and gets downloadable job rows from its public XML feed.

**Blocked by:** 01 — Greenhouse jobs.

**Status:** ready-for-agent

- [ ] Personio jobs appears under Jobs with supported .de/.com board recognition.
- [ ] The public XML feed is read through the guarded context using bounded XML parsing.
- [ ] Titles, locations, departments, source links and available publication dates map to the common columns.
- [ ] Empty, missing and malformed feeds have clear translated outcomes; history and exports work.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.
