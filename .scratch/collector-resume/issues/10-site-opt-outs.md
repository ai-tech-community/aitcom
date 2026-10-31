# 10 — Site opt-out administration

**What to build:** Staff can manage domain opt-outs in the app and members receive the existing clear refusal when a run targets a blocked site.

**Blocked by:** None — existing collector blocklist enforcement.

**Status:** ready-for-agent

- [ ] A staff-only app surface lists opted-out domains and supports adding/removing an opt-out.
- [ ] Domain input is canonicalised and invalid values are refused with field messages.
- [ ] Permissions are enforced on every read and mutation; ordinary members cannot administer opt-outs.
- [ ] The existing network guard consumes the same blocklist and applies it to redirect hops.
- [ ] An affected member run explains that the site opted out; existing results stay private.

For implementation, add or change only the tests that prove this slice; run those files and the workspace type-check. Never run full/integration/Chromium test tiers, push, or write to a database. Preserve shared safeguards and EN/NL/FR copy.
