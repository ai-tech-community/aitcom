# 10 — Site opt-out administration

**What to build:** Staff can manage domain opt-outs in the app and members receive the existing clear refusal when a run targets a blocked site.

**Blocked by:** None — existing collector blocklist enforcement.

**Status:** implementation complete in PR #547

- [x] A staff-only app surface lists opted-out domains and supports adding/removing an opt-out.
- [x] Domain input is canonicalised and invalid values are refused with field messages.
- [x] Permissions are enforced on every read and mutation; ordinary members cannot administer opt-outs.
- [x] The existing network guard consumes the same blocklist and applies it to redirect hops.
- [x] An affected member run explains that the site opted out; existing results stay private.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.

Implemented in [PR #547](https://github.com/ai-tech-community/aitcom/pull/547).
Plan and verification: `docs/superpowers/plans/2026-10-31-collector-completion.md`.
