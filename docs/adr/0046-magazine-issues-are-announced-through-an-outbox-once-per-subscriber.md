---
status: accepted
---

# Magazine issues are announced through an outbox, once per subscriber

A [[magazine-subscriber]] follows a [[magazine]] and hears when a new
[[issue]] is published. A [[scheduled-issue]] uses the same publication path
as the Publish button. This ADR records the subscriptions slice's boundaries
and the decisions its later tasks implement. Sources:
`docs/superpowers/specs/2026-10-26-community-magazines-design.md` (Goals 8,
Flow 6 and slice 4), and
`docs/superpowers/plans/2026-10-27-community-magazines-subscriptions.md`
(Decisions 1–14).

It extends [ADR-0042](0042-magazine-issues-are-read-through-one-access-resolver.md)
(the resolver decides who may read),
[ADR-0043](0043-magazine-issue-items-are-a-registry-of-kind-strategies.md)
(publication owns placement and credit), and
[ADR-0045](0045-magazine-roles-are-capabilities-read-through-the-editorship-seam.md)
(the scheduler needs `edit`). Notices reuse the inbox from
[ADR-0025](0025-real-time-delivery-is-asymmetric.md); there is no new inbox channel.

## Context

- Subscriptions are site-written relationships between Payload magazines and
  accounts or confirmed email addresses. They need uniqueness and cascading
  deletion, like the magazine team.
- Publishing must remain quick and atomic while delivery survives retries,
  overlapping runs, email refusal and changes to issue visibility.
- A schedule must preserve publication's validation, article placement and
  credit rules, and must check the scheduler's current rights when it runs.
- Public email forms must not reveal addresses or let a new magazine mail
  arbitrary text to strangers.

## Decision

1. **One Drizzle subscription table (plan Decision 1).**
   `app.magazine_subscription` has a UUID string id, magazine id, exactly one
   of user id or normalized email, email locale (`en` or `nl`), confirmation
   hash, last-send time, send count, confirmation time and creation time.
   Partial unique indexes enforce one account or address per magazine and
   unique confirmation hashes. Magazine and user deletion cascade. A row is
   active when `confirmed_at` is set; account subscriptions set it on insert.
   Cross-store foreign keys to Payload live in the migration.

2. **Subscription eligibility follows magazine visibility (plan Decision 2).**
   `mayKnowMagazine` is shared by shelf reads and `findMagazineForViewer`:
   a readable published issue or permission to read the community's content
   makes the magazine knowable; otherwise answer not-found. Subscription
   lookup uses `readableIssueExists` for its small existence query. Email uses
   the anonymous scope and requires `readableIssueExists` for that scope too,
   so it needs an existing published public issue. Without one, it silently
   does nothing.

3. **Accounts use the inbox; addresses use email (plan Decision 3).**
   Follow spec Flow 6 over Goal 8's wording: a signed-in non-member also
   receives inbox notices. **Please check — accepted ruling:** membership
   controls which issues they hear about, not their delivery channel.
   Subscribing with an account merges an email row for the same magazine and
   account address, preserving the earlier confirmation time and delivery
   history. Convert the email row in place so a refusal of an in-flight send
   can still release its claim. If an account row already exists, move its
   claims to the retained row first, keeping inbox claims on conflict. Any
   channel's claim means that subscriber has already been told. The address
   comes from `app.user`, never the session. An email request for an already
   subscribed account is a silent no-op.

4. **Confirm email ownership on POST (plan Decision 4).** A random 32-byte
   base64url link lasts seven days after the last send; only its SHA-256 hash
   is stored. GET never confirms, so mail scanners cannot subscribe anyone.
   Responses are identical for known and unknown addresses. Resend at most
   once per ten minutes, three times per subscription, five magazines per
   address per 24 hours and 50 confirmation mails per magazine per 24 hours.
   Count and upsert share a DB transaction, taking an address advisory lock
   first. An in-memory IP limit allows ten requests per hour. Delete pending
   rows 30 days after `COALESCE(confirm_sent_at, created_at)`.

5. **Reuse signed unsubscribe links (plan Decision 5).** The existing token
   flow gains scope `magazine`, with subscription id as subject. The existing
   locale unsubscribe page and one-click headers remove that row. Account
   subscribers use the Subscribe button. No unsubscribe token is stored.

6. **Publication commits an outbox row; delivery claims each subscriber
   (plan Decision 6).** `publishIssue` inserts one
   `app.magazine_issue_announcement` keyed by issue id in its publication
   transaction, with conflict-do-nothing. Old published issues have no row
   and are never announced. `app.magazine_issue_delivery` has primary key
   `(issue_id, subscription_id)` and channel `inbox` or `email`; claim by
   insert-on-conflict returning. Claims and inbox notices commit together in
   batches of 500. Email claims precede sending: `false` releases the claim
   and reopens the announcement in one transaction; a thrown send keeps its
   claim, accepting possible loss to prevent duplicates after an uncertain
   send. Only current subscriptions confirmed at or before publication are
   eligible. Complete when none remain. Pick open rows by
   `last_attempted_at NULLS FIRST, created_at` and stamp each attempt so older
   failures cannot starve newer issues. After seven days, complete with a log
   of issue id and remaining count, never addresses.

7. **The resolver decides recipients (plan Decision 7).** `issueAudience`
   calls ADR-0042's resolver for anonymous and member standing and switches
   exhaustively over its access union. `everyone` includes active account
   and email subscriptions; `members` includes only active community members
   with account subscriptions; `nobody` completes without delivery. Recheck
   every batch. `activeMembershipCondition()` is shared with editor
   recipient queries; a parity test pins SQL eligibility to the resolver.
   Amended in slice 6 (plan 2026-10-28, Decision 8): email stays public-only; a preview issue (`preview` audience) reaches signed-in subscribers through the inbox and nobody by email.

8. **Scheduling uses the existing publication path (plan Decision 8).**
   Statuses are `draft`, `scheduled`, `published`; `scheduledFor` and
   `scheduledBy` hold the instant and scheduler. One client-safe
   `ISSUE_TRANSITIONS` table governs actions: drafts may schedule, publish or
   delete; scheduled issues may reschedule, unschedule or publish; published
   issues have none of those actions. A scheduled issue stays editable, is
   invisible to readers through ADR-0042, and must be unscheduled before
   deletion. Schedule time must be future and within 365 days; time is
   checked before the same `assertPublishable` validation used by publishing.
   The due run calls `publishIssue` as `scheduledBy`, who must still have
   `edit` under ADR-0045. The existing claim, placement, article publication
   and credit path in ADR-0043 stays authoritative. Publishing clears both
   schedule fields and records `publishedVia` (`button` or `schedule`) with
   one injected clock.

   Automatic publication uses `publishIssue` through a scheduled issue with
   origin `auto`, now included in `PUBLISH_ORIGINS`. Validation, placement,
   credit and the announcement use the same publication path.

   Amended by ADR-0047: auto-publish needs both the scheduling person's `edit` and `whenReady = "auto_publish"` in the magazine's settings; the origin is stored in `scheduledVia`.

9. **Failures preserve newer edits (plan Decision 9).** Read typed refusal
   codes through `magazineErrorCodeOf`, never message parsing. Empty issues,
   invalid items or lost scheduler rights return to draft and notify every
   editor. Changed issues, concurrency aborts and unknown errors retry until
   more than 60 minutes after the scheduled time, then fail with reason
   `error`. `unscheduleIssue` uses the existing `updated_at` claim; if a newer
   edit wins, leave it alone and send no failure notice. A deleted or missing
   community returns the issue to draft silently through the same path.

10. **One cron owns the lifecycle (plan Decision 10).**
    `/api/cron/magazine-issues` runs every five minutes, with a 300-second
    maximum. Publish up to 20 due issues, remove stale pending subscriptions,
    then deliver up to ten open announcements and 100 emails per run, paced
    600 ms apart. The UI promises publication within a few minutes.

11. **Inbox immediately, email later (plan Decision 11).** After publication
    commits, `afterIssuePublished` runs existing pending-article credit then
    inbox delivery, each with independent error logging so neither fails
    publication. The cron finishes remaining work. Later slices extend this
    one after-publish hook.

12. **Mail uses the subscriber's language and the existing recipient gate
    (plan Decision 12).** `magazineMail` next-intl copy is rendered with
    `escapeHtml`. Move the storyline gate to a neutral email module, retaining
    existing re-exports and exact storyline messages. `sendGatedEmail` shares
    delivery policy, with rate-limit retry on for storyline announcements
    and off for draft reviews. Outside production, only
    `MAIL_TEST_RECIPIENT` is mailed; other addresses are skipped without
    claims so their announcement remains open until delivery or give-up.

13. **Notices share one row writer (plan Decision 13).**
    `insertMagazineNoticesIn` writes inside the caller's transaction and
    throws; the existing private wrapper logs failures. Inbox copy remains
    English. The translator takes `magazineEditor` for staff copy or
    `magazines` for new-issue copy. Types are `magazine_issue_published` and
    `magazine_issue_schedule_failed`; no other module writes these notice rows.

14. **Every staff role sees counts (plan Decision 14).** `write` permits
    `{ withAccount, byEmail, waiting }`, including contributors under
    ADR-0045. One `SubscriberCountLine` appears on editor and contributor
    desks. Counts expose no names or addresses.

## Considered options

- **A Payload subscription collection or separate account/email tables:**
  rejected. These are relational site writes; splitting tables would repeat
  unions in every count and delivery query.
- **Payload `schedulePublish`:** rejected. It needs versions/drafts and the
  Payload jobs runner and bypasses placement, credit and the announcement.
- **Vercel Queues:** rejected. The cron already owns retries, following
  ADR-0025's durable-backstop precedent.
- **Sending inside the publish request:** rejected. Rate limits and delivery
  latency would delay or fail publication.
- **A Payload `notifiedAt` column:** rejected. A stale Payload save could
  overwrite it; the outbox stays outside Payload like the credit claim.
- **`EmailTemplates`:** rejected. Staff-edited, single-language event mail
  does not fit subscriber-language magazine copy.
- **A stored unsubscribe token:** rejected. It duplicates the existing
  signed-token flow and unsubscribe page.

## Consequences

- Publication and its durable announcement are atomic. Inbox claims and
  notices are atomic too; email claims provide at-most-once attempts, with
  the deliberate uncertain-send loss described above.
- Audience changes take effect before each batch. A subscription never
  grants reading rights, and members-only titles never reach outsiders.
- Shipped subscriber controls on the magazine shelf, issue page and community
  Magazine tab, scheduling in the builder, and subscriber counts on editor and
  contributor desks. `/{locale}/magazine-subscriptions/confirm` reads confirmation state;
  `POST /api/magazine-subscriptions/confirm` confirms and redirects back. The
  existing `/{locale}/unsubscribe` page and `POST /api/email/unsubscribe` now
  accept magazine links, including RFC 8058 one-click requests.
- `vercel.json` registers `/api/cron/magazine-issues` with `*/5 * * * *`.
  `runMagazineIssueJobs` publishes due issues, purges stale waiting rows and
  delivers announcements in that order. It starts on deployment; no backfill
  is needed, and existing published issues are not announced. Production needs
  `DIGEST_UNSUBSCRIBE_SECRET` or its `BETTER_AUTH_SECRET` fallback, as digests do.
- Scheduled status remains in PostgreSQL after rollback because an enum
  value cannot be removed. Rollback first returns scheduled issues to draft.

### Risks and operating limits

- **Email speed.** A run sends at most 100 emails, paced for Resend. A magazine
  with 2,000 email subscribers takes about 100 minutes to reach everyone at
  the five-minute cadence. Raise `EMAIL_BATCH` or add a run when traffic
  warrants it.
- **Publish through the site.** Flipping an issue's status in Payload admin
  bypasses the site's publication path, so it creates neither an announcement
  nor article credit. Staff must use the site's Publish button.
- **Schedule latency.** An issue can go out up to five minutes after its time;
  the UI promises "within a few minutes".
- **Visibility changes do not restart a completed announcement.** Narrowing
  visibility limits the next batch's recipients. Widening a members-only issue
  to public after completion does not email the email subscribers.
- **Digest overlap.** Account subscribers who also receive the weekly digest
  could hear about an issue through both channels if magazine issues are added
  to that digest. It contains no magazine issues today; any future inclusion
  should skip issues the reader already subscribes to.
- **Email needs public issues.** Email-only subscribers receive public issues
  only. Without an existing published public issue, the email form remains
  visible and answers "check your email" but sends nothing, preserving the
  anti-spam and non-disclosure rule. Hiding it would require exposing email
  eligibility through `status`; the accepted ruling keeps the form visible.
- **Signed-in non-members use the inbox.** This follows spec Flow 6 rather
  than Goal 8's membership-based channel wording. Reading rights still decide
  which issues reach them.
- **Counts include contributor access.** Every magazine staff role can see
  subscriber counts under `write`; no names or addresses are exposed.
- **Persistent schedule errors return to draft.** Unknown errors retry until
  more than 60 minutes after the scheduled time, then return the issue to
  draft and notify editors with reason `error`. After a long cron outage, a
  first unknown error may already exceed that window.
- **Confirmation quotas can delay signup.** The per-magazine quota is 50 rows
  with `confirm_sent_at` in the past 24 hours. Further requests get the same
  answer without mail until capacity returns. Resends of the same row do not
  increase this count (the quota counts rows, not send events), so this is not
  a strict 50-message cap. Raise `CONFIRM_MAILS_PER_MAGAZINE_PER_DAY` if traffic
  warrants it.
- **Three links per waiting row.** An address that uses all three confirmation
  sends for a magazine cannot request another until its waiting row is purged,
  30 days after the last send. This protects strangers' inboxes.
- **IP limits are per instance.** The in-memory limit follows the existing
  event import precedent; database limits per address and magazine hold across
  instances and provide the durable abuse guard.
- **Inbox notices are stored in English**, following existing notification
  types. Email uses the subscriber's saved language.
