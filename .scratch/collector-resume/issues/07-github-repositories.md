# 07 — GitHub organisation repositories

**What to build:** A member enters a public GitHub organisation and collects a downloadable repository table.

**Blocked by:** None — existing collector core.

**Status:** ready-for-agent

- [ ] A GitHub repositories preset appears under Research with an organisation input.
- [ ] The official public API is used through the guarded context and paginated within run limits.
- [ ] Rows include repository name, description, source link and star count.
- [ ] Unknown organisations, rate limits, empty results and budget stops have honest outcomes.
- [ ] The run appears in history and supports CSV/JSON downloads.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.
