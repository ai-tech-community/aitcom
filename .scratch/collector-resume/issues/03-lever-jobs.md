# 03 — Lever jobs

**What to build:** A member selects Lever or pastes a Lever board link, then collects and downloads its jobs.

**Blocked by:** 01 — Greenhouse jobs.

**Status:** reviewed-locally; owner app check pending

- [x] Lever jobs appears under Jobs; supported links prefill the correct company.
- [x] Public structured data is read through the guarded context and mapped to the common job columns.
- [x] Invalid names, empty boards, missing boards and source failures are explained.
- [x] The completed run and row count appear in history and CSV/JSON downloads work.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.

Implemented on `feat/collector-lever`; plan and verification record:
`docs/superpowers/plans/2026-10-31-collector-lever.md`. Local review route:
`/dashboard/collectors/new/lever-board`, board `leverdemo`; paste the full EU
link for regional recognition. 121 focused tests, type-check, lint/format and
independent Standards/Spec reviews passed. Guarded stub-storage API replays
returned 10 global and 324 EU jobs; no database writes or branch push.
