# 04 — Workable jobs

**What to build:** A member selects Workable or pastes its board link and gets useful job rows from the public board data.

**Blocked by:** 01 — Greenhouse jobs.

**Status:** ready-for-agent

- [ ] Workable jobs appears under Jobs with correct company recognition.
- [ ] The supported public structured source is verified before the preset is offered.
- [ ] Every request uses the guarded context; rows use the common job columns.
- [ ] Empty, missing and unreadable boards have useful states; history and CSV/JSON exports work.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.
