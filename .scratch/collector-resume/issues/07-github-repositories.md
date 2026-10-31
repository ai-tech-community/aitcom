# 07 — GitHub organisation repositories

**What to build:** A member enters a public GitHub organisation and collects a downloadable repository table.

**Blocked by:** None — existing collector core.

**Status:** implementation complete in PR #547

- [x] A GitHub repositories preset appears under Research with an organisation input.
- [x] The official public API is used through the guarded context and paginated within run limits.
- [x] Rows include repository name, description, source link and star count.
- [x] Unknown organisations, rate limits, empty results and budget stops have honest outcomes.
- [x] The run appears in history and supports CSV/JSON downloads.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.

Implemented in [PR #547](https://github.com/ai-tech-community/aitcom/pull/547).
Plan and verification: `docs/superpowers/plans/2026-10-31-collector-completion.md`.
