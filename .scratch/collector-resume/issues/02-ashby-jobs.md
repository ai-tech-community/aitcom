# 02 — Ashby jobs

**What to build:** A member pastes an Ashby board link and collects published roles even when its page builds the list with JavaScript.

**Blocked by:** 01 — Greenhouse jobs.

**Status:** implemented locally — review and owner app check pending

- [x] Ashby jobs appears under Jobs and supported board links select it with the company filled in.
- [x] The collector reads the public structured board data through the guarded context and returns the shared job columns.
- [x] Existing shared board readers are reused where their semantics fit; source dates are never invented.
- [x] Empty boards, missing boards and invalid responses have useful translated states.
- [x] The run appears in history with a useful name and supports existing CSV/JSON downloads.

Review route: `/dashboard/collectors/new/ashby-board`, board name `Ashby`.
Read-only guarded replay on 2026-10-31 returned 74 listed job rows and logged
`Found 74 jobs.` without database storage. Entries marked unlisted are omitted.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.
