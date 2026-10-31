# 02 — Ashby jobs

**What to build:** A member pastes an Ashby board link and collects published roles even when its page builds the list with JavaScript.

**Blocked by:** 01 — Greenhouse jobs.

**Status:** ready-for-agent

- [ ] Ashby jobs appears under Jobs and supported board links select it with the company filled in.
- [ ] The collector reads the public structured board data through the guarded context and returns the shared job columns.
- [ ] Existing shared board readers are reused where their semantics fit; source dates are never invented.
- [ ] Empty boards, missing boards and invalid responses have useful translated states.
- [ ] The run appears in history with a useful name and supports existing CSV/JSON downloads.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.
