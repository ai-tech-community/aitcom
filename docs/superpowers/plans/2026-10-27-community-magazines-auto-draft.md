# Community Magazines — Auto-draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A magazine can make its own draft issues. Editors switch it on per magazine, pick how often (monthly, every two weeks, weekly, after each community event, or only when asked), how far back to look, which kinds of content to pick and how many, the layout and visibility of the drafts, and what happens when a draft is ready (tell the editors, or publish it after N days unless someone stops it). Every picked item carries a short reason that only editors see. Editors review and change the draft in the normal issue builder; any change by a person stops the automatic publish. A history shows what happened and who did it.

**Architecture:** Each suggestion **source** gets a **suggester** in its kind's folder (`items/<kind>/suggest.ts`) next to the picker source, registered in one exhaustive `ITEM_SUGGESTERS` record keyed by source id; the client-safe per-source facts live in one `AUTO_DRAFT_SOURCES` record (Decision 1; supersedes ADR-0043 Decision 4). The **auto-drafter** (`src/server/magazines/auto-draft/drafter.ts`) only orchestrates: it claims one run per (magazine, period) in `app.magazine_auto_draft_run`, asks each enabled suggester for ranked candidates, applies counts, never-reuse and validation, and then calls the existing issue service (`createIssue`, `setIssueItems`, and for auto-publish `scheduleIssue` with `via: "auto"`). Auto-publish is an ordinary scheduled issue whose `scheduledVia` is `"auto"`; the existing scheduled run (`publishDueIssues`, ADR-0046) publishes it through `publishIssue` with origin `"auto"`. The issue service stops an automatic schedule when a person edits the issue, and writes `app.magazine_issue_history`. Reasons live in `app.magazine_auto_pick`, which no reader path reads. Settings live in `app.magazine_auto_draft_settings`. The existing `/api/cron/magazine-issues` route gains one step. Decisions are recorded in ADR-0047.

**Tech Stack:** Next.js App Router (RSC pages), tRPC, Payload CMS 3.77 (MagazineIssues, Local API), Drizzle (`app` schema), next-intl (en + nl), shadcn/ui primitives, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-26-community-magazines-design.md`. Read "Goals 11", "Auto-draft" (all of it), "Layout 4 and 5", "Delivery slices → 5" and "Claude's calls" (last line). Read first: ADR-0042, ADR-0043, ADR-0045, ADR-0046, and the earlier slice plans `docs/superpowers/plans/2026-10-26-community-magazines-core.md`, `…-platform-content.md`, `2026-10-27-community-magazines-contributors.md`, `2026-10-27-community-magazines-subscriptions.md`, and the two rulings files that exist (`2026-10-26-community-magazines-core-rulings.md`, `2026-10-26-community-magazines-platform-content-rulings.md`; the contributors and subscriptions plans have no separate rulings file). Those rulings still hold unless this plan says otherwise.

## Decisions this plan makes (spec gaps)

1. **Suggestions come from named sources; each source belongs to one kind; one exhaustive registry on each side.** A **source** is "where suggestions come from" (`AutoDraftSourceId`); a **kind** is what the item is. Today there are seven sources: `article`, `storyline`, `event`, `forumThread`, `launchpadProject`, `newsItem` (each of the same-named kind) and `welcome` (kind `editorial`, the new-member welcome). A second editorial source later (for example challenge results) is a new source id, never a fake kind, and stored settings keep their keys.
   - **Client-safe facts, one record** (`src/lib/magazines/auto-draft.ts`): `AUTO_DRAFT_SOURCES: { [S in AutoDraftSourceId]: { kind: ItemKindId; defaults: AutoDraftSource; maxLimit: number; needsTopics: boolean; countsTowardMinimum: boolean } }`. `AUTO_DRAFT_SOURCE_DEFAULTS`, `sourceMaxLimit`, the form's "Up to" and "needs topics" rows and the drafter's minimum count are all derived from it. A type-level check (`type _EveryKindHasASource = Exclude<ItemKindId, (typeof AUTO_DRAFT_SOURCES)[AutoDraftSourceId]["kind"]>` asserted `never`) makes a new kind without a source a compile error.
   - **Server strategies** (`src/server/magazines/items/types.ts` gains `ItemSuggestionSource<Input>` with only `suggest(ctx, window, config)`). Each kind folder gets `suggest.ts` exporting its source(s); `src/server/magazines/items/suggesters.ts` holds `ITEM_SUGGESTERS: { [S in AutoDraftSourceId]: ItemSuggestionSource<InputOf<SourceKind<S>>> }` (exhaustive like `ITEM_KINDS`). `suggestCandidates(source, …)` attaches the content reference through the kind strategy (shared helper `referenceOfInput` pulled out of `searchPickerCandidates`). `registry.ts` also exports `referencesOfBlocks(blocks: StoredBlock[]): string[]` (the private `referenceOfBlock` over every block, nulls dropped; `validateIssueItems` reuses it), so the drafter never dispatches on kinds itself.
   - **Suggest context, built once.** `SuggestContext = PickerContext & { community: ItemCommunity & { name: string }; topics: readonly string[]; now: Date }` (`viewerId` = the acting person). One factory `suggestContextFor(deps, { magazine, community, viewerId, locale, now })` in `items/context.ts`, next to `itemContextFor`; topics come from `normalizeTopics(magazineTopicsOf(magazine))`, where `magazineTopicsOf` is the private `topicsOf` of `reading.ts` moved to `magazine-service.ts` and exported (`reading.ts` imports it). The router (Task 5) and the drafter (Task 6) both call the factory.
   - **This supersedes ADR-0043 Decision 4** ("slice 5 adds `suggest` to the interface"), and deviates from the spec line "suggest on each item kind module": the suggesters live in each kind's folder, but in a parallel registry. Rejected: adding `suggest` to `IssueItemKind` (the strategy is client-reachable through `toStored`/`input` and already carries load/validate; search and suggest are editor-side data sources, which is why pickers already live apart; and a kind can have more than one source), keying settings by kind (a second editorial source would need a fake kind or a data migration of stored settings), and one big ranking function in the auto-drafter (spec: "no kind-specific logic in the auto-drafter").
2. **Ranking is deterministic, from our own data, ties broken by id.** Per source:
   - `article`: approved, not placed, of this magazine; **waiting longest first** (`updatedAt` ascending, then id). Reason `waitingSince`. No look-back window (they are a backlog). The query is a new `listApprovedArticlesOldestFirst(payload, magazineId, viewerId, exclude, limit)` in `magazine-articles.ts` (same `where` as `listAvailableArticles`, `sort: "updatedAt"`, same `AvailableMagazineArticle` rows with `editableByViewer`), so `openHref` is the picker's (`magazineArticleEditPath` when `editableByViewer`). The spec says "most-read first", but these articles are not published yet, so nobody has read them; waiting time is the fair, deterministic order. (Risk line for Greg.)
   - `storyline`: public storylines (`publicStoryline`) whose English or Dutch title or overview contains one of the magazine's topics (case-insensitive), with `latestAt >= window.since`; order `latestAt desc`, vote score desc, slug. Reason `topic` (the first magazine topic that matches, in the magazine's topic order).
   - `newsItem` ("news headline digest"): news items with `publishedAt` in the window whose title or summary contains a topic; order `publishedAt desc`, id. Reason `topic`. A magazine without topics gets no news and no storylines (the skip notice says so through `too_few`; the settings screen says "Add topics to your magazine to get AIT News").
   - `event`: this community's events (`communityContentWhere`) whose `status` is in `DRAFTABLE_EVENT_STATUSES = ["published", "completed"]` (exported from `items/event/suggest.ts`; not `PUBLICLY_LISTED_EVENT_STATUSES`, which includes `cancelled`). Queried with `draft: false` and filtered on `status`, exactly like `items/event/picker.ts` (live events keep `_status` "draft"). Event `date` and `endDate` are calendar days stored at midnight UTC (times live in the free-text `startTime`/`endTime`), so day rules use whole UTC days: `startOfToday = now` truncated to 00:00 UTC; an event **has ended** once `now >= (endDate ?? date) + 1 day` (the start of the day after its last day); it is **coming up** when `date >= startOfToday` and `date < startOfToday + EVENT_COMING_UP_DAYS` (today's events count as coming up). Coming up first, soonest first, reason `eventComingUp`; then ended ones whose last day lies in the window, most people going first (`app.event_registration` rows with status `registered` or `attended`), then latest first, then id, reason `eventRecap`. The one definition of "ended community events" is `endedCommunityEvents(deps, community, since, until): Promise<{ id: number; endsAt: Date }[]>` in `items/event/suggest.ts` (`endsAt` = the start of the day after the last day); the event suggester and `pendingEventPeriods` (Decision 5) both call it.
   - `forumThread`: this community's threads, not deleted, `lastActivityAt` in the window; order `replyCount desc`, `viewCount desc`, id. Reason `mostReplies`. (Threads have no reaction count; replies and views are what we store.)
   - `launchpadProject`: this community's projects, published, `updatedAt` in the window; order `voteCount desc`, id. Reason `mostUpvotes`. The scope is `communityProjectWhere`, which gains an optional last argument `updatedSince?: Date`, applied **inside** its member-project SQL (`and "launchpad_projects"."updated_at" >= ${updatedSince}`) before the `vote_count` order and limit, and also added to the returned `Where` (`updatedAt: { greater_than_equal }`). Without it, old high-vote member projects would fill the limit and crowd out recent ones.
   - `welcome` (kind `editorial`) = the **new-member welcome**: one editorial block when at least one membership with `status = 'active'` has `joinedAt` in the window. Heading "Welcome to our new members", body "{count} people joined {community} since {date}. Say hello!" (English, see Decision 13), **a count, never names** (an issue can be public; a member list must not leak). Reason `newMembers`. `countsTowardMinimum: false` in `AUTO_DRAFT_SOURCES`.
3. **Reasons are structured, stored apart from the issue, and read only by editor paths.** `SuggestionReason` (client-safe union in `src/lib/magazines/suggestions.ts`, formatted in the viewer's language like `CandidateFact`). The auto-drafter stores one row per picked item in `app.magazine_auto_pick (issue_id, item_id, reason jsonb)`, keyed by the saved block id (block ids survive saves, core preflight F5). Only `loadIssueEditorView` reads it. Rejected: an `autoReason` field on every item block (seven block tables in the migration, and the reading loaders would carry it next to reader data).
4. **Settings: one Drizzle row per magazine, `app.magazine_auto_draft_settings`.** Columns in Task 1. `sources` is `jsonb` keyed by `AutoDraftSourceId`, validated by zod on read and merged over `AUTO_DRAFT_SOURCE_DEFAULTS` (`resolveSources`), so a new source needs no migration. `src/server/magazines/auto-draft/settings.ts` is the **only** module that reads or writes this table (`readAutoDraftSettings`, `saveAutoDraftSettings`, `autoPublishAllowed`, `listDueAutoDraftSettings`); the publisher and the cron step call it. `visibility` null = "same as the magazine default"; a concrete visibility goes through `planVisibilityChange` and stores `public_confirmed_by/at` exactly like a magazine or an issue (ADR-0042 rule: the unlisted-community opt-in, leaders only). `schedule_starts_at` is set when the settings are switched on or the cadence, day of month or weekday change; a period counts only when it falls due at or after it, so switching on in the middle of a month never makes an instant draft (that is what "Make a draft now" is for). Saving needs `manage` (magazine policy, like the magazine default visibility); reading the screen, the history and "Make a draft now" need `edit`. Rejected: Payload fields on `Magazines` (a Payload save rewrites every column it owns from a possibly stale document, the reason ADR-0046 kept its outbox in Drizzle).
5. **Periods, all in UTC.** `calendarPeriod(settings, now)` in `src/lib/magazines/auto-draft-schedule.ts`: monthly → key `month:YYYY-MM`, due `monthDay` 00:00 UTC (`monthDay` 1–28); weekly → key `week:<ISO week-year>-W<ww>`, due on `weekday` (ISO: 1 = Monday … 7 = Sunday) of that ISO week; biweekly → 14-day blocks counted from Monday 2024-01-01 (`BIWEEKLY_EPOCH`), key `fortnight:<n>`, due on `weekday` of the block's first week; `after_event` and `on_demand` → null. After-event periods are `event:<eventId>` for each event of `endedCommunityEvents(deps, community, max(now − AFTER_EVENT_LOOK_BACK_DAYS, schedule_starts_at), now)` (Decision 2: `endsAt` = the start of the day after its last day, so a recap never comes before the event), oldest `endsAt` first. Manual runs use `manual:<uuid>`. Look-back window: `since_last_issue` → since the latest published issue's `publishedAt` (no published issue → `LOOK_BACK_FALLBACK_DAYS = 30`), `days_30`, `days_7`; `until = now`.
6. **One run per (magazine, period), claimed before any work.** `app.magazine_auto_draft_run` has a unique `(magazine_id, period_key)` and a partial unique `(magazine_id) WHERE status = 'running'`. `claimAutoDraftRun` first marks this magazine's `running` rows claimed more than `RUN_STALE_MINUTES = 15` ago as `failed`, then `INSERT … ON CONFLICT DO NOTHING RETURNING id` (no conflict target: either index refuses), then, if nothing was inserted, re-claims a `failed` row of the same period while `attempts < AUTO_DRAFT_MAX_ATTEMPTS = 3` (`23505` from the partial index there = busy). No row → `already_ran` (this period has a finished run) or `busy` (another run of this magazine is in progress). So two cron passes, or a cron pass and "Make a draft now", never make two drafts. **The run names its issue as soon as it exists:** `attachRunIssue(db, runId, issueId)` writes `run.issue_id` right after `createIssue`, before any other step. **Any failure after `createIssue` cleans up:** a throw from `setIssueItems` or `saveAutoPicks` deletes that draft (`deleteDraftIssue` with `via: "auto"`), marks the run `failed` and rethrows; a refusal from `scheduleIssue` (for example `assertPublishable`) is **not** a failure: the run ends `made` with `goesOutAt: null`, and the editors get the notify-only notice (the draft is good, it just will not go out by itself). **A re-claimed `failed` run whose `issue_id` names an issue** (the process died mid-way) first cleans that issue up: status `draft` → delete it (`via: "auto"`); `scheduled` with `scheduledVia = "auto"` → unschedule then delete it (`via: "auto"`); anything else (a person took it over: their own schedule, or published) → finish the run `made` with that issue, make nothing new, send no notice. Rejected: a `pg_advisory_xact_lock` (the work spans several Payload transactions; a session lock on a pooled connection is unreliable).
7. **One open auto-draft per magazine.** Open = an issue named by **any** run of this magazine (`issue_id` non-null, whatever the run's status) whose status is `draft` or `scheduled`; so a half-made draft of a crashed run also blocks a second one until its re-claim cleans it up. **"Made automatically"** (for the builder's reasons and notice) = an issue named by a `made` run. Both definitions live in `auto-draft/runs.ts` only (`findOpenAutoDraft`, `isAutoMadeIssue`). A run that finds an open one ends `skipped` with reason `draft_open` (history only, no notice: the editors already have the open draft's notice). Too few: fewer than `AUTO_DRAFT_MIN_ITEMS = 3` valid candidates from sources with `AUTO_DRAFT_SOURCES[s].countsTowardMinimum` → `skipped`, reason `too_few` (with `found` and `needed`). For a scheduled or event run the editors are told once per period (the run row makes the notice once-only). **A manual run ("Make a draft now") sends no inbox notice for `too_few` or `no_rights`**: the presser sees the result on the screen, and each press is its own period, so a notice would repeat on every press.
8. **Who the auto-drafter acts as.** `IssueActor` gains `via?: "auto"`. A scheduled run acts as `settings.updated_by` (the person who last saved the settings), whose `edit` capability is checked at every run (ADR-0045); without it the run is `skipped` / `no_rights` and the editors are told to save the settings again. "Make a draft now" acts as the person who pressed it. With `via: "auto"` the issue service records history with `actor_id = null` ("Automatic") and does not treat the write as a person's edit; the rule lives in one private `historyActorId(actor: IssueActor | null): string | null` in `issue-service.ts` (null for a null actor or `via: "auto"`, else `userId`). The auto-drafter's own history rows (`draft_made`, `draft_skipped`) use `trigger === "manual" ? requestedBy : null` as actor, so "Make a draft now" shows who pressed it. Rejected: a system user (a fake account in `app.user`, and no person's rights would be checked).
9. **Auto-publish is an automatic schedule.** `PUBLISH_ORIGINS` gains `"auto"`; MagazineIssues gains `scheduledVia` (select of `SCHEDULE_ORIGINS = ["schedule", "auto"]`, null on rows from before). When `whenReady = "auto_publish"`, the auto-drafter calls `scheduleIssue(…, now, { via: "auto" })` for `now + autoPublishDays` days. **The lifecycle rule lives in the issue service, not the auto-drafter:** `setIssueItems` and `updateIssueDetails` by a person (`actor.via !== "auto"`) on an issue that is `scheduled` with `scheduledVia = "auto"` (and `canIssue(issue.status, "unschedule")`, so the `ISSUE_TRANSITIONS` table still governs) write `status: "draft"` plus the cleared schedule fields in the same claimed write, and record `auto_publish_stopped` (`why: "edited"`). The cleared fields are one private constant `CLEARED_SCHEDULE = { scheduledFor: null, scheduledBy: null, scheduledVia: null }` in `issue-service.ts`, used by `unscheduleIssue`, the stop-on-edit write and `publishIssue`. `unscheduleIssue` of an automatic schedule records `auto_publish_stopped`: `why: "failed"` with `failure` when called with `opts.failure` (the scheduled run's `failSchedule`), else `why: "stopped"`. Publishing early is the Publish button (`publishIssue` accepts `scheduled`). **Rights for auto-publish (amends ADR-0046 Decision 8, recorded in ADR-0047):** ADR-0046 said auto-publish rights are checked against the magazine's automatic-publication settings *instead of* a person. This plan requires **both**: `scheduledBy` (the person whose rights the auto-drafter used) must still have `edit` (ADR-0045), **and** the settings must still say `whenReady = "auto_publish"`. Why: the settings alone would let a draft go out on the authority of someone who has left the team. In `scheduled-publishing.ts` the per-origin rule is an exhaustive `SCHEDULE_ORIGIN_CHECKS: Record<ScheduleOrigin, (deps: Deps, issue: MagazineIssue) => Promise<ScheduleFailure | null>>` (`schedule → null`; `auto → (await autoPublishAllowed(deps.db, magazineId)) ? null : "auto_off"`), run after the `edit` check so `no_rights` wins; origin = `issue.scheduledVia ?? "schedule"`. Failure → back to draft, editors told (new `ScheduleFailure` `"auto_off"`). Saving settings to "tell me only" also stops the open automatic draft's **automatic** schedule at once (Task 4; a person's schedule is never touched). A person rescheduling an automatic schedule makes it a person's schedule (`via` defaults to `"schedule"`). Known small race (ADR-0047 risk): the publisher reads the settings just before `publishIssue`; a "tell me only" save landing in those milliseconds loses to the publish, the same as a save landing just after it. Rejected: a separate "publish after" timer outside the issue status (a second publish trigger next to ADR-0046's, and the desk and builder would not show the time); re-reading the settings inside `publishIssue`'s claimed transaction (the issue service would depend on the auto-draft module, for a window of milliseconds).
10. **Issue history for every issue, in one table.** `app.magazine_issue_history` (bigserial id, magazine, issue id `ON DELETE SET NULL` plus `issue_number`/`issue_title` snapshots, `event`, `origin`, `actor_id` null = automatic, `detail jsonb`, `created_at`). Events (`ISSUE_HISTORY_EVENTS`): `draft_made`, `draft_skipped` (written by the auto-drafter), `items_changed`, `auto_publish_stopped`, `published`, `deleted` (written by the issue service inside its claimed transactions through `recordIssueHistory(tx, entry)`). `items_changed` is written only for a person's save and skipped when the issue's latest history row (`ORDER BY created_at DESC, id DESC`) is an `items_changed` by the same person less than `ITEMS_CHANGED_QUIET_MINUTES = 60` ago (the builder autosaves). Rows written in one transaction share `created_at` (transaction time), so **every ordering is `created_at DESC, id DESC`**, and when one write makes two rows the service inserts `items_changed` first, then `auto_publish_stopped`. History rows are written in the write's transaction, after the write — **except `deleted`**, which is inserted after the delete's claim and **before** `payload.delete` (the row's `issue_id` FK would refuse a deleted issue; the delete then sets it null). The auto-drafter removing its own half-made draft (`via: "auto"`) writes no `deleted` row (editors never saw that draft; the run row records `failed`). `published` records `origin`; its actor is null for `"auto"`. The auto-draft screen shows the magazine's latest `HISTORY_LIMIT = 30` rows. Rejected: history only for auto-made issues (the issue service would need to know which issues the auto-drafter made, a special case; and "published / by whom" is useful for every issue).
11. **Cron: one more step in the existing route.** `runMagazineIssueJobs` runs `runDueAutoDrafts(deps, now)` **first** (so a draft that is due is made before scheduled publishing and delivery), in its own `try`/log, at most `AUTO_DRAFT_RUNS_PER_PASS = 5` claims per pass, magazines with the oldest last run first. The due list (`listDueAutoDraftSettings` + the computed period keys) leaves out every (magazine, period) that already has a `made` or `skipped` run, or a `failed` run with `attempts >= AUTO_DRAFT_MAX_ATTEMPTS`, and only claims that were inserted or re-claimed count toward the 5 (an `already_ran`/`busy` answer does not use up the budget). `IssueJobsResult` gains `drafted` and `skipped`. Rejected: a second cron route (ADR-0046 Decision 10: an issue's lifecycle stays in one route).
12. **Notices through the existing inbox (ADR-0025).** `notifications.ts` gains `notifyAutoDraftReady` (type `magazine_auto_draft_ready`, link to the builder; text says whether and when it goes out by itself) and `notifyAutoDraftSkipped` (type `magazine_auto_draft_skipped`, reasons `too_few` and `no_rights`, link to the auto-draft screen; never for a manual run, Decision 7), both to `listMagazineEditorIds`. `ScheduleFailure` gains `"auto_off"`. Stored in English (slice 3 precedent); dates in the text are formatted `en-GB`, `dateStyle: "long"`, `timeZone: "Europe/Amsterdam"`.
13. **Generated text is English.** The issue title (`Issue of {date}`, message key `magazineEditor.autoDraft.issueTitle`) and the welcome block (`magazineEditor.autoDraft.welcome.{heading,body}`) are built with the English translator (`getTranslations({ locale: routing.defaultLocale, namespace: "magazineEditor.autoDraft" })`), in the default locale, the only locale the builder edits (as `assertItemsValid` says). Both keys exist in `en.json` and `nl.json`. Editors change the text like any text. (Risk line.)
14. **"Add more" reuses the ranking.** `pickerCandidates` with an **empty** query asks the suggesters of the kind's sources first (in `AUTO_DRAFT_SOURCE_ORDER`; window = the magazine's saved look-back, limit `PICKER_LIMIT`), then fills up with the plain search, de-duplicated by reference; on a duplicate the suggestion's entry wins but takes the search entry's `openHref` when its own is null. Candidates gain `reason: SuggestionReason | null`; the picker shows it in one muted line. A typed query is unchanged and does not read settings or build a suggest context (a lazy loader is only called for an empty query).
15. **One migration, `src/migrations/20261027c_magazine_auto_draft.ts`**, and **ADR-0047** "Magazine auto-drafts are ordinary issues assembled from kind suggesters". If `origin/main` has a later migration or ADR number when Task 1 starts, use the next free one everywhere below.

## Global Constraints

- **The constraints file handed to the coding engine with every task holds this plan's "Decisions this plan makes" section and this "Global Constraints" section verbatim.** Task text refers to "Decision N" and "the DB test prefix"; both are defined there, nowhere else.
- Branch: `feat/community-magazines-auto-draft`, created by the controller (not a task agent) from `origin/main` after the subscriptions PR (`feat/community-magazines-subscriptions`) has merged. If it has not merged yet, the controller stacks the branch on it and later rebases with `git rebase --onto origin/main <old base>` after the squash merge (CI runs only for PRs into main). Run `git branch --show-current` before every commit. Never `git checkout`/`git switch`, never `git stash`, never `git add -A` / `git add .`. Stage files by name and confirm every staged file is yours.
- No `Co-Authored-By`, "Generated with" or any AI credit line in commits or PRs.
- Before Task 1, after Task 5 and before opening the PR: `git fetch origin && git log origin/main --oneline | grep -i -E "magazin|auto.?draft|suggest"; gh pr list --search magazine`. Stop if another session shipped part of this.
- **Never** run `pnpm db:apply`, `pnpm db:push`, `pnpm build`, `pnpm dev`, `drizzle-kit generate`, or anything that reads `.env`. Its `DATABASE_URL` is production, and prod applies migrations on merge. Never `source`/`.` `.env` or `.env.docker`.
- Unit test prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run`.
- **DB test prefix** (written `<DB prefix>` in the tasks; use exactly; never host port 5432):
  `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test`
  If `aitcom_test` is not reachable, set it up once: `pnpm dev:db`; `docker run -d --rm --name aitcom-test-pg-forward --network aitcom_default -p 127.0.0.1:55432:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp:postgres:5432`. New tables, columns and enum values reach the test DB only through the migration's `up` (Task 1's migration test runs it). Never set `PAYLOAD_PUSH` against `aitcom_test`. A DB suite that reports _skipped_ is a setup failure: fix the env, do not continue.
- **Regenerate Payload types** (Task 1 only): `env -u PAYLOAD_PUSH SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test RESEND_API_KEY= npx payload generate:types` (if it stops on one missing variable, pass that one inline with a dummy local value). `git diff -- src/payload-types.ts` must show only the MagazineIssue `publishedVia` (gains `'auto'`) and `scheduledVia` hunks (and their select type).
- Integration tests copy the `isLocalDbConfigured` guard and fixture style of `src/server/magazines/scheduled-publishing.integration.test.ts` (unique suffix, owner/admin/editor/member users with member profiles, a listed community and its magazine, `callerAs(userId)` built with `createCaller({ db, headers, session })` where needed, cleanup in `afterEach`). Fixed clocks: `const baseTime = new Date("2026-10-27T12:00:00Z")` and `at(minutes)`. Cleanup deletes the fixture magazines (settings, runs, history and picks cascade or set null with them; issues are deleted with the existing helper), the fixture events, forum threads, launchpad projects, news items and storylines the test created, and the fixture users' `app.notification` rows.
- Payload `number` values may come back as strings: `Number()` before comparing.
- **Running the app** (visual checks only). Commit first, then export `HEAD`: `X="$TMPDIR/aitcom-visual"; rm -rf "$X"; mkdir -p "$X"; git -C /Users/greg/coding-projects/aitcom archive HEAD | tar -x -C "$X"; ln -s /Users/greg/coding-projects/aitcom/node_modules "$X/node_modules"`. Then, in `$X`: `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test RESEND_API_KEY= BETTER_AUTH_SECRET=local-visual-check PAYLOAD_SECRET=local-visual-check pnpm exec next dev -p 3100`.
- Every user-visible string goes through next-intl in **both** `messages/en.json` and `messages/nl.json`, in everyday words, informal Dutch ("je"). The plan gives the English; the task writes natural Dutch alongside. New copy lives under `magazineEditor.autoDraft.*`, `magazineEditor.notifications.autoDraftReady|autoDraftSkipped`, `magazineEditor.notifications.scheduleFailed.content.auto_off` and `magazineEditor.builder.*`; `src/i18n/messages-parity.test.ts` already covers `magazineEditor`. Do not use "cadence", "suggester", "candidate", "period", "run", "cron", "orchestrate" or "auto-draft" in copy. Say "automatic drafts", "how often", "picked because", "goes out by itself", "make a draft now". Editor refusal codes reach the UI only through `readEditorError` / `editorErrorKey`.
- Design (UI tasks): read `PRODUCT.md` and `DESIGN.md` first. Tokens come from `src/styles/globals.css`, primitives from `src/components/ui/`. One Voice Rule: on the automatic-drafts screen the one orange is **Save**; "Make a draft now" is `ink`; in the builder the Publish button keeps the accent and "Stop the automatic publish" is `outline`. `/ LABEL` kickers come only through `<SectionLabel>`. Mono is for dates, times and counts only; reasons are Sans. Flat by default. Loading → `<Skeleton>`, error → `<ErrorState onRetry>` or `role="alert"` text, empty → text that teaches the next step.
- Accessibility: WCAG 2.2 AA. Label every control; IDs from `useId()`. Groups of related controls are a `<fieldset>` with a `<legend>`. Every input with help or error text links them with `aria-describedby` and sets `aria-invalid="true"` while its error shows. Results and state changes are announced (`role="status"`). No horizontal page scroll at 390px.

## Review Focus

1. **Two cron passes overlap, or a pass meets "Make a draft now" for the same magazine.** At most one draft per period and at most one open automatic draft; the second caller gets a plain "a draft is already being made" or "there is already an open draft". Tests: Task 6 (`two runs at once make one draft`, `a second pass in the same period does nothing`, `make a draft now while a draft is open makes none`).
2. **An editor changes an automatic draft minutes before it would go out by itself.** It does not go out; it is a draft again, the editor's change is kept, the history says who stopped it. Tests: Task 2 (`a person's edit stops the automatic publish`, `the auto-drafter's own save does not stop it`), Task 9 (step 4, "An edit just before the due time keeps it a draft").
3. **Reasons or members-only content leak to readers.** A reader of an automatically published public issue never sees a reason, and a members-only forum thread or event picked into it stays hidden from non-members as for any issue (ADR-0044). Test: Task 9 (step 6, "Reasons stay with editors").
4. **Too little happened, or the magazine has no topics.** No draft, the editors get one notice that says why and how to get more, and later passes in the same period stay quiet. An editor pressing "Make a draft now" five times with too little gets five on-screen answers and puts no notice in anyone's inbox. Tests: Task 6 (`too few things makes no draft and tells the editors once`, `a manual run with too little tells only the presser`).
5. **The person who set up automatic drafts loses edit rights, or someone switches settings to "tell me only" while a draft waits to go out.** Nothing is published by itself; the draft stays a draft and the editors are told; a schedule a person set is never cancelled by the settings. Tests: Task 2 (`switching settings off auto-publish fails the automatic schedule`), Task 4 (`saving tell-me-only stops a waiting automatic publish`, `a person's schedule on the automatic draft itself is untouched`), Task 6 (`a run without edit rights makes no draft and tells the editors`).
6. **An unlisted community picks "Everyone" for its automatic drafts.** Saving needs the same recorded confirmation as a magazine or an issue, only a community leader may give it, and the drafts copy it. Test: Task 4 (`public drafts in an unlisted community need a leader's confirmation`).
7. **A run dies or fails half-way.** No orphaned draft, never a second open draft. Tests: Task 6 (`drafter-failure.integration.test.ts`: save, picks and schedule failures; a crashed run's draft is cleaned up on re-claim).

---

## File structure

**Create**

| File                                                                                                          | Responsibility                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/lib/magazines/auto-draft.ts`                                                                             | Settings values, defaults, input schema, `resolveSources` (client-safe).                               |
| `src/lib/magazines/auto-draft-schedule.ts`                                                                    | `calendarPeriod`, `isPeriodDue`, `nextDraftAt`, `lookBackWindow`, `SuggestWindow` (client-safe, pure). |
| `src/lib/magazines/suggestions.ts`                                                                            | `SuggestionReason` union and its zod schema (client-safe).                                             |
| `src/lib/magazines/issue-history.ts`                                                                          | `ISSUE_HISTORY_EVENTS`, `IssueHistoryEntry` (client-safe).                                             |
| `src/migrations/20261027c_magazine_auto_draft.ts` (+ `magazine-auto-draft.integration.test.ts`)               | Enum value, `scheduled_via`, four app tables.                                                          |
| `src/server/magazines/issue-history.ts`                                                                       | `recordIssueHistory`, `listIssueHistory`.                                                              |
| `src/server/magazines/items/suggesters.ts`                                                                    | `ITEM_SUGGESTERS`, `suggestCandidates`.                                                                |
| `src/server/magazines/items/<kind>/suggest.ts` (7)                                                            | One suggester per kind.                                                                                |
| `src/server/magazines/auto-draft/settings.ts`                                                                 | The only reader/writer of the settings table: read, save, `autoPublishAllowed`, due list (Tasks 2, 4, 6). |
| `src/server/magazines/auto-draft/window.ts`                                                                   | `suggestWindowFor` (Task 4).                                                                           |
| `src/server/magazines/auto-draft/runs.ts`                                                                     | Claim, attach, finish runs; open auto-draft and "made automatically" lookups.                          |
| `src/server/magazines/auto-draft/drafter.ts`                                                                  | `makeAutoDraft`, `runDueAutoDrafts`.                                                                   |
| `src/server/magazines/auto-draft/drafter-failure.integration.test.ts`                                         | Failure and crash cleanup tests, in their own file for the module mock (Task 6).                      |
| `src/server/magazines/auto-draft/picks.ts`                                                                    | Store and read auto-pick reasons.                                                                      |
| `src/app/[locale]/communities/[slug]/magazine/auto-draft/page.tsx`                                            | The automatic-drafts screen.                                                                           |
| `src/components/magazines/editor/auto-draft/{auto-draft-settings-form,make-draft-now,issue-history-list}.tsx` | The screen's parts.                                                                                    |
| `src/components/magazines/editor/builder/auto-draft-notice.tsx`                                               | The builder's "made automatically" notice.                                                             |
| `src/components/magazines/editor/suggestion-reason.tsx`                                                       | One reason in the viewer's language (rows and picker).                                                 |
| `docs/adr/0047-magazine-auto-drafts-are-ordinary-issues-assembled-from-kind-suggesters.md`                    | ADR.                                                                                                   |

**Modify**

`src/lib/magazines/values.ts`, `src/lib/magazines/paths.ts`, `src/collections/MagazineIssues.ts`, `src/payload-types.ts` (generated), `src/server/db/schema.ts`, `src/migrations/index.ts`, `src/migrations/magazines.integration.test.ts`, `src/server/magazines/{issue-service,issue-editing,scheduled-publishing,issue-jobs,notifications,magazine-service,reading,magazine-articles}.ts`, `src/server/magazines/items/{types,registry,pickers,context}.ts`, `src/server/magazines/items/launchpadProject/scope.ts`, `src/server/news/{storylines,list}.ts`, `src/server/api/routers/magazines.ts`, `src/server/api/routers/magazines.integration.test.ts`, `src/components/magazines/editor/editor-desk.tsx`, `src/components/magazines/editor/builder/{issue-builder,item-row,picker-panel,builder-top-bar}.tsx` (+ new `builder-top-bar.test.tsx`, which does not exist yet), `src/app/api/cron/magazine-issues/route.test.ts`, `messages/{en,nl}.json`, `CONTEXT.md`, `DESIGN.md`, `docs/adr/0043-*.md`, `docs/adr/0046-*.md`.

---

## Task 1: Values, the migration, the Payload field and ADR-0047

**Files:**

- Create: `src/lib/magazines/auto-draft.ts`, `src/lib/magazines/auto-draft-schedule.ts`, `src/lib/magazines/suggestions.ts`, `src/lib/magazines/issue-history.ts`, `src/migrations/20261027c_magazine_auto_draft.ts`, `docs/adr/0047-magazine-auto-drafts-are-ordinary-issues-assembled-from-kind-suggesters.md`
- Modify: `src/lib/magazines/values.ts`, `src/collections/MagazineIssues.ts`, `src/payload-types.ts` (generated), `src/server/db/schema.ts` (after `magazineIssueDeliveries`; the `notification.type` comment gains `magazine_auto_draft_ready` and `magazine_auto_draft_skipped`), `src/migrations/index.ts`, `src/migrations/magazines.integration.test.ts`, `CONTEXT.md`
- Test: `src/lib/magazines/values.test.ts`, `src/lib/magazines/auto-draft.test.ts`, `src/lib/magazines/auto-draft-schedule.test.ts`, `src/lib/magazines/suggestions.test.ts`, `src/collections/magazines-schema.test.ts`, `src/migrations/magazine-auto-draft.integration.test.ts`, `src/migrations/magazines.integration.test.ts`

**Interfaces:**

- Produces (`values.ts`): `PUBLISH_ORIGINS = ["button", "schedule", "auto"] as const` (drop the "slice 5 adds" comment); `export const SCHEDULE_ORIGINS = ["schedule", "auto"] as const satisfies readonly PublishOrigin[]; export type ScheduleOrigin = (typeof SCHEDULE_ORIGINS)[number];`
- Produces (`suggestions.ts`):
  ```ts
  export type SuggestionReason =
    | { type: "waitingSince"; at: string }
    | { type: "topic"; topic: string }
    | { type: "eventComingUp"; at: string }
    | { type: "eventRecap"; at: string; going: number }
    | { type: "mostReplies"; count: number }
    | { type: "mostUpvotes"; count: number }
    | { type: "newMembers"; count: number };
  export const suggestionReasonSchema: z.ZodType<SuggestionReason>; // discriminated union on "type"
  /** The stored reason, or null when it is not one we know (an old or broken row). */
  export function parseSuggestionReason(
    value: unknown,
  ): SuggestionReason | null;
  ```
- Produces (`auto-draft.ts`):
  ```ts
  export const AUTO_DRAFT_CADENCES = ["monthly", "biweekly", "weekly", "after_event", "on_demand"] as const;
  export type AutoDraftCadence = (typeof AUTO_DRAFT_CADENCES)[number];
  export const AUTO_DRAFT_LOOK_BACKS = ["since_last_issue", "days_30", "days_7"] as const;
  export type AutoDraftLookBack = (typeof AUTO_DRAFT_LOOK_BACKS)[number];
  export const AUTO_DRAFT_WHEN_READY = ["notify", "auto_publish"] as const;
  export type AutoDraftWhenReady = (typeof AUTO_DRAFT_WHEN_READY)[number];
  /** Where suggestions come from (Decision 1); also the item order in a draft (a test pins it). */
  export const AUTO_DRAFT_SOURCE_IDS = ["article", "storyline", "event", "forumThread", "launchpadProject", "newsItem", "welcome"] as const;
  export type AutoDraftSourceId = (typeof AUTO_DRAFT_SOURCE_IDS)[number];
  export const AUTO_DRAFT_SOURCE_ORDER: readonly AutoDraftSourceId[] = AUTO_DRAFT_SOURCE_IDS;
  export type AutoDraftSource = { enabled: boolean; max: number };
  export const AUTO_DRAFT_SOURCE_MAX = 10;
  /** The one record of per-source facts; everything below is derived from it. */
  export const AUTO_DRAFT_SOURCES = {
    article:          { kind: "article",          defaults: { enabled: true, max: 5 }, maxLimit: AUTO_DRAFT_SOURCE_MAX, needsTopics: false, countsTowardMinimum: true },
    storyline:        { kind: "storyline",        defaults: { enabled: true, max: 3 }, maxLimit: AUTO_DRAFT_SOURCE_MAX, needsTopics: true,  countsTowardMinimum: true },
    event:            { kind: "event",            defaults: { enabled: true, max: 4 }, maxLimit: AUTO_DRAFT_SOURCE_MAX, needsTopics: false, countsTowardMinimum: true },
    forumThread:      { kind: "forumThread",      defaults: { enabled: true, max: 3 }, maxLimit: AUTO_DRAFT_SOURCE_MAX, needsTopics: false, countsTowardMinimum: true },
    launchpadProject: { kind: "launchpadProject", defaults: { enabled: true, max: 3 }, maxLimit: AUTO_DRAFT_SOURCE_MAX, needsTopics: false, countsTowardMinimum: true },
    newsItem:         { kind: "newsItem",         defaults: { enabled: true, max: 5 }, maxLimit: AUTO_DRAFT_SOURCE_MAX, needsTopics: true,  countsTowardMinimum: true },
    welcome:          { kind: "editorial",        defaults: { enabled: true, max: 1 }, maxLimit: 1,                     needsTopics: false, countsTowardMinimum: false },
  } as const satisfies { [S in AutoDraftSourceId]: { kind: ItemKindId; defaults: AutoDraftSource; maxLimit: number; needsTopics: boolean; countsTowardMinimum: boolean } };
  export type SourceKind<S extends AutoDraftSourceId> = (typeof AUTO_DRAFT_SOURCES)[S]["kind"];
  /** Compile error when an item kind (`ItemKindId`, `item-views.ts`) has no source. */
  type AssertNever<T extends never> = T;
  type _EveryKindHasASource = AssertNever<Exclude<ItemKindId, SourceKind<AutoDraftSourceId>>>;
  export const AUTO_DRAFT_SOURCE_DEFAULTS: Record<AutoDraftSourceId, AutoDraftSource>; // derived: AUTO_DRAFT_SOURCES[s].defaults
  export function sourceMaxLimit(source: AutoDraftSourceId): number;                  // derived: AUTO_DRAFT_SOURCES[s].maxLimit
  export const AUTO_DRAFT_MIN_ITEMS = 3;
  export const AUTO_PUBLISH_DAYS_DEFAULT = 3;
  export const AUTO_PUBLISH_DAYS_MAX = 14;
  export const MONTH_DAY_MAX = 28;
  export const LOOK_BACK_FALLBACK_DAYS = 30;
  export const EVENT_COMING_UP_DAYS = 30;
  export const AFTER_EVENT_LOOK_BACK_DAYS = 7;
  export type AutoDraftSettings = {
    enabled: boolean;
    cadence: AutoDraftCadence;
    monthDay: number;          // 1–28
    weekday: number;           // ISO: 1 = Monday … 7 = Sunday
    lookBack: AutoDraftLookBack;
    layout: IssueLayout;
    visibility: IssueVisibility | null; // null = the magazine default
    publicConfirmedBy: string | null;
    publicConfirmedAt: string | null;
    sources: Record<AutoDraftSourceId, AutoDraftSource>;
    neverReuse: boolean;
    whenReady: AutoDraftWhenReady;
    autoPublishDays: number;   // 1–14
  };
  export const DEFAULT_AUTO_DRAFT_SETTINGS: AutoDraftSettings;
  //   enabled false, monthly, monthDay 1, weekday 1, since_last_issue, "cover-story",
  //   visibility null, confirmations null, AUTO_DRAFT_SOURCE_DEFAULTS, neverReuse true, notify, 3
  /** What the save form sends: the settings without confirmations, plus the opt-in. */
  export const autoDraftSettingsInput: z.ZodObject<…>; // bounds above; sources: every source id optional, max int 1..sourceMaxLimit(source)
  export type AutoDraftSettingsInput = z.infer<typeof autoDraftSettingsInput>;
  /** Valid stored entries over the defaults; unknown source ids dropped, max clamped to 1..sourceMaxLimit. */
  export function resolveSources(stored: unknown): Record<AutoDraftSourceId, AutoDraftSource>;
  ```
- Produces (`auto-draft-schedule.ts`):
  ```ts
  export type SuggestWindow = { since: Date; until: Date };
  export type CalendarPeriod = { key: string; dueAt: Date };
  export const BIWEEKLY_EPOCH = Date.UTC(2024, 0, 1); // a Monday
  export function calendarPeriod(
    s: Pick<AutoDraftSettings, "cadence" | "monthDay" | "weekday">,
    now: Date,
  ): CalendarPeriod | null;
  /** now >= dueAt, and the schedule had started by dueAt (scheduleStartsAt non-null and <= dueAt). */
  export function isPeriodDue(
    period: CalendarPeriod,
    now: Date,
    scheduleStartsAt: Date | null,
  ): boolean;
  /** The next dueAt at or after max(now, scheduleStartsAt) for calendar cadences; null otherwise or when not started. */
  export function nextDraftAt(
    s: Pick<AutoDraftSettings, "enabled" | "cadence" | "monthDay" | "weekday">,
    now: Date,
    scheduleStartsAt: Date | null,
  ): Date | null;
  export function lookBackWindow(
    lookBack: AutoDraftLookBack,
    lastPublishedAt: Date | null,
    now: Date,
  ): SuggestWindow;
  ```
- Produces (`issue-history.ts`, lib):
  ```ts
  export const ISSUE_HISTORY_EVENTS = [
    "draft_made",
    "draft_skipped",
    "items_changed",
    "auto_publish_stopped",
    "published",
    "deleted",
  ] as const;
  export type IssueHistoryEvent = (typeof ISSUE_HISTORY_EVENTS)[number];
  export const AUTO_DRAFT_SKIP_REASONS = [
    "too_few",
    "draft_open",
    "no_rights",
  ] as const;
  export type AutoDraftSkipReason = (typeof AUTO_DRAFT_SKIP_REASONS)[number];
  export type AutoDraftTrigger = "schedule" | "event" | "manual";
  /** Why the scheduled run sent an issue back to draft (moved here from notifications.ts, which re-exports the type). */
  export const SCHEDULE_FAILURES = ["empty", "invalid_item", "no_rights", "error", "auto_off"] as const;
  export type ScheduleFailure = (typeof SCHEDULE_FAILURES)[number];
  export type IssueHistoryDetail =
    | {
        event: "draft_made";
        trigger: AutoDraftTrigger;
        itemCount: number;
        goesOutAt: string | null;
      }
    | {
        event: "draft_skipped";
        trigger: AutoDraftTrigger;
        reason: AutoDraftSkipReason;
        found: number | null;
        needed: number | null;
      }
    | { event: "items_changed"; itemCount: number }
    | {
        event: "auto_publish_stopped";
        why: "edited" | "stopped" | "failed";
        failure?: ScheduleFailure; // set when why = "failed"
      }
    | { event: "published"; origin: PublishOrigin }
    | { event: "deleted" };
  export type IssueHistoryEntry = {
    id: number;
    detail: IssueHistoryDetail;
    actorName: string | null; // null = automatic
    issue: {
      id: number | null;
      number: number | null;
      title: string | null;
      status: IssueStatus | null; // the issue's current status; null when it was deleted
    } | null;
    createdAt: string;
  };
  ```
- Produces (`MagazineIssues.ts`): after `scheduledBy`, `{ name: "scheduledVia", type: "select", options: SCHEDULE_ORIGINS.map(v => ({ label: v, value: v })), admin: { readOnly: true, description: "Who set the schedule: a person, or automatic drafts. A person's change stops an automatic schedule." } }`. `publishedVia` description: "How it was published: the Publish button, a schedule, or automatically."
- Produces (`schema.ts`), CHECKs/indexes mirrored; Payload-table FKs only in the migration (as for `magazineStaff`):

  ```ts
  export const magazineAutoDraftSettings = appSchema.table("magazine_auto_draft_settings", …);
  //   magazineId int PK; enabled bool NOT NULL default false; cadence varchar(16) NOT NULL default 'monthly';
  //   monthDay smallint NOT NULL default 1; weekday smallint NOT NULL default 1; lookBack varchar(20) NOT NULL default 'since_last_issue';
  //   layout varchar(32) NOT NULL default 'cover-story'; visibility varchar(16) null; publicConfirmedBy varchar(255) null;
  //   publicConfirmedAt timestamptz null; sources jsonb NOT NULL default '{}'; neverReuse bool NOT NULL default true;
  //   whenReady varchar(16) NOT NULL default 'notify'; autoPublishDays smallint NOT NULL default 3;
  //   scheduleStartsAt timestamptz null; updatedBy varchar(255) null (→ user, set null); createdAt; updatedAt.
  //   checks: magazine_auto_draft_settings_cadence_check, _month_day_check (1..28), _weekday_check (1..7),
  //   _look_back_check, _layout_check (layout IN ISSUE_LAYOUTS, today 'cover-story'), _visibility_check (null or members/public),
  //   _when_ready_check, _publish_days_check (1..14)
  export const magazineAutoDraftRuns = appSchema.table("magazine_auto_draft_run", …);
  //   id varchar(255) PK (uuid); magazineId int NOT NULL; periodKey varchar(80) NOT NULL; trigger varchar(16) NOT NULL;
  //   status varchar(16) NOT NULL; skipReason varchar(32) null; foundCount int null; issueId int null;
  //   requestedBy varchar(255) null (→ user, set null); attempts smallint NOT NULL default 1;
  //   claimedAt timestamptz NOT NULL; finishedAt timestamptz null; createdAt.
  //   uniqueIndex magazine_auto_draft_run_period_idx (magazine_id, period_key);
  //   uniqueIndex magazine_auto_draft_run_running_idx (magazine_id) where status = 'running';
  //   index magazine_auto_draft_run_issue_idx (issue_id);
  //   checks: _trigger_check (schedule/event/manual), _status_check (running/made/skipped/failed), _skip_reason_check (null or AUTO_DRAFT_SKIP_REASONS)
  export const magazineAutoPicks = appSchema.table("magazine_auto_pick", …);
  //   issueId int NOT NULL; itemId varchar(255) NOT NULL; reason jsonb NOT NULL; createdAt; PK (issueId, itemId)
  export const magazineIssueHistory = appSchema.table("magazine_issue_history", …);
  //   id bigserial PK; magazineId int NOT NULL; issueId int null; issueNumber int null; issueTitle text null;
  //   event varchar(32) NOT NULL; origin varchar(16) null; actorId varchar(255) null (→ user, set null);
  //   detail jsonb NOT NULL; createdAt.
  //   index magazine_issue_history_magazine_idx (magazine_id, created_at); index magazine_issue_history_issue_idx (issue_id, created_at)
  //   checks: _event_check (ISSUE_HISTORY_EVENTS), _origin_check (null or PUBLISH_ORIGINS)
  ```

- [ ] **Step 1: Write the failing unit tests.**
  - `values.test.ts`: `it("automatic schedules are a kind of publish origin")`: `PUBLISH_ORIGINS` equals `["button","schedule","auto"]`; every `SCHEDULE_ORIGINS` value is in `PUBLISH_ORIGINS`.
  - `suggestions.test.ts`: `it("reads every reason we write")` (one valid object per `type` round-trips through `parseSuggestionReason`); `it("drops reasons it does not know")` (`{ type: "ai" }`, `{ type: "topic" }` without `topic`, `null`, `"x"` → null).
  - `auto-draft.test.ts`: `it("lists every source once, in draft order")` (`[...AUTO_DRAFT_SOURCE_ORDER].sort()` equals `Object.keys(AUTO_DRAFT_SOURCES).sort()` and `Object.keys(AUTO_DRAFT_SOURCE_DEFAULTS).sort()`, length 7, no repeats); `it("only the welcome counts nothing toward the minimum and allows one block")` (`countsTowardMinimum` false and `sourceMaxLimit` 1 only for `welcome`; `needsTopics` true exactly for `storyline` and `newsItem`); `it("fills missing sources with defaults and clamps counts")` (`resolveSources({ article: { enabled: false, max: 50 }, welcome: { enabled: true, max: 4 }, editorial: { enabled: false, max: 1 }, poll: { enabled: true, max: 2 } })` → `article { false, 10 }`, `welcome { true, 1 }`, `storyline` = default, no `editorial` or `poll` key; `resolveSources("junk")` equals the defaults); `it("refuses settings out of bounds")` (`autoDraftSettingsInput.safeParse` fails for `monthDay: 29`, `weekday: 0`, `autoPublishDays: 15`, `sources.forumThread.max: 0`; passes for `DEFAULT_AUTO_DRAFT_SETTINGS` minus the confirmation fields).
  - `auto-draft-schedule.test.ts` (UTC instants):
    - `it("monthly is due from the chosen day")`: `{ cadence: "monthly", monthDay: 5 }`, now `2026-11-07T10:00:00Z` → `{ key: "month:2026-11", dueAt: 2026-11-05T00:00:00Z }`.
    - `it("weekly uses ISO weeks")`: `{ weekly, weekday: 1 }`, now `2026-10-28T09:00:00Z` → `{ key: "week:2026-W44", dueAt: 2026-10-26T00:00:00Z }`; now `2027-01-01T09:00:00Z` → key `week:2026-W53`; weekday 7 at now `2026-10-28` → dueAt `2026-11-01T00:00:00Z`.
    - `it("every two weeks counts blocks from a fixed Monday")`: `{ biweekly, weekday: 1 }`, now `2026-10-28T09:00:00Z` → `{ key: "fortnight:73", dueAt: 2026-10-19T00:00:00Z }`; now `2026-11-02T09:00:00Z` → key `fortnight:74`; weekday 3 at now `2026-10-28` → dueAt `2026-10-21T00:00:00Z`.
    - `it("after events and on demand have no calendar")` → null for both.
    - `it("a period counts only once the schedule had started")`: period due `2026-11-05`; `isPeriodDue(p, 2026-11-07, 2026-11-01)` true; `(p, 2026-11-07, 2026-11-06)` false; `(p, 2026-11-04, 2026-11-01)` false; `(p, 2026-11-07, null)` false.
    - `it("names the next draft day")`: monthly day 5, `now = 2026-11-07`, started `2026-11-01` → `2026-12-05T00:00:00Z`; started `2026-10-01`, now `2026-11-03` → `2026-11-05T00:00:00Z`; `enabled: false` → null; `after_event` → null.
    - `it("looks back since the last issue, or a fixed number of days")`: `since_last_issue` with last `2026-10-01T08:00:00Z` → since that instant; with null → `now − 30 days`; `days_7` → `now − 7 days`; `until` is `now` in each.
  - `magazines-schema.test.ts`: `scheduledVia` is a `select` whose option values equal `SCHEDULE_ORIGINS`; `publishedVia` option values equal `PUBLISH_ORIGINS`. Add `describe("magazine auto-draft migration")`: the source contains `ADD VALUE IF NOT EXISTS 'auto'`, `"scheduled_via"`, `CREATE TABLE IF NOT EXISTS "app"."magazine_auto_draft_settings"`, `"app"."magazine_auto_draft_run"`, `"app"."magazine_auto_pick"`, `"app"."magazine_issue_history"`, and the index registers `name: "20261027c_magazine_auto_draft"` after `"20261027b_magazine_subscriptions"`.
- [ ] **Step 2: Run them.** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines src/collections/magazines-schema.test.ts` → FAIL.
- [ ] **Step 3: Implement** the four lib modules, the `values.ts` change, the collection field and the Drizzle tables. ISO week: Thursday-of-week rule (`d + 4 − (getUTCDay() || 7)`), week-year is that Thursday's year.
- [ ] **Step 4: Write the migration integration test** `src/migrations/magazine-auto-draft.integration.test.ts` in the style of `src/migrations/magazine-subscriptions.integration.test.ts` (refuses any database but `aitcom_test`; fixture: one bare user, one magazine row, one issue row inserted with SQL):
  - `it("adds the auto origin and the schedule source, and can run twice")`: run `up` twice; `enum_range(NULL::"enum_magazine_issues_published_via")` contains `auto`; `magazine_issues` has `scheduled_via`.
  - `it("keeps settings in bounds")`: `month_day = 29`, `weekday = 0`, `auto_publish_days = 15`, `cadence = 'daily'`, `visibility = 'teaser'`, `layout = 'grid'` are each `23514`.
  - `it("allows one run per period and one running run per magazine")`: second `(magazine, 'month:2026-11')` → `23505`; two `running` rows with different keys → `23505`; a `running` and a `made` row with different keys are fine.
  - `it("cleans up with its parents and keeps history of deleted issues")`: deleting the issue deletes its picks, sets `run.issue_id` and `history.issue_id` to null and keeps both rows; deleting the magazine deletes settings, runs and history; deleting the user sets `updated_by`, `requested_by`, `actor_id` to null.
  - `it("down removes the tables and the column, up restores them")`: inside a rolled-back transaction exactly like `magazine-subscriptions.integration.test.ts` (throw a `rollback` error and `expect(…).rejects.toBe(rollback)`).
  - **Also change `src/migrations/magazines.integration.test.ts`:** import `* as autoDraft from "./20261027c_magazine_auto_draft"`, call `autoDraft.down` first in the rollback transaction (before `subscriptions.down`) and `autoDraft.up` last.
- [ ] **Step 5: Write `20261027c_magazine_auto_draft.ts`.** First statement on its own: `ALTER TYPE "public"."enum_magazine_issues_published_via" ADD VALUE IF NOT EXISTS 'auto';` (the `20261027b` pattern and comment). Then one statement: `DO $$ BEGIN CREATE TYPE "public"."enum_magazine_issues_scheduled_via" AS ENUM('schedule', 'auto'); EXCEPTION WHEN duplicate_object THEN null; END $$;`, `ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "scheduled_via" "public"."enum_magazine_issues_scheduled_via";`, and the four `CREATE TABLE IF NOT EXISTS "app".…` with every constraint and index of Interfaces. FKs: settings/run/history `magazine_id` → `"public"."magazines"` ON DELETE cascade; pick `issue_id` → `"public"."magazine_issues"` ON DELETE cascade; run and history `issue_id` → `"public"."magazine_issues"` ON DELETE set null; `updated_by`, `requested_by`, `actor_id` → `"app"."user"` ON DELETE set null. `down`: drop the four tables, the column and the `scheduled_via` type; `auto` stays in the enum (comment: Postgres cannot drop an enum value; rows are untouched). Header comment: Decisions 3, 4, 6, 10; idempotent because failed deploys re-run it. Register in `src/migrations/index.ts`. Run `<DB prefix> pnpm vitest run src/migrations/magazine-auto-draft.integration.test.ts src/migrations/magazines.integration.test.ts` → PASS (not skipped).
- [ ] **Step 6: Regenerate Payload types** (Global Constraints) and run `pnpm typecheck`; fix exhaustive `Record<PublishOrigin, …>` maps if any appear (expected: none).
- [ ] **Step 7: Write ADR-0047** in the format of `docs/adr/0046-*.md`. Title "Magazine auto-drafts are ordinary issues assembled from kind suggesters". It records Decisions 1–14 in short form, links ADR-0043 (**supersedes its Decision 4**: suggesters are a parallel registry keyed by source, each source of one kind; a kind without a source is a compile error), ADR-0042 (drafts are invisible to readers through the resolver; the unlisted opt-in rule for draft visibility), ADR-0045 (the auto-drafter acts with a person's `edit`), ADR-0046 (**amends its Decision 8**: auto-publish needs both the scheduling person's `edit` and the settings' `auto_publish`, because settings alone would publish on the authority of someone who left the team; auto-publish is a scheduled issue with origin `auto`; the same cron route), ADR-0025 (notices through the inbox). Known risk: the publisher reads the settings just before `publishIssue`, so a "tell me only" save in those milliseconds loses to the publish (Decision 9). Rejected options: `suggest` on `IssueItemKind`, a ranking function in the auto-drafter, reasons on item blocks, settings on the Payload magazine, an advisory lock, a system user, a separate publish timer, history only for auto-made issues, a second cron route, AI ranking (spec "Later"). Check 0047 is free first: `git ls-tree -r --name-only origin/main docs/adr | tail -2` and `gh pr list --state open --json files --jq '.[].files[].path' | grep docs/adr/0047`.
- [ ] **Step 8: Update `CONTEXT.md`.** Add `### Automatic draft` (an issue the magazine made itself; one open at a time; an ordinary draft once made), `### Automatic publish` (a schedule set by automatic drafts; a person's change stops it) and `### Issue history` (what happened to the magazine's issues and who did it), in the file's format, linking ADR-0047.
- [ ] **Step 9: Verify** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines src/collections src/migrations/migration-runner-contract.test.ts && pnpm typecheck` → PASS.
- [ ] **Step 10: Commit** (every file above by name, `src/payload-types.ts` included): `feat(magazines): auto-draft tables, automatic schedule origin and ADR-0047`.

---

## Task 2: The issue service learns automatic schedules and keeps a history

**Files:**

- Create: `src/server/magazines/issue-history.ts`, `src/server/magazines/auto-draft/settings.ts` (only `autoPublishAllowed` in this task; Task 4 adds the rest)
- Modify: `src/server/magazines/issue-service.ts`, `src/server/magazines/scheduled-publishing.ts`, `src/server/magazines/notifications.ts`, `messages/{en,nl}.json`
- Test: `src/server/magazines/issue-service.integration.test.ts`, `src/server/magazines/scheduled-publishing.integration.test.ts`, `src/server/magazines/notifications.test.ts`

**Interfaces:**

- Consumes: `magazineIssueHistory`, `magazineAutoDraftSettings` (Task 1), `IssueHistoryDetail`, `ScheduleOrigin`, `ScheduleFailure`, `SCHEDULE_FAILURES`, `PublishOrigin`, `canIssue`; `PayloadTransaction`, `inPayloadTransaction` (`payload-writes.ts`); the private `writeIssue`, `assertFresh` (`issue-service.ts`).
- Produces (`auto-draft/settings.ts`): `export async function autoPublishAllowed(db: Deps["db"], magazineId: number): Promise<boolean>` — true only when the magazine's settings row exists with `when_ready = 'auto_publish'`. The only reader of the settings table in this task (Decision 4).
- Produces (`issue-history.ts`):
  ```ts
  export const ITEMS_CHANGED_QUIET_MINUTES = 60;
  export const HISTORY_LIMIT = 30;
  export type HistoryWrite = {
    magazineId: number;
    issue: { id: number; number: number; title: string } | null;
    actorId: string | null; // null = automatic
    detail: IssueHistoryDetail;
  };
  /** Inside the caller's transaction (Payload sql through tx.execute). `origin` column = detail.origin for "published", else null.
   *  For "items_changed": inserts nothing when the issue's latest history row is an items_changed by the same actor
   *  less than ITEMS_CHANGED_QUIET_MINUTES before now (one INSERT … SELECT … WHERE NOT EXISTS). */
  export async function recordIssueHistory(
    tx: PayloadTransaction,
    entry: HistoryWrite,
    now?: Date,
  ): Promise<void>;
  /** ORDER BY created_at DESC, id DESC, at most HISTORY_LIMIT; actor names from app.user.name (null actor → null);
   *  issue.status from a left join on magazine_issues (null when the issue was deleted). */
  export async function listIssueHistory(
    db: Deps["db"],
    magazineId: number,
  ): Promise<IssueHistoryEntry[]>;
  ```
- Produces (`issue-service.ts`):
  ```ts
  export type IssueActor = {
    userId: string;
    community: MagazineCommunity;
    /** The auto-drafter acting with this person's rights (Decision 8). */
    via?: "auto";
  };
  export async function createIssue(
    deps,
    magazine,
    input: { title: string },
    _actor: IssueActor,
    opts?: { layout?: IssueLayout; visibility?: VisibilityRecord }, // default: magazine default as today, layout "cover-story"
  ): Promise<MagazineIssue>;
  export async function scheduleIssue(
    deps,
    issue,
    publishAt,
    expectedUpdatedAt,
    actor,
    now?: Date,
    opts?: { via?: ScheduleOrigin }, // default "schedule"; written to scheduledVia
  ): Promise<MagazineIssue>;
  export async function unscheduleIssue(
    deps,
    issue,
    expectedUpdatedAt,
    actor: IssueActor | null,
    opts?: { failure?: ScheduleFailure }, // the scheduled run's reason; recorded in history
  ): Promise<MagazineIssue>;
  // Private: const CLEARED_SCHEDULE = { scheduledFor: null, scheduledBy: null, scheduledVia: null } as const;
  //   used by unscheduleIssue, the stop-on-edit write and publishIssue (all three clear scheduledVia).
  // Private: function historyActorId(actor: IssueActor | null): string | null; // null for null or via "auto"
  // Private: function stopsAutomaticSchedule(issue: MagazineIssue, actor: IssueActor): boolean;
  //   actor.via !== "auto" && issue.status === "scheduled" && issue.scheduledVia === "auto" && canIssue(issue.status, "unschedule")
  ```
  History written by the service, in the write's transaction, after the write unless said otherwise; actor always through `historyActorId`:
  - `setIssueItems` by a person → `items_changed { itemCount }` (quiet rule above).
  - `setIssueItems` / `updateIssueDetails` when `stopsAutomaticSchedule` → the same write also sets `status: "draft"` and `...CLEARED_SCHEDULE`, and records `auto_publish_stopped { why: "edited" }`. Insert order in `setIssueItems`: `items_changed` first, then `auto_publish_stopped`.
  - `unscheduleIssue` of an `auto` schedule → `auto_publish_stopped { why: "failed", failure }` when `opts.failure` is given, else `{ why: "stopped" }`.
  - `publishIssue` → `published { origin }`, actor null when origin is `"auto"`, else `historyActorId(actor)`.
  - `deleteDraftIssue` → `deleted`, inserted **after the claim UPDATE and before `payload.delete`** in the same transaction (the FK refuses a row for an already-deleted issue; the delete then sets `issue_id` null and the snapshot stays). **No row** when `actor.via === "auto"` (the auto-drafter removing its own half-made draft).
- Produces (`notifications.ts`): `ScheduleFailure` now imported from `src/lib/magazines/issue-history.ts` and re-exported (adds `"auto_off"`); content key `notifications.scheduleFailed.content.auto_off`: "Automatic publishing is switched off for {magazine}, so this issue stays a draft. Publish it yourself when it is ready."
- Produces (`scheduled-publishing.ts`): `failSchedule` passes its reason as `unscheduleIssue(deps, issue, issue.updatedAt, null, reason ? { failure: reason } : undefined)` (the community-gone case passes no failure and records `why: "stopped"`). `resolveScheduledPublisher` keeps the `edit` check on `scheduledBy` first (`no_rights` wins), then runs the exhaustive per-origin check:
  ```ts
  const SCHEDULE_ORIGIN_CHECKS: Record<
    ScheduleOrigin,
    (deps: Deps, issue: MagazineIssue) => Promise<ScheduleFailure | null>
  > = {
    schedule: async () => null,
    auto: async (deps, issue) =>
      (await autoPublishAllowed(deps.db, requireRelationId(issue.magazine))) ? null : "auto_off",
  };
  ```
  and returns `origin: issue.scheduledVia ?? "schedule"`. It never queries the settings table itself.

- [ ] **Step 1: Write the failing tests** in `issue-service.integration.test.ts` (existing fixture; an issue with one approved article and one editorial):
  - `it("an automatic schedule is recorded as automatic")`: `scheduleIssue(…, at(60*24), …, at(0), { via: "auto" })` → `scheduledVia: "auto"`; without opts → `"schedule"`; `unscheduleIssue` and `publishIssue` leave `scheduledVia` null.
  - `it("a person's edit stops the automatic publish")`: auto-scheduled issue; `setIssueItems` by the editor (one item removed) → `status: "draft"`, `scheduledFor`, `scheduledBy`, `scheduledVia` null, items saved; history from `listIssueHistory` (`created_at DESC, id DESC`; both rows share `created_at`, so the `id` tie-break decides) `auto_publish_stopped { why: "edited" }` then `items_changed { itemCount: 1 }`, both with the editor as actor. Same for `updateIssueDetails({ title })` (only `auto_publish_stopped`).
  - `it("the auto-drafter's own save does not stop it")`: same with `actor.via = "auto"` → still `scheduled`, `scheduledVia: "auto"`, no history rows.
  - `it("a person's schedule is not touched by edits")`: `via` default → after `setIssueItems` still `scheduled` (slice 4 behaviour).
  - `it("stopping an automatic publish is in the history")`: `unscheduleIssue` by the editor → `auto_publish_stopped { why: "stopped" }` actor editor; `unscheduleIssue(…, null, { failure: "auto_off" })` → `auto_publish_stopped { why: "failed", failure: "auto_off" }` actor null; unscheduling a person's schedule writes no row.
  - `it("history says how and by whom an issue went out or was deleted")`: button publish → `published { origin: "button" }` actor owner; `publishIssue(…, { origin: "auto" })` → actor null; `deleteDraftIssue` by the editor succeeds and leaves one `deleted` row with `issue_id` null afterwards (set null by the delete), `issue_title` and `issue_number` kept, actor editor; `deleteDraftIssue` with `{ ...actor, via: "auto" }` succeeds and writes no row.
  - `it("many quick saves make one history line")`: two `setIssueItems` by editor A in a row → one `items_changed` row; a save by editor B → a second row; another save by B → still two; backdate B's row by 61 minutes with SQL (`UPDATE "app"."magazine_issue_history" SET "created_at" = …`), then a save by B → a third row.
  - `it("creates a draft with the given layout and visibility")`: `createIssue(…, { visibility: { visibility: "public", publicConfirmedBy: "u1", publicConfirmedAt: T } })` → the issue carries that record; without opts → the magazine default, as today.
- [ ] **Step 2: Add to `scheduled-publishing.integration.test.ts`:**
  - `it("publishes an automatic schedule as automatic")`: settings row `when_ready = 'auto_publish'`; auto-scheduled issue due at `at(0)`; `publishDueIssues(deps, at(5))` → `published: 1`, `publishedVia: "auto"`, history `published { origin: "auto" }` with actor null.
  - `it("switching settings off auto-publish fails the automatic schedule")`: settings `notify`; → `failed: 1`, issue `draft`, every editor gets `magazine_issue_schedule_failed` with `extra.reason === "auto_off"`; history `auto_publish_stopped { why: "failed", failure: "auto_off" }` actor null.
  - `it("an automatic schedule still needs the person's edit rights")`: settings `auto_publish`; the issue's `scheduled_by` is set (SQL) to an **appointed editor** (not the owner: owners keep `edit` through community leadership), then that editor's `magazineStaff` row is deleted, as in the existing no-rights test → `no_rights` (not `auto_off`).
- [ ] **Step 3: `notifications.test.ts`:** `notifyScheduleFailed` with `reason: "auto_off"` writes the English content above with the magazine name.
- [ ] **Step 4: Run** `<DB prefix> pnpm vitest run src/server/magazines/issue-service.integration.test.ts src/server/magazines/scheduled-publishing.integration.test.ts` and `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/notifications.test.ts` → FAIL.
- [ ] **Step 5: Implement** `issue-history.ts` and the service, publisher and notice changes. History inserts use `tx.execute(payloadSql\`INSERT INTO "app"."magazine_issue_history" …\`)`like`recordIssueAnnouncement`; the issue snapshot comes from the written issue (`Number(number)`, `title`).
- [ ] **Step 6: Run** the commands of Step 4, then the whole magazine DB suite `<DB prefix> pnpm vitest run src/server/magazines src/server/api/routers/magazines.integration.test.ts` → PASS (slice 1–4 behaviour unchanged).
- [ ] **Step 7: Commit:** `feat(magazines): automatic schedules stop on a person's edit; issue history`.

---

## Task 3: A suggester for every item kind

**Files:**

- Create: `src/server/magazines/items/suggesters.ts`, `src/server/magazines/items/{article,storyline,newsItem,event,forumThread,launchpadProject,editorial}/suggest.ts` (the `editorial` folder's file exports the `welcome` source)
- Modify: `src/server/magazines/items/types.ts`, `src/server/magazines/items/registry.ts`, `src/server/magazines/items/pickers.ts`, `src/server/magazines/items/context.ts`, `src/server/magazines/items/launchpadProject/scope.ts`, `src/server/magazines/magazine-articles.ts`, `src/server/magazines/magazine-service.ts`, `src/server/magazines/reading.ts`, `src/server/news/storylines.ts`, `src/server/news/list.ts`, `messages/{en,nl}.json`
- Test: `src/server/magazines/items/suggesters.test.ts`, `src/server/magazines/items/suggesters.integration.test.ts`

**Interfaces:**

- Consumes: `SuggestionReason`, `AUTO_DRAFT_SOURCES`, `AutoDraftSourceId`, `SourceKind` (Task 1), `SuggestWindow`, `EVENT_COMING_UP_DAYS`; `communityContentWhere`, `forumThreadCommunityWhere` (`src/server/communities/forum-scope.ts`), `communityProjectWhere` (`items/launchpadProject/scope.ts`), `eventRegistrations`, `communityMemberships` (`schema.ts`), `plainTextToLexical` (`src/server/challenge-engine/lexical.ts`), `normalizeTopics`, `PickerContext`, `itemContextFor`; in `storylines.ts` the private `publicStoryline`, `storylineScore`, `latestAt`; `escapeLike`. (Not `PUBLICLY_LISTED_EVENT_STATUSES`: it includes `cancelled`; use `DRAFTABLE_EVENT_STATUSES`.)
- Produces (`magazine-service.ts`): `export function magazineTopicsOf(magazine: Magazine): string[]` — the private `topicsOf` of `reading.ts` moved here unchanged (flattens `{ topic }[]`, drops blanks, keeps case and order); `reading.ts` imports it instead.
- Produces (`magazine-articles.ts`):
  ```ts
  /** Same filter as listAvailableArticles, waiting longest first (sort "updatedAt", then id). */
  export async function listApprovedArticlesOldestFirst(
    payload: PayloadClient,
    magazineId: number,
    viewerId: string,
    exclude: readonly number[],
    limit: number,
  ): Promise<AvailableMagazineArticle[]>;
  ```
- Produces (`launchpadProject/scope.ts`): `communityProjectWhere(deps, community, query, exclude, limit, updatedSince?: Date)` — when given, `and "launchpad_projects"."updated_at" >= ${updatedSince}` inside the member-project SQL (before `order by vote_count desc limit`), and `{ updatedAt: { greater_than_equal: updatedSince.toISOString() } }` and-ed onto the returned `Where`. Existing callers unchanged.
- Produces (`items/event/suggest.ts`): `export const DRAFTABLE_EVENT_STATUSES = ["published", "completed"] as const;` and
  ```ts
  /** Community events (draft: false, status in DRAFTABLE_EVENT_STATUSES) whose end — the start of the UTC day
   *  after (endDate ?? date) — lies in [since, until]; oldest end first, then id. */
  export async function endedCommunityEvents(
    deps: Pick<Deps, "payload">,
    community: ItemCommunity,
    since: Date,
    until: Date,
  ): Promise<{ id: number; endsAt: Date }[]>;
  ```
- Produces (`items/context.ts`):
  ```ts
  export function suggestContextFor(
    deps: Deps,
    opts: {
      magazine: Magazine;
      community: ItemCommunity & { name: string };
      viewerId: string;
      locale: AppLocale;
      now: Date;
    },
  ): SuggestContext; // topics = normalizeTopics(magazineTopicsOf(magazine)); magazineId = magazine.id
  ```
- Produces (`storylines.ts`):
  ```ts
  /** Public storylines whose en/nl title or overview contains a topic, latest source at or after `since`;
   *  latestAt desc, score desc, slug. `matchedTopic` = the first topic, in the given order, that matches. */
  export async function suggestPublicStorylines(
    input: {
      topics: readonly string[];
      since: Date;
      limit: number;
      exclude: readonly string[];
    },
    database?: typeof db,
  ): Promise<(StorylineCard & { matchedTopic: string })[]>;
  ```
- Produces (`list.ts`):
  ```ts
  /** News items published in [since, until] whose title or summary contains a topic; publishedAt desc, id. */
  export async function suggestNewsItems(
    input: {
      topics: readonly string[];
      since: Date;
      until: Date;
      limit: number;
      exclude: readonly string[];
    },
    database?: typeof db,
  ): Promise<(NewsListItem & { matchedTopic: string })[]>;
  ```
  Both return `[]` for an empty `topics` without querying. Topic match: `or(...topics.map(t => ilike(col, \`%${escapeLike(t)}%\`)))`; `matchedTopic`through a`CASE WHEN … THEN <topic>` in topic order.
- Produces (`types.ts`):
  ```ts
  /** viewerId = the acting person (the caller in "Add more", actingUserId in the drafter); openHref follows it. */
  export type SuggestContext = PickerContext & {
    community: ItemCommunity & { name: string };
    /** The magazine's topics, normalized (trimmed, lower-case). */
    topics: readonly string[];
    now: Date;
  };
  export type SuggestConfig = { limit: number; exclude: readonly string[] };
  export type SuggestionSourceCandidate<Input> =
    PickerSourceCandidate<Input> & { reason: SuggestionReason };
  export interface ItemSuggestionSource<Input> {
    // countsTowardMinimum lives in AUTO_DRAFT_SOURCES (lib), not here.
    /** Best first, at most config.limit, never a reference in config.exclude. Deterministic. */
    suggest(
      ctx: SuggestContext,
      window: SuggestWindow,
      config: SuggestConfig,
    ): Promise<SuggestionSourceCandidate<Input>[]>;
  }
  ```
- Produces (`registry.ts`): `export function referenceOfInput<K extends ItemKindId>(kind: K, input: InputOf<K>): string | null` (`toStored` then `referenceOf`); `searchPickerCandidates` uses it (behaviour unchanged). `export function referencesOfBlocks(blocks: StoredBlock[]): string[]` (the private `referenceOfBlock` over every block, nulls dropped); `validateIssueItems` reuses it where it collects previous references (behaviour unchanged).
- Produces (`suggesters.ts`):
  ```ts
  export const ITEM_SUGGESTERS: {
    [S in AutoDraftSourceId]: ItemSuggestionSource<InputOf<SourceKind<S>>>;
  };
  export type SuggestedCandidate<Input> = SuggestionSourceCandidate<Input> & {
    reference: string | null;
  };
  export async function suggestCandidates<S extends AutoDraftSourceId>(
    source: S,
    ctx: SuggestContext,
    window: SuggestWindow,
    config: SuggestConfig,
  ): Promise<SuggestedCandidate<InputOf<SourceKind<S>>>[]>; // reference via referenceOfInput(AUTO_DRAFT_SOURCES[source].kind, input)
  ```
- Rules: Decision 2 for every source. Facts and `openHref` as the kind's picker gives them (same `CandidateFact`s; the article suggester uses `listApprovedArticlesOldestFirst(…, ctx.viewerId, …)` and the article picker's `openHref` rule); storyline titles in `ctx.locale` as the picker does. The launchpad suggester passes `window.since` as `updatedSince`. The event suggester uses `endedCommunityEvents` for its recap half. The welcome input: `{ kind: "editorial", heading: "Welcome to our new members", body: plainTextToLexical("{count} people joined {community} since {date}. Say hello!") }` built with the English translator of `magazineEditor.autoDraft.welcome.{heading,body}` (date `en-GB` `dateStyle: "long"`, `timeZone: "Europe/Amsterdam"`); title = the heading.

- [ ] **Step 1: Write the failing unit test** `suggesters.test.ts`: `it("every source has a suggester")` (`Object.keys(ITEM_SUGGESTERS).sort()` equals `[...AUTO_DRAFT_SOURCE_IDS].sort()`); `it("every item kind has a source")` (the set of `AUTO_DRAFT_SOURCES[s].kind` equals `Object.keys(ITEM_KINDS)`).
- [ ] **Step 2: Write the failing DB tests** `suggesters.integration.test.ts` (fixture: listed community with owner and members, its magazine, `now = at(0)` = `2026-10-27T12:00:00Z`, `window = { since: at(-60*24*30), until: at(0) }`, the suggest context from `suggestContextFor` with the owner as viewer). **Global rows** (news items, storylines) are shared with other tests in `aitcom_test`, so every topic and matching title uses the fixture suffix: topics `[\`agents${suffix}\`, \`robotics${suffix}\`]`, titles like `\`AI agents${suffix} at work\``. Event days are UTC midnights relative to `startOfToday = 2026-10-27T00:00:00Z`:
  - `it("suggests approved articles that waited longest first")`: three approved unplaced articles with `updatedAt` 3, 2, 1 days ago, one placed, one `pending` → the three in age order; reason `waitingSince` with each `updatedAt`; `exclude: ["article:<oldest id>"]` leaves two; `limit: 1` → one; an article written by the viewer carries `openHref` = `magazineArticleEditPath(slug, articleSlug)`, others `null`.
  - `it("puts coming events first, then past ones by how many went")`: events with `date` today (`+0d`), `+2d`, `+40d` (outside), `−3d` with one `registered` row, `−5d` with three rows (`registered`, `attended`, `cancelled`), one `cancelled` event at `−4d`, one event of another community at `−2d`. Expected, exactly: `[+0d (eventComingUp), +2d (eventComingUp), −5d (eventRecap, going: 2), −3d (eventRecap, going: 1)]`. (Today's event is coming up, not a recap.)
  - `it("an event has ended only after its last day")`: `endedCommunityEvents` at `now = 2026-10-27T12:00:00Z`: an event with `date` `2026-10-27` → not included; `date` `2026-10-26` → included with `endsAt = 2026-10-27T00:00:00Z`; `date` `2026-10-25`, `endDate` `2026-10-27` → not included.
  - `it("ranks threads by replies inside the window")`: threads with replies 9 (active `−40d`, outside), 5, 5 (more views), 2, one deleted → `[5 (more views), 5, 2]`; reason `mostReplies`.
  - `it("ranks projects by upvotes inside the window")`: community project 7 votes, unscoped project of an active member 9 votes, unscoped of a non-member 20 votes, an unpublished one → `[9, 7]`; reason `mostUpvotes`.
  - `it("old popular projects do not crowd out recent ones")`: with `limit: 1`, an unscoped member project with 50 votes updated `−40d` (outside) and one with 3 votes updated `−1d` → `[3]`.
  - `it("welcomes new members with a count, never names")`: two `active` members joined inside the window, one `active` before it, one `pending_approval` and one `invited` inside it → one candidate, reason `{ newMembers, count: 2 }`, heading "Welcome to our new members", body text contains "2 people joined" and none of the members' names; no joiners → `[]`.
  - `it("gives the same answer every time")`: calling each suggester twice returns deep-equal lists.
  - `it("suggests storylines that match a topic and moved recently")`: public storylines titled `AI agents${suffix} at work` (latest valid source `−2d`), `Robotics${suffix} weekly` (`−1d`), `Agents${suffix} of change` (latest `−40d`, outside), `Gardening${suffix}` (`−1d`), a draft storyline about `agents${suffix}` → exactly `[Robotics… (topic robotics${suffix}), AI agents… (topic agents${suffix})]`.
  - `it("suggests news headlines that match a topic inside the window")`: headlines matching in title, matching only in summary, outside the window, not matching → exactly the two matching ones inside the window, newest first; `exclude` respected.
  - `it("suggests no news for a magazine without topics")` → `[]` from both news suggesters.
- [ ] **Step 3: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/items/suggesters.test.ts` and `<DB prefix> pnpm vitest run src/server/magazines/items/suggesters.integration.test.ts` → FAIL.
- [ ] **Step 4: Implement** the types, `referenceOfInput`, `referencesOfBlocks`, `magazineTopicsOf` (move), `suggestContextFor`, `listApprovedArticlesOldestFirst`, `communityProjectWhere`'s `updatedSince`, `endedCommunityEvents`, the two news functions, the seven suggesters and `suggesters.ts`. Event registrations are counted in one grouped Drizzle query for the loaded event ids; ties after counts break on id. The welcome copy goes in `magazineEditor.autoDraft.welcome.{heading,body}` (en + nl).
- [ ] **Step 5: Run** both commands, plus `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/items src/server/news src/i18n` → PASS.
- [ ] **Step 6: Commit:** `feat(magazines): a suggester for every item kind`.

---

## Task 4: Automatic-draft settings: service and API

**Files:**

- Create: `src/server/magazines/auto-draft/window.ts`, `src/server/magazines/auto-draft/runs.ts` (only `findOpenAutoDraft` in this task); extend `src/server/magazines/auto-draft/settings.ts` (created in Task 2)
- Modify: `src/server/api/routers/magazines.ts`, `src/server/api/routers/magazines.integration.test.ts`, `src/lib/magazines/paths.ts`
- Test: `src/server/magazines/auto-draft/settings.integration.test.ts`, `src/lib/magazines/paths.test.ts`

**Interfaces:**

- Consumes: Task 1 values and tables; `planVisibilityChange`; `unscheduleIssue`, `IssueActor` (Task 2); `nextDraftAt`, `lookBackWindow`.
- Produces (`window.ts`): `export async function suggestWindowFor(deps: Deps, magazineId: number, lookBack: AutoDraftLookBack, now: Date): Promise<SuggestWindow>` — `lookBackWindow(lookBack, <publishedAt of the magazine's latest published issue, or null>, now)`. Used by Tasks 5 and 6.
- Produces (`settings.ts`):
  ```ts
  export type StoredAutoDraftSettings = AutoDraftSettings & {
    scheduleStartsAt: Date | null;
    updatedBy: string | null;
  };
  /** The saved row merged over DEFAULT_AUTO_DRAFT_SETTINGS (resolveSources for sources); defaults when there is none. */
  export async function readAutoDraftSettings(
    db: Deps["db"],
    magazineId: number,
  ): Promise<StoredAutoDraftSettings>;
  /** Upsert. Visibility: null clears confirmations; a value goes through planVisibilityChange against the saved record
   *  (refusal codes CONFIRM_UNLISTED_PUBLIC / UNLISTED_PUBLIC_LEADERS_ONLY as magazineError). scheduleStartsAt = now when
   *  enabled turns on or cadence/monthDay/weekday change while enabled; null when disabled; else kept. updatedBy = actor.
   *  Afterwards, when the saved whenReady is "notify": if findOpenAutoDraft returns an issue with status "scheduled"
   *  AND scheduledVia "auto", stops it through unscheduleIssue as the actor (ISSUE_CHANGED / ISSUE_NOT_SCHEDULED ignored).
   *  A person's schedule (scheduledVia "schedule" or null) is never touched, even on the automatic draft itself. */
  export async function saveAutoDraftSettings(
    deps: Deps,
    magazine: Magazine,
    input: AutoDraftSettingsInput,
    actor: IssueActor & { leadsCommunity: boolean },
    now?: Date,
  ): Promise<StoredAutoDraftSettings>;
  ```
  Note: "Make a draft now" works whether `enabled` is on or off, so the open automatic schedule is stopped only when `whenReady` becomes `"notify"`.
  Also in `settings.ts` (the only reader of the table, Decision 4):
  ```ts
  export type DueAutoDraftSettings = StoredAutoDraftSettings & { magazineId: number; communityId: string; lastRunAt: Date | null };
  /** Enabled rows with a cadence other than on_demand, a non-null scheduleStartsAt and updatedBy, of magazines whose
   *  community is not deleted; ordered by the magazine's latest run claimedAt (nulls first), then magazineId. */
  export async function listDueAutoDraftSettings(db: Deps["db"]): Promise<DueAutoDraftSettings[]>;
  ```
- Produces (`runs.ts`): `export async function findOpenAutoDraft(deps: Deps, magazineId: number): Promise<MagazineIssue | null>` (Decision 7: an issue named by **any** run of this magazine (`issue_id` non-null) whose status is `draft` or `scheduled`; newest run first).
- Produces (`paths.ts`): `export function magazineAutoDraftPath(communitySlug: string): string` → `${communityMagazinePath(slug)}/auto-draft`.
- Produces (router; add to `PROCEDURE_CAPABILITY` and the gate test's `calls`):
  - `autoDraftSettings: editorProcedure.input({ slug })` → `null` without a magazine, else `{ settings: AutoDraftSettings; nextDraftAt: string | null; canManage: boolean; magazineDefaultVisibility: IssueVisibility; hasTopics: boolean; communityIsPrivate: boolean; community: { slug: string; isListedInDirectory: boolean } }` (`canManage = standingCan(ctx.standing, "manage")`; `hasTopics = normalizeTopics(magazineTopicsOf(magazine)).length > 0`).
  - `saveAutoDraftSettings: managerProcedure.input(autoDraftSettingsInput.extend({ slug: z.string() }))` → `AutoDraftSettings`. Calls `saveAutoDraftSettings(depsOf(ctx), requireMagazine(ctx.magazine), input, { ...actorOf(ctx), leadsCommunity: ctx.standing.leadsCommunity })` (NOT_FOUND without a magazine; the same pattern as `saveSettings` and `updateIssue`).

- [ ] **Step 1: Write the failing DB tests** `settings.integration.test.ts`:
  - `it("reads defaults until saved")`: `readAutoDraftSettings` equals `DEFAULT_AUTO_DRAFT_SETTINGS` with `scheduleStartsAt: null`.
  - `it("saves and reads back every setting")`: a full input round-trips; `updatedBy` = the owner.
  - `it("starts the schedule when switched on or when the day changes")`: enable at `at(0)` → `scheduleStartsAt = at(0)`; save again unchanged at `at(10)` → still `at(0)`; change `monthDay` at `at(20)` → `at(20)`; disable → null.
  - `it("public drafts in an unlisted community need a leader's confirmation")`: unlisted community; `visibility: "public"` without confirmation → `CONFIRM_UNLISTED_PUBLIC`; with `confirmUnlistedPublic` by an appointed editor-in-chief who is not a community leader → `UNLISTED_PUBLIC_LEADERS_ONLY`; by the owner → saved with `publicConfirmedBy` owner; `visibility: null` → confirmations cleared.
  - `it("saving tell-me-only stops a waiting automatic publish")`: a `made` run naming an auto-scheduled issue; save `whenReady: "notify"` → the issue is a `draft` with `scheduledVia` null, history `auto_publish_stopped { why: "stopped" }` by the saver. A person's schedule on another issue is untouched.
  - `it("a person's schedule on the automatic draft itself is untouched")`: a `made` run naming an issue an editor rescheduled by hand (`scheduledVia: "schedule"`); save `whenReady: "notify"` → still `scheduled`, `scheduledVia: "schedule"`, no new history row.
  - `it("lists only settings that can fall due")`: enabled monthly (listed), disabled, `on_demand`, enabled without `updatedBy`, enabled in a deleted community → only the first; `autoPublishAllowed` true only for a row with `auto_publish`, false with no row.
  - `it("looks back from the last published issue")`: `suggestWindowFor` with `since_last_issue` → `since` = the latest published issue's `publishedAt` (a later draft is ignored); with no published issue → `now − 30 days`.
- [ ] **Step 2: Extend `magazines.integration.test.ts`:** `PROCEDURE_CAPABILITY` gains `autoDraftSettings: "edit"`, `saveAutoDraftSettings: "manage"`; `calls` gains both. Plus `it("an editor sees the settings but cannot save them")`: an appointed `editor` gets `canManage: false` and FORBIDDEN on save.
- [ ] **Step 3: `paths.test.ts`:** `magazineAutoDraftPath("night-owls") === "/communities/night-owls/magazine/auto-draft"`.
- [ ] **Step 4: Run** `<DB prefix> pnpm vitest run src/server/magazines/auto-draft src/server/api/routers/magazines.integration.test.ts` and `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines/paths.test.ts` → FAIL; implement; run again → PASS.
- [ ] **Step 5: Commit:** `feat(magazines): automatic-draft settings with the unlisted opt-in`.

---

## Task 5: "Add more" shows suggestions first

**Files:**

- Modify: `src/server/magazines/items/pickers.ts`, `src/server/api/routers/magazines.ts`
- Test: `src/server/magazines/items/pickers.test.ts`, `src/server/api/routers/magazines.integration.test.ts`

**Interfaces:**

- Consumes: `suggestCandidates`, `SuggestContext`, `suggestContextFor`, `referenceOfInput`, `AUTO_DRAFT_SOURCES`, `AUTO_DRAFT_SOURCE_ORDER` (Tasks 1, 3); `readAutoDraftSettings`, `suggestWindowFor` (Task 4); `searchPickerCandidates`.
- Produces (`pickers.ts`):
  ```ts
  export type PickerSuggestion = { reason: SuggestionReason | null };
  export type SuggestionLoader = () => Promise<{ ctx: SuggestContext; window: SuggestWindow }>;
  /** Empty query: calls loadSuggestion once, asks every source of this kind (AUTO_DRAFT_SOURCE_ORDER entries whose
   *  AUTO_DRAFT_SOURCES[s].kind === kind) for suggestions (limit PICKER_LIMIT, the same exclude), then the plain search,
   *  de-duplicated by reference (the suggestion wins; when its openHref is null it takes the search entry's openHref),
   *  at most PICKER_LIMIT in all. Non-empty query: searchPickerCandidates unchanged, reason null, loadSuggestion never called. */
  export async function pickerCandidatesFor<K extends PickableKindId>(
    kind: K,
    query: string,
    ctx: PickerContext,
    exclude: readonly string[],
    loadSuggestion: SuggestionLoader,
  ): Promise<(PickerCandidate<InputOf<K>> & PickerSuggestion)[]>;
  ```
- Router: `pickerCandidates` calls `pickerCandidatesFor` with a loader that builds the context with `suggestContextFor(depsOf(ctx), { magazine, community: { ...communityOf(ctx), name: ctx.community.name }, viewerId: ctx.session.user.id, locale: routing.defaultLocale, now })` and the window with `suggestWindowFor(deps, magazine.id, (await readAutoDraftSettings(db, magazine.id)).lookBack, now)`.

- [ ] **Step 1: Write the failing unit test** `pickers.test.ts` (suggester and search mocked with `vi.mock("./suggesters")` and a stubbed `ITEM_PICKERS.forumThread.search`; `loadSuggestion` is a `vi.fn`): `it("puts suggestions first and fills up with search")` (suggestions A, B; search B, C, D → A, B (reasons), C, D (`reason: null`)); `it("a duplicate keeps the search entry's open link")` (suggestion B with `openHref: null`, search B with `openHref: "/x"` → B has the reason and `openHref: "/x"`); `it("keeps the limit")` (13 suggestions → 12, no search call); `it("a typed search does not ask for suggestions")` (`loadSuggestion` not called, suggesters not called).
- [ ] **Step 2: Add to `magazines.integration.test.ts`:** `it("Add more lists suggestions first, with their reason")`: an empty-query `pickerCandidates({ kind: "forumThread" })` returns the most-replied thread in the window first with `reason.type === "mostReplies"`, then other threads with `reason: null`, no reference twice; a typed query returns `reason: null` for all, in the same order as `searchPickerCandidates`.
- [ ] **Step 3: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/items/pickers.test.ts` and `<DB prefix> pnpm vitest run src/server/api/routers/magazines.integration.test.ts` → FAIL; implement; run again → PASS.
- [ ] **Step 4: Commit:** `feat(magazines): Add more shows suggestions first`.

---

## Task 6: The auto-drafter, its notices and the cron step

**Files:**

- Create: `src/server/magazines/auto-draft/drafter.ts`, `src/server/magazines/auto-draft/picks.ts`
- Modify: `src/server/magazines/auto-draft/runs.ts`, `src/server/magazines/issue-jobs.ts`, `src/server/magazines/notifications.ts`, `src/server/magazines/issue-editing.ts`, `src/server/api/routers/magazines.ts`, `src/server/api/routers/magazines.integration.test.ts`, `src/app/api/cron/magazine-issues/route.test.ts`, `messages/{en,nl}.json`
- Test: `src/server/magazines/auto-draft/drafter.integration.test.ts`, `src/server/magazines/notifications.test.ts`, `src/app/api/cron/magazine-issues/route.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 1–5: `suggestCandidates`, `ITEM_SUGGESTERS`, `AUTO_DRAFT_SOURCES`, `suggestContextFor`, `suggestWindowFor`, `readAutoDraftSettings`, `listDueAutoDraftSettings`, `findOpenAutoDraft`, `createIssue`, `setIssueItems`, `scheduleIssue`, `unscheduleIssue`, `deleteDraftIssue`, `recordIssueHistory`, `validateIssueItems`, `itemContextFor`, `referencesOfBlocks`, `toStoredItems`, `loadMagazineEditorship`, `standingCan`, `listMagazineEditorIds`, `calendarPeriod`, `isPeriodDue`, `endedCommunityEvents`.
- Produces (`runs.ts`):
  ```ts
  export const RUN_STALE_MINUTES = 15;
  export const AUTO_DRAFT_MAX_ATTEMPTS = 3;
  export type RunClaim =
    | { runId: string; leftoverIssueId: number | null } // leftoverIssueId: a re-claimed failed run's issue_id
    | { refused: "already_ran" | "busy" };
  /** Decision 6, in order: stale running → failed; insert; re-claim a failed row of the same period. */
  export async function claimAutoDraftRun(
    db: Deps["db"],
    input: {
      magazineId: number;
      periodKey: string;
      trigger: AutoDraftTrigger;
      requestedBy: string | null;
      now: Date;
    },
  ): Promise<RunClaim>;
  /** Names the run's issue right after createIssue (Decision 6), before any other step. */
  export async function attachRunIssue(db: Deps["db"], runId: string, issueId: number): Promise<void>;
  /** Decision 7: the issue is named by a `made` run. The one definition of "made automatically". */
  export async function isAutoMadeIssue(db: Deps["db"], issueId: number): Promise<boolean>;
  /** (magazine, period) pairs that need no claim: a made or skipped run, or a failed run with attempts >= AUTO_DRAFT_MAX_ATTEMPTS. */
  export async function finishedPeriodKeys(db: Deps["db"], magazineId: number, periodKeys: readonly string[]): Promise<Set<string>>;
  export async function finishAutoDraftRun(
    db: Deps["db"],
    runId: string,
    result:
      | { status: "made"; issueId: number }
      | { status: "skipped"; reason: AutoDraftSkipReason; found: number | null }
      | { status: "failed" },
    now: Date,
  ): Promise<void>;
  /** Event periods not yet finished: `event:<id>` for each event of endedCommunityEvents(deps, community,
   *  max(now − AFTER_EVENT_LOOK_BACK_DAYS days, scheduleStartsAt), now) (Decision 5), oldest endsAt first,
   *  minus finishedPeriodKeys. No event query of its own. */
  export async function pendingEventPeriods(
    deps: Deps,
    input: {
      magazineId: number;
      community: ItemCommunity;
      scheduleStartsAt: Date;
      now: Date;
    },
  ): Promise<string[]>;
  ```
- Produces (`picks.ts`):
  ```ts
  export async function saveAutoPicks(
    db: Deps["db"],
    issueId: number,
    picks: { itemId: string; reason: SuggestionReason }[],
  ): Promise<void>;
  /** Null unless isAutoMadeIssue (runs.ts); else reasons by block id from the pick rows (unknown reasons dropped). */
  export async function loadAutoDraftForIssue(
    db: Deps["db"],
    issueId: number,
  ): Promise<{ reasons: Record<string, SuggestionReason> } | null>;
  ```
- Produces (`drafter.ts`):
  ```ts
  export const AUTO_DRAFT_RUNS_PER_PASS = 5;
  export type AutoDraftOutcome =
    | {
        status: "made";
        issueId: number;
        itemCount: number;
        goesOutAt: string | null;
      }
    | {
        status: "skipped";
        reason: AutoDraftSkipReason;
        found: number | null;
        needed: number | null;
        openIssueId: number | null;
      }
    | { status: "already_ran" }
    | { status: "busy" };
  /** One claimed attempt (Decisions 6–9). Throws only after marking the run failed. */
  export async function makeAutoDraft(
    deps: Deps,
    input: {
      magazine: Magazine;
      community: MagazineCommunity & { name: string };
      periodKey: string;
      trigger: AutoDraftTrigger;
      /** The person whose edit rights the run uses: the presser, or settings.updatedBy. */
      actingUserId: string | null;
      requestedBy: string | null;
      now: Date;
    },
  ): Promise<AutoDraftOutcome>;
  /** The cron step. For each row of listDueAutoDraftSettings: the calendar period (calendarPeriod + isPeriodDue) or the
   *  pendingEventPeriods; skips any key in finishedPeriodKeys before claiming. Stops after AUTO_DRAFT_RUNS_PER_PASS
   *  successful claims (an already_ran/busy answer does not count). Each makeAutoDraft is wrapped in its own try/log
   *  ("[magazines] automatic draft failed", magazine id) so one failure never stops the others. Never reads the settings table itself. */
  export async function runDueAutoDrafts(
    deps: Deps,
    now: Date,
  ): Promise<{ drafted: number; skipped: number }>;
  ```
  `makeAutoDraft` order:
  1. **Claim** (`claimAutoDraftRun`). Refused → `already_ran` / `busy`.
  2. **Leftover of a crashed attempt** (`leftoverIssueId` non-null; Decision 6): load it; `draft` → `deleteDraftIssue` with `via: "auto"`; `scheduled` with `scheduledVia "auto"` → `unscheduleIssue` (actor `via: "auto"`), then delete; missing → nothing; anything else → `finishAutoDraftRun(made, that id)` and return `made` for it, no notice, no history.
  3. **Rights:** `actingUserId` has `edit` (else `skipped no_rights`; notice only when `trigger !== "manual"`).
  4. **Open draft:** `findOpenAutoDraft` (else `skipped draft_open`, no notice).
  5. **Inputs:** settings (`readAutoDraftSettings`), window (`suggestWindowFor(deps, magazine.id, settings.lookBack, now)`), context (`suggestContextFor(deps, { magazine, community, viewerId: actingUserId, locale: routing.defaultLocale, now })`), exclude = (`neverReuse` ? `referencesOfBlocks` of every other issue of the magazine : `[]`) plus the references already chosen in this run.
  6. **Pick:** for each source in `AUTO_DRAFT_SOURCE_ORDER` with `enabled`: `suggestCandidates(source, ctx, window, { limit: max, exclude })` → drop candidates `validateIssueItems` finds a problem with (editor context from `itemContextFor` with `viewerId: ctx.viewerId`, `issueId: null`) → `found` = the kept candidates of sources with `AUTO_DRAFT_SOURCES[s].countsTowardMinimum`; `found < AUTO_DRAFT_MIN_ITEMS` → `skipped too_few` with `found`, `needed` (notice only when `trigger !== "manual"`).
  7. **Create:** `createIssue(deps, magazine, { title }, actor, { layout, visibility })`, `title` from `magazineEditor.autoDraft.issueTitle` ("Issue of {date}", English translator, `en-GB` long date of `now`, Amsterdam), `visibility` = the settings record when `settings.visibility` is set, else omitted → **at once** `attachRunIssue(db, runId, issue.id)`.
  8. **Fill:** `setIssueItems(deps, issue, inputs, issue.updatedAt, actor)` with `actor.via = "auto"` → `saveAutoPicks` (saved block ids in order). If either throws: `deleteDraftIssue(issue, { ...actor, via: "auto" })`, `finishAutoDraftRun(failed)`, rethrow.
  9. **Schedule** when `whenReady = "auto_publish"`: `scheduleIssue(deps, saved, now + autoPublishDays days, saved.updatedAt, actor, now, { via: "auto" })`. If it throws (a refusal, for example `assertPublishable`): log it, keep the draft, `goesOutAt = null`.
  10. **Finish:** `finishAutoDraftRun(made)` → history `draft_made` → `notifyAutoDraftReady` (the notify-only text when `goesOutAt` is null).
  History rows of the drafter (`draft_made`, `draft_skipped`) are written through `inPayloadTransaction` with actor `trigger === "manual" ? requestedBy : null` (Decision 8). Every `skipped` writes `draft_skipped`.
- Produces (`notifications.ts`), English, to `listMagazineEditorIds`:
  - `notifyAutoDraftReady(db, { editorIds, magazineName, issue: { id, title }, itemCount, goesOutAt: string | null, community })` → type `magazine_auto_draft_ready`; title "A new draft of {magazine} is ready"; content (notify) "We picked {count} things for you. Check the draft and publish it when you are happy."; content (auto) "We picked {count} things for you. It goes out by itself on {date} unless you stop it. Any change you make stops that."; link `issueBuilderPath`, label "Open the draft".
  - `notifyAutoDraftSkipped(db, { editorIds, magazineName, reason: "too_few" | "no_rights", found, needed, community })` → type `magazine_auto_draft_skipped` (the drafter never calls it for a manual run); title "No new draft of {magazine} this time"; `too_few`: "We found only {found} things to put in it, and a draft needs at least {needed}. Switch on more kinds of content, look back further, or add topics to your magazine."; `no_rights`: "The person who set up automatic drafts can no longer edit the magazine. Save the automatic draft settings again to restart them."; link `magazineAutoDraftPath`, label "Open automatic drafts".
- Produces (`issue-jobs.ts`): `IssueJobsResult` gains `drafted: number; skipped: number` (0 by default); `runDueAutoDrafts` runs first in its own `try`/log `"[magazines] automatic drafts failed"`.
- Produces (`issue-editing.ts`): `IssueEditorView` gains `autoDraft: { reasons: Record<string, SuggestionReason> } | null` from `loadAutoDraftForIssue`.
- Produces (messages): `magazineEditor.autoDraft.issueTitle` = "Issue of {date}" (en) and the Dutch equivalent (nl).
- Router (add to `PROCEDURE_CAPABILITY` and `calls`): `makeAutoDraftNow: editorProcedure.input({ slug })` → `AutoDraftOutcome` (`requireMagazine(ctx.magazine)` → NOT_FOUND; period `manual:<crypto.randomUUID()>`, trigger `manual`, acting and requested by the caller, community `{ ...communityOf(ctx), name: ctx.community.name }`); `autoDraftHistory: editorProcedure.input({ slug })` → `IssueHistoryEntry[]` (`[]` without a magazine).

- [ ] **Step 1: Write the failing DB tests** `drafter.integration.test.ts` (fixture: listed community, magazine with topics `[\`agents${suffix}\`]`, saved settings enabled monthly day 1 with `scheduleStartsAt = 2026-10-01T12:00:00Z` (noon, so the October period, due at midnight, never counts), sources `storyline` and `newsItem` **switched off** (global rows in the shared test DB must not change the counts), an **appointed editor** as `updatedBy` (so the no-rights test can remove them); content: 2 approved articles, 2 threads with replies, 1 coming event, 1 new member; `now = 2026-11-01T06:00:00Z` unless stated):
  - `it("makes one normal draft with reasons and tells the editors")`: `runDueAutoDrafts` → `{ drafted: 1, skipped: 0 }`; one draft issue, layout and visibility from settings, title "Issue of 1 November 2026", items in `AUTO_DRAFT_SOURCE_ORDER` (articles, event, threads, welcome last); `loadIssueEditorView(…).autoDraft.reasons` has one reason per saved block id; history `draft_made { trigger: "schedule", itemCount: 6, goesOutAt: null }` actor null; every editor has one `magazine_auto_draft_ready` notice linking the builder; the issue's `items_changed` history is empty (the auto-drafter is not a person).
  - `it("a second pass in the same period does nothing")`: run again at `+5 min` → `{ drafted: 0, skipped: 0 }`, still one issue, still one notice each.
  - `it("two runs at once make one draft")`: `Promise.all([runDueAutoDrafts(deps, now), makeAutoDraft(… manual …)])` → exactly one issue was created; the other outcome is `busy` or `skipped draft_open`.
  - `it("make a draft now while a draft is open makes none")`: after the first draft, `makeAutoDraft` manual by the editor → `{ status: "skipped", reason: "draft_open", openIssueId: <first> }`; no notice; history `draft_skipped { reason: "draft_open" }` with the editor as actor. Then publish the open draft at `now + 1 min` and seed 2 new threads with replies and 1 new approved article, all dated after that `publishedAt` (the look-back `since_last_issue` now starts there); a manual run at `now + 10 min` makes a new draft of exactly those 3 items, none a reference of the first issue (`neverReuse`), history `draft_made { trigger: "manual" }` with the editor as actor.
  - `it("too few things makes no draft and tells the editors once")`: only one thread in the window and no articles/events/new members → `skipped too_few { found: 1, needed: 3 }`, one `magazine_auto_draft_skipped` notice per editor; a second pass in the period → no new notice; the welcome block alone never makes a draft (`found` counts only counting sources).
  - `it("a manual run with too little tells only the presser")`: same content, three manual runs → three `{ status: "skipped", reason: "too_few" }` outcomes, **no** `magazine_auto_draft_skipped` notice for anyone, three `draft_skipped` rows with the presser as actor.
  - `it("a run without edit rights makes no draft and tells the editors")`: delete the `updatedBy` editor's `magazineStaff` row (an appointed editor, not a leader) → `skipped no_rights`, notice per remaining editor.
  - `it("a pass is not used up by periods that already ran")`: 6 magazines due, 5 of them with a `made` run for the current period → the sixth is drafted in one pass (`drafted: 1`).
  - `it("auto-publish schedules the draft to go out after N days")`: settings `auto_publish`, 3 days → issue `scheduled`, `scheduledVia: "auto"`, `scheduledFor = now + 3 days`, notice text contains "goes out by itself on 4 November 2026"; `runMagazineIssueJobs` at `now + 3 days + 5 min` publishes it with `publishedVia: "auto"`.
  - `it("not due yet, or switched off, or on demand, makes nothing")`: `now = 2026-10-31T06:00:00Z` (the October period fell due before `scheduleStartsAt`); settings disabled; cadence `on_demand` → `{ drafted: 0, skipped: 0 }`, no run rows.
  - `it("after each event makes one draft per ended event")`: cadence `after_event`; an event whose only day was yesterday (`date = 2026-10-31`, so ended at `2026-11-01T00:00:00Z`) → one draft for `event:<id>`; an event with `date = 2026-11-01` (today, still on) → no period; a second pass → nothing; a cancelled event → nothing.
  - In its own file `src/server/magazines/auto-draft/drafter-failure.integration.test.ts` (so the mocks touch no other test), the same fixture. Mock `../issue-service` and `./picks` with `vi.mock(…, async (importOriginal) => …)` wrappers whose behaviour each test sets through a hoisted `vi.hoisted` switch (default: call the real function):
    - `it("a failed save leaves no half-made draft and can be tried again")`: `setIssueItems` throws once → the cron pass does not reject (the step logs), no issue of the magazine remains, no `deleted` history row, the run is `failed` with `attempts: 1`; the next pass makes the draft, the run is `made` with `attempts: 2`.
    - `it("a failed pick save leaves no half-made draft")`: `saveAutoPicks` throws once → same expectations.
    - `it("a refused schedule keeps the draft and tells the editors")`: settings `auto_publish`; `scheduleIssue` throws `magazineError("ISSUE_EMPTY")` → the run is `made`, the issue is a `draft` with `scheduledVia` null, history `draft_made { goesOutAt: null }`, each editor's ready notice has the notify-only text.
    - `it("a run that died half-way is cleaned up, never doubled")`: insert by SQL a `running` run for the current period claimed at `now − 20 min` whose `issue_id` names a fresh empty draft of the magazine (as if the process died after `createIssue`); a `makeAutoDraft` manual call in between → `skipped draft_open` (the leftover counts as open); then `runDueAutoDrafts(now)` → the stale run is re-claimed (`attempts: 2`), the leftover draft is deleted, exactly one draft of the magazine exists and the run names it.
- [ ] **Step 2: Unit and route tests.** `notifications.test.ts`: both new notices, both copy variants of each, links and `extra`. `route.test.ts`: the mocked result gains `drafted` and `skipped` and the response body carries them.
- [ ] **Step 3: Extend `magazines.integration.test.ts`:** `PROCEDURE_CAPABILITY` gains `makeAutoDraftNow: "edit"`, `autoDraftHistory: "edit"`; `calls` gains both.
- [ ] **Step 4: Run** `<DB prefix> pnpm vitest run src/server/magazines/auto-draft src/server/api/routers/magazines.integration.test.ts` and `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/notifications.test.ts src/app/api/cron/magazine-issues` → FAIL; implement; run again → PASS. Then `<DB prefix> pnpm vitest run src/server/magazines` → PASS.
- [ ] **Step 5: Commit:** `feat(magazines): the auto-drafter makes one draft per period from the suggesters`.

---

## Task 7: The automatic-drafts screen

**Files:**

- Create: `src/app/[locale]/communities/[slug]/magazine/auto-draft/page.tsx` (+ `page.test.tsx`), `src/components/magazines/editor/auto-draft/auto-draft-settings-form.tsx` (+ test), `src/components/magazines/editor/auto-draft/make-draft-now.tsx` (+ test), `src/components/magazines/editor/auto-draft/issue-history-list.tsx` (+ test)
- Modify: `src/components/magazines/editor/editor-desk.tsx` (+ test), `src/components/magazines/test-fixtures.ts`, `messages/{en,nl}.json`
- Test: the `*.test.tsx` files above

**Interfaces:**

- Consumes: `autoDraftSettings`, `saveAutoDraftSettings`, `makeAutoDraftNow`, `autoDraftHistory` (Tasks 4 and 6); `PublicOptIn`, `publicOptInRequired` (`public-opt-in.tsx`); `magazineAutoDraftPath`, `issueBuilderPath`; `readEditorError`; `AUTO_DRAFT_*` values.
- Page: gate exactly like `magazine/team/page.tsx` but `standingCan(desk.standing, "edit")`; `robots: { index: false }`; `metaTitle` "Automatic drafts"; renders back link, `<h1>` "Automatic drafts", intro "Let the magazine make a draft from what happened in your community. You check it and decide what goes out.", then `<MakeDraftNow slug />`, `<AutoDraftSettingsForm slug />`, `<IssueHistoryList slug />`.
- `AutoDraftSettingsForm({ slug })`: loads `autoDraftSettings`; one `<form>`; `fieldset disabled` with the note "Only the editor-in-chief can change these." when `canManage` is false. Groups, each a `<fieldset>` + `<legend>`:
  1. "Make drafts by themselves" (switch) + "Next draft: {date}" (mono date) when `nextDraftAt`.
  2. "How often": radio group monthly ("Every month"), biweekly ("Every two weeks"), weekly ("Every week"), after_event ("After each event of the community"), on_demand ("Only when I ask"). The selects are **not** inside the radio labels: next to the monthly radio sits a `<select>` with its own visible `<label>` "Day of the month" (1–28); next to the biweekly and weekly radios one shared `<select>` labelled "Day of the week" (Monday … Sunday, ISO 1–7). Each select is enabled only while its option is chosen.
  3. "Look back": since_last_issue ("Since the last issue"), days_30 ("The last 30 days"), days_7 ("The last 7 days").
  4. "What to pick": one row per source in `AUTO_DRAFT_SOURCE_ORDER`, every row driven by `AUTO_DRAFT_SOURCES` (no source named in the component): a checkbox with the source's label from `magazineEditor.autoDraft.sources.<id>` (article "Member articles ready for the magazine", storyline "AIT News stories", newsItem "AIT News headlines", event "Community events", forumThread "Forum threads", launchpadProject "Launchpad projects", welcome "Welcome new members") and, when `AUTO_DRAFT_SOURCES[s].maxLimit > 1`, a number input "Up to" (1..`sourceMaxLimit(s)`) whose accessible name is "Up to, {source label}" through `aria-labelledby="<upToLabelId> <sourceLabelId>"`. When `hasTopics` is false, every row with `needsTopics` shows "Add topics to your magazine to get AIT News." with a link to `magazineSettingsPath`.
  5. "Don't pick anything an earlier issue already has" (checkbox, default on).
  6. "Drafts look like": layout select (`ISSUE_LAYOUTS`, labels `magazineEditor.autoDraft.layouts.<value>`: "cover-story" → "Cover story") and visibility select ("Same as the magazine ({current})", "Members only", "Everyone"), followed by `<PublicOptIn>` when `publicOptInRequired` (same rule as the settings form; save is blocked until confirmed and sends `confirmUnlistedPublic`).
  7. "When a draft is ready": "Tell the editors, and we publish by hand" / "Publish it by itself after {n 1–14} days, unless someone stops it" + help "Editors are told first. Any change to the draft stops the automatic publish."
     Save (`variant="default"` = the accent) → `role="status"` "Saved." or the mapped error text in `role="alert"`.
- `MakeDraftNow({ slug })`: `ink` button "Make a draft now"; result line (`role="status"`): made → "Your draft is ready." + link "Open the draft"; `too_few` → "There is not enough yet: we found {found} things and a draft needs {needed}."; `draft_open` → "There is already an open draft. Finish or delete it first." + link to it; `no_rights` → "You cannot make drafts for this magazine."; `busy` → "A draft is being made right now. Try again in a minute."; `already_ran` cannot happen for manual and maps to the `busy` text.
- `IssueHistoryList({ slug })`: `<SectionLabel>` "History"; `<ol>` of entries, each: who ("Automatic" when `actorName` is null), what (`draft_made` "made a draft" + " that goes out on {date}" when `goesOutAt`; `draft_skipped` "made no draft: {reason text}" with reason texts `too_few` "there was not enough yet (found {found}, a draft needs {needed})", `draft_open` "there is already an open draft", `no_rights` "the person who set this up can no longer edit the magazine"; `items_changed` "changed the items"; `auto_publish_stopped` "stopped the automatic publish" + " by editing" for `edited`, or for `failed` "could not publish it by itself: {failure text}" with failure texts `auto_off` "automatic publishing is switched off", `no_rights` "the person who set it up can no longer edit the magazine", `empty` "the issue is empty", `invalid_item` "an item cannot be published", `error` "something went wrong"; `published` by origin "published it" / "published it on schedule" / "published it automatically"; `deleted` "deleted it"), the issue ("Issue {number}: {title}", linking the builder when `issue.id` is set and `issue.status` is `draft` or `scheduled`), and the time (`<time>`, mono). Exhaustive `switch`es with a `never` default for event, skip reason and failure. Empty: "Nothing yet. When the magazine makes or skips a draft, you will see it here."
- Editor desk: a ghost button "Automatic drafts" → `magazineAutoDraftPath(slug)` next to Team/Settings, shown to every editor (the desk is already `edit`-only).

- [ ] **Step 1: Write the failing component tests** (Testing Library, `renderWithIntl`, tRPC mocked like `magazine-settings-form.test.tsx`):
  - form: `it("shows the saved settings and saves what changed")` (submit sends exactly the form's values plus `slug`); `it("enables the day only for the chosen schedule")`; `it("gives every control its own name")` (every `getAllByRole("radio" | "checkbox" | "combobox" | "spinbutton")` has a non-empty accessible name and no two are equal; "Up to, Forum threads" is found by name; no select is inside a `<label>` of a radio); `it("shows Up to only where more than one item is allowed")` (no "Up to" for the welcome row); `it("asks an unlisted community to confirm Everyone")` (save disabled until the opt-in box is ticked, then `confirmUnlistedPublic: true`); `it("is read-only for editors who cannot manage")` (every control disabled, note shown, no Save); `it("tells you to add topics for AIT News")`; `it("announces Saved")` (`role="status"`).
  - make-draft-now: one test per outcome text above; the made link points at `issueBuilderPath(slug, id)`.
  - history: `it("says who did what, automatic when nobody did")` for each event kind, each skip reason and each failure; `it("links only issues that are still being worked on")` (draft and scheduled link to the builder; published and deleted do not); `it("teaches what will appear when empty")`.
  - page: 404 for a member without `edit`, redirect when signed out, renders the three parts for an editor (mocks as `team/page.test.tsx`).
  - desk: the "Automatic drafts" link is present for an editor.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines/editor "src/app/[locale]/communities/[slug]/magazine" src/i18n` → FAIL; implement; run again → PASS.
- [ ] **Step 3: Commit:** `feat(magazines): automatic-drafts screen with history and make a draft now`.

---

## Task 8: The builder shows why things were picked and the automatic publish

**Files:**

- Create: `src/components/magazines/editor/builder/auto-draft-notice.tsx` (+ test), `src/components/magazines/editor/suggestion-reason.tsx` (+ test)
- Modify: `src/components/magazines/editor/builder/{issue-builder,item-row,picker-panel,builder-top-bar}.tsx`, the existing tests `issue-builder.test.tsx`, `item-row.test.tsx`, `picker-panel.test.tsx`, `src/components/magazines/test-fixtures.ts`, `messages/{en,nl}.json`
- Create (test): `src/components/magazines/editor/builder/builder-top-bar.test.tsx` (does not exist yet)

**Interfaces:**

- Consumes: `getIssueForEditing` (now with `autoDraft`), `issue.scheduledVia`; `pickerCandidates` (now with `reason`); `unscheduleIssue` (existing builder mutation path `changePublication`).
- `SuggestionReasonText({ reason }: { reason: SuggestionReason })`: Sans text in the viewer's language, dates with `formatEventDay` in `<span className="font-mono">` and counts mono, under `magazineEditor.builder.reasons.*`: waitingSince "Approved and waiting since {date}"; topic "Matches your topic {topic}"; eventComingUp "Coming up on {date}"; eventRecap "Took place on {date}, {going} going"; mostReplies "Most talked about: {count} replies"; mostUpvotes "Most upvoted: {count} upvotes"; newMembers "{count} new members joined". Exhaustive `switch` with a `never` default.
- `ItemRowView` gains `reason: SuggestionReason | null`; the row shows "Picked because: <SuggestionReasonText>" in one muted `text-xs` line under the title. `issue-builder.tsx` fills it from `data.autoDraft?.reasons[item.key] ?? null` (saved items are keyed by block id).
- `AutoDraftNotice({ status, scheduledVia, scheduledFor, onStop, stopping })`, shown above the items when `data.autoDraft` is non-null, a bordered (flat) box, `role="region"` with `aria-label` "Made automatically":
  - automatic schedule: "The magazine made this draft. It goes out by itself on {time} unless you stop it. Any change you make stops that too." + `outline` button "Stop the automatic publish" → the existing `unschedule()`.
  - otherwise (draft): "The magazine made this draft from what happened in your community. Check it, change what you like, and publish it when you are happy."
- After a save returns an issue whose status went from scheduled-with-`auto` to `draft`, the builder announces in its existing `role="status"` region: "Your change stopped the automatic publish. Publish it yourself when it is ready." (compare the previous and the saved `scheduledVia`/`status`; once per transition).
- `BuilderTopBar` gains `scheduledVia: ScheduleOrigin | null`; for `"auto"` the scheduled line reads "Goes out by itself {time}" instead of "Goes out {time}".
- `PickerPanel`: each candidate with a `reason` shows `<SuggestionReasonText>` in one muted line below its facts; the list heading for an empty query is "Suggested for this issue" when the first candidate has a reason, else unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `suggestion-reason.test.tsx`: each reason type renders the English text; dates and counts are inside `.font-mono`.
  - `item-row.test.tsx`: `it("shows why the magazine picked the item")`; no line when `reason` is null.
  - `auto-draft-notice.test.tsx`: both texts; the Stop button calls `onStop`, is `outline`, and is disabled while `stopping`.
  - `issue-builder.test.tsx`: `it("shows reasons and the notice for an automatic draft")` (fixture `autoDraft.reasons` keyed by the saved block ids); `it("says that a change stopped the automatic publish")` (the save mutation resolves with `status: "draft"`, `scheduledVia: null` after the loaded issue was `scheduled`/`auto` → the status text appears once); `it("shows nothing extra for an issue an editor made")`.
  - new `builder-top-bar.test.tsx`: "Goes out by itself" for `auto`; "Goes out" for `schedule` and for `null`.
  - `picker-panel.test.tsx`: `it("shows why a suggestion is offered")`.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines src/i18n` → FAIL; implement; run again → PASS.
- [ ] **Step 3: Commit:** `feat(magazines): builder shows auto-pick reasons and the automatic publish`.

---

## Task 9: Slice guarantees, visual check and docs

**Files:**

- Create: `src/server/magazines/auto-draft.integration.test.ts`
- Modify: `DESIGN.md`, `docs/adr/0047-*.md` (Consequences), `docs/adr/0043-*.md` (one line under Decision 4: "Superseded by ADR-0047: suggesters are a parallel registry keyed by source, not a method on the kind interface."), `docs/adr/0046-*.md` (one line under Decision 8: "Amended by ADR-0047: auto-publish needs both the scheduling person's `edit` and `whenReady = "auto_publish"` in the magazine's settings; the origin is stored in `scheduledVia`."), `CONTEXT.md` (only if a term changed during the build)

**Interfaces:**

- Consumes: everything above, through `createCaller`, `runMagazineIssueJobs` and the reading loaders only (the slice end to end); notices read from `app.notification`; the cron step gets the fake mailer of the subscriptions slice.

- [ ] **Step 1: Write the end-to-end guarantee test** `auto-draft.integration.test.ts` (DB). `it("from settings to an automatic issue, with people in control")`, in order:
  1. The community is **unlisted** (its forum is members-only). The owner saves settings: enabled, weekly on Monday, `since_last_issue`, visibility `public` with `confirmUnlistedPublic`, `auto_publish` after 3 days. An appointed editor gets FORBIDDEN on save.
  2. Seed: 2 approved articles, a thread with 4 replies in the community's forum, a coming event.
  3. `runMagazineIssueJobs` on the Monday after `scheduleStartsAt`: `drafted: 1`; the draft is `scheduled` with `scheduledVia: "auto"`; editors have the ready notice; readers cannot open it (`loadIssuePage` for an outsider → null).
  4. **An edit just before the due time keeps it a draft** (Review Focus 2): the editor calls `setIssueItems` (reorders) one minute before due; `runMagazineIssueJobs` after due publishes nothing; the issue is a `draft`; history shows the editor stopped it.
  5. The editor schedules it by hand (`scheduleIssue`) and the next run publishes it with `publishedVia: "schedule"`; the history row says "published on schedule" (`origin: "schedule"`).
  6. **Reasons stay with editors** (Review Focus 3): the published issue's reader payload for an outsider and for a member (`loadIssuePage` / the reading loader the issue page uses) contains no reason text and no `reason`/`autoDraft` key (`JSON.stringify` check for "Picked because", "waitingSince", "mostReplies"); the outsider does not get the members-only thread; the member does.
  7. Seed, dated after the first issue's `publishedAt`: 2 new threads with replies and 1 new approved article (the look-back `since_last_issue` now starts at that publish). `makeAutoDraftNow` by the editor → a new draft of exactly those 3 items, none of them a reference of the first issue.
  8. `autoDraftHistory` lists, newest first (`created_at DESC, id DESC`): `draft_made` (manual, actor = the editor who pressed), `published` (`origin: "schedule"`, actor = the editor who scheduled), `auto_publish_stopped` (`why: "edited"`, actor = the editor), `items_changed` (actor = the editor), `draft_made` (schedule, actor null = "Automatic").
- [ ] **Step 2: Run the whole slice's suites:** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib src/server/magazines src/server/news src/components/magazines src/app/api "src/app/[locale]/magazines" "src/app/[locale]/communities" src/collections src/i18n`, then `<DB prefix> pnpm vitest run src/migrations src/server/magazines src/server/news src/server/api/routers`, then `pnpm typecheck`, `pnpm lint` and `pnpm format:check` → all PASS, no DB suite skipped.
- [ ] **Step 3: Production build from the export** (Global Constraints, "Running the app", with `pnpm exec next build` in place of `next dev`) → succeeds.
- [ ] **Step 4: Visual check** on the running export (port 3100, test DB seeded with a listed and an unlisted community, a magazine with topics, a few threads, events and approved articles). Check each item at 390px and 1440px, light and dark. Write findings in the PR description, not in a file.
  - Automatic drafts screen as the owner: every group readable; the day select follows the chosen option; "Everyone" in the unlisted community shows the opt-in and blocks Save until ticked; Save is the only orange; "Saved." is announced; no horizontal scroll.
  - Same screen as an appointed editor: read-only note, controls disabled, "Make a draft now" works.
  - "Make a draft now": each result line (made, not enough, open draft).
  - History list: names, "Automatic", mono times, issue links.
  - Builder for an automatic draft: the notice, "Picked because" lines under items, "Goes out by itself …" in the top bar, Stop button (`outline`); edit an item and see the "Your change stopped …" message; Publish still the one orange.
  - "Add more" with an empty search: "Suggested for this issue" with reasons; typing a search hides the reasons.
  - Notification panel: the ready and the skipped notices with working links.
  - Editor desk: the "Automatic drafts" link.
- [ ] **Step 5: Docs.** `DESIGN.md`: add the automatic-drafts screen to the editor screens and the rule "auto-pick reasons are editor-only, Sans, one muted line". ADR-0047 Consequences: what shipped (tables, the cron step, the screen) and the risks below. The ADR-0043 and ADR-0046 lines. Grep `CONTEXT.md` and `docs/adr/0046-*.md` for "slice 5 will" / "slice 5 adds" and update them to what shipped (plans are history; leave them).
- [ ] **Step 6: Note for the PR description** (Greg runs production actions): no backfill; nothing changes for any magazine until an editor-in-chief switches automatic drafts on; the cron route is the existing one.
- [ ] **Step 7: Commit:** `test(magazines): auto-draft slice guarantees; docs`.

---

## Risks and open points (for the PR description)

- **Member articles are ranked by waiting time, not by reads.** The spec says "most-read first", but approved articles are not published yet, so nobody has read them. Waiting longest first is fair and predictable. Please check.
- **News needs topics.** A magazine without topics gets no AIT News stories or headlines; the screen says so. Topic matching is plain text (title, overview, summary), so "AI" matches many words; editors can pick sharper topics.
- **Generated text is English** (issue title and welcome block), like everything the builder edits today. A Dutch community changes it by hand.
- **Days are UTC.** "Monthly on day 1" falls due at 01:00 or 02:00 Amsterdam time; the cron runs every five minutes, so drafts appear early that morning.
- **Switching on mid-period waits for the next period** (no surprise draft). "Make a draft now" covers the impatient case.
- **The welcome block counts people, never names**, because the issue can be public.
- **The auto-drafter acts with the rights of whoever last saved the settings.** If that person leaves the team, drafts stop and the editors are told to save the settings again.
- **History is kept for every issue**, not only automatic ones, so the screen also shows a person's publish. Quick autosaves collapse into one line per person per hour.
- **A run that crashes mid-way** is retried up to three times per period (the stale claim expires after 15 minutes); its half-made draft counts as open until the retry deletes it, so there is never a second one. After three tries the period is skipped silently (logged).
- **Publishing from Payload admin** still bypasses the site path (no history, no announcement), as in slice 4.
- **Suggesters are not a method on the kind interface.** The spec and ADR-0043 Decision 4 said `suggest` would be added to each item kind. The suggesters do live in each kind's folder, but in a parallel registry keyed by *source*, so one kind can have more than one source (the welcome is an editorial source). ADR-0047 supersedes ADR-0043 Decision 4.
- **Auto-publish checks a person and the settings.** ADR-0046 said only the settings would be checked. We also require the person who set up automatic drafts to still have edit rights. ADR-0047 amends ADR-0046.
- **A tiny race on switching auto-publish off.** If an editor saves "tell me only" in the same instant the scheduled run publishes, the publish can win, as if the save came just after. Recorded in ADR-0047.

## Self-review notes

- Spec coverage: settings on/off, cadence (five options), "Make a draft now", look-back (three options), layout and visibility with the recorded unlisted confirmation, per-source on/off and max, never-reuse default on, notify-only default and auto-publish after N (default 3) unless stopped (Tasks 1, 4, 7); `suggest` on each kind module with a human reason, deterministic from our data (Task 3); auto-drafter only orchestrates and creates a normal draft through the issue service (Task 6); too-few threshold with the editors told why (Task 6); one open auto-draft per magazine (Task 6); idempotent per (magazine, period) through the cron route (Tasks 1, 6); auto-publish through `publishIssue`, recorded as published automatically (Tasks 1, 2, 6); any editor edit turns auto-publish off for that draft (Task 2); history per magazine with who (Tasks 2, 6, 7); builder shows auto-pick reasons, "Add more" reuses the ranking (Tasks 5, 8); editor inbox notices (Tasks 2, 6).
- Type names used across tasks, each defined in one Interfaces block: `SCHEDULE_ORIGINS`, `ScheduleOrigin`, `SuggestionReason`, `parseSuggestionReason`, `AutoDraftSettings`, `AutoDraftSettingsInput`, `autoDraftSettingsInput`, `resolveSources`, `sourceMaxLimit`, `AUTO_DRAFT_SOURCE_ORDER`, `SuggestWindow`, `calendarPeriod`, `isPeriodDue`, `nextDraftAt`, `lookBackWindow`, `ISSUE_HISTORY_EVENTS`, `IssueHistoryDetail`, `IssueHistoryEntry`, `AutoDraftSkipReason`, `AutoDraftTrigger`, `SCHEDULE_FAILURES`, `ScheduleFailure`, `AUTO_DRAFT_SOURCE_IDS`, `AutoDraftSourceId`, `AUTO_DRAFT_SOURCES`, `SourceKind` (T1); `recordIssueHistory`, `listIssueHistory`, `HistoryWrite`, `IssueActor.via`, `stopsAutomaticSchedule`, `historyActorId`, `CLEARED_SCHEDULE` (private), `SCHEDULE_ORIGIN_CHECKS` (private), `autoPublishAllowed`, `ScheduleFailure "auto_off"` (T2); `SuggestContext`, `SuggestConfig`, `ItemSuggestionSource`, `SuggestionSourceCandidate`, `ITEM_SUGGESTERS`, `SuggestedCandidate`, `suggestCandidates`, `referenceOfInput`, `suggestPublicStorylines`, `suggestNewsItems`, `referencesOfBlocks`, `suggestContextFor`, `magazineTopicsOf`, `listApprovedArticlesOldestFirst`, `DRAFTABLE_EVENT_STATUSES`, `endedCommunityEvents` (T3); `StoredAutoDraftSettings`, `readAutoDraftSettings`, `saveAutoDraftSettings`, `findOpenAutoDraft`, `suggestWindowFor`, `listDueAutoDraftSettings`, `magazineAutoDraftPath` (T4); `pickerCandidatesFor`, `PickerSuggestion`, `SuggestionLoader` (T5); `RunClaim`, `claimAutoDraftRun`, `attachRunIssue`, `isAutoMadeIssue`, `finishedPeriodKeys`, `finishAutoDraftRun`, `pendingEventPeriods`, `saveAutoPicks`, `loadAutoDraftForIssue`, `AutoDraftOutcome`, `makeAutoDraft`, `runDueAutoDrafts`, `notifyAutoDraftReady`, `notifyAutoDraftSkipped` (T6); `AutoDraftSettingsForm`, `MakeDraftNow`, `IssueHistoryList` (T7); `SuggestionReasonText`, `AutoDraftNotice` (T8).
- Review Focus lines each have their test in the owning task (Tasks 2, 4, 6, 9).

## Preflight rulings

Every preflight finding (spec 1–19, design 1–13, safety 1–17) was checked against the code and holds; the plan above is fixed for each. No finding was rejected. Where a finding offered alternatives, the choice is recorded here:

- Ruling: settings and suggesters are keyed by **source id** (`welcome` for the editorial welcome), not by kind (design 6) — a second editorial source then needs no fake kind and no data migration of stored settings — cost if wrong: one extra id layer; source ids equal kind ids for six of seven sources, so it is cheap to collapse later.
- Ruling: the publisher/settings race (safety 12) is **recorded as a known risk in ADR-0047**, not fixed by re-reading settings inside `publishIssue` — the fix would make the core issue service depend on the auto-draft module for a window of milliseconds that is indistinguishable from a save landing just after the publish — cost if wrong: in a true same-instant race one issue goes out by itself after an editor chose "tell me only"; the editor can still see it in the history.
- Ruling: "Add more" takes a **lazy `SuggestionLoader`** (spec 13) and **keeps the search entry's `openHref`** on a duplicate while `SuggestContext` also carries `viewerId` (spec 8, design 3, safety 8) — both close the gap; the loader keeps typed searches free of settings reads — cost if wrong: none beyond one extra parameter.
- Ruling: a crashed run's leftover issue is **deleted on re-claim**, not reused (spec 4, safety 2) — a half-made draft may have no items or picks, and rebuilding it is the same code path as a fresh run — cost if wrong: a slightly later draft after a crash.
- Ruling: `failSchedule` history uses **`why: "failed"` with the failure reason** (design 5) rather than a separate `"switched_off"` value (spec 15) — one shape covers every scheduled-run failure — cost if wrong: none.
