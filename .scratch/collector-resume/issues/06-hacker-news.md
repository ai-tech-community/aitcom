# 06 — Hacker News stories

**What to build:** A member chooses Top, New, Ask or Show and a limit, then sees stories with points, comments and links.

**Blocked by:** None — existing collector core.

**Status:** implementation complete in PR #547

- [x] Hacker News appears under Research; supported pasted site paths preselect the corresponding list.
- [x] The form supports the list choice and bounded item limit.
- [x] Official public data is fetched through the guarded context; item requests respect site and run budgets.
- [x] Rows include title, URL, points, comments, author, source date and discussion URL.
- [x] Unavailable items are handled explicitly and partial budget stops remain honest; history and downloads work.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.

Implemented in [PR #547](https://github.com/ai-tech-community/aitcom/pull/547).
Plan and verification: `docs/superpowers/plans/2026-10-31-collector-completion.md`.
