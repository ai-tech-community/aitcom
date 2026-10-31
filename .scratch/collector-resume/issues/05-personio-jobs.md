# 05 — Personio jobs

**What to build:** A member supplies a Personio company board and gets downloadable job rows from its public XML feed.

**Blocked by:** 01 — Greenhouse jobs.

**Status:** reviewed-locally; owner app check pending

- [x] Personio jobs appears under Jobs with supported .de/.com board recognition.
- [x] The public XML feed is read through the guarded context using bounded XML parsing.
- [x] Titles, locations, departments, source links and available publication dates map to the common columns.
- [x] Empty, missing and malformed feeds have clear translated outcomes; history and exports work.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.

Implemented on `feat/collector-personio`, stacked on the local Workable slice.
Plan: `docs/superpowers/plans/2026-10-31-collector-personio.md`. Owner route:
`/dashboard/collectors/new/personio-board`; use `https://demo.jobs.personio.de/`
and German (`de`) for four descriptions. 229 focused tests, type-check,
targeted style checks and independent final reviews passed. Real guarded
stub-storage replays verified .de/.com jobs and an empty feed. No push or
DB writes. Strict XML decoding uses the bounded worker and saxes6.0.0 already
present in the lockfile.
