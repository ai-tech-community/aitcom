---
status: accepted
---

# Magazine auto-drafts are ordinary issues assembled from kind suggesters

An [[automatic-draft]] is an ordinary [[issue]] assembled from activity in a
[[magazine]] and its community. Editors can change it, publish it or let it go
out on an [[automatic-publish]] schedule. This ADR records the automatic-drafts
slice's boundaries and the decisions its later tasks implement. Sources:
`docs/superpowers/specs/2026-10-26-community-magazines-design.md` (slice 5), and
`docs/superpowers/plans/2026-10-27-community-magazines-auto-draft.md`
(Decisions 1–14).

It **supersedes Decision 4 of
[ADR-0043](0043-magazine-issue-items-are-a-registry-of-kind-strategies.md)**:
suggesters form a parallel registry keyed by source; they do not extend
`IssueItemKind`. It **amends Decision 8 of
[ADR-0046](0046-magazine-issues-are-announced-through-an-outbox-once-per-subscriber.md)**:
automatic publication needs both the scheduling person's current `edit`
capability and the magazine's `auto_publish` setting.

It follows [ADR-0042](0042-magazine-issues-are-read-through-one-access-resolver.md)
for reader access and the unlisted-community public opt-in,
[ADR-0045](0045-magazine-roles-are-capabilities-read-through-the-editorship-seam.md)
for the acting person's rights, and
[ADR-0025](0025-real-time-delivery-is-asymmetric.md) for inbox notices.

## Context

- Draft assembly must reuse the issue service's validation, placement,
  publication, credit and announcement path. Once made, a draft is editable
  like any other issue and remains invisible to readers through the resolver.
- Suggestions need an explainable order, editor-only reasons, and room for
  more than one source of the same item kind.
- Overlapping requests and interrupted work must not create duplicate or
  orphaned drafts. A person's changes must stop an automatic schedule.

## Decision

1. **Sources belong to kinds (plan Decision 1).** The client-safe
   `AUTO_DRAFT_SOURCES` record holds each source's kind, defaults, count limit,
   topic requirement and whether it counts toward the minimum. Defaults,
   controls and counts derive from it. Sources are `article`, `storyline`,
   `event`, `forumThread`, `launchpadProject`, `newsItem` and `welcome` in that
   draft order; `welcome` belongs to `editorial`. A second editorial source
   needs a new source id, not a fake kind or a settings migration. A type check
   makes a kind without a source a compile error. Server suggesters live in
   each kind's folder and an exhaustive, source-keyed `ITEM_SUGGESTERS`
   registry. Shared context is built once with the acting viewer, community,
   normalized topics and clock. Reference helpers keep dispatch out of the
   drafter.

2. **Ranking uses our data, with stable tie-breaks (plan Decision 2).** Approved,
   unplaced magazine articles wait longest first, outside the look-back
   window. Topic-matching public storylines rank by latest activity, votes
   and slug; topic-matching news ranks by publication time and id. Without
   magazine topics those two sources return nothing. Community events must
   be published or completed: coming-up events first, soonest first, then
   recaps by attendance, latest date and id. Cancelled events are excluded.
   Event days are UTC: an event ends at midnight after its last calendar day;
   coming-up includes today and the next 30 days, exclusive of day 30. The
   shared `endedCommunityEvents` query also supplies after-event triggers.
   Active community threads rank by replies, views and id. Published community
   projects rank by votes and id, applying the look-back inside the member
   project query before its limit. The welcome is one editorial block with a
   count of new active memberships, never names, and does not count toward
   the minimum. Other source defaults are 5, 3, 4, 3, 3 and 5 items; their
   maximum is ten, while welcome allows one.

3. **Reasons stay apart from reader content (plan Decision 3).** Structured
   `SuggestionReason` values live in `app.magazine_auto_pick`, keyed by issue
   id and the saved block's stable item id. Only editor loaders read them.
   Unknown or broken stored reasons parse as null; reader blocks gain no
   reason field.

4. **Settings have one site-owned row per magazine (plan Decision 4).**
   `app.magazine_auto_draft_settings` is read and written only through the
   settings module. Per-source JSON is validated and merged over defaults,
   discarding unknown ids and clamping counts. Visibility null inherits the
   magazine default; concrete public visibility uses the existing recorded,
   leaders-only confirmation for unlisted communities, copied onto drafts.
   Saving needs `manage`; reading, history and making a draft need `edit`.
   Enabling or changing the calendar resets `schedule_starts_at`; an earlier
   due day never causes an immediate draft. Defaults are disabled, monthly
   on day one, Monday, since the last issue, cover-story layout, no visibility
   override, never reuse, notify only, and three days before automatic publish.

5. **Periods use UTC (plan Decision 5).** Monthly keys are `month:YYYY-MM`, due
   on day 1–28; weekly keys use the ISO week-year and chosen ISO weekday.
   Fortnights are 14-day blocks from Monday 2024-01-01, due on the chosen day
   of the first week. After-event keys are `event:<id>` for events ended
   since the later of schedule start and seven days ago, oldest first. Manual
   keys are `manual:<uuid>`. Look-back is since the last published issue
   (30-day fallback), 30 days or seven days, ending now. The next draft day
   is at or after both now and schedule start.

6. **Claim before work; recover interrupted work (plan Decision 6).**
   `app.magazine_auto_draft_run` uniquely claims `(magazine_id, period_key)`
   and has a partial unique index allowing one `running` row per magazine.
   Claims older than 15 minutes fail; a failed period may be reclaimed up to
   three attempts. Insert conflicts return already-ran or busy; reclaim
   conflicts return busy. Attach the issue id immediately after creation.
   Save or pick failures delete the half-made draft and fail the run; a
   schedule refusal keeps the usable draft and sends a notify-only notice.
   After a successful claim, while holding the magazine's running lock, clean
   every failed run with an attached issue, including manual runs, expired
   calendar periods and exhausted retries. Record the run's last issue-write
   time on attach and fill. A published issue, a person's schedule, a person
   history row or an issue update later than that recorded write is kept and
   marks its run made. Otherwise delete a leftover draft, or silently
   unschedule and delete an automatic schedule, without issue history. Clear
   deleted issue references so they cannot block later drafts. If the claimed
   run's own issue was taken over, return it as made without a new notice.

7. **One open automatic draft per magazine (plan Decision 7).** Any run's
   attached draft or scheduled issue blocks another after failed leftovers
   have been cleaned. Only a made run marks an issue as made automatically.
   An open draft skips with `draft_open` and no notice. Fewer than three valid items
   from sources that count skips with `too_few`, recording found and needed.
   Scheduled and event skips notify once per period; manual skips show their
   answer only to the person who pressed the button. The welcome never
   satisfies the minimum.

8. **Act with a person's rights (plan Decision 8).** Scheduled assembly uses
   the person who last saved settings, rechecking `edit` each time. Lost rights
   skip with `no_rights`. A manual request uses the presser. `IssueActor.via`
   marks automatic writes so they neither cancel their own schedule nor appear
   as a person's edits. Issue-service history records a null automatic actor;
   manual draft-made/skipped history records the presser.

9. **Automatic publish is a schedule (plan Decision 9).** `scheduledVia` is
   `schedule` or `auto`; old nulls mean a person's schedule. Automatic drafts
   schedule through the issue service for now plus 1–14 days. A person's item
   or detail edit stops an automatic schedule in the same claimed write,
   clears all schedule fields and records why. Explicit stop and scheduled
   failure also record why; publication clears the schedule and records its
   origin. A person's reschedule becomes `schedule`. Publishing early remains
   the Publish button. Both `scheduledBy`'s current `edit` and settings still
   allowing `auto_publish` are required, with lost rights checked first.
   Settings alone could publish on the authority of someone who left the team.
   Choosing notify-only stops a waiting automatic schedule immediately, while
   preserving a person's schedule. Origin checks are exhaustive over
   `SCHEDULE_ORIGINS`; settings refusal is `auto_off`.

10. **History covers every issue (plan Decision 10).**
    `app.magazine_issue_history` stores draft-made, draft-skipped,
    items-changed, automatic-publish-stopped, published and deleted events,
    with structured detail, origin, actor and issue number/title snapshots.
    `actor_kind` distinguishes a person from an automatic action even after
    the person's account is deleted; missing person names read as a former
    member. Deleting an issue sets its history reference null; deleting the
    magazine deletes its history. Issue writes record history in their transaction;
    deletion records after its claim but before deleting the issue. Automatic
    cleanup writes no deleted event. A person's item saves are coalesced when
    the latest event is their items-changed less than 60 minutes ago. All
    ordering is `created_at DESC, id DESC`; a save records items-changed before
    automatic-publish-stopped. The screen shows the latest 30 events.

11. **Use the existing cron route (plan Decision 11).** Automatic assembly
    runs first in `runMagazineIssueJobs`, with its own error logging, before
    scheduled publishing and delivery. Claim at most five magazines per pass,
    oldest last run first. Finished periods and exhausted failures are omitted;
    busy/already-ran responses consume no claim budget. Results gain drafted
    and skipped counts.

12. **Use the inbox (plan Decision 12).** Ready notices link to the builder
    and say whether and when the issue goes out. Too-few and no-rights notices
    link to settings, go to magazine editors and never repeat for manual runs.
    Types are `magazine_auto_draft_ready` and `magazine_auto_draft_skipped`.
    Schedule failures gain `auto_off`. Stored copy is English; dates use
    `en-GB`, long form, in `Europe/Amsterdam`.

13. **Generated text is English (plan Decision 13).** Titles and welcome
    blocks use the default-locale translator, matching the builder's editable
    locale. Both English and Dutch message keys exist; editors can change the
    resulting text like any issue text.

14. **The picker reuses ranking (plan Decision 14).** Empty-query searches
    lazily load settings and suggestion context, ask the kind's sources in
    source order, then fill from plain search. Reference duplicates keep the
    suggestion and its reason, taking the search entry's `openHref` when the
    suggestion lacks one. Typed searches keep the existing path without
    settings or suggestion-context reads. Reasons appear only in editor UI.

## Considered options

- **`suggest` on `IssueItemKind`:** rejected. Editor data sources sit beside
  the kind strategies, like pickers, and a kind can have multiple sources.
- **A ranking function in the drafter:** rejected. Kind-specific ranking
  belongs in each kind's module.
- **Reasons on item blocks:** rejected. It changes every block table and
  puts editor metadata beside reader content.
- **Settings on the Payload magazine:** rejected. Stale Payload saves can
  rewrite site-owned state, as ADR-0046's outbox decision explains.
- **An advisory lock:** rejected. Work crosses multiple Payload transactions;
  pooled sessions cannot reliably hold a session lock across them.
- **A system user:** rejected. It invents an account and avoids checking the
  responsible person's current rights.
- **A separate publish timer:** rejected. Scheduling already has a status,
  a visible time and the authoritative publication path.
- **History only for automatic issues:** rejected. It adds a special case to
  the issue service; publication history is useful for every issue.
- **A second cron route:** rejected. One route owns the issue lifecycle.
- **AI ranking:** deferred by the spec. Deterministic activity-based ranking
  can explain each pick without an external service.

## Consequences

- Drafts use existing issue validation and access rules; referenced
  members-only content never becomes public merely by appearing in an issue.
- Four Drizzle tables keep settings, claims, reasons and history outside
  Payload: `app.magazine_auto_draft_settings`, `app.magazine_auto_draft_run`,
  `app.magazine_auto_pick` and `app.magazine_issue_history`. Migration
  `20261027c_magazine_auto_draft` adds them and `scheduledVia`, and extends the
  publish-origin enum. The additive follow-up migration
  `20261027d_magazine_auto_draft_followups` records run last-write times and
  history actor kinds. Rollback drops the new tables and schedule source but
  leaves the `auto` enum value, which PostgreSQL cannot remove individually.
- `runMagazineIssueJobs` assembles due drafts before scheduled publication,
  subscription cleanup and announcement delivery. It uses the existing
  `/api/cron/magazine-issues` route, every five minutes; no second route or
  backfill is needed. Existing magazines keep their behaviour until an
  editor-in-chief enables automatic drafts.
- The automatic-drafts screen at
  `/{locale}/communities/[slug]/magazine/auto-draft` ships settings, "Make a
  draft now" and history, linked from the editor desk. Appointed editors can
  read settings and make drafts; saving settings requires `manage`. The
  builder shows the automatic-draft notice, pick reasons and automatic
  publication time with a Stop control. Empty "Add more" searches reuse the
  suggestions; ready and skipped inbox notices link to the relevant screen.
- The DB guarantee test exercises settings, assembly, stop-on-edit, a person's
  schedule, reader privacy, look-back and history through callers, the job
  runner and reading loaders. History uses the transaction clock for both
  assembly and issue edits, ordered by `created_at DESC, id DESC`.

### Risks and operating limits

- **Settings/publisher race.** The publisher reads settings just before
  `publishIssue`. A notify-only save landing in those milliseconds can lose
  to publication, like one arriving just afterwards. Re-reading inside the
  claimed publication transaction would couple the core service to automatic
  draft settings for that small window; this is deliberately not done.
- **Article ranking uses waiting time.** Approved articles are unpublished
  and have no readership yet; oldest-waiting-first gives them a fair,
  deterministic order.
- **News needs topics.** A magazine without topics gets neither AIT News
  stories nor headlines; the settings screen explains this. Matching is plain
  text over titles, overviews and summaries, so a short topic such as "AI"
  matches many words. Editors can choose sharper topics.
- **Generated titles and welcome copy are English.** The builder currently
  edits the default locale only; a Dutch community changes that text by hand.
- **Days are UTC.** Monthly day 1 falls due at 01:00 or 02:00 Amsterdam time;
  the five-minute cron makes drafts early that morning. Switching on
  mid-period waits for the next due period, avoiding a surprise draft;
  "Make a draft now" covers an immediate request.
- **The welcome counts people, never names.** An issue can be public, so the
  generated welcome must not expose the community's member list.
- **The last settings saver lends their rights.** Scheduled assembly acts as
  that person and checks current `edit`. If they leave the team, assembly
  stops and editors are told to save settings again.
- **History covers every issue.** It also shows a person's publication of a
  manually made issue. Quick item autosaves collapse into one line per person
  per hour while that person's item change remains the latest event.
- **Crashes have a retry limit; leftovers do not depend on retrying that key.**
  A stale claim expires after 15 minutes and can be retried up to three times
  per period. The next successful claim for the magazine cleans every failed
  leftover, including manual keys, ended periods and exhausted attempts, while
  holding the running lock. Person history or an issue timestamp after the
  run's recorded last write preserves an editor's work and marks the run made;
  published issues and a person's schedules are also preserved. Other drafts
  and automatic schedules are silently removed, so they cannot cause a false
  open-draft skip. Without another successful claim, cleanup waits. Exhausted
  failures remain logged without an inbox notice.
- **Payload admin still bypasses the site publication path.** Publishing
  there records neither issue history nor an announcement, as in slice 4.
- **Suggesters amend the original interface plan.** They live in each kind's
  folder but in a parallel registry keyed by source, allowing several sources
  for one kind (the welcome is an editorial source). This supersedes
  ADR-0043 Decision 4's proposed `suggest` method on the kind interface.
- **Automatic publication checks both person and settings.** The scheduling
  person must retain `edit` and settings must allow `auto_publish`. This
  amends ADR-0046 Decision 8's settings-only rule.
- **Small communities may produce no draft.** Three substantive items are
  required; a welcome alone does not count. Magazines without topics receive
  neither storyline nor news suggestions.
