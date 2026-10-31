# 12 — Structured events from a public page

**What to build:** A member pastes a public event page containing structured Event data and gets event rows without writing selectors.

**Blocked by:** None — existing collector core and extraction sandbox.

**Status:** implementation complete in PR #547

- [x] An Event page preset and Events rail group are reachable in the workspace.
- [x] The public page is fetched through the guarded context and JSON-LD is read inside the deadline-bound extraction sandbox.
- [x] Event entries including nested ItemList/@graph yield name, start/end, URL, venue, city, online flag and organiser.
- [x] No Event data, malformed content and refused/oversized pages have honest translated outcomes.
- [x] Results appear in history and support CSV/JSON download; site-specific presets remain separate measured follow-ups.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.

Implemented in [PR #547](https://github.com/ai-tech-community/aitcom/pull/547).
Plan and verification: `docs/superpowers/plans/2026-10-31-collector-completion.md`.
