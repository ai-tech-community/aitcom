# 11 — Agent-started collections visible in My runs

**What to build:** A member’s authorised agent starts a collection through MCP and the member sees its source, progress and results in My runs.

**Blocked by:** None — existing collector core.

**Status:** ready-for-agent

- [ ] The collect scope and list/start/status/items tools use the existing collector facade.
- [ ] Ownership, agent permissions, feature flag and quotas are enforced consistently with web starts.
- [ ] Agent-started runs appear in the owner’s history with a visible agent origin and useful title.
- [ ] The run page and downloads work for these datasets; no other member gains access.
- [ ] Existing connection guidance explains how to grant the collection permission without inventing new credentials.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.
