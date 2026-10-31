# 09 — Visible dataset expiry and cleanup

**What to build:** A member can see when a dataset expires and expired datasets are actually removed by the retention worker.

**Blocked by:** None — existing collector core.

**Status:** implementation complete in PR #547

- [x] The run screen displays its stored expiry date in the member’s locale.
- [x] The retention worker removes only eligible expired datasets and associated rows in bounded batches.
- [x] Cleanup and active-run handling are explicit and safe under repeated worker invocations.
- [x] Expired/missing run links and downloads give the existing clear unavailable result.
- [x] Verification uses mocks or saved data without writing to a database; manual production mutation is not part of implementation.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.

Implemented in [PR #547](https://github.com/ai-tech-community/aitcom/pull/547).
Plan and verification: `docs/superpowers/plans/2026-10-31-collector-completion.md`.
