# Community Magazines — Subscriptions and Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone who may see a magazine can subscribe to it. Signed-in subscribers get one inbox message per newly published issue. People without an account subscribe with their email address, confirm it from a link (double opt-in), and get one email per issue with an unsubscribe link. Editors can schedule an issue to go out at a date and time; the existing cron setup publishes it through the same publish path as the Publish button. Magazine editors see how many people subscribe.

**Architecture:** Subscriptions are one Drizzle table, `app.magazine_subscription` (an account **or** an email address per row). Publishing writes an **outbox** row, `app.magazine_issue_announcement`, inside the publish transaction; delivery claims one `app.magazine_issue_delivery` row per (issue, subscription), so every subscriber is told exactly once however often delivery runs. Who may be told is asked of the access resolver (`issueAudience`, built on `resolveMagazineIssueAccess`, ADR-0042), again at every delivery batch. Scheduling adds the issue status `scheduled` (`scheduledFor`, `scheduledBy`); one cron route, `/api/cron/magazine-issues`, publishes due issues by calling `publishIssue` with the scheduler as the actor and `origin: "schedule"`, then delivers announcements. Unsubscribe links reuse the signed-token unsubscribe page and endpoint with a new `magazine` scope. Decisions are recorded in ADR-0046.

**Tech Stack:** Next.js App Router (RSC pages, route handlers), tRPC, Payload CMS 3.77 (MagazineIssues, Local API), Drizzle (`app` schema), Resend (existing `src/server/email.ts`), next-intl (en + nl), shadcn/ui primitives, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-26-community-magazines-design.md`. Read "Goals 8", "Domain model → Subscription", "Flows 4 and 6", "Auto-draft → Structure" (the cron and "same publish path" rule) and "Delivery slices → 4". Read first: ADR-0025, ADR-0042, ADR-0043, ADR-0045, and the earlier slice plans `docs/superpowers/plans/2026-10-26-community-magazines-core.md`, `…-platform-content.md`, `2026-10-27-community-magazines-contributors.md` with their `-rulings.md` files. Those rulings still hold unless this plan says otherwise.

## Decisions this plan makes (spec gaps)

1. **Storage: one Drizzle table, `app.magazine_subscription`.** Columns: `id` varchar(255) PK (uuid), `magazine_id` int (FK `public.magazines` ON DELETE cascade), `user_id` varchar(255) null (FK `app.user` ON DELETE cascade), `email` varchar(255) null (trimmed, lower-case), `locale` varchar(5) NOT NULL default `'en'` (CHECK `en`/`nl`: the language of the emails), `confirm_token_hash` varchar(64) null, `confirm_sent_at` timestamptz null, `confirm_send_count` int NOT NULL default 0, `confirmed_at` timestamptz null, `created_at`. CHECK: exactly one of `user_id` / `email`. Partial unique indexes `(magazine_id, user_id) WHERE user_id IS NOT NULL` and `(magazine_id, email) WHERE email IS NOT NULL`, a partial unique index on `confirm_token_hash`, plain indexes on `magazine_id` and `user_id`. A subscription is **active** when `confirmed_at` is set (account rows get it on insert). Rejected: a Payload collection (subscriptions are membership-style data the site writes, like `app.magazine_staff`, ADR-0045); two tables (every count and delivery query would union them).
2. **Who may subscribe = who may know the magazine exists.** One named, exported rule in `src/server/magazines/reading.ts`: `mayKnowMagazine({ hasReadableIssue, community, isMember }): boolean` (true when the scope may read at least one published issue of the magazine or `canReadContent(community, isMember)`). The private `loadShelf` calls it instead of its inline `issues.length === 0 && !canReadContent(…)` rule. The `magazineSubscriptions` router calls `findMagazineForViewer`, which supplies the result of `readableIssueExists(deps, scope, magazineId)`, a `limit: 1` published-readable-issue query. `false` → `NOT_FOUND`. No second rule, and no full shelf load per status check. An email subscriber is anonymous, so the anonymous scope decides. **Email subscriptions additionally need something to announce:** `subscribeByEmail` silently does nothing (same `{ ok: true }`) unless `readableIssueExists(deps, anonymousScope, magazineId)` finds at least one published public issue. A brand-new magazine in a listed community therefore cannot be used to mail text its creator chose to strangers.
3. **Channels.** An account subscription is told in the inbox only; an email subscription by email only. A person is one subscription per magazine: when a signed-in user subscribes, an email row of the same magazine with their account address (read from `app.user` by id, the one source of truth; the session carries no email) is converted to an account row in place, preserving its id and delivery claims so an in-flight email refusal can still release its claim. If an account row already exists, its claims move to the retained row before it is deleted; existing inbox claims win channel conflicts. The retained row takes the earliest confirmation time from both subscriptions and `now`, so a merge never makes the person "late" for an issue they were already owed. Subscribing by email with an address whose account is already subscribed is a silent no-op. Spec Goal 8 says "members in the inbox, non-members by email"; this plan follows spec Flow 6 ("signed-in → inbox, otherwise email"): a signed-in non-member subscriber is told in the inbox. Recorded in ADR-0046 and under Risks for Greg to check.
4. **Double opt-in.** The confirm link carries a random 32-byte token (base64url); only its SHA-256 hex is stored. The link works for `CONFIRM_LINK_DAYS = 7` days after the last send. The page behind the link confirms only on a **POST** (a button), never on GET, because mail scanners open links. Abuse limits, all answered with the same `{ ok: true }` so the form never reveals whether an address is known: per row, a new link at most every `CONFIRM_RESEND_MINUTES = 10` and at most `CONFIRM_SENDS_PER_SUBSCRIPTION = 3` times; per address, at most `CONFIRM_MAGAZINES_PER_ADDRESS_PER_DAY = 5` magazines in 24 hours; per magazine, at most `CONFIRM_MAILS_PER_MAGAZINE_PER_DAY = 50` confirmation mails in 24 hours (rows of the magazine with `confirm_sent_at` in the last 24h). The count-then-upsert runs in **one `db.transaction`** that first takes `pg_advisory_xact_lock(hashtext('magazine-confirm:' || <normalized email>))`, so parallel requests for one address cannot both pass the count; the per-magazine count is read in the same transaction. All of these are DB-enforced, so they hold across server instances. Per client IP, `createPerUserLimit({ windowMs: 3_600_000, max: 10 })` in memory (`TOO_MANY_REQUESTS`). Unconfirmed rows whose last link was sent (`COALESCE(confirm_sent_at, created_at)`) more than `PENDING_SUBSCRIPTION_DAYS = 30` days ago are deleted by the cron (we do not keep addresses nobody confirmed, and a live link is never deleted).
5. **Unsubscribe reuses the existing signed-token flow.** `src/server/notifications/unsubscribe-token.ts` gains the scope `magazine`, whose subject is the subscription id. Emails link to the existing `/[locale]/unsubscribe` page and carry the existing `List-Unsubscribe` one-click headers; `/api/email/unsubscribe` switches exhaustively on the scope and, for `magazine`, deletes the subscription row. Account subscribers stop with the Subscribe button. Rejected: a stored unsubscribe token column (a second token system next to a working one, and the spec names the existing page as the piece to reuse).
6. **An outbox, delivered once per subscriber.** `publishIssue` writes `app.magazine_issue_announcement (issue_id PK, magazine_id, published_at, completed_at, last_attempted_at, created_at)` with `ON CONFLICT DO NOTHING` in the same transaction that publishes the issue, so a published issue always has exactly one announcement and an unpublished one never has. Issues published before this slice have none and are never announced. Delivery claims `app.magazine_issue_delivery (issue_id, subscription_id) PK, channel CHECK ('inbox','email'), delivered_at` with `INSERT … ON CONFLICT DO NOTHING RETURNING`. Inbox: claims and notification rows are written in **one DB transaction** per batch of `INBOX_BATCH = 500`, so a claim never exists without its notice. Email: claim, then send; a send that returns `false` (gate or Resend refused) releases the claim **and, in the same transaction, sets the announcement's `completed_at` back to NULL**, so a completion check that ran while the send was in flight can never leave that subscriber out; a send that throws keeps the claim (at most once, the storyline precedent). Only subscriptions with `confirmed_at <= published_at` count (someone who subscribes after the issue came out is not told about it; equal times count as in time). The announcement is completed (`completed_at`) when nothing eligible is left. Work rotates: each run picks open announcements by `last_attempted_at NULLS FIRST, created_at` and stamps `last_attempted_at = now` on each one it picks, so announcements that never finish (outside production by design, or Resend refusing) cannot starve newer ones. Give-up rule: an open announcement whose `published_at` is more than `ANNOUNCEMENT_MAX_DAYS = 7` days before `now` is completed with a log line naming the issue id and how many subscribers were left (no addresses). Rejected: sending inside the publish request (Resend rate limits, a slow publish), Vercel Queues (the cron already owns retries, ADR-0025 precedent), a `notifiedAt` column on the Payload issue (a Payload save rewrites every column it owns, the reason `app.magazine_article_credit` exists).
7. **The audience comes from the resolver.** `issueAudience(community, issue): "nobody" | "members" | "everyone"` in `src/server/magazines/issue-access.ts` asks `resolveMagazineIssueAccess` as `NO_STANDING` and, when needed, as `standingOf("member", null)`, and decides with an **exhaustive `switch` over `MagazineIssueAccess`** (ADR-0042 / `src/lib/magazines/access.ts`: never `access === "full"`), with a comment that slice 6 must decide `teaser` there (teaser issues are meant to reach email subscribers). `everyone` → every active account subscription and every active email subscription; `members` → only account subscriptions whose user is an active member of the community, and no email; `nobody` (deleted community, not published) → nothing, and the announcement completes. "Active member" in SQL is one exported predicate next to `activeRoleOf`: `activeMembershipCondition()` in `src/server/magazines/viewer-role.ts` (`eq(communityMemberships.status, "active")`), used by the delivery query and by `listMagazineEditorIds`. A parity test pins the delivery query's eligibility to the resolver (Task 6). It is evaluated again at every batch, so switching a public issue to members-only before the email run stops the emails.
8. **Scheduling is a status plus two fields, published through `publishIssue`.** `ISSUE_STATUSES` becomes `["draft", "scheduled", "published"]`; MagazineIssues gains `scheduledFor` (date, indexed), `scheduledBy` (text, user id) and `publishedVia` (below). **Lifecycle rules live in one table.** `src/lib/magazines/values.ts` (client-safe) gains `ISSUE_ACTIONS = ["schedule", "unschedule", "publish", "delete"] as const`, `ISSUE_TRANSITIONS: Record<IssueStatus, readonly IssueAction[]>` = `{ draft: ["schedule", "publish", "delete"], scheduled: ["schedule", "unschedule", "publish"], published: [] }` and `canIssue(status, action): boolean`. Every service pre-check (`scheduleIssue`, `unscheduleIssue`, `publishIssue`, `deleteDraftIssue`) and every UI branch that today compares `issue.status === …` for an action (`issue-builder.tsx:266`, `builder-top-bar.tsx:79`) reads it; display-only surfaces (`editor-desk.tsx` badge, `issue-reader.tsx` `EditorBar`) switch exhaustively over `IssueStatus` (`Record<IssueStatus, …>`). "Validates exactly like publish" is one private function in `issue-service.ts`, `assertPublishable(deps, issue, actor)` (empty check, then `assertItemsValid`), pulled out of `publishIssue` and called by both. `scheduleIssue` order: `canIssue`, time, then `assertPublishable` (so a wrong time never costs an item load). `scheduleIssue` accepts a draft or an already scheduled issue (reschedule), and the time (`scheduleProblem`: in the future, at most `SCHEDULE_MAX_DAYS = 365` days ahead). `unscheduleIssue` returns it to `draft`. A scheduled issue is editable like a draft; readers never see it (the resolver and `readableIssueWhere` already require `published`). `deleteDraftIssue` still refuses it (`ISSUE_NOT_DRAFT`): stop the schedule first. `publishIssue` accepts `draft` or `scheduled` and clears both fields. **How it was published is recorded:** MagazineIssues gains `publishedVia` (select, options from `PUBLISH_ORIGINS = ["button", "schedule"] as const` in `values.ts`; slice 5 adds `"auto"`), written by `publishIssue` from a new optional last parameter `opts: { origin?: PublishOrigin; now?: Date } = {}` (defaults `"button"`, `new Date()`); `publishedAt` is `opts.now`, so the cron and tests use one clock. The cron publishes a due issue by calling `publishIssue(deps, issue, issue.updatedAt, { userId: scheduledBy, community }, { origin: "schedule", now })`: the same claim, validation, article publishing, credit and announcement. The scheduler must still have `edit` (`standingCan`) at that moment. ADR-0046 has one paragraph on how slice 5's auto-publish plugs in (a scheduled issue with origin `"auto"`; rights checked against the magazine's settings instead of a person). Rejected: Payload's `schedulePublish` (needs versions/drafts on the collection and the Payload jobs runner, and would bypass placement, credit and the outbox).
9. **What the scheduled run does with each outcome.** The run reads the refusal code with a new `magazineErrorCodeOf(error: unknown): MagazineErrorCode | null` in `errors.ts` (reads `error.cause instanceof MagazineErrorCause`), never by parsing messages. Published → counted. `ISSUE_CHANGED`, `ISSUE_NOT_DRAFT`, a concurrency abort or any unknown error → left as is, retried next run (logged) — **until** `now - scheduledFor > SCHEDULE_RETRY_LIMIT_MINUTES = 60`; then it fails with reason `error`. `ISSUE_EMPTY` → failure `empty`; any code in `ITEM_PROBLEM_CODES` → `invalid_item`; scheduler without `edit` (or `scheduledBy` null) → `no_rights`. A failure returns the issue to `draft` by calling `unscheduleIssue(deps, issue, issue.updatedAt, actor)` (its `writeIssue` claim on `updated_at`, so an editor's newer change wins; `ISSUE_CHANGED` / `ISSUE_NOT_SCHEDULED` from it mean "someone changed it": do nothing, no notice) and sends `magazine_issue_schedule_failed` to every editor (`listMagazineEditorIds`). A soft-deleted or missing community returns the issue to draft silently through the same call. There is no second claim SQL.
10. **One cron route, `/api/cron/magazine-issues`, every 5 minutes** (`*/5 * * * *` in `vercel.json`, `maxDuration = 300`). In order: publish due issues (`DUE_BATCH = 20`), delete stale unconfirmed subscriptions, deliver announcements (up to `OPEN_ANNOUNCEMENTS_PER_RUN = 10` open announcements, least recently tried first per Decision 6: inbox for each, then up to `EMAIL_BATCH = 100` emails in the run, paced `EMAIL_PACE_MS = 600`). One route keeps an issue's lifecycle in one place and the project's cron count low. The UI says an issue goes out "within a few minutes" of its time.
11. **Inbox right away, email by cron.** After a successful publish (button or schedule), `publishIssue` calls one private `afterIssuePublished(deps, published)` in `issue-service.ts` after the commit. It runs credit (`creditPendingMagazineArticles`, moved there unchanged) and then `deliverInboxAnnouncement(deps, issueId)`, each in its own `try`/log so neither throws nor fails the publish (the credit precedent). Slices 5 and 6 add their after-publish work there. Whatever the inbox step does not finish, the cron does.
12. **Emails are next-intl copy in the subscriber's language** (`magazineMail.*`), rendered by one small layout function with `escapeHtml` from `src/server/email-template.ts`. Rejected: `EmailTemplates` (one language, staff-edited, a tracer for event mail). The production-only recipient gate moves from `src/lib/news/storyline-draft-review.ts` to a neutral `src/lib/email/recipient-gate.ts` (the storyline names stay as re-exports), and the gated Resend send becomes `sendGatedEmail(to, message, env, opts: { refusedMessage: string; rejectedMessage: string; logPrefix: string; retryOnRateLimit: boolean })`. Both `sendStorylineAnnounceEmail` (retry on, today's exact strings `"Storyline announcement email refused"` / `"Resend rejected the storyline announcement"` / `"news-storyline-announce: resend rejected the email"`) and `sendStorylineDraftReviewEmail` (retry off, `"Storyline review email refused"` / `"Resend rejected the storyline draft email"`) use it, so no existing message changes. Outside production only `MAIL_TEST_RECIPIENT` is ever mailed; email delivery skips other addresses **without** claiming them, so the announcement stays open outside production (storyline precedent; Decision 6's rotation and give-up keep that from blocking anything).
13. **Inbox notices are stored in English** (slice 3 precedent) through `src/server/magazines/notifications.ts`. It gains `insertMagazineNoticesIn(writer, notices)` (throws; for use inside a caller's transaction) and keeps `insertMagazineNotices` (never throws, stays private) as a wrapper, so the row shape lives in one place and nothing else writes the `notification` table. `magazineNoticeTranslator(namespace: "magazineEditor" | "magazines")` takes its namespace: editor-facing copy stays under `magazineEditor.notifications`, reader-facing new-issue copy goes under `magazines.notifications.issuePublished`. Types: `magazine_issue_published`, `magazine_issue_schedule_failed`.
14. **Subscriber counts are for every magazine staff role (the `write` capability)**, as the slice brief says ("visible to magazine staff"; contributors are staff, ADR-0045): `{ withAccount, byEmail, waiting }`, shown by one `SubscriberCountLine` component on the editor desk and on the contributor desk. Counts carry no names or addresses.
15. **One migration, `src/migrations/20261027b_magazine_subscriptions.ts`**, and **ADR-0046**. If `origin/main` has a later migration or ADR number when Task 1 starts, use the next free one everywhere below.

## Global Constraints

- **The constraints file handed to the coding engine with every task holds this plan's "Decisions this plan makes" section and this "Global Constraints" section verbatim.** Task text refers to "Decision N" and "the DB test prefix"; both are defined there, nowhere else.
- Branch: `feat/community-magazines-subscriptions`, created by the controller (not a task agent) from `origin/main` after the contributors PR (`feat/community-magazines-contributors`) has merged. If it has not merged yet, the controller stacks the branch on it and later rebases with `git rebase --onto origin/main <old base>` after the squash merge (CI runs only for PRs into main). Run `git branch --show-current` before every commit. Never `git checkout`/`git switch`, never `git stash`, never `git add -A` / `git add .`. Stage files by name and confirm every staged file is yours.
- No `Co-Authored-By`, "Generated with" or any AI credit line in commits or PRs.
- Before Task 1, after Task 5 and before opening the PR: `git fetch origin && git log origin/main --oneline | grep -i -E "magazin|subscri|schedul"; gh pr list --search magazine`. Stop if another session shipped part of this.
- **Never** run `pnpm db:apply`, `pnpm db:push`, `pnpm build`, `pnpm dev`, `drizzle-kit generate`, or anything that reads `.env`. Its `DATABASE_URL` is production, and prod applies migrations on merge. Never `source`/`.` `.env` or `.env.docker`.
- Unit test prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run`.
- **DB test prefix** (written `<DB prefix>` in the tasks; use exactly; never host port 5432):
  `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test`
  If `aitcom_test` is not reachable, set it up once: `pnpm dev:db`; `docker run -d --rm --name aitcom-test-pg-forward --network aitcom_default -p 127.0.0.1:55432:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp:postgres:5432`. New tables and the new enum value reach the test DB only through the migration's `up` (Task 1's migration test runs it). Never set `PAYLOAD_PUSH` against `aitcom_test`. A DB suite that reports _skipped_ is a setup failure: fix the env, do not continue.
- **Regenerate Payload types** (Task 1 only): `env -u PAYLOAD_PUSH SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test RESEND_API_KEY= npx payload generate:types` (if it stops on one missing variable, pass that one inline with a dummy local value). `git diff -- src/payload-types.ts` must show only the MagazineIssue `status`, `scheduledFor`, `scheduledBy` and `publishedVia` hunks (and their select type).
- Integration tests copy the `isLocalDbConfigured` guard and fixture style of `src/server/api/routers/magazines.integration.test.ts` (unique suffix, users with member profiles, owner/admin/member/outsider, a `callerAs(userId)` built with `createCaller({ db, headers, session })`, cleanup in `afterEach`). The session there carries only `{ id, name }`; no server code in this slice may read an email address from the session (Decision 3 reads it from `app.user`). Cleanup also deletes the fixture magazines' `app.magazine_subscription` rows (deliveries and announcements cascade with issues and subscriptions) and the fixture users' `app.notification` rows. Anonymous callers pass `session: null`; tests that hit the IP limit pass `headers: new Headers({ "x-forwarded-for": "<unique ip per test>" })`.
- Every email in tests goes to a fake `MagazineMailer` (`{ send: vi.fn(async () => true), env: { VERCEL_ENV: "production", NODE_ENV: "production" }, sleep: async () => {} }`) or to a `vi.mock("@/server/email")` of `sendGatedEmail`. No test may reach Resend.
- Payload `number` values may come back as strings: `Number()` before comparing.
- **Running the app** (visual checks only). Commit first, then export `HEAD`: `X="$TMPDIR/aitcom-visual"; rm -rf "$X"; mkdir -p "$X"; git -C /Users/greg/coding-projects/aitcom archive HEAD | tar -x -C "$X"; ln -s /Users/greg/coding-projects/aitcom/node_modules "$X/node_modules"`. Then, in `$X`: `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test RESEND_API_KEY= BETTER_AUTH_SECRET=local-visual-check PAYLOAD_SECRET=local-visual-check pnpm exec next dev -p 3100`.
- Every user-visible string goes through next-intl in **both** `messages/en.json` and `messages/nl.json`, in everyday words, informal Dutch ("je"). The plan gives the English; the task writes natural Dutch alongside. Task 1 extends `src/i18n/messages-parity.test.ts` to the namespaces `magazines`, `magazineMail`, `magazineSubscription` and `magazineUnsubscribe`. Do not use "opt-in", "token", "outbox", "announcement", "audience" or "cron" in copy. Say "subscribe", "link", "new issue", "goes out", "schedule". Editor refusal codes reach the UI only through `readEditorError` / `editorErrorKey`; the reader-side subscribe errors map tRPC codes (`TOO_MANY_REQUESTS`, `NOT_FOUND`) to `magazines.subscribe.*` keys.
- Design (UI tasks): read `PRODUCT.md` and `DESIGN.md` first. Tokens come from `src/styles/globals.css`, primitives from `src/components/ui/`. One Voice Rule: the Subscribe button is **never** orange (`ink`, or `outline` once subscribed): the issue page, the shelf and the Magazine tab keep their accent. In the publish dialog the one orange is the confirm button ("Publish" or "Schedule it"). `/ LABEL` kickers come only through `<SectionLabel>`. Mono is for dates, times and counts only. Flat by default. Loading → `<Skeleton>`, error → `<ErrorState onRetry>` or `role="alert"` text, empty → text that teaches the next step.
- Accessibility: WCAG 2.2 AA. Label every control; IDs from `useId()`. Every input with help or error text links them with `aria-describedby` (help id, plus error id while an error shows) and sets `aria-invalid="true"` while its error shows. Disclosure buttons carry `aria-expanded`/`aria-controls` and move focus into what they open. Results and state changes are announced (`role="status"`). The date-and-time field is a labelled native `<input type="datetime-local">` with the time zone in its help text. No horizontal page scroll at 390px.

## Review Focus

1. **A members-only issue is published in a magazine that also has email subscribers and signed-in non-member subscribers.** Only community members hear of it (inbox); nobody else gets its title by inbox or email, now or in a later run. Test: Task 6 (`a members-only issue reaches members only`).
2. **Delivery runs twice, overlaps, or follows the inline inbox run; a scheduled issue is picked up by two cron runs at once.** Every subscriber gets exactly one inbox message or one email per issue, and the issue is published once with one announcement. Tests: Task 3 (`two runs at once publish it once`), Task 6 (`two deliveries at once still tell each subscriber once`, `a second run sends nothing`).
3. **Someone types a stranger's address again and again, or a mail scanner opens the confirm link.** At most three mails per address per magazine and five magazines per day, also under parallel requests; the same answer every time, for known and unknown addresses; opening the link never confirms. Tests: Task 4 (`asking again soon sends no second mail and answers the same`, `never more than three mails per magazine or five magazines a day`, `parallel requests cannot beat the daily limit`), Task 5 (`opening the link does not confirm`).
4. **An editor schedules an issue, then it is emptied, an item breaks, or the editor leaves the team.** It does not go out; it is a draft again and every editor is told why. An editor's newer change is never overwritten by the run. Tests: Task 3 (`an issue emptied after scheduling goes back to draft and the editors are told`, `a scheduler removed from the team does not publish`, `a rescheduled issue is not published early`).
5. **Someone subscribes after an issue came out but before the email run, or unsubscribes in between.** They get nothing for that issue, and the next issue reaches only current subscribers. Test: Task 6 (`late subscribers and leavers are not told`).
6. **Someone creates a listed community and a magazine named like an advert, then types many strangers' addresses.** No confirmation mail goes out while the magazine has no published public issue, and never more than 50 a day per magazine. The confirm route never redirects off-site. Tests: Task 4 (`a magazine with nothing public mails nobody`, `a magazine sends at most 50 confirmation mails a day`), Task 5 (`ignores a locale that is not ours`).

---

## File structure

**Create**

| File                                                                                                  | Responsibility                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/lib/magazines/schedule.ts`                                                                       | `SCHEDULE_MAX_DAYS`, `scheduleProblem`, `localDateTimeToIso`, `isoToLocalDateTime` (client-safe). |
| `src/lib/magazines/subscriptions.ts`                                                                  | Subscription limits as named constants, `normalizeSubscriberEmail` (client-safe).                 |
| `src/lib/email/recipient-gate.ts`                                                                     | `MAIL_TEST_RECIPIENT`, `MailEnv`, `gatedMailRecipient` (moved from the storyline module).         |
| `src/migrations/20261027b_magazine_subscriptions.ts` (+ `magazine-subscriptions.integration.test.ts`) | Enum value, issue columns, the three app tables.                                                  |
| `src/server/magazines/announcements.ts`                                                               | The outbox: record (Task 2), deliver inbox and email (Task 6).                                    |
| `src/server/magazines/scheduled-publishing.ts`                                                        | `publishDueIssues` and the failure path.                                                          |
| `src/server/magazines/issue-jobs.ts`                                                                  | `runMagazineIssueJobs`: what the cron runs, in order.                                             |
| `src/server/magazines/subscriptions/{service,tokens,mail}.ts`                                         | Subscribe, confirm, remove, count, purge; confirm tokens; mail rendering and the mailer seam.     |
| `src/server/api/routers/magazine-subscriptions.ts`                                                    | Reader-facing subscribe API.                                                                      |
| `src/app/api/cron/magazine-issues/route.ts`                                                           | The cron entry.                                                                                   |
| `src/app/api/magazine-subscriptions/confirm/route.ts`                                                 | The confirm POST.                                                                                 |
| `src/app/[locale]/magazine-subscriptions/confirm/page.tsx`                                            | The confirm page.                                                                                 |
| `src/components/magazines/reading/subscribe-button.tsx`                                               | Subscribe for readers (account or email).                                                         |
| `src/components/magazines/reading/subscription-confirm.tsx`                                           | The confirm page body.                                                                            |
| `src/components/magazines/editor/subscriber-count-line.tsx`                                           | The subscribers line shared by the editor and contributor desks.                                  |
| `src/server/rate-limit/client-ip.ts`                                                                  | `clientIpFromHeaders(headers)`: the one client-IP rule.                                           |
| `docs/adr/0046-magazine-issues-are-announced-through-an-outbox-once-per-subscriber.md`                | ADR.                                                                                              |

**Modify**

`src/lib/magazines/values.ts`, `src/lib/magazines/paths.ts`, `src/lib/news/storyline-draft-review.ts`, `src/collections/MagazineIssues.ts`, `src/payload-types.ts` (generated), `src/server/db/schema.ts`, `src/migrations/index.ts`, `src/server/email.ts`, `src/server/notifications/unsubscribe-token.ts`, `src/app/api/email/unsubscribe/route.ts`, `src/app/[locale]/unsubscribe/page.tsx`, `src/components/notifications/unsubscribe-confirm.tsx`, `src/server/magazines/{issue-service,issue-access,issue-editing,errors,notifications,reading,viewer-role,editorship}.ts`, `src/lib/magazines/item-views.ts`, `src/server/rate-limit/per-user-window.ts`, `src/server/benchmark/public-rate-limit.ts`, `src/migrations/magazines.integration.test.ts`, `src/server/api/routers/magazines.ts`, `src/server/api/root.ts`, `src/components/magazines/editor/{editor-errors,editor-desk,contributor-desk}.ts(x)`, `src/components/magazines/editor/builder/{publish-dialog,builder-top-bar,issue-builder}.tsx`, `src/components/magazines/reading/{issue-rail,magazine-shelf,issue-reader}.tsx`, `src/components/magazines/community/magazine-tab.tsx`, `src/i18n/messages-parity.test.ts`, `vercel.json`, `messages/{en,nl}.json`, `CONTEXT.md`, `DESIGN.md`.

---

## Task 1: Schedule and subscription values, the migration, Payload fields and ADR-0046

**Files:**

- Create: `src/lib/magazines/schedule.ts`, `src/lib/magazines/subscriptions.ts`, `src/migrations/20261027b_magazine_subscriptions.ts`, `docs/adr/0046-magazine-issues-are-announced-through-an-outbox-once-per-subscriber.md`
- Modify: `src/lib/magazines/values.ts`, `src/collections/MagazineIssues.ts`, `src/payload-types.ts` (generated), `src/server/db/schema.ts` (after `magazineStaff`; the `notification.type` comment gains the two new types), `src/migrations/index.ts`, `src/migrations/magazines.integration.test.ts` (rollback order, Step 4), `src/i18n/messages-parity.test.ts`, `messages/{en,nl}.json`, `CONTEXT.md`
- Test: `src/lib/magazines/values.test.ts` (create if missing), `src/lib/magazines/schedule.test.ts`, `src/lib/magazines/subscriptions.test.ts`, `src/collections/magazines-schema.test.ts`, `src/migrations/magazine-subscriptions.integration.test.ts`, `src/migrations/magazines.integration.test.ts`, `src/i18n/messages-parity.test.ts`

**Interfaces:**

- Produces (`values.ts`): `ISSUE_STATUSES = ["draft", "scheduled", "published"] as const`; `ISSUE_STATUS_LABELS.scheduled = "Scheduled"`. Replace the "slice 1 has no scheduling" comment. Also (Decision 8):
  ```ts
  export const ISSUE_ACTIONS = [
    "schedule",
    "unschedule",
    "publish",
    "delete",
  ] as const;
  export type IssueAction = (typeof ISSUE_ACTIONS)[number];
  /** The one table of what an issue in each status may do next. Services pre-check with it; the UI branches on it. */
  export const ISSUE_TRANSITIONS: Record<IssueStatus, readonly IssueAction[]> =
    {
      draft: ["schedule", "publish", "delete"],
      scheduled: ["schedule", "unschedule", "publish"],
      published: [],
    };
  export function canIssue(status: IssueStatus, action: IssueAction): boolean;
  export const PUBLISH_ORIGINS = ["button", "schedule"] as const; // slice 5 adds "auto"
  export type PublishOrigin = (typeof PUBLISH_ORIGINS)[number];
  ```
- Produces (`schedule.ts`):
  ```ts
  export const SCHEDULE_MAX_DAYS = 365;
  export type ScheduleProblem = "SCHEDULE_IN_PAST" | "SCHEDULE_TOO_FAR";
  /** In the past (publishAt <= now) or more than SCHEDULE_MAX_DAYS ahead; null when fine. */
  export function scheduleProblem(
    publishAt: Date,
    now: Date,
  ): ScheduleProblem | null;
  /** "YYYY-MM-DDTHH:mm" (a datetime-local value, read as the runtime's local time) → ISO string; null when not a valid date-time. */
  export function localDateTimeToIso(value: string): string | null;
  /** The reverse, for prefilling the input: an ISO instant as local "YYYY-MM-DDTHH:mm". */
  export function isoToLocalDateTime(iso: string): string;
  ```
- Produces (`subscriptions.ts`):
  ```ts
  export const CONFIRM_LINK_DAYS = 7;
  export const CONFIRM_RESEND_MINUTES = 10;
  export const CONFIRM_SENDS_PER_SUBSCRIPTION = 3;
  export const CONFIRM_MAGAZINES_PER_ADDRESS_PER_DAY = 5;
  export const CONFIRM_MAILS_PER_MAGAZINE_PER_DAY = 50;
  export const PENDING_SUBSCRIPTION_DAYS = 30;
  export const SUBSCRIBER_EMAIL_MAX = 254;
  /** Trimmed and lower-cased; null unless it has one "@", no spaces, a dot after the "@", and at most SUBSCRIBER_EMAIL_MAX characters. */
  export function normalizeSubscriberEmail(raw: string): string | null;
  ```
- Produces (`MagazineIssues.ts`): after `publishedBy`, `{ name: "scheduledFor", type: "date", index: true, admin: { date: { pickerAppearance: "dayAndTime" } } }` and `{ name: "scheduledBy", type: "text", admin: { description: "Who scheduled it (Better Auth user ID). The scheduled publish runs as this person." } }`, then `{ name: "publishedVia", type: "select", options: PUBLISH_ORIGINS.map(v => ({ label: v, value: v })), admin: { readOnly: true, description: "How it was published: the Publish button or a schedule." } }`; `scheduledFor` joins `defaultColumns` after `status`. The `status` options come from `ISSUE_STATUSES` (no code change there).
- Produces (`schema.ts`), with mirrored CHECKs, PK and indexes; the `magazines` / `magazine_issues` FKs live only in the migration (Payload tables), as for `magazineStaff`:
  ```ts
  export const magazineSubscriptions = appSchema.table("magazine_subscription", …);
  //   id, magazineId, userId (→ user, cascade), email, locale ($type<AppLocale>()), confirmTokenHash, confirmSentAt,
  //   confirmSendCount, confirmedAt, createdAt; indexes magazine_subscription_user_idx, magazine_subscription_magazine_idx,
  //   uniqueIndex magazine_subscription_magazine_user_idx (where user_id is not null),
  //   uniqueIndex magazine_subscription_magazine_email_idx (where email is not null),
  //   uniqueIndex magazine_subscription_confirm_token_idx (where confirm_token_hash is not null),
  //   check magazine_subscription_one_subscriber_check, check magazine_subscription_locale_check
  export const magazineIssueAnnouncements = appSchema.table("magazine_issue_announcement", …);
  //   issueId (PK), magazineId, publishedAt, completedAt, lastAttemptedAt (timestamptz null), createdAt;
  //   index magazine_issue_announcement_open_idx on (last_attempted_at, created_at) where completed_at is null
  export const magazineIssueDeliveries = appSchema.table("magazine_issue_delivery", …);
  //   issueId, subscriptionId (→ magazineSubscriptions.id, cascade), channel ($type<"inbox" | "email">()), deliveredAt;
  //   PK (issueId, subscriptionId); check magazine_issue_delivery_channel_check
  ```
- Messages added here so the new status never shows a raw key: `magazineEditor.desk.status.scheduled` and `magazineEditor.builder.status.scheduled`, both "Scheduled".

- [ ] **Step 1: Write the failing unit tests.**
  - `values.test.ts`: `it("an issue's next steps come from one table")`: `canIssue("draft","publish")`, `canIssue("scheduled","publish")`, `canIssue("scheduled","unschedule")` true; `canIssue("draft","unschedule")`, `canIssue("scheduled","delete")`, `canIssue("published","publish")` false; every `ISSUE_STATUSES` value has a row.
  - `schedule.test.ts`: `it("accepts a time in the future within a year")` (`now + 1 min` → null; `now + 365 days` → null); `it("refuses a past time and a time over a year away")` (`now` → `SCHEDULE_IN_PAST`, `now - 1 min` → `SCHEDULE_IN_PAST`, `now + 366 days` → `SCHEDULE_TOO_FAR`); `it("reads a datetime-local value as local time")` (`localDateTimeToIso("2026-11-02T09:00") === new Date(2026, 10, 2, 9, 0).toISOString()`; `"2026-13-02T09:00"`, `""` and `"tomorrow"` → null); `it("round-trips for the input")` (`isoToLocalDateTime(localDateTimeToIso("2026-11-02T09:05")!) === "2026-11-02T09:05"`).
  - `subscriptions.test.ts`: `it("normalizes an address")` (`"  Ann@Example.COM " → "ann@example.com"`); `it("refuses what cannot be an address")` (`"ann"`, `"ann@example"`, `"a b@example.com"`, `"a@@example.com"`, a 255-character address → null).
  - `magazines-schema.test.ts`: in the issue collection test, `status` options equal `ISSUE_STATUSES` and include `"scheduled"`; `scheduledFor` is a `date` with `index: true`; `scheduledBy` is `text`; `publishedVia` is a `select` whose option values equal `PUBLISH_ORIGINS`. Add `describe("magazine subscriptions migration")` like the platform-items one: the source contains `ADD VALUE IF NOT EXISTS 'scheduled'`, `CREATE TABLE IF NOT EXISTS "app"."magazine_subscription"`, `"app"."magazine_issue_announcement"`, `"app"."magazine_issue_delivery"`, and the index registers `name: "20261027b_magazine_subscriptions"` after `"20261027a_magazine_staff"`.
  - `messages-parity.test.ts`: add `[en.magazines, nl.magazines]` to the list (the other new namespaces are added by the tasks that create them).
- [ ] **Step 2: Run them.** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines src/collections/magazines-schema.test.ts src/i18n` → FAIL.
- [ ] **Step 3: Implement** `schedule.ts`, `subscriptions.ts`, the `values.ts` change, the collection fields, the Drizzle tables and the two message keys.
- [ ] **Step 4: Write the migration integration test** `src/migrations/magazine-subscriptions.integration.test.ts` in the style of `src/migrations/magazine-staff.integration.test.ts` (refuses any database but `aitcom_test`; fixture: one bare user, one magazine row, one issue row inserted with SQL):
  - `it("adds the scheduled status and the schedule columns, and can run twice")`. Run `up` twice. `enum_range(NULL::"enum_magazine_issues_status")` contains `scheduled`; `magazine_issues` has `scheduled_for` and `scheduled_by`.
  - `it("keeps one subscriber per row and one row per subscriber")`. A row with both `user_id` and `email`, or neither, is a check violation (`23514`); a second `(magazine, user)` or `(magazine, email)` row is a unique violation (`23505`); the same email in a second magazine is fine; `locale = 'de'` is a check violation.
  - `it("claims each delivery once and cleans up with its parents")`. A second delivery row for the same `(issue, subscription)` is `23505`; `channel = 'sms'` is `23514`. Deleting the subscription deletes its deliveries; deleting the issue deletes its announcement and deliveries; deleting the magazine deletes its subscriptions; deleting the user deletes their subscription.
  - `it("down removes the tables and columns, up restores them")`. **Run inside a transaction that is rolled back**, exactly like `src/migrations/magazine-staff.integration.test.ts:181-193`: `const rollback = new Error("rollback migration exercise"); await expect(db.transaction(async (tx) => { await down({ db: tx } as never); /* assert tables and columns gone */ await up({ db: tx } as never); /* assert back */ throw rollback; })).rejects.toBe(rollback);`. Other DB suites run in parallel and must keep their rows.
  - **Also change `src/migrations/magazines.integration.test.ts`** (its rollback would otherwise fail: `20261026a`'s `down` drops `magazine_issues`/`magazines` without CASCADE, and the new app tables reference them). Add `import * as subscriptions from "./20261027b_magazine_subscriptions";`, call `await subscriptions.down({ db: tx } as never);` first in the rollback transaction (before `staff.down`), and `await subscriptions.up({ db: tx } as never);` last (after `staff.up`).
- [ ] **Step 5: Write `20261027b_magazine_subscriptions.ts`.** First statement on its own: `ALTER TYPE "public"."enum_magazine_issues_status" ADD VALUE IF NOT EXISTS 'scheduled';` (Postgres refuses to use a new enum value in the transaction that adds it; precedent `20261013a_event_type_conference.ts`). Then one statement with `DO $$ BEGIN CREATE TYPE "public"."enum_magazine_issues_published_via" AS ENUM('button', 'schedule'); EXCEPTION WHEN duplicate_object THEN null; END $$;` (the `20261026a` enum pattern), `ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp(3) with time zone`, `… "scheduled_by" varchar`, `… "published_via" "enum_magazine_issues_published_via"` (nullable; issues published before this slice stay null), `CREATE INDEX IF NOT EXISTS "magazine_issues_scheduled_for_idx"`, and the three `CREATE TABLE IF NOT EXISTS "app".…` with every constraint and index of Interfaces (FKs: subscription → `"public"."magazines"` and `"app"."user"` ON DELETE cascade; announcement and delivery → `"public"."magazine_issues"` ON DELETE cascade, announcement → `"public"."magazines"` ON DELETE cascade, delivery → `"app"."magazine_subscription"` ON DELETE cascade). Partial unique indexes: `CREATE UNIQUE INDEX IF NOT EXISTS … WHERE "user_id" IS NOT NULL` (and the email and token ones). `down`: drop the three tables, set `status = 'draft'` where it is `'scheduled'`, drop the three columns, the index and the `published_via` enum type (`DROP TYPE IF EXISTS`); the `scheduled` status value stays (Postgres cannot drop one; say so in a comment). Header comment: why Drizzle (Decision 1), why the outbox is outside Payload (Decision 6), idempotent because failed deploys re-run it. Register it in `src/migrations/index.ts`. Run `<DB prefix> pnpm vitest run src/migrations/magazine-subscriptions.integration.test.ts src/migrations/magazines.integration.test.ts` → PASS (not skipped).
- [ ] **Step 6: Regenerate Payload types** (Global Constraints). `MagazineIssue.status` becomes `'draft' | 'scheduled' | 'published'` and gains `scheduledFor?: string | null; scheduledBy?: string | null; publishedVia?: ('button' | 'schedule') | null`. Run `pnpm typecheck`. Fix every place the new status breaks (expected: none outside exhaustive `Record<IssueStatus, …>`s, which now need `scheduled`).
- [ ] **Step 7: Write ADR-0046** in the format of `docs/adr/0045-*.md`. Title "Magazine issues are announced through an outbox, once per subscriber". It records Decisions 1–14 in short form, including: Flow 6 followed over Goal 8's wording for signed-in non-members (Decision 3); subscriber counts for every staff role (Decision 14); one paragraph on how slice 5's auto-publish plugs into `publishIssue` (origin `"auto"`, rights checked against the magazine's settings rather than a person; Decision 8); links ADR-0025 (inbox, no new channel), ADR-0042 (the resolver decides the audience; scheduled issues are invisible to readers through it), ADR-0043 (publish path: placement and credit), ADR-0045 (the scheduler's `edit` capability). Rejected options: Payload `schedulePublish`, Vercel Queues, sending in the publish request, a `notifiedAt` Payload column, `EmailTemplates`, a stored unsubscribe token. Check 0046 is free first: `git ls-tree -r --name-only origin/main docs/adr | tail -2` and `gh pr list --state open --json files --jq '.[].files[].path' | grep docs/adr/0046`.
- [ ] **Step 8: Update `CONTEXT.md`.** Add `### Magazine subscriber` (an account or a confirmed email address; how each is told), `### Scheduled issue` (status, who it publishes as, what happens when it cannot) and `### Issue announcement` (told once per subscriber; audience from the resolver), in the file's format, linking ADR-0046.
- [ ] **Step 9: Verify** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines src/collections src/i18n src/migrations/migration-runner-contract.test.ts && pnpm typecheck` → PASS.
- [ ] **Step 10: Commit** (every file above by name, `src/payload-types.ts` included): `feat(magazines): subscription tables, scheduled issue status and ADR-0046`.

---

## Task 2: Schedule, unschedule and publish through one path

**Files:**

- Create: `src/server/magazines/announcements.ts` (only `recordIssueAnnouncement` in this task)
- Modify: `src/server/magazines/issue-service.ts`, `src/server/magazines/issue-editing.ts` (`IssueListRow` and `listMagazineIssues` select `scheduledFor`), `src/server/magazines/errors.ts`, `src/components/magazines/editor/editor-errors.ts`, `src/server/api/routers/magazines.ts`, `messages/{en,nl}.json`
- Test: `src/server/magazines/issue-service.integration.test.ts`, `src/server/magazines/issue-access.integration.test.ts`, `src/server/magazines/errors.test.ts`, `src/components/magazines/editor/editor-errors.test.ts`, `src/server/api/routers/magazines.integration.test.ts`

**Interfaces:**

- Consumes: `scheduleProblem`, `canIssue`, `PublishOrigin` (Task 1); `magazineIssueAnnouncements` (Task 1); `writeIssue`, `assertItemsValid`, `assertFresh` (private, `issue-service.ts`); `PayloadTransaction` (`payload-writes.ts`).
- Lifecycle (Decision 8): every status pre-check in `issue-service.ts` uses `canIssue` — `scheduleIssue` (`"schedule"`), `unscheduleIssue` (`"unschedule"`, else `ISSUE_NOT_SCHEDULED`), `publishIssue` (`"publish"`, else `ISSUE_NOT_DRAFT`), `deleteDraftIssue` (`"delete"`, else `ISSUE_NOT_DRAFT`; its SQL claim keeps `"status" = 'draft'`). Private `assertPublishable(deps, issue, actor): Promise<void>` = `storedBlocksOf(issue).length === 0 → ISSUE_EMPTY`, then `assertItemsValid`; `publishIssue` and `scheduleIssue` both call it. Private `afterIssuePublished(deps, published): Promise<void>` runs `creditPendingMagazineArticles` in a `try`/log (`"[magazines] credit after publish failed"`); `publishIssue` calls only it after the commit (Task 6 adds the inbox step inside it).
- Produces (`announcements.ts`):
  ```ts
  /** Inside the publish transaction: the issue's one announcement (INSERT … ON CONFLICT ("issue_id") DO NOTHING, through tx.execute). */
  export async function recordIssueAnnouncement(
    tx: PayloadTransaction,
    input: { issueId: number; magazineId: number; publishedAt: string },
  ): Promise<void>;
  ```
- Produces (`issue-service.ts`):
  ```ts
  /** Draft or scheduled → scheduled at publishAt (reschedule allowed). ISSUE_NOT_DRAFT when published;
   *  SCHEDULE_IN_PAST / SCHEDULE_TOO_FAR from scheduleProblem; ISSUE_EMPTY; item problems as in publish.
   *  Writes { status: "scheduled", scheduledFor, scheduledBy: actor.userId } through writeIssue. */
  export async function scheduleIssue(
    deps: Deps,
    issue: MagazineIssue,
    publishAt: Date,
    expectedUpdatedAt: string,
    actor: IssueActor,
    now?: Date, // default new Date()
  ): Promise<MagazineIssue>;
  /** Scheduled → draft, both schedule fields null, through writeIssue. ISSUE_NOT_SCHEDULED otherwise.
   *  The actor is unused (like deleteDraftIssue's `_actor`), so the scheduled run may call it for a null scheduler. */
  export async function unscheduleIssue(
    deps: Deps,
    issue: MagazineIssue,
    expectedUpdatedAt: string,
    _actor: IssueActor | null,
  ): Promise<MagazineIssue>;
  export async function publishIssue(
    deps: Deps,
    issue: MagazineIssue,
    expectedUpdatedAt: string,
    actor: IssueActor,
    opts?: { origin?: PublishOrigin; now?: Date }, // defaults "button", new Date()
  ): Promise<MagazineIssue>;
  //   canIssue(status, "publish"), so draft and scheduled pass. Its update writes publishedAt: now.toISOString(),
  //   publishedVia: origin, scheduledFor: null, scheduledBy: null, and, in the same transaction after the update,
  //   calls recordIssueAnnouncement(tx, { issueId, magazineId, publishedAt }) with the publishedAt it wrote.
  //   The router's publishIssue passes no opts (origin "button").
  // deleteDraftIssue: unchanged (its claim keeps `"status" = 'draft'`, so a scheduled issue is ISSUE_NOT_DRAFT).
  ```
- Produces (errors): `MAGAZINE_ERROR_CODES` gains `"SCHEDULE_IN_PAST"` (BAD_REQUEST), `"SCHEDULE_TOO_FAR"` (BAD_REQUEST), `"ISSUE_NOT_SCHEDULED"` (CONFLICT). `editor-errors.ts` maps them to `scheduleInPast`, `scheduleTooFar`, `issueNotScheduled`. Copy (`magazineEditor.errors`): "Pick a time that is still to come." / "Pick a time within the next year." / "This issue is not scheduled any more. Reload to see what changed." `issueNotDraft` copy is unchanged.
- Produces (router, `edit`, built on `issueProcedure`):
  - `scheduleIssue(issueWrite.extend({ publishAt: z.string().datetime({ offset: true }) }))` → `MagazineIssue` (passes `new Date(input.publishAt)`).
  - `unscheduleIssue(issueWrite)` → `MagazineIssue`.
  - Add both to `PROCEDURE_CAPABILITY` as `"edit"`.

- [ ] **Step 1: Write the failing tests** in `issue-service.integration.test.ts` (existing fixture; an issue with one approved article):
  - `it("schedules a draft and can move the time")`. `scheduleIssue` at `now + 1 day` → `status: "scheduled"`, `scheduledFor` that instant, `scheduledBy` the actor. Again at `now + 2 days` → the new time.
  - `it("refuses to schedule a past time, a time over a year away, an empty or a published issue")`. Codes `SCHEDULE_IN_PAST`, `SCHEDULE_TOO_FAR`, `ISSUE_EMPTY`, `ISSUE_NOT_DRAFT`; the issue is unchanged after each.
  - `it("a scheduled issue can still be edited, but not deleted")`. `setIssueItems` and `updateIssueDetails` work on it and keep the schedule; `deleteDraftIssue` → `ISSUE_NOT_DRAFT`.
  - `it("unscheduling makes it a draft again")`. Both fields null. Unscheduling a draft → `ISSUE_NOT_SCHEDULED`. Unscheduling with a stale `expectedUpdatedAt` (after an `updateIssueDetails`) → `ISSUE_CHANGED`, still scheduled (the scheduled run's failure path relies on this). `unscheduleIssue(…, null)` works (no actor needed).
  - `it("publishing records how and when it went out")`. `publishIssue(…, { origin: "schedule", now: T })` → `publishedVia: "schedule"` and `publishedAt === T.toISOString()`; without opts → `publishedVia: "button"`.
  - `it("publishing a scheduled issue clears the schedule and records one announcement")`. After `publishIssue`: `status: "published"`, both fields null, one `app.magazine_issue_announcement` row with `magazine_id` and `published_at` equal to the issue's `publishedAt`. A later `setIssueItems` on the published issue leaves exactly one row.
  - `it("a publish that fails records no announcement")`. Force `ISSUE_CHANGED` (stale `expectedUpdatedAt`): no row.
- [ ] **Step 2: Add a parity row** in `issue-access.integration.test.ts`: the fixture of `readableIssueWhere returns exactly the issues the resolver lets each viewer read` gains a scheduled public issue. Members, outsiders and anonymous viewers do not get it from either form; editors do.
- [ ] **Step 3: Extend `magazines.integration.test.ts`**: `PROCEDURE_CAPABILITY` gains `scheduleIssue: "edit"` and `unscheduleIssue: "edit"`, **and** the table test's `calls` record gains (its keys must equal the router's procedures):

  ```ts
  scheduleIssue: () =>
    caller.scheduleIssue({ ...write, publishAt: new Date(Date.now() + 86_400_000).toISOString() }),
  unscheduleIssue: () => caller.unscheduleIssue(write),
  ```

  Add `it("schedules and unschedules through the API")`: the owner schedules with an ISO string with offset, then unschedules.

- [ ] **Step 4: Update `errors.test.ts` and `editor-errors.test.ts`** for the three codes.
- [ ] **Step 5: Run them** → FAIL. `<DB prefix> pnpm vitest run src/server/magazines/issue-service.integration.test.ts src/server/magazines/issue-access.integration.test.ts src/server/api/routers/magazines.integration.test.ts`.
- [ ] **Step 6: Implement.** `scheduleIssue`'s order: `canIssue`, time, then `assertPublishable` (so a wrong time never costs an item load). The editor copy in both locales.
- [ ] **Step 7: Run** `<DB prefix> pnpm vitest run src/server/magazines src/server/api/routers/magazines.integration.test.ts`, `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines src/components/magazines src/i18n` and `pnpm typecheck` → PASS.
- [ ] **Step 8: Commit**: `feat(magazines): schedule issues; publishing records its announcement`.

---

## Task 3: The scheduled publish run and the cron route

**Files:**

- Create: `src/server/magazines/scheduled-publishing.ts`, `src/server/magazines/issue-jobs.ts`, `src/app/api/cron/magazine-issues/route.ts`
- Modify: `src/server/magazines/notifications.ts`, `src/server/magazines/errors.ts` (`magazineErrorCodeOf`), `src/lib/magazines/item-views.ts` (`ITEM_PROBLEM_CODES`), `src/server/magazines/issue-service.ts` (`isItemProblemCode`), `vercel.json`, `messages/{en,nl}.json`
- Test: `src/server/magazines/scheduled-publishing.integration.test.ts`, `src/app/api/cron/magazine-issues/route.test.ts`, `src/server/magazines/notifications.test.ts`, `src/server/magazines/errors.test.ts`

**Interfaces:**

- Consumes: `publishIssue`, `unscheduleIssue`, `IssueActor` (Task 2); `loadMagazineEditorship`, `standingCan`, `listMagazineEditorIds` (`editorship.ts`); `isConcurrencyAbort` (`payload-writes.ts`); `issueBuilderPath` (`paths.ts`).
- Produces (`errors.ts`):
  ```ts
  /** The magazine refusal code an error carries, or null for anything else. Reads error.cause instanceof MagazineErrorCause. */
  export function magazineErrorCodeOf(error: unknown): MagazineErrorCode | null;
  ```
- Produces (`item-views.ts`): `export const ITEM_PROBLEM_CODES = ["ITEM_INVALID", "ARTICLE_PLACED", "ARTICLE_NOT_READY"] as const;` and `ItemProblem["code"]` becomes `(typeof ITEM_PROBLEM_CODES)[number]` (the existing `Subset<…, MagazineErrorCode>` check in `issue-service.ts` keeps compiling). `issue-service.ts` exports `isItemProblemCode(code: MagazineErrorCode): code is ItemProblemCode`, built on `ITEM_PROBLEM_CODES`.
- Produces (`notifications.ts`):
  ```ts
  export const MAGAZINE_ISSUE_SCHEDULE_FAILED_NOTIFICATION =
    "magazine_issue_schedule_failed";
  export type ScheduleFailure =
    | "empty"
    | "invalid_item"
    | "no_rights"
    | "error";
  export async function notifyScheduleFailed(
    db: Deps["db"],
    input: {
      editorIds: readonly string[];
      reason: ScheduleFailure;
      issue: { id: number; title: string };
      magazineName: string;
      community: NoticeCommunity;
    },
  ): Promise<void>; // one row per editor via insertMagazineNotices; path = issueBuilderPath(community.slug, issue.id); extra { reason, issueId }
  ```
  Copy (`magazineEditor.notifications.scheduleFailed`): `title` "“{title}” did not go out", `content.empty` "It has no items, so it could not be published. It is a draft again.", `content.invalid_item` "Something in it needs fixing. Open it to see what. It is a draft again.", `content.no_rights` "The person who scheduled it can no longer publish for {magazine}. Open it to publish or schedule it yourself.", `content.error` "Something went wrong on our side, so it could not be published. It is a draft again. Open it to try again.", `linkLabel` "Open the issue". The copy is chosen with a `Record<ScheduleFailure, …>` key, never a chain of `if`s.
- Produces (`scheduled-publishing.ts`):
  ```ts
  export const DUE_BATCH = 20;
  export const SCHEDULE_RETRY_LIMIT_MINUTES = 60;
  export type DueRunResult = {
    published: number;
    failed: number;
    retried: number;
  };
  /** Issues with status "scheduled" and scheduledFor <= now, oldest first, at most DUE_BATCH (Payload find, depth 0).
   *  Each through publishIssue(deps, issue, issue.updatedAt, actor, { origin: "schedule", now })
   *  with actor = { userId: scheduledBy, community }.
   *  Outcomes per Decision 9 (code read with magazineErrorCodeOf). One issue's failure never stops the others. */
  export async function publishDueIssues(
    deps: Deps,
    now: Date,
  ): Promise<DueRunResult>;
  ```
  The failure path (private `failSchedule(deps, issue, reason: ScheduleFailure | null)`): `await unscheduleIssue(deps, issue, issue.updatedAt, null)`; when it throws a magazine error whose code is `ISSUE_CHANGED` or `ISSUE_NOT_SCHEDULED`, do nothing more (an editor changed it; their change wins); any other error → log and leave for the next run. After it returns, when `reason` is not null: `notifyScheduleFailed` to `listMagazineEditorIds`. A soft-deleted or missing community → `failSchedule(…, null)`. A retryable outcome whose `now - scheduledFor` exceeds `SCHEDULE_RETRY_LIMIT_MINUTES` → `failSchedule(…, "error")` (counted as `failed`). No SQL of its own.
- Produces (`issue-jobs.ts`):
  ```ts
  export type IssueJobsResult = DueRunResult; // Task 6 widens it
  /** What /api/cron/magazine-issues runs, in order (Decision 10). Idempotent. */
  export async function runMagazineIssueJobs(
    deps: Deps,
    opts: { now: Date },
  ): Promise<IssueJobsResult>;
  ```
- Route (`route.ts`): `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 300`. `GET` follows `src/app/api/cron/news-storyline-announce/route.ts`:

  ```ts
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const deps = { db, payload: await getPayloadClient() };
  const result = await runMagazineIssueJobs(deps, { now: new Date() });
  return NextResponse.json({
    success: true,
    ...result,
    timestamp: new Date().toISOString(),
  });
  // on error: console.error("[magazine-issues] failed", error); return NextResponse.json({ success: false }, { status: 500 });
  ```

  `vercel.json` `crons` gains exactly:

  ```json
  { "path": "/api/cron/magazine-issues", "schedule": "*/5 * * * *" }
  ```

- [ ] **Step 1: Write `scheduled-publishing.integration.test.ts`** (DB; fixture: owner, admin, staff editor E, member M, a magazine, an issue holding one approved article written by E, and helpers that schedule through `scheduleIssue` and move "now" forward):
  - `it("publishes a due issue once, as the person who scheduled it")`. Scheduled by E at `t + 1h`. `publishDueIssues(t + 30min)` → `{ published: 0 }`. `publishDueIssues(t + 2h)` → `published: 1`; the issue is `published`, `publishedBy === E`, the article is `published` and its author credited (one `app.magazine_article_credit` row), one announcement row. A second run → `published: 0`.
  - `it("two runs at once publish it once")`. `Promise.all([run(t+2h), run(t+2h)])`: the `published` counts add up to 1, one announcement row, one credit row.
  - `it("a rescheduled issue is not published early")`. Scheduled at `t + 1h`, then moved to `t + 3h`; `run(t + 2h)` publishes nothing; `run(t + 4h)` publishes it.
  - `it("an issue emptied after scheduling goes back to draft and the editors are told")`. `setIssueItems([])` on the scheduled issue, then `run(t + 2h)` → `failed: 1`, status `draft`, fields null; one `magazine_issue_schedule_failed` row each for owner, admin and E, with `metadata.reason = "empty"` and `metadata.reviewPath` = the builder path.
  - `it("a scheduler removed from the team does not publish")`. Delete E's staff row → `failed: 1`, draft, `reason = "no_rights"`, notices to owner and admin only.
  - `it("a deleted community publishes nothing and tells nobody")`. Set the community's `deletedAt` → the issue is a draft again, no notice.
  - `it("one failing issue does not stop the others")`. Two due issues, one emptied: one `published`, one `failed`.
  - `it("an issue that keeps failing for an unknown reason goes back to draft after an hour")`. Make `publishIssue` throw a plain `Error` for this issue (`vi.spyOn` on the module export, or a fixture that triggers a non-magazine error): `run(scheduledFor + 30min)` → `retried: 1`, still `scheduled`, no notice; `run(scheduledFor + 61min)` → `failed: 1`, `draft`, one `magazine_issue_schedule_failed` per editor with `metadata.reason = "error"`.
  - In the first test, also assert `publishedVia === "schedule"` and `publishedAt === <the run's now>.toISOString()`.
- [ ] **Step 2: Write `route.test.ts`** like `src/app/api/cron/news-storyline-announce/route.test.ts` (mock `runMagazineIssueJobs` and `getPayloadClient`): `it("refuses a missing or wrong secret")`, `it("runs the issue jobs once and answers their counts")`, `it("answers 500 when the run throws")`. Add to `notifications.test.ts`: `it("tells each editor why a scheduled issue did not go out")` (fake db: one row per editor, each of the four reasons' copy, the builder path). Add to `errors.test.ts`: `it("reads the code a magazine refusal carries")` (`magazineErrorCodeOf(magazineError("ISSUE_EMPTY")) === "ISSUE_EMPTY"`; a plain `Error`, a `TRPCError` without the cause, `null` → `null`) and `it("item problem codes are refusal codes")` (every `ITEM_PROBLEM_CODES` entry is in `MAGAZINE_ERROR_CODES`; `isItemProblemCode("ISSUE_EMPTY") === false`).
- [ ] **Step 3: Run them** → FAIL.
- [ ] **Step 4: Implement**, plus the en + nl copy and the `vercel.json` entry. Decide the outcome with `magazineErrorCodeOf(error)` (never by parsing messages): `ISSUE_EMPTY` → `empty`; `isItemProblemCode(code)` → `invalid_item`; `isConcurrencyAbort(error)`, `ISSUE_CHANGED`, `ISSUE_NOT_DRAFT`, `null` or any other code → retry until `SCHEDULE_RETRY_LIMIT_MINUTES`, then `error`.
- [ ] **Step 5: Run** `<DB prefix> pnpm vitest run src/server/magazines`, `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines src/app/api/cron/magazine-issues` and `pnpm typecheck` → PASS.
- [ ] **Step 6: Commit**: `feat(magazines): scheduled issues go out from the cron through the publish path`.

---

## Task 4: Subscriptions: service, confirmation email and reader API

**Files:**

- Create: `src/lib/email/recipient-gate.ts`, `src/server/rate-limit/client-ip.ts`, `src/server/magazines/subscriptions/service.ts`, `src/server/magazines/subscriptions/tokens.ts`, `src/server/magazines/subscriptions/mail.ts`, `src/server/api/routers/magazine-subscriptions.ts`
- Modify: `src/lib/news/storyline-draft-review.ts` (re-exports), `src/server/email.ts` (`sendGatedEmail`; both storyline senders use it), `src/server/benchmark/public-rate-limit.ts` (`getClientIp` wraps `clientIpFromHeaders`), `src/server/rate-limit/per-user-window.ts` (drops expired windows), `src/server/magazines/reading.ts` (`readableIssueExists`, `mayKnowMagazine`, `findMagazineForViewer`, export `findMagazineBySlug`), `src/lib/magazines/paths.ts`, `src/server/api/root.ts`, `src/server/api/routers/magazines.ts` (`subscriberCounts`), `src/i18n/messages-parity.test.ts` (add `magazineMail`), `messages/{en,nl}.json`
- Test: `src/lib/email/recipient-gate.test.ts`, `src/server/rate-limit/client-ip.test.ts`, `src/server/rate-limit/per-user-window.test.ts`, `src/server/email-storyline-announce.test.ts` (unchanged, must pass), `src/lib/news/storyline-draft-review.test.ts` (unchanged, must pass), every existing test that covers `sendStorylineDraftReviewEmail` (`grep -rln sendStorylineDraftReviewEmail src --include=*.test.ts`; unchanged, must pass), `src/server/magazines/reading.integration.test.ts`, `src/server/magazines/subscriptions/mail.test.ts`, `src/server/magazines/subscriptions/service.integration.test.ts`, `src/server/api/routers/magazine-subscriptions.integration.test.ts`, `src/server/api/routers/magazines.integration.test.ts`

**Interfaces:**

- Consumes: Task 1's constants, `normalizeSubscriberEmail`, `magazineSubscriptions`; `loadIssueReadScope`, `readableIssueWhere`, `liveCommunitiesById`, `canReadContent` (as `loadShelf` uses them); `createPerUserLimit` (`src/server/rate-limit/per-user-window.ts`); `escapeHtml` (`src/server/email-template.ts`); `CANONICAL_PRODUCTION_ORIGIN`; `loadMessages`, `AppLocale` (`src/i18n/messages`); `routing.locales`.
- Produces (`reading.ts`, Decision 2; `CommunityRow` becomes exported as `MagazineCommunityRow`):
  ```ts
  /** The one "may know this magazine exists" rule, pure. loadShelf calls it with issues.length > 0
   *  in place of its inline `issues.length === 0 && !canReadContent(…)` (no extra query on the shelf). */
  export function mayKnowMagazine(input: {
    hasReadableIssue: boolean;
    community: MagazineCommunityRow;
    isMember: boolean;
  }): boolean;
  /** Whether the scope may read at least one published issue of the magazine: readableIssueWhere + PUBLISHED, limit 1, depth 0. */
  export async function readableIssueExists(
    deps: Deps,
    scope: IssueReadScope,
    magazineId: number,
  ): Promise<boolean>;
  /** Magazine by slug + its live community, when the viewer may know it (mayKnowMagazine over readableIssueExists); else null. */
  export async function findMagazineForViewer(
    deps: Deps,
    opts: { magazineSlug: string; viewerId: string | null },
  ): Promise<{ magazine: Magazine; community: MagazineCommunityRow } | null>;
  export async function findMagazineBySlug(
    payload: Deps["payload"],
    slug: string,
  ): Promise<Magazine | null>; // now exported, unchanged
  ```
- Produces (`client-ip.ts`): `export function clientIpFromHeaders(headers: Headers): string` — first `x-forwarded-for` entry (trimmed), else `x-real-ip`, else `"unknown"` (the body of today's `getClientIp`). `getClientIp(req)` in `public-rate-limit.ts` becomes `clientIpFromHeaders(req.headers)`. The two inline copies in `src/app/api/auth/[...all]/route.ts` and `src/app/api/mcp/route.ts` are left alone (see Preflight rulings).
- Produces (`per-user-window.ts`): same signature; each call first deletes windows whose `resetAt` has passed when the map holds more than `PRUNE_ABOVE = 1_000` keys, so anonymous IP keys cannot grow without bound. Test: `it("forgets windows that have ended")` (1,001 keys, advance `now` past the window, one more call → the map no longer holds the old keys; observe through a test-only `size()` on the returned function or by asserting a re-used key starts fresh).
- Produces (`recipient-gate.ts`): `MAIL_TEST_RECIPIENT = "greg@klevox.com"`, `type MailEnv = { VERCEL_ENV?: string; NODE_ENV?: string }`, `gatedMailRecipient(to: string, env: MailEnv): string | null` — the body of today's `storylineMailRecipient`, moved. `storyline-draft-review.ts` keeps `STORYLINE_TEST_RECIPIENT`, `StorylineMailEnv` and `storylineMailRecipient` as aliases of these.
- Produces (`email.ts`):
  ```ts
  /** The gated Resend send, moved out of the two storyline senders.
   *  false when the gate refuses or Resend is not configured; throws opts.refusedMessage when NODE_ENV is "test"
   *  and the recipient is not MAIL_TEST_RECIPIENT; with retryOnRateLimit, one retry after 1s on rate_limit_exceeded;
   *  on a Resend error logs `${opts.logPrefix}: resend rejected the email` with the error name and throws opts.rejectedMessage. */
  export async function sendGatedEmail(
    to: string,
    message: {
      subject: string;
      html: string;
      text: string;
      headers?: Record<string, string>;
    },
    env: MailEnv,
    opts: {
      refusedMessage: string;
      rejectedMessage: string;
      logPrefix: string;
      retryOnRateLimit: boolean;
    },
  ): Promise<boolean>;
  // sendStorylineAnnounceEmail → sendGatedEmail(to, message, env, { refusedMessage: "Storyline announcement email refused",
  //   rejectedMessage: "Resend rejected the storyline announcement", logPrefix: "news-storyline-announce", retryOnRateLimit: true })
  // sendStorylineDraftReviewEmail → sendGatedEmail(to, renderStorylineDraftReviewEmail(opts), env, { refusedMessage:
  //   "Storyline review email refused", rejectedMessage: "Resend rejected the storyline draft email",
  //   logPrefix: "storyline-draft-review", retryOnRateLimit: false })
  // Every existing message string stays exactly as it is today.
  ```
- Produces (`paths.ts`): `export const MAGAZINE_SUBSCRIPTION_CONFIRM_PATH = "/magazine-subscriptions/confirm";`
- Produces (`tokens.ts`): `newConfirmToken(): { token: string; hash: string }` (`randomBytes(32)` base64url; SHA-256 hex) and `hashConfirmToken(token: string): string`.
- Produces (`mail.ts`):
  ```ts
  export type MagazineMail = { subject: string; html: string; text: string };
  export type OutgoingMagazineMail = MagazineMail & {
    headers?: Record<string, string>;
  };
  /** The seam every magazine email goes through; tests pass a fake. */
  export type MagazineMailer = {
    send(to: string, mail: OutgoingMagazineMail): Promise<boolean>;
    env: MailEnv;
    sleep?: (ms: number) => Promise<void>;
  };
  /** sendGatedEmail(…, { refusedMessage: "Magazine email refused", rejectedMessage: "Resend rejected the magazine email",
   *  logPrefix: "magazines", retryOnRateLimit: true }) with { VERCEL_ENV, NODE_ENV } from process.env. */
  export function defaultMagazineMailer(): MagazineMailer;
  /** One layout for every magazine email: heading, paragraphs, one action link, small footer lines, optional unsubscribe link.
   *  Every value HTML-escaped; the text part holds the same words and the raw URLs. */
  export function renderMagazineMail(parts: {
    subject: string;
    heading: string;
    paragraphs: readonly string[];
    action: { label: string; href: string };
    footer: readonly string[];
    unsubscribe?: { label: string; href: string };
  }): MagazineMail;
  export function magazineConfirmUrl(locale: AppLocale, token: string): string; // `${ORIGIN}/${locale}${MAGAZINE_SUBSCRIPTION_CONFIRM_PATH}?t=…`
  export async function confirmationMail(input: {
    locale: AppLocale;
    magazineName: string;
    confirmUrl: string;
  }): Promise<MagazineMail>;
  ```
  Copy (`magazineMail.confirm`, en): `subject` "Confirm: new issues of {magazine} by email"; `heading` "Get new issues of {magazine}?"; `body` "Someone, hopefully you, asked us to email this address when {magazine} has a new issue. Click the button to say yes."; `action` "Yes, email me new issues"; `expires` "The link works for 7 days."; `ignore` "Did not ask for this? Then ignore this email. We will not write again." `magazineMail.footer` "AIT Community".
- Produces (`service.ts`):
  ```ts
  export type SubscriberCounts = {
    withAccount: number;
    byEmail: number;
    waiting: number;
  };
  /** Idempotent; confirmed at once. One transaction: reads the user's address from app.user by id (Decision 3; the session
   *  has none), deletes an email row of this magazine with that address, and inserts the account row with
   *  confirmed_at = LEAST(<deleted email row's confirmed_at>, now) (now when there was none or it was unconfirmed).
   *  ON CONFLICT on (magazine_id, user_id) DO NOTHING. */
  export async function subscribeAccount(
    db: Deps["db"],
    magazineId: number,
    userId: string,
    locale: AppLocale,
    now: Date,
  ): Promise<void>;
  export async function unsubscribeAccount(
    db: Deps["db"],
    magazineId: number,
    userId: string,
  ): Promise<void>;
  export async function isAccountSubscribed(
    db: Deps["db"],
    magazineId: number,
    userId: string,
  ): Promise<boolean>;
  /** Decisions 2 and 4. Never reveals anything: returns normally for every address. Order: normalize (null → return);
   *  readableIssueExists(deps, <anonymous scope: loadIssueReadScope(db, null)>, magazine.id) false → return (nothing public to
   *  announce; the anonymous readable set is exactly issueAudience "everyone", pinned by the Task 6 parity test);
   *  then ONE db.transaction that first runs SELECT pg_advisory_xact_lock(hashtext('magazine-confirm:' || <normalized email>)) and:
   *  an account subscription of this magazine whose user has this address → return;
   *  ≥ CONFIRM_MAGAZINES_PER_ADDRESS_PER_DAY rows with this address and confirm_sent_at in the last 24h (other magazines) → return;
   *  ≥ CONFIRM_MAILS_PER_MAGAZINE_PER_DAY rows of this magazine with confirm_sent_at in the last 24h → return;
   *  then ONE upsert on the partial unique index (magazine_id, email) that sets a new token hash, confirm_sent_at = now,
   *  confirm_send_count + 1 (1 on insert) and locale, but only WHERE confirmed_at IS NULL AND (confirm_sent_at IS NULL OR
   *  older than CONFIRM_RESEND_MINUTES) AND confirm_send_count < CONFIRM_SENDS_PER_SUBSCRIPTION, RETURNING id.
   *  After commit: no row → return. A row → mailer.send(confirmationMail);
   *  a failed or throwing send is logged ("[magazines] confirmation mail failed", no address in the log) and swallowed. */
  export async function subscribeByEmail(
    deps: Deps,
    input: {
      magazine: { id: number; name: string };
      email: string;
      locale: AppLocale;
    },
    mailer: MagazineMailer,
    now: Date,
  ): Promise<void>;
  export type ConfirmLinkStatus =
    | "ready"
    | "subscribed"
    | "expired"
    | "invalid";
  export type ConfirmLink = {
    status: ConfirmLinkStatus;
    magazine: { name: string; slug: string } | null;
  };
  /** Reads, never writes. invalid: no row for the hash (or its magazine is gone); subscribed: confirmed_at set;
   *  expired: confirm_sent_at older than CONFIRM_LINK_DAYS; else ready. */
  export async function readConfirmLink(
    deps: Deps,
    token: string,
    now: Date,
  ): Promise<ConfirmLink>;
  /** ready → sets confirmed_at = now (conditional on confirmed_at IS NULL) and answers "subscribed"; other statuses unchanged. */
  export async function confirmEmailSubscription(
    deps: Deps,
    token: string,
    now: Date,
  ): Promise<ConfirmLink>;
  /** Idempotent delete by id (the unsubscribe link). */
  export async function removeSubscription(
    db: Deps["db"],
    subscriptionId: string,
  ): Promise<void>;
  export async function countSubscribers(
    db: Deps["db"],
    magazineId: number,
  ): Promise<SubscriberCounts>;
  //   withAccount = user rows; byEmail = confirmed email rows; waiting = unconfirmed email rows
  /** Deletes email rows WHERE confirmed_at IS NULL AND COALESCE(confirm_sent_at, created_at) < now - PENDING_SUBSCRIPTION_DAYS;
   *  returns how many. A link re-sent recently is never deleted while it still works. */
  export async function purgeUnconfirmedSubscriptions(
    db: Deps["db"],
    now: Date,
  ): Promise<number>;
  ```
- Produces (router `magazineSubscriptions`, registered in `root.ts`; `magazineSlug` is the magazine's slug, `locale: z.enum(routing.locales)`):
  - `status` (`publicProcedure`, `{ magazineSlug }`) → `{ signedIn: boolean; subscribed: boolean }`. `NOT_FOUND` when `findMagazineForViewer(deps, { magazineSlug, viewerId })` is null (the one "may know this magazine" rule, Decision 2; no shelf load).
  - `subscribe` (`protectedProcedure`, `{ magazineSlug, locale }`) → `{ subscribed: true }`. Same `NOT_FOUND` rule. Calls `subscribeAccount(db, magazine.id, ctx.session.user.id, locale, new Date())` (the address comes from `app.user`, not the session).
  - `unsubscribe` (`protectedProcedure`, `{ magazineSlug }`) → `{ subscribed: false }`. Finds the magazine with the now-exported `findMagazineBySlug(payload, magazineSlug)` only (someone who lost access can still leave); `null` → `NOT_FOUND`.
  - `subscribeByEmail` (`publicProcedure`, `{ magazineSlug, email: z.string().trim().max(SUBSCRIBER_EMAIL_MAX), locale }`) → `{ ok: true }`. First the per-IP limit (`createPerUserLimit`, key = `clientIpFromHeaders(ctx.headers)`; refused → `TRPCError TOO_MANY_REQUESTS`), then the `NOT_FOUND` rule with the anonymous viewer (`viewerId: null`), then `subscribeByEmail(deps, …, defaultMagazineMailer(), new Date())`.
- Produces (`magazines` router): `subscriberCounts` (`writerProcedure`, `{ slug }`) → `SubscriberCounts | null` (null without a magazine). Add `subscriberCounts: "write"` to `PROCEDURE_CAPABILITY` **and** to the table test's `calls` record: `subscriberCounts: () => caller.subscriberCounts({ slug: slug() }),`.

- [ ] **Step 1: Write the failing unit tests.**
  - `recipient-gate.test.ts`: production returns the normalized address; elsewhere only `MAIL_TEST_RECIPIENT`; a value without `@` → null. (The storyline tests keep passing through the aliases.)
  - `client-ip.test.ts`: first `x-forwarded-for` entry trimmed; else `x-real-ip`; else `"unknown"`.
  - `per-user-window.test.ts`: `it("forgets windows that have ended")` (see Interfaces).
  - `mail.test.ts`: `it("escapes everything a magazine name can carry")` (a name `<b>&"x"` never appears raw in `html`); `it("has a text part with the link")`; `it("writes the confirmation in the subscriber's language")` (`nl` subject differs from `en` and comes from `nl.json`); `it("links to the confirm page in that language")` (`magazineConfirmUrl("nl", "abc")` ends with `/nl/magazine-subscriptions/confirm?t=abc`).
- [ ] **Step 2: Write `service.integration.test.ts`** (DB; fixture: owner, member M, outsider O, a listed community with a magazine that has one published public issue — inserted through `publishIssue` — so email subscribe has something to announce; `mailer` fake; a `now` you move):
  - `it("a signed-in reader subscribes once and can leave")`. Two `subscribeAccount` calls → one row with `confirmed_at` set; `isAccountSubscribed` true; after `unsubscribeAccount` false.
  - `it("email subscribe stores a waiting row and mails one link")`. One row: `confirmed_at` null, `locale` as given, `confirm_send_count` 1, `confirm_token_hash` 64 hex characters that do not appear in the mail. One `send` call to the address; its text contains `/en/magazine-subscriptions/confirm?t=`.
  - `it("asking again soon sends no second mail and answers the same")`. Again after 5 minutes → no second `send`; after 11 minutes → a second `send` with a new token (the first token now reads `invalid`). An address already confirmed → no `send`. M's own account address while M has an account subscription → no row, no `send`. Every call resolves to `undefined`.
  - `it("never more than three mails per magazine or five magazines a day")`. Four calls 11 minutes apart → three `send`s. Six magazines (each with a published public issue) in one hour for the same address → five `send`s; a day later the sixth works.
  - `it("parallel requests cannot beat the daily limit")`. Eight magazines with a public issue; `Promise.all` of eight `subscribeByEmail` calls for one address, one per magazine → at most five `send`s and at most five rows with `confirm_sent_at` set.
  - `it("a magazine sends at most 50 confirmation mails a day")`. 51 different addresses for one magazine → 50 `send`s; a day later the 51st works.
  - `it("a magazine with nothing public mails nobody")`. A magazine in a listed community with no published issue, and one whose only published issue is members-only → no row, no `send`, the call resolves to `undefined`.
  - `it("confirming works once and old links expire")`. `readConfirmLink` → `ready` and the magazine's name; it changes nothing. `confirmEmailSubscription` → `subscribed`, `confirmed_at` set; again → `subscribed`. A link read 8 days after its send → `expired` and confirming it changes nothing. `"nonsense"` → `invalid`.
  - `it("an account subscription takes over an email one")`. A confirmed email row for M's address (`confirmed_at = T0`), then `subscribeAccount(db, magazineId, M, "en", T0 + 1 day)` → only the account row is left, with `confirmed_at = T0` (LEAST, Decision 3). With no email row, `confirmed_at = now`.
  - `it("counts subscribers by kind")` and `it("removes links nobody confirmed after 30 days")` (unconfirmed row created 31 days ago and never re-sent → removed; unconfirmed row created 31 days ago but re-sent (`confirm_sent_at`) 2 days ago → kept; confirmed and fresh ones kept).
  - `it("a send that throws never fails the subscribe")`.
- [ ] **Step 3: Write `magazine-subscriptions.integration.test.ts`** (router through `createCaller`; mock `sendGatedEmail` with `vi.mock("@/server/email", …)` so `defaultMagazineMailer` never reaches Resend):
  - `it("only people who may see the magazine can subscribe")`. An unlisted community whose magazine has only members-only issues: the outsider's `status`, `subscribe` and the anonymous `subscribeByEmail` → `NOT_FOUND`; the member's `subscribe` works. A listed community whose magazine has a published public issue: the outsider and anonymous both work.
  - `it("subscribing through the API takes over the reader's email subscription")`. A confirmed email row with M's `app.user` address in the magazine; `callerAs(M).magazineSubscriptions.subscribe(...)` (session `{ id, name }` only) → the email row is gone and one account row exists.
  - `it("tells a reader whether they subscribe")`. Anonymous → `{ signedIn: false, subscribed: false }`; M after `subscribe` → `{ signedIn: true, subscribed: true }`.
  - `it("anyone subscribed can leave, even after losing access")`.
  - `it("too many tries from one address are refused")`. Ten anonymous calls from one IP succeed, the eleventh → `TOO_MANY_REQUESTS`; another IP still works.
  - `it("unknown, known and confirmed addresses get the same answer")`. Three calls → three `{ ok: true }`.
  - In `magazines.integration.test.ts`: `it("magazine staff see subscriber counts")` (owner and an appointed contributor both get `{ withAccount: 1, byEmail: 0, waiting: 1 }` after one account and one waiting email row); the table test (with the `calls` entry above) covers the gate: an outsider and a moderator without a staff role get FORBIDDEN.
- [ ] **Step 4: Run them** → FAIL.
- [ ] **Step 5: Implement** (gate move, sender extraction for both storyline senders, `clientIpFromHeaders` and the limiter pruning, the `reading.ts` seam with `loadShelf` switched to `mayKnowMagazine`, tokens, mail, service, router, `subscriberCounts`), the en + nl `magazineMail.*` copy and the parity entry. The per-IP limiter is one module-level instance in the router file.
- [ ] **Step 6: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib src/server/email-storyline-announce.test.ts src/server/rate-limit src/server/benchmark src/server/news src/server/magazines src/i18n`, `<DB prefix> pnpm vitest run src/server/magazines src/server/api/routers/magazine-subscriptions.integration.test.ts src/server/api/routers/magazines.integration.test.ts src/server/news` and `pnpm typecheck` → PASS.
- [ ] **Step 7: Commit**: `feat(magazines): subscribe with an account or a confirmed email address`.

---

## Task 5: The confirm page and the magazine unsubscribe link

**Files:**

- Create: `src/app/api/magazine-subscriptions/confirm/route.ts`, `src/app/[locale]/magazine-subscriptions/confirm/page.tsx`, `src/components/magazines/reading/subscription-confirm.tsx`
- Modify: `src/server/notifications/unsubscribe-token.ts`, `src/app/api/email/unsubscribe/route.ts`, `src/app/[locale]/unsubscribe/page.tsx`, `src/components/notifications/unsubscribe-confirm.tsx` (`copy.settings` optional; no link when absent), `src/i18n/messages-parity.test.ts` (add `magazineSubscription`, `magazineUnsubscribe`), `messages/{en,nl}.json`
- Test: `src/server/notifications/unsubscribe-token.test.ts`, `src/app/api/email/unsubscribe/route.test.ts`, `src/app/api/magazine-subscriptions/confirm/route.test.ts`, `src/app/[locale]/magazine-subscriptions/confirm/page.test.tsx`, `src/app/[locale]/unsubscribe/page.test.tsx` (new)

**Interfaces:**

- Consumes: `readConfirmLink`, `confirmEmailSubscription`, `removeSubscription`, `ConfirmLink` (Task 4); `magazinePath` (`paths.ts`).
- Produces (`unsubscribe-token.ts`):
  ```ts
  export const MAGAZINE_UNSUBSCRIBE_SCOPE = "magazine" as const;
  export type UnsubscribeScope =
    | typeof DIGEST_UNSUBSCRIBE_SCOPE
    | typeof STORY_UNSUBSCRIBE_SCOPE
    | typeof MAGAZINE_UNSUBSCRIBE_SCOPE;
  export type UnsubscribePayload =
    | {
        scope: typeof DIGEST_UNSUBSCRIBE_SCOPE | typeof STORY_UNSUBSCRIBE_SCOPE;
        userId: string;
      }
    | { scope: typeof MAGAZINE_UNSUBSCRIBE_SCOPE; subscriptionId: string };
  // signUnsubscribeToken / verifyUnsubscribeToken keep their names and the wire format { u, s }:
  //   u is the userId or the subscriptionId by scope. Every existing call site keeps compiling (it passes userId with digest/story).
  ```
- Route `/api/email/unsubscribe`: the scope dispatch becomes an exhaustive `switch`: `digest` → `recordGlobalDigestOptOut(userId)`, `story` → `recordStoryEmailOptOut(userId)`, `magazine` → `removeSubscription(db, subscriptionId)`. The confirm redirect adds `&kind=magazine` for that scope.
- Page `/[locale]/unsubscribe`: the copy namespace comes from `Record<UnsubscribeScope, "digestUnsubscribe" | "storyUnsubscribe" | "magazineUnsubscribe">` (from the verified scope, or from `kind` after `done=1`), through one small function `unsubscribeNamespaceFor(query): UnsubscribeNamespace` in the page file that **both** `generateMetadata({ searchParams })` and the page body call, so the tab title matches the page. For `magazine` no settings link (the subscriber may have no account).
- Confirm route (`POST` only; `runtime = "nodejs"`, `dynamic = "force-dynamic"`): form fields `t`, `locale`. Missing `t` → `400`. The locale is whitelisted: `(routing.locales as readonly string[]).includes(raw) ? raw : routing.defaultLocale` (the `localeFrom` precedent in `src/app/api/email/unsubscribe/route.ts`), never interpolated raw. Calls `confirmEmailSubscription({ db, payload }, t, new Date())` and redirects `303` to `new URL(path, req.url)` with `path = "/" + locale + MAGAZINE_SUBSCRIPTION_CONFIRM_PATH + "?t=" + encodeURIComponent(t)` whatever the outcome (the page shows it); the target is always same-origin. Never answers with an address.
- Page `/[locale]/magazine-subscriptions/confirm`: `dynamic = "force-dynamic"`, metadata `{ title: t("metaTitle"), robots: { index: false, follow: false } }`. Reads `t` → `readConfirmLink` (never confirms) → `<SubscriptionConfirm status magazine token locale />`.
- `SubscriptionConfirm` (server component, the `UnsubscribeConfirm` frame: `max-w-lg`, `<SectionLabel>` kicker, a bordered panel): `ready` → a `<form method="post" action="/api/magazine-subscriptions/confirm">` with hidden `t` and `locale` and the default button; `subscribed` → done copy plus an `ink` link to `magazinePath(magazine)`; `expired` / `invalid` → their copy plus the magazine link when known.
- Copy (`magazineSubscription`): `metaTitle` "Confirm your subscription", `kicker` "Magazine", `readyTitle` "Get new issues of {magazine} by email?", `readyBody` "Click the button and we will email you each time {magazine} has a new issue.", `action` "Yes, email me new issues", `doneTitle` "You are subscribed", `doneBody` "We will email you when {magazine} has a new issue. Every email has a link to stop.", `openMagazine` "Go to {magazine}", `expiredTitle` "This link is too old", `expiredBody` "Links work for 7 days. Ask for a new one on the magazine page.", `invalidTitle` "This link does not work", `invalidBody` "It may be cut off or replaced by a newer one. Ask for a new one on the magazine page." (`magazineUnsubscribe`): `metaTitle` "Stop magazine emails", `kicker` "Magazine emails", `title` "Stop emails from this magazine?", `body` "You will not get an email about new issues any more.", `action` "Unsubscribe", `doneTitle` "You are unsubscribed", `doneBody` "We will not email you about this magazine again.", `invalidTitle` "This link does not work", `invalidBody` "It may be cut off. Open the magazine page to subscribe again."

- [ ] **Step 1: Write the failing tests.**
  - `unsubscribe-token.test.ts`: `it("signs and reads a magazine token carrying the subscription id")`; `it("existing digest and story tokens still read the same")` (a token signed with today's code for `{ userId, scope: "story" }` verifies to the same payload); `it("refuses an unknown scope")`.
  - `api/email/unsubscribe/route.test.ts`: `it("a magazine link removes that subscription")` (mock `removeSubscription`; called with the id; the digest and story functions are not); `it("redirects a confirmed magazine unsubscribe to the done page")` (`kind=magazine`).
  - `confirm/route.test.ts` (mock the service): `it("confirms on POST and sends the reader back to the page")` (303, `Location` ends with `/nl/magazine-subscriptions/confirm?t=abc`); `it("refuses a request without a link")` (400); `it("has no GET")` (the module exports no `GET`); `it("ignores a locale that is not ours")` (`locale="//evil.example"` and `locale="de"` → 303 to `/en/magazine-subscriptions/confirm?t=…` on the request's own origin: `new URL(location).origin === new URL(req.url).origin`).
  - `confirm/page.test.tsx` (mock `readConfirmLink` and `confirmEmailSubscription`): `it("opening the link does not confirm")` (`confirmEmailSubscription` never called; the form posts to `/api/magazine-subscriptions/confirm` with the hidden `t`); `it("shows the done, expired and invalid states")`; `it("is never indexed")` (metadata `robots.index === false`).
  - `unsubscribe/page.test.tsx`: `it("uses the magazine words and no settings link for a magazine link")`; `it("titles the tab for a magazine link")` (`generateMetadata({ searchParams })` with a magazine token, and with `done=1&kind=magazine` → title "Stop magazine emails"); `it("keeps the digest page as it was")` (digest title and body unchanged).
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement**, plus the en + nl copy and the parity entries.
- [ ] **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/notifications src/app/api/email src/app/api/magazine-subscriptions "src/app/[locale]/magazine-subscriptions" "src/app/[locale]/unsubscribe" src/components/notifications src/i18n` and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit**: `feat(magazines): confirm and unsubscribe links for magazine emails`.

---

## Task 6: Tell subscribers about a new issue, once

**Files:**

- Modify: `src/server/magazines/announcements.ts`, `src/server/magazines/issue-access.ts` (`issueAudience`), `src/server/magazines/viewer-role.ts` (`activeMembershipCondition`), `src/server/magazines/editorship.ts` (`listMagazineEditorIds` uses it), `src/server/magazines/notifications.ts`, `src/server/magazines/subscriptions/mail.ts` (`issueMail`, `magazineUnsubscribeUrl`, `absoluteIssueUrl`), `src/server/magazines/issue-service.ts` (`afterIssuePublished` gains the inbox step), `src/server/magazines/issue-jobs.ts`, `src/app/api/cron/magazine-issues/route.ts` (passes `defaultMagazineMailer()`), `messages/{en,nl}.json`
- Test: `src/server/magazines/announcements.integration.test.ts`, `src/server/magazines/issue-access.test.ts`, `src/server/magazines/editorship.integration.test.ts` (unchanged, must pass), `src/server/magazines/notifications.test.ts`, `src/server/magazines/subscriptions/mail.test.ts`, `src/app/api/cron/magazine-issues/route.test.ts`

**Interfaces:**

- Consumes: `recordIssueAnnouncement` (Task 2); `publishDueIssues` (Task 3); `MagazineMailer`, `renderMagazineMail`, `purgeUnconfirmedSubscriptions` (Task 4); `signUnsubscribeToken`, `unsubscribeSecret`, `digestListUnsubscribeHeaders` (Task 5 / existing); `gatedMailRecipient` (Task 4); `resolveMagazineIssueAccess`, `issueAccessFacts`, `NO_STANDING`, `standingOf`; `issuePath`.
- Produces (`issue-access.ts`):
  ```ts
  export type IssueAudience = "nobody" | "members" | "everyone";
  /** Who may be told about a published issue (Decision 7). An exhaustive switch over the outsider's access
   *  (resolveMagazineIssueAccess with NO_STANDING): "full" → "everyone"; "none" → switch over the plain member's access
   *  (standingOf("member", null)): "full" → "members", "none" → "nobody"; "editor" (impossible for these standings) → "nobody".
   *  No `access === …` comparisons; each switch ends in `const _exhaustive: never = access`. Comment: slice 6 decides
   *  `teaser` here (teaser issues are meant to reach email subscribers). */
  export function issueAudience(
    community: (CommunityVisibility & { deleted: boolean }) | null,
    issue: IssueAccessInput["issue"],
  ): IssueAudience;
  ```
- Produces (`viewer-role.ts`): `export function activeMembershipCondition(): SQL` = `eq(communityMemberships.status, "active")`, documented as the SQL twin of `activeRoleOf`. `listMagazineEditorIds` replaces its inline `eq(communityMemberships.status, "active")` with it; the delivery query uses it for the `members` audience.
- Produces (`notifications.ts`):
  ```ts
  export type MagazineNotice; // the existing type, now exported
  // magazineNoticeTranslator(namespace: "magazineEditor" | "magazines"): existing callers pass "magazineEditor".
  /** Throws; for use inside the caller's transaction. insertMagazineNotices becomes try { insertMagazineNoticesIn(db, …) } catch → log. */
  export async function insertMagazineNoticesIn(writer: Pick<Deps["db"], "insert">, notices: readonly MagazineNotice[]): Promise<void>;
  export const MAGAZINE_ISSUE_PUBLISHED_NOTIFICATION = "magazine_issue_published";
  /** Text only (English, from magazines.notifications.issuePublished): one notice per user; path = issuePath(magazine, issue); extra { issueId, magazineId }. */
  export async function issuePublishedNotices(input: {
    userIds: readonly string[];
    magazine: { id: number; name: string; slug: string };
    issue: { id: number; number: number; title: string; slug: string };
    community: NoticeCommunity;
  }): Promise<MagazineNotice[]>;
  ```
  Copy (`magazines.notifications.issuePublished`, reader-facing): `title` "New in {magazine}: {title}", `content` "Issue {number} is out.", `linkLabel` "Read the issue".
- Produces (`mail.ts`):
  ```ts
  export function absoluteIssueUrl(
    locale: AppLocale,
    magazine: { slug: string },
    issue: { slug: string },
  ): string; // `${ORIGIN}/${locale}${issuePath(…)}`
  export function magazineUnsubscribeUrl(
    locale: AppLocale,
    token: string,
  ): string; // `${ORIGIN}/${locale}/unsubscribe?t=…`
  export async function issueMail(input: {
    locale: AppLocale;
    magazineName: string;
    communityName: string;
    issue: { number: number; title: string };
    issueUrl: string;
    unsubscribeUrl: string;
  }): Promise<MagazineMail>;
  ```
  Copy (`magazineMail.issue`): `subject` "{magazine}: {title}", `lead` "Issue {number} of {magazine}, from {community}, is out.", `action` "Read the issue", `why` "You get this email because you subscribed to {magazine}.", `unsubscribe` "Unsubscribe". Heading = the issue title.
- Produces (`announcements.ts`):
  ```ts
  export const INBOX_BATCH = 500;
  export const EMAIL_BATCH = 100;
  export const EMAIL_PACE_MS = 600;
  export const OPEN_ANNOUNCEMENTS_PER_RUN = 10;
  export const ANNOUNCEMENT_MAX_DAYS = 7;
  /** All inbox notices still owed for one issue, in batches of INBOX_BATCH. Each batch is ONE db transaction:
   *  select eligible account subscriptions (Decision 7: audience; confirmed_at <= published_at; no delivery row yet), ordered by id,
   *  INSERT the delivery claims (channel "inbox") ON CONFLICT DO NOTHING RETURNING subscription_id,
   *  then insertMagazineNoticesIn(tx, issuePublishedNotices(for the claimed users only)).
   *  Returns how many notices it wrote. Never throws (logs "[magazines] inbox announcement failed"). */
  export async function deliverInboxAnnouncement(
    deps: Deps,
    issueId: number,
  ): Promise<number>;
  export type DeliveryResult = {
    inbox: number;
    email: number;
    completed: number;
  };
  /** The cron step. First completes open announcements whose published_at is more than ANNOUNCEMENT_MAX_DAYS before now
   *  (log "[magazines] announcement given up" with issue id and left-over count; no addresses). Then picks up to
   *  OPEN_ANNOUNCEMENTS_PER_RUN open announcements ORDER BY last_attempted_at NULLS FIRST, created_at, and stamps
   *  last_attempted_at = now on each picked row (Decision 6: work rotates). For each: load the issue (en and nl titles,
   *  nl falling back to en), its magazine and community, and the audience; "nobody" → complete it. Else deliverInboxAnnouncement,
   *  then (audience "everyone" only, while the run's email budget EMAIL_BATCH lasts) each eligible email subscription:
   *  gatedMailRecipient(email, mailer.env) null → skip without a claim; claim (channel "email") → none returned → skip;
   *  send issueMail in the row's locale with a magazine unsubscribe token (unsubscribeSecret(); none configured → log and
   *  send no email this run) and digestListUnsubscribeHeaders(token); false → in ONE transaction delete the claim and
   *  set the announcement's completed_at = NULL (so a completion check that ran during the send cannot strand the
   *  subscriber); throws → keep the claim, log;
   *  sleep(EMAIL_PACE_MS) after each sent mail. Then complete the announcement (completed_at = now, only where still null)
   *  when no eligible inbox or email subscription without a delivery row is left. */
  export async function deliverPendingAnnouncements(
    deps: Deps,
    mailer: MagazineMailer,
    now: Date,
  ): Promise<DeliveryResult>;
  ```
- `issue-service.ts`: `afterIssuePublished` (Task 2) runs `deliverInboxAnnouncement(deps, published.id)` after the credit step, in its own `try` (Decision 11). `publishIssue` itself is unchanged; the cron path gets it through `publishIssue`.
- `issue-jobs.ts`: `IssueJobsResult = DueRunResult & DeliveryResult & { purged: number }`; `runMagazineIssueJobs(deps, opts: { now: Date; mailer: MagazineMailer })` runs `publishDueIssues` → `purgeUnconfirmedSubscriptions` → `deliverPendingAnnouncements`, each step in its own `try`/log so one failing step does not skip the next. The route passes `defaultMagazineMailer()`.

- [ ] **Step 1: Write the failing unit tests.**
  - `issue-access.test.ts`: `it("an issue's audience follows the resolver")` table: published public in a listed community → `everyone`; published public unconfirmed in an unlisted one → `members`; confirmed → `everyone`; published members → `members`; scheduled or draft → `nobody`; deleted or missing community → `nobody`.
  - `issue-access.test.ts`: the table above is typed `Record<MagazineIssueAccess, …>`-style so a new access level without a row fails to compile: add `const OUTSIDER_ACCESS_DECIDED: Record<MagazineIssueAccess, IssueAudience | "via-member"> = { none: "via-member", full: "everyone", editor: "nobody" };` and assert `issueAudience` agrees with it for one fixture per row.
  - `notifications.test.ts`: `it("writes one new-issue notice per user, linking to the issue")` (copy from `magazines.notifications.issuePublished`); `it("insertMagazineNoticesIn throws")` (a fake writer whose `insert` throws → the promise rejects); `it("the public notifiers still swallow a failed insert")` (`notifyRoleAssigned` with a throwing fake db resolves, as the existing test at `notifications.test.ts:45` does — keep that test and make sure it still passes through the new wrapper).
  - `mail.test.ts`: `it("an issue email links to the issue and to unsubscribe")` (both URLs in `html` and `text`; the Dutch subject for `nl`).
- [ ] **Step 2: Write `announcements.integration.test.ts`** (DB; fixture: listed community, owner, member M (account subscription), outsider O (account subscription), confirmed email subscriber X with `locale: "nl"`, waiting email subscriber W; fake mailer with production env; `DIGEST_UNSUBSCRIBE_SECRET` stubbed):
  - `it("a members-only issue reaches members only")`. Publish a members issue: M has one `magazine_issue_published` notice with `metadata.reviewPath` = the issue path; O and the owner (not subscribed) have none. `deliverPendingAnnouncements` → `email: 0`, the announcement is completed, a second run changes nothing.
  - `it("a public issue reaches every subscriber once")`. Publish public: M and O have one notice each right after `publishIssue` returns (inline). Run the cron step twice: X got exactly one email, in Dutch, with the `List-Unsubscribe` header and a link whose `t` verifies to `{ scope: "magazine", subscriptionId: X's id }`; W got nothing; the second run sends nothing and `completed_at` is set.
  - `it("two deliveries at once still tell each subscriber once")`. `Promise.all` of two `deliverInboxAnnouncement` calls (after deleting the inline notices and claims to reset) → one notice each; `Promise.all` of two `deliverPendingAnnouncements` → X got one email.
  - `it("late subscribers and leavers are not told")`. One clock: publish with `publishIssue(…, { now: P })`, read back the stored `published_at`, and create the late rows with `now = published_at + 1s` (never the wall clock). A new confirmed email subscriber and a new account subscriber get nothing for this issue; X removed (`removeSubscription`) before the cron run gets no email. The next published issue reaches only the current subscribers.
  - `it("someone who subscribed at the very moment of publishing is told")`. An account row with `confirmed_at == published_at` gets the notice.
  - `it("who is told matches the resolver")` (parity, Decision 7). For each fixture subscriber with an account (owner-not-subscribed excluded; M member, O outsider, plus a pending member P), and for three issues — public in a listed community, members-only, and public-but-unconfirmed in an unlisted community — the delivery query's eligibility for that issue equals `resolveMagazineIssueAccess({ viewer: await loadMagazineEditorship(db, { communityId, magazineId }, userId), community, issue }) !== "none"`. Email subscribers are eligible exactly when `issueAudience` is `"everyone"`, which equals the anonymous resolver answer being `"full"`.
  - `it("a refused send is tried again next run; a send that throws is not")`. `send` returns `false` once → no claim, next run sends; `send` throws → claim kept, no second attempt.
  - `it("outside production only the test address is mailed and the issue stays open")`. Non-production env: X is skipped without a claim, `completed_at` stays null.
  - `it("announcements that never finish do not block newer ones")`. Non-production env, eleven published public issues with X subscribed (all stay open). Run once: ten announcements get `last_attempted_at`; run again: the eleventh is picked (its inbox notices for M are written) — no open announcement waits more than two runs.
  - `it("old open announcements are given up after a week")`. An open announcement with `published_at = now - 8 days` → `completed_at` set, nothing sent for it.
  - `it("a refused send reopens a completed announcement")`. Simulate the race: the fake mailer's `send` first sets the announcement's `completed_at` with SQL (as a parallel run's completion check would while the mail is in flight), then returns `false` → the claim is gone and `completed_at` is NULL again; the next run mails X.
  - `it("a public issue switched to members before the email run emails nobody")`. Publish public, change visibility to `members` (`updateIssueDetails`), run → no email; completed.
  - `it("a scheduled issue tells subscribers through the same path")`. Schedule, `runMagazineIssueJobs` at the due time → M has the notice, X has the email, the result counts `published: 1, email: 1`.
- [ ] **Step 3: Update `route.test.ts`**: the jobs are called with a mailer (`expect.objectContaining({ mailer: expect.anything() })`) and the response never contains `@`.
- [ ] **Step 4: Run them** → FAIL.
- [ ] **Step 5: Implement**, plus the en + nl copy. Load issue facts through `issueAccessFacts` (an unknown stored value → `nobody`). The eligible-recipient query is written once per channel and used by delivery, by the completion check and by the parity test, so they cannot disagree; its `members` branch uses `activeMembershipCondition()`. `listMagazineEditorIds` switches to `activeMembershipCondition()` in the same commit.
- [ ] **Step 6: Run** `<DB prefix> pnpm vitest run src/server/magazines src/server/api/routers/magazines.integration.test.ts`, `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines src/app/api/cron src/i18n` and `pnpm typecheck` → PASS.
- [ ] **Step 7: Commit**: `feat(magazines): subscribers hear about each new issue once`.

---

## Task 7: The Subscribe button on the shelf, the issue page and the Magazine tab

**Files:**

- Create: `src/components/magazines/reading/subscribe-button.tsx`
- Modify: `src/components/magazines/reading/issue-rail.tsx`, `src/components/magazines/reading/magazine-shelf.tsx`, `src/components/magazines/community/magazine-tab.tsx`, `src/components/magazines/test-fixtures.ts` (if a fixture needs the slug), `messages/{en,nl}.json`
- Test: `src/components/magazines/reading/subscribe-button.test.tsx`, `src/components/magazines/reading/issue-reader.test.tsx`, `src/components/magazines/reading/magazine-shelf.test.tsx`, `src/components/magazines/community/magazine-tab.test.tsx`

**Interfaces:**

- Consumes: `api.magazineSubscriptions.{status,subscribe,unsubscribe,subscribeByEmail}` (Task 4); `MagazineSummary.slug`; `usePathname` and `Link` from `@/i18n/navigation`; `useLocale`.
- Produces:
  ```ts
  /** "use client". Never orange (One Voice). */
  export function SubscribeButton(props: {
    magazineSlug: string;
    magazineName: string;
    className?: string;
  }): JSX.Element;
  ```
- Behaviour:
  - Loading `status` → a `Skeleton` the size of the button. `status` error → nothing (reading must not break).
  - Signed in, not subscribed: `ink` "Subscribe" → `subscribe({ magazineSlug, locale })`. Under it, muted: `inboxHelp`.
  - Signed in, subscribed: `outline` "Subscribed" with a check icon, and a `ghost` "Unsubscribe" → `unsubscribe`. After each change: `status` invalidated and `role="status"` announces `subscribedNow` / `unsubscribedNow`.
  - Signed out: `ink` "Subscribe" is a disclosure (`aria-expanded`, `aria-controls`) that opens a small form: labelled email input (type `email`, `autoComplete="email"`, focus moves into it, `aria-describedby` = the `emailHelp` id plus the error id while an error shows, `aria-invalid="true"` while it shows; ids from `useId()`), button "Send me a link", help `emailHelp`, and a link `signInInstead` to `/auth/signin?redirect=/${locale}${pathname}`. On success the form is replaced by `role="status"` `emailSent`. `TOO_MANY_REQUESTS` → `role="alert"` `tooMany`; other errors → `failed`. The button is disabled while the request runs.
- Placement:
  - `IssueRail`: inside the first section, after the description and before "Visit {community}" (which becomes `outline`, so the rail has one ink action). Update the stale "subscribing comes with slice 2" comment.
  - `MagazineShelf` (`MagazineIdentity`): in the action row beside the topics, before the editors' "Manage" button.
  - `MagazineTab` header: beside the existing `outline` button, for every viewer with a magazine (editors included).
- Copy (`magazines.subscribe`): `subscribe` "Subscribe", `subscribed` "Subscribed", `unsubscribe` "Unsubscribe", `inboxHelp` "Get a message in your inbox when there is a new issue.", `subscribedNow` "You are subscribed to {magazine}.", `unsubscribedNow` "You are no longer subscribed to {magazine}.", `emailLabel` "Your email address", `emailSubmit` "Send me a link", `emailHelp` "We send one email to check it is you. You can stop any time.", `emailSent` "Check your email and click the link in it to start getting new issues.", `signInInstead` "Have an account? Sign in to get new issues in your inbox.", `tooMany` "Too many tries. Wait a while, then try again.", `failed` "That did not work. Try again."

- [ ] **Step 1: Write `subscribe-button.test.tsx`** (mock `@/trpc/react` `api.magazineSubscriptions.*` hooks; assert the **call arguments**):
  - `it("a signed-in reader subscribes and the change is announced")`. Call `{ magazineSlug: "m", locale: "en" }`; then "Subscribed" and the status text.
  - `it("a subscribed reader can unsubscribe")`.
  - `it("a signed-out reader asks for a link by email")`. "Subscribe" has `aria-expanded="false"`; click → `"true"`, the email field (by label "Your email address") has focus; submit → call `{ magazineSlug: "m", email: "ann@example.com", locale: "en" }`; then the `emailSent` status.
  - `it("explains when there were too many tries")` (`data.code = "TOO_MANY_REQUESTS"` → `tooMany` alert; the email field's `aria-describedby` now names both the help and the alert ids and `aria-invalid="true"`).
  - `it("ties the help text to the email field")` (before any error: `aria-describedby` points at the element holding `emailHelp`; no `aria-invalid`).
  - `it("offers sign-in that comes back to this page")` (href contains `redirect=/en/magazines/m`).
  - `it("is never the orange button")` (every rendered button has a `data-variant` attribute other than `default`: `Button` writes `data-variant={variant}`, and an unset variant is the orange default).
  - `it("shows a placeholder while loading and nothing on error")`.
- [ ] **Step 2: Extend the placement tests** (mock `SubscribeButton` to a marker): `issue-reader.test.tsx` `it("offers to subscribe in the rail")`; `magazine-shelf.test.tsx` `it("offers to subscribe beside the topics")`; `magazine-tab.test.tsx` `it("offers to subscribe on the Magazine tab")` (and none when the community has no magazine).
- [ ] **Step 3: Run them** → FAIL.
- [ ] **Step 4: Implement**, plus the en + nl copy.
- [ ] **Step 5: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines "src/app/[locale]/magazines" "src/app/[locale]/communities/[slug]/magazine" src/i18n` and `pnpm typecheck` → PASS.
- [ ] **Step 6: Commit**: `feat(magazines): subscribe button on magazine and issue pages`.

---

## Task 8: Scheduling in the issue builder; schedule and subscribers on the editor desk

**Files:**

- Create: `src/components/magazines/editor/subscriber-count-line.tsx`
- Modify: `src/lib/magazines/schedule.ts` (`browserTimeZone`), `src/components/magazines/editor/builder/publish-dialog.tsx`, `src/components/magazines/editor/builder/builder-top-bar.tsx`, `src/components/magazines/editor/builder/issue-builder.tsx`, `src/components/magazines/editor/editor-desk.tsx`, `src/components/magazines/editor/contributor-desk.tsx`, `src/components/magazines/reading/issue-reader.tsx` (`EditorBar`), `messages/{en,nl}.json`
- Test: `src/components/magazines/editor/builder/publish-dialog.test.tsx`, `src/components/magazines/editor/builder/issue-builder.test.tsx`, `src/components/magazines/editor/editor-desk.test.tsx`, `src/components/magazines/editor/contributor-desk.test.tsx`, `src/components/magazines/reading/issue-reader.test.tsx`

**Interfaces:**

- Consumes: `api.magazines.scheduleIssue`, `api.magazines.unscheduleIssue` (Task 2); `api.magazines.subscriberCounts` (Task 4); `localDateTimeToIso`, `isoToLocalDateTime`, `scheduleProblem`, `canIssue`, `IssueStatus` (Task 1); `IssueListRow.scheduledFor` (Task 2); the builder's `writer.run(expectedUpdatedAt => …)` and conflict handling used by `publish` today.
- Produces (`PublishDialogProps` additions):
  ```ts
  /** The issue's current schedule (ISO), or null. */
  scheduledFor: string | null;
  /** Schedules (or moves) the issue; resolves when stored, rejects after the builder set `error`. */
  onSchedule: (publishAt: string) => Promise<void>;
  /** Stops the schedule; same contract. */
  onUnschedule: () => Promise<void>;
  ```
  Phases become `"review" | "working" | "published" | "scheduled" | "unscheduled"`.
- Dialog layout (review phase): the audience line and blockers as today; then a `<fieldset>` with `<legend>` "When should it go out?" and two radios, "Now" and "Later, at a time I choose" (initially "Later" when `scheduledFor` is set, else "Now"). "Later" shows a labelled `<input type="datetime-local">` ("Date and time", prefilled with `isoToLocalDateTime(scheduledFor)` when set), help "Your time zone: {zone}. It goes out within a few minutes of this time." (`Intl.DateTimeFormat().resolvedOptions().timeZone`), and an inline `role="alert"` when `scheduleProblem` refuses the value (`scheduleInPast` / `scheduleTooFar` copy from `magazineEditor.errors`) or the value does not parse. The confirm button (the dialog's one orange) reads "Publish" or "Schedule it". When `scheduledFor` is set, a line "Scheduled for {time}." and a `ghost` "Cancel the schedule" button (→ `onUnschedule`). Success phases: `scheduled` → title "Your issue is scheduled", lead "It goes out on {time}. You can still change it until then.", button "Keep editing" (focused); `unscheduled` → "The schedule is cancelled", "The issue is a draft again."; `published` as today.
- `BuilderTopBar`: prop `scheduledFor: string | null`; when set, a muted line "Goes out {time}" (time in mono) beside the save status; the kicker's status reads "Scheduled". The Publish button stays and opens the dialog. Its "published" branch (`builder-top-bar.tsx:79`, today `status === "published"`) becomes `!canIssue(status, "publish")`; `issue-builder.tsx:266` (`const published = issue.status === "published"`) likewise reads `canIssue` for what it gates (Decision 8).
- `EditorBar` (`issue-reader.tsx`): prop `status: IssueStatus` instead of `draft: boolean`; its note comes from `const NOTICE: Record<IssueStatus, "draftNotice" | "scheduledNotice" | null> = { draft: "draftNotice", scheduled: "scheduledNotice", published: null }`. `IssueReader` passes `status={issue.status}`. Copy `magazines.issue.scheduledNotice` "Scheduled. Readers cannot see it yet." (no time here: the reading data has none).
- `IssueBuilder`: `schedule(publishAt)` and `unschedule()` mirror `publish` (flush autosave first, `writer.run`, `setIssue(out)`, the same conflict and `readEditorError` handling).
- `EditorDesk`: an `IssueRow` with `status === "scheduled"` shows the "Scheduled" badge (badge variant from a `Record<IssueStatus, "secondary" | "outline">`) and, in mono, "Goes out {time}" from `scheduledFor`. At the top of the desk, `<SubscriberCountLine slug />`.
- `SubscriberCountLine({ slug })` (`"use client"`): reads `api.magazines.subscriberCounts`; "{count} subscribers" (plural; mono number) and, muted, "{withAccount} with an account · {byEmail} by email · {waiting} waiting to confirm" (parts with 0 left out; nothing while loading or on error; nothing for `null`). Used by `EditorDesk` and `ContributorDesk` (Decision 14).
- **Time zone.** Every schedule time is typed and shown in the browser's zone. One helper (client-safe, in `src/lib/magazines/schedule.ts`): `export function browserTimeZone(): string` (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Every display ("Scheduled for {time}", "It goes out on {time}", "Goes out {time}" in the top bar and on the desk) uses `useFormatter().dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone: browserTimeZone() })` — never the provider's default zone, which is the server's (UTC on Vercel; `NextIntlClientProvider` in `src/app/[locale]/layout.tsx` gets no `timeZone`). The help text names the same `browserTimeZone()`.
- The `datetime-local` input carries `aria-describedby` = the `timeHelp` id plus the inline alert's id while it shows, and `aria-invalid="true"` while it shows (ids from `useId()`).
- Copy (`magazineEditor.builder.publishDialog`): `when` "When should it go out?", `now` "Now", `later` "Later, at a time I choose", `timeLabel` "Date and time", `timeHelp`, `timeInvalid` "Enter a date and a time.", `scheduleConfirm` "Schedule it", `scheduling` "Scheduling…", `currentSchedule` "Scheduled for {time}.", `unschedule` "Cancel the schedule", `scheduledTitle`, `scheduledLead`, `unscheduledTitle`, `unscheduledLead`. (`magazineEditor.builder`): `goesOut` "Goes out {time}". (`magazineEditor.desk`): `goesOut` "Goes out {time}", `subscribers` "{count, plural, =0 {No subscribers yet} one {# subscriber} other {# subscribers}}", `subscribersWithAccount` "{count} with an account", `subscribersByEmail` "{count} by email", `subscribersWaiting` "{count} waiting to confirm".

- [ ] **Step 1: Write the failing tests.**
  - `publish-dialog.test.tsx`: `it("schedules for the chosen time")` (choose "Later", type `2030-01-02T09:30`, click "Schedule it" → `onSchedule` called with `localDateTimeToIso("2030-01-02T09:30")`; then the scheduled phase and "Keep editing" has focus). `it("refuses a past time before calling the server")` (alert text, no call). `it("publishes now as before")`. `it("a scheduled issue starts on Later with its time and can cancel the schedule")` (input value prefilled; "Cancel the schedule" → `onUnschedule`; the unscheduled phase). `it("labels the choice and the time")` (`getByRole("group", { name: "When should it go out?" })`, the radios, `getByLabelText("Date and time")`). `it("the confirm button is the only orange one")` (exactly one button whose `data-variant` is missing or `default`). `it("shows the time the editor typed, in their own zone")` (set `process.env.TZ = "America/Los_Angeles"` in the test and restore it after, the precedent in `src/components/events-map-popup.test.tsx:41-47`; render inside `NextIntlClientProvider` with `timeZone="UTC"` to mimic the server; schedule `2030-01-02T09:30` → the scheduled phase's time reads `9:30`, never `5:30 PM`/`17:30`). `it("ties the help and the error to the time field")` (`aria-describedby` names the help id; after a past time also the alert id, and `aria-invalid="true"`).
  - `issue-builder.test.tsx`: `it("schedules with the builder's version and shows the time in the top bar")` (mock `scheduleIssue.useMutation`; the call holds `{ slug, issueId, expectedUpdatedAt, publishAt }`; after it resolves the top bar reads "Goes out …"). `it("a schedule conflict shows the reload banner")` (`ISSUE_CHANGED`).
  - `issue-reader.test.tsx`: `it("tells an editor a scheduled issue is not public yet")` (`status: "scheduled"` with editor access → `scheduledNotice`; `draft` → `draftNotice`; `published` → neither).
  - `contributor-desk.test.tsx`: `it("shows contributors how many people subscribe")` (mock `SubscriberCountLine` to a marker; it renders with the slug).
  - `editor-desk.test.tsx`: `it("a scheduled issue says when it goes out")`; `it("shows how many people subscribe")` (`{ withAccount: 3, byEmail: 2, waiting: 1 }` → "6 subscribers", "3 with an account · 2 by email · 1 waiting to confirm"; `{0,0,0}` → "No subscribers yet" and no detail line).
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement**, plus the en + nl copy.
- [ ] **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines "src/app/[locale]/communities/[slug]/magazine" src/i18n` and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit**: `feat(magazines): schedule an issue from the builder; subscriber counts on the desk`.

---

## Task 9: Slice guarantees, visual check and docs

**Files:**

- Create: `src/server/magazines/subscriptions.integration.test.ts`
- Modify: `DESIGN.md`, `docs/adr/0046-magazine-issues-are-announced-through-an-outbox-once-per-subscriber.md` (Consequences), `docs/adr/0042-magazine-issues-are-read-through-one-access-resolver.md` (one "Used by ADR-0046: `issueAudience`" line), `CONTEXT.md` (only if a term changed during the build)

**Interfaces:**

- Consumes: everything above, through `createCaller`, the route handlers and `runMagazineIssueJobs` only (the slice end to end). `sendGatedEmail` is mocked with `vi.mock("@/server/email")`; the cron step gets a fake mailer.

- [ ] **Step 1: Write the end-to-end guarantee test** `subscriptions.integration.test.ts` (DB). `it("from subscribe to a scheduled issue in every inbox and mailbox, once")`, in one test, in order:
  1. Member M calls `magazineSubscriptions.subscribe`. An anonymous caller calls `subscribeByEmail` for X. The mocked `sendGatedEmail` received one mail to X; read the `t` from its confirm URL.
  2. POST the confirm route with `t`: 303. `readConfirmLink` → `subscribed`.
  3. The owner creates an issue with one item, sets visibility `public`, and calls `scheduleIssue` for `now + 1h`. M has no notice yet; readers cannot open the issue (`loadIssuePage` for an outsider → null).
  4. `runMagazineIssueJobs` at `now + 2h`: `published: 1`, M has one notice, X got one email whose unsubscribe link verifies to X's subscription.
  5. `runMagazineIssueJobs` again: nothing new anywhere.
  6. POST `/api/email/unsubscribe` with X's token and `List-Unsubscribe=One-Click`: 200, X's row is gone.
  7. The owner publishes a second public issue with the button: M has a second notice at once; the next cron run sends no email.
  8. The owner's `subscriberCounts` → `{ withAccount: 1, byEmail: 0, waiting: 0 }`; an appointed contributor gets the same (Decision 14); an outsider gets FORBIDDEN.
- [ ] **Step 2: Run the whole slice's suites:** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib src/server/magazines src/server/notifications src/server/email-storyline-announce.test.ts src/components/magazines src/components/notifications src/app/api "src/app/[locale]/magazines" "src/app/[locale]/magazine-subscriptions" "src/app/[locale]/unsubscribe" "src/app/[locale]/communities" src/collections src/i18n`, then `<DB prefix> pnpm vitest run src/migrations src/server/magazines src/server/news src/server/api/routers`, then `pnpm typecheck`, `pnpm lint` and `pnpm format:check` → all PASS, no DB suite skipped.
- [ ] **Step 3: Production build from the export** (Global Constraints, "Running the app", with `pnpm exec next build` in place of `next dev`) → succeeds.
- [ ] **Step 4: Visual check** on the running export (port 3100, test DB with a seeded listed community, a magazine and one public issue). Check each item at 390px and 1440px, light and dark. Write findings in the PR description, not in a file.
  - Shelf and issue page, signed out: Subscribe opens the email form in place; focus lands in the field; the sent message reads well; no orange besides the page's own accent; no horizontal scroll.
  - Shelf and issue page, signed in: Subscribe → Subscribed + Unsubscribe; the rail keeps one ink action.
  - Magazine tab: the button sits beside the header link; the tab's orange is still only "Read the issue".
  - Confirm page (copy a link from the mocked mail or build one from a test row): ready, done, expired and invalid states; the button is reachable by keyboard.
  - `/en/unsubscribe?t=<magazine token>`: magazine wording, no settings link.
  - Builder: Publish dialog with Now / Later, the time zone hint, a past time refused inline, scheduled success, the top bar "Goes out …", cancel the schedule.
  - Editor desk: the scheduled badge and time; the subscribers line. Contributor desk: the subscribers line.
  - Issue reading view as an editor, for a scheduled issue: the "Scheduled. Readers cannot see it yet." note.
  - The notification panel shows "New in …" and "… did not go out" notices with working links.
- [ ] **Step 5: Docs.** In `DESIGN.md`, add the confirm page to the routes named for reading pages and say the Subscribe button is never the accent. In ADR-0046 Consequences, add what shipped (the routes, the cron entry) and the risks below. Grep `CONTEXT.md` and `docs/adr/0042-*.md` for "draft/published" claims about issue status that are now incomplete and fix them (plans are history; leave them).
- [ ] **Step 6: Note for the PR description** (Greg runs production actions): no backfill is needed; the new cron starts on deploy; `DIGEST_UNSUBSCRIBE_SECRET` (or `BETTER_AUTH_SECRET`) must be set in production, as it already is for digests.
- [ ] **Step 7: Commit**: `test(magazines): subscription and scheduling slice guarantees; docs`.

---

## Risks and open points (for the PR description)

- **Email speed.** One run sends at most 100 emails (Resend pacing), so a magazine with 2,000 email subscribers needs about 100 minutes to reach everyone. Raising `EMAIL_BATCH` or adding a second run is a one-line change once real numbers show it is needed.
- **Publishing from Payload admin** (staff flipping `status`) bypasses the site's publish path: no announcement, no credit. This was already true for credit; staff should publish in the site.
- **A scheduled issue goes out up to five minutes late** (cron cadence). The UI says "within a few minutes".
- **Changing visibility after publishing** narrows who is told from that moment, but never widens it after the announcement completed: a members-only issue later made public does not email the email subscribers. Please check.
- **Members of a community who subscribe with an account but also receive the weekly digest** may hear of an issue twice (inbox + digest). The digest does not include magazine issues today; if it ever does, it should skip subscribed issues.
- **Email-only subscribers get only public issues.** A magazine with no published public issue accepts no email subscription: the form answers "check your email" as always (it never reveals anything) but no mail is sent (Decision 2, anti-spam). The form is still shown there. Please check whether it should be hidden instead (that would need `status` to say whether email is possible, which reveals a little about the magazine).
- **Signed-in non-members are told in the inbox, not by email.** Spec Goal 8 says "members in the inbox; non-members by email"; this plan follows spec Flow 6 ("signed-in → inbox"). Recorded in ADR-0046. Please check.
- **Subscriber counts are visible to every staff role, contributors included** (the slice brief: "visible to magazine staff"). They are counts only, no names or addresses.
- **A scheduled issue that keeps failing for an unknown reason** is retried for an hour, then returned to draft and the editors are told (`reason: "error"`).
- **A busy magazine can send at most 50 confirmation mails a day.** Above that, new email subscribers get the same answer but no mail until the next day. Raise `CONFIRM_MAILS_PER_MAGAZINE_PER_DAY` if real traffic needs it.
- **An address that used up its three confirmation mails** cannot ask again for that magazine until the waiting row is purged (30 days). Rare, and it protects strangers' inboxes.
- **The per-IP limit is per server instance** (in-memory, like the existing event import limit). The DB limits per address are the real guard against mailing a stranger.
- **Notices are stored in English**, like every other notification type.

## Self-review notes

- Spec coverage: Subscribe on magazine and issue pages (Task 7, plus the Magazine tab); signed-in subscribers → inbox per new issue via the existing `notification` table (Tasks 6, 2); email-only double opt-in with confirmation email and unsubscribe link (Tasks 4, 5, 6); email per issue via Resend (Tasks 4, 6); unsubscribe links (Task 5, existing page reused as the spec's table asks); editors schedule an issue (Tasks 1, 2, 8) published by the existing cron setup through the same publish path, idempotent (Task 3); notified exactly once (Decision 6, Task 6); subscriber counts for magazine staff, contributors included (`write`; Tasks 4, 8; Decision 14).
- Type names used across tasks, each defined in one Interfaces block: `ScheduleProblem`, `scheduleProblem`, `localDateTimeToIso`, `isoToLocalDateTime`, `ISSUE_ACTIONS`, `IssueAction`, `ISSUE_TRANSITIONS`, `canIssue`, `PUBLISH_ORIGINS`, `PublishOrigin`, `CONFIRM_MAILS_PER_MAGAZINE_PER_DAY` (T1); `recordIssueAnnouncement`, `scheduleIssue`, `unscheduleIssue`, `assertPublishable` and `afterIssuePublished` (private) (T2); `ScheduleFailure`, `notifyScheduleFailed`, `publishDueIssues`, `DueRunResult`, `SCHEDULE_RETRY_LIMIT_MINUTES`, `magazineErrorCodeOf`, `ITEM_PROBLEM_CODES`, `isItemProblemCode`, `runMagazineIssueJobs`, `IssueJobsResult` (T3, widened in T6); `mayKnowMagazine`, `readableIssueExists`, `findMagazineForViewer`, `findMagazineBySlug`, `MagazineCommunityRow`, `clientIpFromHeaders`, `gatedMailRecipient`, `MailEnv`, `MAIL_TEST_RECIPIENT`, `sendGatedEmail`, `MagazineMail`, `OutgoingMagazineMail`, `MagazineMailer`, `defaultMagazineMailer`, `renderMagazineMail`, `confirmationMail`, `magazineConfirmUrl`, `SubscriberCounts`, `ConfirmLink`, `ConfirmLinkStatus`, `subscribeAccount`, `unsubscribeAccount`, `isAccountSubscribed`, `subscribeByEmail`, `readConfirmLink`, `confirmEmailSubscription`, `removeSubscription`, `countSubscribers`, `purgeUnconfirmedSubscriptions`, `MAGAZINE_SUBSCRIPTION_CONFIRM_PATH` (T4); `MAGAZINE_UNSUBSCRIBE_SCOPE`, `UnsubscribePayload` (T5); `IssueAudience`, `issueAudience`, `activeMembershipCondition`, `ANNOUNCEMENT_MAX_DAYS`, `insertMagazineNoticesIn`, `issuePublishedNotices`, `issueMail`, `absoluteIssueUrl`, `magazineUnsubscribeUrl`, `deliverInboxAnnouncement`, `deliverPendingAnnouncements`, `DeliveryResult` (T6); `SubscribeButton` (T7); `SubscriberCountLine`, `browserTimeZone` (T8).
- Review Focus lines each have their test in the owning task (Tasks 3, 4, 5, 6).

## Preflight rulings

Every preflight finding was checked against the code and fixed in the plan above, except where a ruling below says otherwise.

- Ruling: an email send that returns `false` releases its claim **and reopens the announcement** (`completed_at = NULL`, same transaction) instead of taking `FOR UPDATE` / an advisory lock around release and completion — a lock around those two steps does not cover the window while the mail is in flight (run B can complete while run A is still sending), reopening does — cost if wrong: one extra pass over an announcement that was already done, which finds nothing and completes again.
- Ruling: the inline client-IP reads in `src/app/api/auth/[...all]/route.ts` and `src/app/api/mcp/route.ts` stay as they are; only `getClientIp` becomes a wrapper of the new `clientIpFromHeaders` — those are auth and agent-registration paths outside this slice, and their `??` chain treats an empty `x-forwarded-for` differently from `getClientIp`, so moving them is a behaviour change that deserves its own review — cost if wrong: two copies of the IP rule stay until a follow-up on the slice ticket moves them.
- Ruling: the "give up after repeated unknown errors" rule for scheduled issues is time-based (`now - scheduledFor > SCHEDULE_RETRY_LIMIT_MINUTES = 60`), not an attempts column — no extra schema, and the editor-facing promise is about time ("within a few minutes") — cost if wrong: after a cron outage longer than an hour, an issue whose first real attempt hits a passing error goes back to draft at once (editors are told and can publish by hand).
- Ruling: subscriber counts open to the `write` capability (every staff role) rather than narrowing to `edit` — the slice brief says "visible to magazine staff" and contributors are staff (ADR-0045); counts carry no personal data — cost if wrong: one capability string and one `SubscriberCountLine` use on the contributor desk to remove.
- Ruling: `publishedVia` is added now (Payload select, `button` | `schedule`) — slice 5's auto-publish must be "recorded as published automatically" through the same publish path, and the column is cheap to add in this slice's migration — cost if wrong: one unused nullable column and a types hunk.
