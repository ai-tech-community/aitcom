# Workspace referral invitations

Approved: Greg selected prototype A, then requested the complete flow with live sending disabled until launch. Reference: local branch `codex/prototype-referral-invites`, commit `f7cae294`; issue #549.

Implement on `codex/referral-invites-workspace`. Preserve the community shell and AIT tokens. Replace the referral panel with a responsive composer beside an email preview, real invitation counts and copy-link fallback. Provide EN/NL/FR copy and a personal guest landing page. No prototype switches or fabricated activity in production.

1. Add invitation batches, deliveries, per-member UTC daily budgets and a global invitation suppression ledger. Normalize/dedupe at most ten recipients, cap at fifty/day, serialize quota and recipient checks, enforce membership and verified email, and preserve request idempotency. Keep personal referral codes free from roles, email binding, expiry and finite uses.
2. Deliver via a gated outbox with provider idempotency keys, retry leases and bounded retry windows. Production, explicit launch flag, stable signing secret, API key and webhook secret are all required. Reminders require their own explicit flag and remain off. Scrub raw recipient addresses after fourteen days and on join/suppression. Keep only keyed hashes for recipient cooldown and opt-out enforcement.
3. Add authenticated Resend bounce/complaint handling and account-free signed one-click unsubscribe. No GET changes subscription state. Do not alter transactional mail preferences.
4. Make invite pages public, validate grants before showing names, and keep authorization/redemption on the server. Carry invitation ID, ref and UTM through signup/sign-in and redemption. Record email-invite joins only for the matching authenticated recipient; XP stays activation-only. Preserve existing role-bound/slug invite semantics.
5. Implement Workspace using shared components and explicit loading/error/empty/disabled/partial-result states. Add contextual navigation and community entry. Wire only real endpoints and real counts.
6. Run only new/touched unit test files against an unusable database URL, then workspace type-check. Do not run integration/browser suites, apply migrations, send emails, push or merge. Review standards and spec with independent agents; fix material findings; commit locally. Browser host is unavailable, so disclose the visual-verification limit.

Launch/configuration instructions and deferred Aibuku attribution belong in a dedicated feature document. Homepage tagline changes are outside this feature. Database migrations are authored, never executed in this task. No draft PR can be published without pushing, which Greg's standing rules forbid; keep the branch local.
