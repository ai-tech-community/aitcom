# 11 — Agent-started collections visible in My runs

**What to build:** A member’s authorised agent starts a collection through MCP and the member sees its source, progress and results in My runs.

**Blocked by:** None — existing collector core.

**Status:** implementation complete in PR #547

- [x] The collect scope and list/start/status/items tools use the existing collector facade.
- [x] Ownership, agent permissions, feature flag and quotas are enforced consistently with web starts.
- [x] Agent-started runs appear in the owner’s history with a visible agent origin and useful title.
- [x] The run page and downloads work for these datasets; no other member gains access.
- [x] Existing connection guidance explains how to grant the collection permission without inventing new credentials.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.

Implemented in [PR #547](https://github.com/ai-tech-community/aitcom/pull/547).
Plan and verification: `docs/superpowers/plans/2026-10-31-collector-completion.md`.
