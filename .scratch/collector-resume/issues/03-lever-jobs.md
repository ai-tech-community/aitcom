# 03 — Lever jobs

**What to build:** A member selects Lever or pastes a Lever board link, then collects and downloads its jobs.

**Blocked by:** 01 — Greenhouse jobs.

**Status:** ready-for-agent

- [ ] Lever jobs appears under Jobs; supported links prefill the correct company.
- [ ] Public structured data is read through the guarded context and mapped to the common job columns.
- [ ] Invalid names, empty boards, missing boards and source failures are explained.
- [ ] The completed run and row count appear in history and CSV/JSON downloads work.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.
