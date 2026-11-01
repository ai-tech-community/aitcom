# Member invitations by email

Implements issue #549 using Greg's selected Workspace layout. The community's Invite friends page has a recipient composer alongside the exact localized email copy, a manual share-link alternative and real sent/joined/activated totals. Community overview and navigation link to it. The community in context is the destination; API callers without a slug default to the AIT Hub (`ait`), where signed-in members are enrolled by the existing auth flow.

## Launch configuration

Sending is **off by default**, including on production. No preview or test environment can send these invitations, even with a provider API key. The UI explains the unavailable email action and keeps manual link sharing available.

Sending requires all of:

- `REFERRAL_INVITES_ENABLED=true`
- `VERCEL_ENV=production` and `NODE_ENV=production`
- `REFERRAL_INVITE_SECRET`: dedicated, stable, random secret of at least 32 characters
- `REFERRAL_RESEND_WEBHOOK_SECRET`: Resend signing secret for this webhook
- `RESEND_API_KEY`: the existing provider API key

Do not enable those settings until Greg approves launch. Configure the Resend webhook URL `/api/referral-invites/webhook` for `email.bounced` and `email.complained` first. Verification consumes the untouched request body and signed Svix headers. Webhook handling and recipient opt-out continue functioning when sending is paused.

`REFERRAL_INVITE_REMINDERS_ENABLED=true` separately permits one reminder at least four days after the initial accepted send, only while the main launch gate also passes. It is off by default, preserving the one-invitation prototype. Disabling the reminder switch also stops queued reminder work. Reminders skip joined, banned, suppressed, expired/revoked, and ineligible destinations or senders.

The new migration is `20261101a_referral_email_invites`. It is registered at the end of the normal migration list; it must be applied by the normal release process before the application feature is used. This task only authored it and never connected to a database or ran the build/migration commands.

## Delivery and privacy behavior

Verified active members may submit at most ten normalized addresses per batch. A locked per-member budget limits accepted initial invitations to fifty per UTC day across communities. Recipient advisory locks serialize a fourteen-day cooldown across all inviters and communities. Self-invites, current/banned members, globally suppressed recipients and recently invited addresses are skipped with the same generic response. No specific skip reason or account-membership information is returned.

The caller supplies a UUID request identity. Repeating it returns the original batch; changing its recipient set, locale or destination returns a conflict. The browser retains this identity after a lost response, and unsent addresses stay editable. A persistent outbox claims deliveries with row locks and a ten-minute lease. Each initial/reminder send has its own stable Resend idempotency key. Retries stop after six attempts or twenty-three hours from the first attempt, before Resend's twenty-four-hour key retention expires. Accepted is distinguished from sent; queued work is reported as awaiting delivery.

The cron `/api/cron/referral-invites` runs every five minutes, requires a configured `CRON_SECRET`, cleans expired addresses, prepares explicitly enabled reminders and dispatches bounded batches. Delivery rechecks membership, verification, community settings, the grant, the recipient's membership and suppression immediately before provider contact. A message already in flight cannot be recalled by an opt-out.

Recipient matching uses a dedicated keyed HMAC, never a plain email hash. Opt-out tokens contain only that keyed hash and a separate-purpose signature; they work for people without accounts. GET only shows confirmation. A signed confirmed POST or RFC8058 one-click POST records a global **friend-invitation** suppression and clears any stored address. Digest and transactional-email preferences are unchanged. Addresses are also scrubbed on community/Hub joining through any entry route and by fourteen-day cleanup. The keyed ledger remains to enforce cooldown/opt-out and to attribute later joins without retaining the raw address. Preserve the dedicated secret across deployments; changing it invalidates unsubscribe links and recipient matches, so rotation requires a planned migration.

The guest page shows only valid invite presentation data and preserves role-bound grant authorization on redemption. It carries `noindex` and a canonical to `/en/join`. Existing open/approval standing slug links remain functional, including unlisted communities reached directly; invite-only communities still require an opaque grant. Authentication preserves delivery ID, ref and UTM inside a sanitized internal callback. Redemption trusts the actual invite code, never the ref/UTM values. A tracked join requires the authenticated recipient's matching keyed email and actual membership attribution; Hub auto-enrolment is handled without attributing pre-existing memberships or replacing another inviter. XP remains activation-only under ADR0018.

Copied personal Hub links also retain attribution when signup has already auto-enrolled the account. The explicit guest CTA passes through `/api/referral-invites/start`, which validates the grant and stores signed pre-signup context in an HttpOnly, SameSite=Lax cookie. Production requires the secure `__Host-` cookie; the HTTP fallback is accepted only in development. This context uses a purpose-separated signature under the existing auth secret, lasts at most twenty-four hours, and stays out of shared URLs and RPC parameters. An authentication retry keeps the original entry time. Only an account created after that browser's entry may claim an unassigned active Hub membership through an unrestricted personal grant. Existing accounts, assigned inviters, finite/role-bound grants and bans remain unchanged. This works while email sending is disabled and awards no XP on signup.

## Validation and deferred work

Implementation verification: **93 unit tests passed across 14 added/touched test files**, and `pnpm typecheck` passed. Formatting and diff checks passed. Independent standards and spec reviews found no remaining material issue in their reviewed scope after the reminder, legacy-invite and join-cleanup fixes. Design-token drift was corrected; the only detector exception retains the design system's required Geist Sans in the email template.

Follow-up diagnosis reproduced the missing copied-link signup context at the guest authentication handoff. All **28 focused regression tests passed across four new/touched test files**, and the workspace type-check passed. These cover the guest page, signed browser context, auth redirects, and the real redemption procedure with mocked storage; they also reject client-body proofs, old accounts, restricted grants and insecure production-cookie fallbacks. Standards and spec reviews cleared the fix after the production-cookie restriction. Final pre-PR lint cleanup preserved blank-name fallbacks and passed changed-file ESLint, formatting, 34 tests across the three touched test files, and the workspace type-check; focused source review found no material issue.

Run only the added/touched unit test files and `pnpm typecheck`. Unit tests use mocks and an unusable database URL; no integration or Chromium suite is part of this task. The browser host is unavailable, so visual rendering, real provider delivery, migration execution and concurrent database behavior have not been exercised. The lock/unique/check constraints have received source review; they still need normal staging/CI validation before launch.

The prototype variants stay on their separate throwaway branch. Homepage tagline changes and downstream Aibuku conversion tracking are outside this change.

Provider references: [webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [idempotency keys and their retention](https://resend.com/docs/dashboard/emails/idempotency-keys).
