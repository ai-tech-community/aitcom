# 04 — Workable jobs

**What to build:** A member selects Workable or pastes its board link and gets useful job rows from the public board data.

**Blocked by:** 01 — Greenhouse jobs.

**Status:** merged in [PR #546](https://github.com/ai-tech-community/aitcom/pull/546) (`14a5195d`)

- [x] Workable jobs appears under Jobs with correct company recognition.
- [x] The supported public structured source is verified before the preset is offered.
- [x] Every request uses the guarded context; rows use the common job columns.
- [x] Empty, missing and unreadable boards have useful states; history and CSV/JSON exports work.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.

Implemented on `feat/collector-workable`; plan and validation record:
`docs/superpowers/plans/2026-10-31-collector-workable.md`. Owner route:
`/dashboard/collectors/new/workable-board`, name `careers`; also paste
`https://apply.workable.com/huggingface/`. 150 focused tests, type-check,
syntax/style checks and independent Standards/Spec reviews passed. Guarded
stub-storage replays collected two and six jobs with descriptions and
verified the missing-board error. No database writes or Workable push.
