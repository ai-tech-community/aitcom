# 08 — First ready-made HTML template

**What to build:** A member selects one verified site template and reads a useful list without supplying CSS selectors.

**Blocked by:** None — existing page-list collector.

**Status:** implementation complete in PR #547

- [x] Choose one source from measured static-page candidates; verify real returned HTML and site rules before offering it.
- [x] The preset appears in the appropriate rail group and asks only for the member-specific values.
- [x] Saved selectors stay in settings and pass the existing selector policy.
- [x] A saved source-page fixture proves expected nonempty rows and correct source links.
- [x] An empty or changed page is explained; results appear in history with CSV/JSON download.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.

Implemented in [PR #547](https://github.com/ai-tech-community/aitcom/pull/547).
Plan and verification: `docs/superpowers/plans/2026-10-31-collector-completion.md`.
