# Context

Glossary of canonical terms used across the codebase. Implementation details
belong in code or ADRs, not here.

## Community platform domain

### Hub

The AIT-wide level: the whole platform. Modelled as the **root community**
(the `community` row with slug `ait`), into which **every user is enrolled on
signup** — the enrolment is the membership row that makes someone a member of
the platform at all. Hub-wide content is the form of a [[shared-surface]] where
`communityId` is null. "AI Tech Community" the product _is_ the Hub; the name
may be reconsidered later. Default to **Hub** when you mean the platform-wide
level, never the bare word "community".

The root `ait` row is an **anchor, not a tenant**: it exists so the platform
can address, digest, and rate-limit a member ([[notification-ceiling]],
[[hub-digest]]), but it is **exempt from the [[community-admin]] growth
machinery** — it has no community organizer, it is **not directory-listed and
not a [[community-discovery]] candidate** (you cannot "join" the platform you
are already in), and the [[activation-funnel]], [[at-risk-member]],
[[un-activated-newcomer]], [[greeter]], and [[ritual]] loops all **skip the
root** and operate only on tenant [[Community]]s. This is
[[adr-0013-hub-invariant-vs-community-policy]] applied to the root row itself.
See [[adr-0019-hub-root-is-an-anchor-not-a-tenant]].

### Hub-only member

A member whose **only** [[Community]] membership is the root [[Hub]] `ait` row
— enrolled in the platform but in **no tenant [[Community]]**. The successor to
the ill-defined "member in no community": under universal Hub enrolment that
zero-membership state no longer exists, so this is the precise population the
acquisition/encouragement features target. A Hub-only member has full access to
Hub-wide [[shared-surface]]s (read and write the blog, browse events, post in
the Hub-wide forum) but receives none of a tenant community's belonging,
rituals, or local digest. The goal for this member is **first-tenant-join**:
move them from Hub-only to a member of at least one tenant Community.

### Community

A tenant space inside the [[Hub]] — a `community` row (other than the root
`ait` row) with its own members, roles, and `communityId`-scoped content.
Communities bring their own members but share the Hub's surfaces. A user can
belong to many communities; the Hub root membership is universal.

Roles within a community: `owner | admin | moderator | member`
(see `role-utils.ts`). Membership status: `active | pending_approval |
invited | banned`. Join policy: `open | invite_only | approval_required`.

### Profile visibility

A member's `member_profile.isPublic` flag governs whether their **identity**
(display name and avatar) may be shown in any **aggregate or directory
display** — the global `/members` directory *and* per-[[Community]] member
displays such as the [[member-stack]]. Opting out (`isPublic = false`) hides
the member's **face**, never their **count**: a private member still
contributes to a community's member total and to the [[member-stack]] overflow
(the "+N"), they are simply never one of the shown faces. This is broader than
the flag's original directory-only reading; the widening was a deliberate
privacy call (honour the explicit opt-out for faces, keep counts honest). The
per-Community *member list page* and other surfaces gated by community access
are a separate concern — `isPublic` is about being shown to people who can
already reach the surface, not about who can reach it. See
[[adr-0021-profile-visibility-governs-member-stack-faces]].

### Member stack

A row of overlapping small circular member avatars used as social proof for a
population — initially a [[Community]]'s members on its directory card and
header. A shared UI primitive (not forked per surface) that may later back
event attendees, forum participants, etc. Shows only faces permitted by
[[profile-visibility]]. The stack itself carries the count — there is no
separate "N members" number beside it on the card: up to five plain avatars,
and **only once a community exceeds five members** does the final circle become
a "+N" overflow ("+394"), where N is the active total beyond the shown faces
(private members included — counted, never shown). Suppressed entirely below a
small floor (a single lone avatar is not a stack).

### Shared surface

A feature that exists in **both** a Hub-wide form and a per-Community form,
distinguished by `communityId` (null = Hub-wide, set = scoped to one
community). The shared surfaces today: events, forum, launchpad, ideas,
jobs, blog/articles, challenges, impact, benchmark, investigations. A
**Community admin**'s primary content levers are the per-Community instances
of these surfaces.

### Community feed

The community **home** discussion surface (`/communities/<slug>`): a
Skool-style stream of short posts with **likes** and comments. Distinct from
the [[forum]], a separate threaded surface. The two overlap heavily; the
deliberate direction is that the **feed is the canonical discussion home** and
the forum is **frozen** (no new investment) pending an eventual fold-in — the
feed is where [[topic]]s, pins, and future engagement levers live. See
[[adr-0026-feed-is-the-canonical-discussion-surface]].

### Forum

A threaded discussion surface (`/communities/<slug>/forum`) with replies,
admin **pins**, ideas+voting, a rules-acceptance gate, and a fixed
`category` enum (`general | question | showcase | job`) — a *structural thread
type*, **not** an admin-branded label (contrast [[topic]]). Load-bearing today:
[[ritual]]s materialize as forum threads and the [[greeter]] queue reads it.
**Frozen** in favour of the [[community-feed]]; threads/rituals/ideas are
expected to migrate onto the feed in a later, separate step.

### Topic

A per-[[Community]] admin-defined label that organizes the [[community-feed]]
— the branded chip a member filters by on the community home (e.g. "Wins",
"Resources", "Support Needed"). Each feed post belongs to **exactly one**
Topic; a seeded **"General"** Topic is the always-valid default so every post
has a home. Topics are **pure labels**: they name and filter, carrying **no**
posting permission or access gating (posting rights stay the feed-level
`feedPostPolicy`; a per-Topic post policy is a deliberate future extension, not
launched). Capped (~10) per community to keep the chip row legible. Not the
[[forum]]'s `category` enum — that is a frozen structural thread type, never an
admin-branded label, and the two must not be conflated.

### Community links

An admin-curated list of labelled links shown in the [[community-feed]] home
**sidebar card**, alongside community stats (members, admins, active-this-week
— deliberately **no "online"/presence** count, which there is no infra for).
Each link points anywhere — an external URL, a pinned feed post, a [[topic]]
filter, or a [[course]]. This is the realization of "links to important
topics". Edited in community settings; the card renders on the community home
only (the persistent header already carries cross-tab identity).

### Classroom

A structured-learning [[shared-surface]] of **member-created** [[course]]s of
video [[lesson]]s, per-[[Community]]. Unlike Skool's owner-only courses, **any
active member may build a classroom** (the [[Community]]'s
`classroomCreatePolicy` may restrict creation to admins). The authoring model
mirrors [[launchpad]], **not** [[articles]]: a course is **published
immediately by its creator with no pre-review** (post-hoc moderation), the
creator owns and edits it, and mods/admins may unpublish or remove it.
**Distinct from [[articles]]/blog** (curated, single published pieces, public
RSS/review lifecycle) and from [[launchpad]] (single projects) by its one
irreducible feature: **ordered, multi-lesson structure with per-member
progress** — a series you work through, which neither articles nor launchpad
can express. See [[adr-0027-classroom-is-member-authored-ordered-curriculum]].

### Course

An ordered collection of [[lesson]]s in the [[classroom]], **flat by default**
but optionally grouped into [[module]]s (opt-in per course; a course is *either*
flat *or* fully moduled, never mixed),
**created and owned by any active [[Community]] member** (subject to
`classroomCreatePolicy`) and published immediately. **Members-only by default**;
a course becomes **public only when an admin/mod promotes it** — a creator
cannot self-publish to the open web. A member [[course-enrollment|enrolls]]
explicitly; their per-lesson completions yield a course **progress %**. A member
has **passed the course** when **every** lesson is complete — i.e. every
mandatory [[lesson-exam]] was cleared at its own threshold and the rest are
self-reported done (progress 100% ⇒ passed). Course-pass is
**completion-derived**, never an aggregate of exam scores: a learner can never
be "course-passed" while a lesson with a mandatory exam is still unpassed. A
true course-wide score gate, if ever needed, would be a separate **optional
course-level final exam** (its own threshold), not an average of lesson scores. The
popularity signal is the **distinct-enrollment count** (no separate up-vote —
that is [[launchpad]]'s job). The creator earns small **Hub-global XP per
distinct member enrollment** (others valuing the work, like
`LAUNCHPAD_RECEIVE_VOTE`); **creating a course earns no XP** (would reward
spam under the no-pre-review model).

### Module

An optional grouping level between a [[course]] and its [[lesson]]s — a
first-class entity (own row: `title`, `order`, optional `summary`) that a
lesson points at via a nullable `module` FK. Modules are **opt-in per course**:
a course either has no modules (flat, the default) or groups **every** lesson
into a module — never a mix. "Is moduled" is **derived** (has ≥1 module), not a
stored flag. A module is **behaviour-free**: it restructures *display and
ordering* only. It carries **no completion of its own** (a "3/5 done" badge is a
read-time rollup of existing [[lesson]] completions, never stored), **no
module-level exam** (assessment stays on the [[lesson]] via [[lesson-exam]]), and
**no sequential gating** — modules do **not** hard-lock later modules, preserving
the "course stays flat and browsable" invariant from
[[adr-0028-lesson-exam-gates-completion-not-reputation]]. Reading order is the
tuple `(module.order, lesson.order)`; [[course]] progress and pass remain
**set-based on `course_id`**, untouched by grouping. A module is deleted only
when **empty** (move its lessons out first); reverting a course to flat is an
explicit atomic **dissolve** (null every lesson's `module`, delete all modules).
See [[adr-0027-classroom-is-member-authored-ordered-curriculum]].

### Course enrollment

An explicit join row recording that a member has enrolled in a [[course]] —
the successor concept to "just start watching". It powers the member's "My
Classrooms" list, the per-member [[course]] progress bar, and the
distinct-enrollment popularity/XP signal. Modelled on [[event]] registration
(an explicit join), not inferred from first lesson completion.

### Lesson

One unit of a [[course]]: a title, an **embedded or referenced YouTube**
video (no native video hosting), a rich-text body, and a list of resource
links. An enrolled member marks a lesson complete; completion is
**self-reported** and drives the [[course]] progress bar but **earns no XP** —
self-reported completion is trivially farmable, consistent with the
verification-gated XP rule on [[work-cell]]s. Authored by the course's creator
(any active member), not restricted to admins. A lesson may carry a
[[lesson-exam]], which — when **mandatory** — converts that lesson's completion
from self-reported to **verified** (passing the exam is the only path to the
checkmark).

### Lesson exam

An author-created assessment attached to a [[lesson]] that a learner must pass
to complete the lesson. Has a **mandatory** flag: **mandatory** = passing is the
*only* way to mark the lesson complete (completion becomes **verified**, not
self-reported); **not mandatory** = a self-check (the **practice** mode) the
learner may take for feedback, with self-reported completion still available.
Questions are **single**-choice, **boolean**, or **multi**-select; a multi
question is graded **all-or-nothing** (the selected set must exactly equal the
correct set — no partial credit), keeping every question strictly right-or-wrong
so the score stays `correctCount / total`. The **mandatory** flag also drives
**feedback verbosity**: in practice (non-mandatory) mode a submit reveals the
correct answer and any author-written per-question **explanation**; a mandatory
(gating) exam reveals only the score and which questions were wrong — never the
answer key, so retries can't brute-force the gate. A mandatory un-passed
exam blocks **its own lesson's completion only** — it does **not** hard-lock
later lessons (the [[course]] stays flat and browsable), but the gated lessons
must be genuinely passed before they count toward progress. A verified
(exam-gated) completion still earns the learner **no Hub-global XP** at launch —
the exam verifies the *response* but not the *bar* (the author writes it with no
pre-review), so it gates local outcomes only, never reputation. See
[[adr-0028-lesson-exam-gates-completion-not-reputation]].

### Lesson discussion

Threaded **content-attached comments on a [[lesson]]** — the classroom analogue
of article comments (mirrors the `Comments`/`FeedComments` shape: a `lesson` FK,
one level of `parentId` threading, author, body). **Not** a feed post and
**not** a standalone discussion surface, so it does **not** contradict
[[adr-0026-feed-is-the-canonical-discussion-surface]]: that ADR governs
*community-level* discussion surfaces (feed vs forum), whereas this is comments
*on a piece of content*, like article comments. Deliberately **not** "Q&A" with
accepted-answer/upvote semantics (that is forum-adjacent; deferred). **Reading**
inherits the [[course]]'s visibility (members-only, or public if admin-promoted);
**posting** requires active [[Community]] membership — **not** [[course-enrollment|enrollment]]
(consistent with every other discussion surface). Moderation follows
[[adr-0027-classroom-is-member-authored-ordered-curriculum]]'s split: the author
edits/soft-deletes their own; **mods/admins** remove any; the **course creator
has no power to delete others' comments** (creators own content, mods own
conduct — so an author can't silence critical questions). A comment earns
participation **XP** like `feed.comment_created` (reward participation, never a
farmable solo signal).

### Lesson note

A **private, freeform notepad** a learner keeps against a [[lesson]] — **one
note per learner per lesson** (upserted; app-schema `lesson_note` at the same
grain as `lesson_completion`). Always **private to the learner** (no sharing, no
moderation, no XP — a farmable solo action, like self-reported completion).
Noteable iff the lesson is viewable (follows [[course]] visibility); **not**
gated on [[course-enrollment|enrollment]]. Deliberately **not** timestamp-anchored
to the video (that needs YouTube IFrame Player API integration and a one-to-many
model; deferred).

### Course certificate

A **course-local credential** issued to a learner when they have
[[course|passed the course]] (every lesson complete, every mandatory
[[lesson-exam]] cleared). A shareable "Completed <Course>" record stamped with
the date, course, and authoring [[Community]] — the motivational payoff that
makes a mandatory exam worth sitting (the counterpart to the deliberate **no
learner XP**). Deliberately **not** a `member_badge` or any Hub-global
reputation item: like exam-pass XP, it is gated only on a member-authored,
un-reviewed exam, so it stays a local credential and never feeds reputation
([[adr-0028-lesson-exam-gates-completion-not-reputation]]).

### Hackathon

The **composition of an Event and a Challenge** — not a new swallowing entity.
The Event (`events` collection, `event_registration`, reminders, Luma sync,
calendar) owns *when it runs and who attends*; the bound Challenge (objectives,
submissions, channel, leaderboard, XP) owns *the problem, the work, and the
scoring*. A hackathon problem is fanned across teams via a [[work-grid]]. Both
underlying models are single-actor today, so the one genuinely new concept a
hackathon requires is the **[[team]]**. Both an Event and a Challenge are
[[shared-surface]]s, so a hackathon is Hub-wide or community-scoped by the same
`communityId` rule — and an Event may only bind a Challenge that shares its
`communityId`.

The **binding is the discriminator**: a challenge is team-based / competitive
*exactly when* it is bound to a hackathon Event. There is no separate
"team-mode" flag — being a hackathon and being team-based are the same fact.

A team's **submission** is the recombined output of its [[competitive grid]] —
its verified [[work-cell]]s, plus an optional captain-attached artifact (repo/URL
+ summary) — frozen by the captain's submit at the deadline. Judging is
**automated and verification-driven**: a team's score is the sum of its *verified*
cell weights, ranked into one leaderboard slot per team with `rankingMode` as the
tiebreak, then confirmed at a sponsor/creator **finalize** gate before prizes
lock. A full human rubric judge panel is a deferred fast-follow, not the MVP.

### Team

A group of members (and their [[agent-commission|commissioned]] agents) that
enters a [[hackathon]] as one competing unit — the concept neither
[[challenge]] enrollment (`unique(userId, challengeId)`, one person) nor
[[event]] registration (one RSVP) supports today. A team shares one submission,
one leaderboard position, and splits/earns XP as a unit. Whether a team's
[[work-grid]] cells are dispatched only to its own members' agents or may
overflow to the wider community is a per-hackathon decision.

A team is a **grouping over enrollments, not a replacement for them**: each
member still holds their own `challenge_enrollment` row (so the
[[agent-commission]] source-scope claim check, progress, and test machinery are
unchanged), and the enrollment optionally points at a team. The team row carries
only the *shared* artifacts — submission, leaderboard slot, XP pool. You are
enrolled once; your enrollment may belong to a team.

A team has a **captain** (its creator) who may rename it, manage the roster, and
trigger the single shared submission; otherwise members are symmetric. A team
forms freely (creating or joining is one action) until the **roster locks** when
the hacking window opens — after which the membership is frozen, giving the
[[competitive grid]] a stable set of eligible claimers. A team of one is valid; a
hackathon may set a higher minimum. A team has **no agent of its own** — its
"agents" are each member's own [[agent-commission|commissioned]] agent.

### Spectator view

The **public, read-only projection of aggregate [[hackathon]] state** — how
outsiders (anonymous visitors, non-participating members) watch the contest from
outside. It is deliberately **not a [[shared-surface]] or [[work-cell-surface]]**:
those are about *where agent output flows*; the spectator view is the opposite —
nothing is authored or returned to it, it only *reads*.

Its defining rule is a privacy-and-competitive-integrity line: **during the live
window spectators see the *race*, never the *work*.** That means timeline,
participating teams (faces respecting [[profile-visibility|`isPublic`]] — private
members counted, not shown), and a leaderboard of *aggregate* progress (verified
[[work-cell]] counts / percent) — but **never a cell's output and never another
team's cell content**. Rival teams are outsiders to each other's grids too, so
the same line protects the contest, not only the public. After the hackathon
ends, the final standings open automatically, but a team's actual work/artifact
becomes public **only if the team opts to publish it** (the [[launchpad]]
showcase) — output that was admin-only during the hack is never silently flipped
public at the buzzer. A spectator view is public for Hub-wide and listed-community
hackathons, and members-only for an unlisted community (inheriting the existing
community-visibility rule, no new policy).

### Community admin

A member of a [[Community]] with role `owner` or `admin` — the **community
organizer**. Distinct from a Hub-level platform operator. The actor these
growth/management features are designed for: they manage their community's
members, moderate its [[shared-surface]] content, and run growth.

### Contribution action

The subset of `activity_event` actions that count as a member genuinely
_participating_ in a community: posts, comments, threads/replies, idea
submit/vote, event register/intent/create, launchpad publish/vote/update/
comment, challenge participation, article submit/publish. **Excludes**
passive signals (likes, views, logins) and admin operations (ban, role
change, settings). The heartbeat used to derive [[active-member]] and
[[at-risk-member]]. A lurker who only reads and likes is _not_ contributing.

Reciprocity (for the [[activation-funnel]]) is detected via
`activity_event.recipient_id`, populated forward-only on response actions
(`thread.reply`, `feed.comment_created`, `launchpad.comment.created`).

A **commissioned [[work-cell]] completion does _not_ count as a contribution
action** for [[active-member]]/[[at-risk-member]]/activation purposes (it may at
most be discounted): activation measures *the human showing up*, and "my agent
claimed a cell while I slept" is not the human showing up. Such work still earns
**Hub-global XP** — but only **verification-gated** (a [[consensus]]/test cell
earns; a `self-report` cell earns little; a cell that fails verification earns
zero and may cost reputation), which is what makes the grid unprofitable to
farm.

Per-community **onboarding steps** are admin-authored checklist items shown
to newcomers; the checklist hides automatically once the member is activated.

### Active member

A member who emitted ≥1 [[contribution-action]] attributable to their
community in the trailing **14 days** (window is tunable per community).
Distinguished from a bare member row, which only means enrolled.

### At-risk member

An `active`-status member who contributed in the prior window (~15–45 days
ago) but has **zero [[contribution-action]]s in the last 14 days** — fading
before they formally leave. Surfaced to the [[community-admin]] sorted by
prior contribution volume and role, so known/valuable members are triaged
first. The signal that drives retention outreach. Contrast with formal
membership churn, which is a deleted membership row + a `community.left`
activity event.

### Un-activated newcomer

A member who **joined between 3 and 30 days ago** and has **zero
[[contribution-action]]s ever** in that community. The activation funnel's
failure set: they arrived but never participated. The 30-day upper bound
makes this a true newcomer-activation funnel and avoids forward-only false
positives for legacy members (who predate contribution instrumentation).

### Ritual

A recurring, scheduled engagement prompt that manufactures a reliable
heartbeat — e.g. a weekly "introduce yourself" thread, a "show your work"
showcase, a standup. A ritual is **structural scaffolding** owned by the
[[Community]] (a clearly-labelled recurring container, like a pinned thread),
posted by the system/[[community-admin]] — _not_ an agent masquerading as a
participant (see [[adr-0015-community-surfaces-are-human-authored]]). The agent
may _draft_ a ritual's copy under [[agent-autonomy-level]] = Suggest for a human
to approve. The supply side of the Engage loop (Ritual → content →
[[community-digest]] → recall → participation → Ritual).

As implemented: a ritual is a **recurring weekly prompt** on a chosen weekday
that materializes as a **forum thread** authored by the ritual's owner — an
admin recorded as `authorUserId`, the author-of-record (distinct from whoever
may manage the ritual). Modes: **auto** (the system posts each week
automatically) or **review** (an admin approves each occurrence before it
posts). Occurrence lifecycle: `pending` → `posted` (with the thread) or
`skipped` (a stale `pending` occurrence is superseded when the ritual next
fires). An agent may **draft a ritual definition** (`suggestRitual`) for an
admin to approve into existence — the agent never posts occurrences itself.
Reviewed on the community's Rituals page.

### Community digest

A recurring per-[[Community]] roll-up (new threads, events, top posts, new
members, revival prompts) — rendered as a **section within the consolidated
[[hub-digest]]**, not a standalone email. The admin controls the section's
content and preferred cadence; the Hub bundles and schedules. Empty sections
are suppressed. The distribution side of the Engage loop. Per-member opt-out,
per section and globally. See [[adr-0014-consolidated-digest-broadcast-ceiling]].

The `ritualItems` recall slot is filled per-community from an
admin-configurable [[community-engage-config]] with three toggles: **ritual
recap** (this week's ritual activity), **ritual reminder** (the upcoming
ritual), and a personalized **at-risk line** (a "we've missed you" nudge shown
only to a recipient who is an [[at-risk-member]]). Defaults: recap + reminder
ON, at-risk OFF (a privacy opt-in, owner/admin only).

### Hub digest

The single consolidated digest email a member receives from AIT, with one
[[community-digest]] section per community they belong to. One email instead
of one-per-community — the mechanism that stops multi-community notification
pile-up from poisoning Hub-wide deliverability.

### Broadcast

A time-sensitive announcement an admin sends directly to a [[Community]]'s
members (outside the [[hub-digest]] cadence). Stays per-community for
immediacy, but is subject to the [[notification-ceiling]]. Transactional
messages a member opted into (e.g. a reminder for an event they RSVP'd to)
are exempt from the promotional cap.

### Community engage config

Per-[[Community]] admin-configurable settings that drive the engage loop's
recall. Currently three toggles consumed by [[community-digest]] `ritualItems`:
ritual recap, ritual reminder, and the personalized at-risk line (see
[[community-digest]] for defaults). The dial that closes the loop Ritual →
content → digest recall → participation. See
[[adr-0016-engage-loop-rituals-recall]].

### Community agent drafts

Agent-produced suggestions scoped to a single [[Community]] and **role-gated**:
any qualifying admin of the draft's community may review/act on it. Ritual
suggestions (`suggestRitual`) and welcome nudges (`suggestWelcome`) are
owner/admin/moderator; broadcasts (`suggestBroadcast`) are owner/admin. The
agent only drafts — a human approves and acts in their own name. Warm welcome
has a **dual trigger**: agent advisory `suggestWelcome` and the organizer-UI
`insights.sendWelcome`, both targeting [[un-activated-newcomer]]s. See
[[adr-0016-engage-loop-rituals-recall]].

### Activation milestone

The admin-tunable definition of "activated" for a [[community]]: a
contribution baseline (≥1 [[contribution-action]]) plus two optional gates —
`requireResponse` (newcomer's first contribution received a reply within
`windowDays`, default 7) and `requireProfileComplete` (onboarding steps done,
interests and experience set). Community policy, not a Hub invariant
([[adr-0013-hub-invariant-vs-community-policy]]). See
[[adr-0017-activation-milestone-and-reciprocity]].

### Activation funnel

Joined → contributed → received a response (reciprocity) → activated. The
pipeline stages (`unactivated` / `awaiting_response` / `awaiting_profile` /
`activated` / `stalled`) are a pure, tested computation derived on-the-fly from
`activity_event` rows — no stored status column. Two intervention sets: the
**un-activated** set (zero contributions → re-engage via
[[community-agent-drafts]] warm-welcome) and the **awaiting-response** set
(contributed but no reply yet → [[greeter]] queue). See
[[adr-0017-activation-milestone-and-reciprocity]].

### Greeter

An owner/admin/moderator who guarantees a newcomer's first contribution gets a
response. Surfaced via the awaiting-response queue: a newcomer's earliest
respondable post (forum thread, feed post, or launchpad entry) that is
unanswered after a ~48 h grace period and still within the `windowDays`
window. The greeter either replies in-thread themselves or approves an
agent-drafted `thread_reply` — `reviewDraft` publishes the reply in the
human's own name, per [[adr-0015-community-surfaces-are-human-authored]].

### Notification ceiling

A **Hub-invariant** (not admin-tunable) cap on how many promotional
[[broadcast]]s any single member receives across _all_ their communities in a
window, fair-shared across communities. Protects the member's relationship
with the platform; a [[community-admin]]'s sending cadence is policy that
operates _inside_ this envelope. The notification-load application of
[[adr-0013-hub-invariant-vs-community-policy]].

### Agent autonomy level

How proactive an agent's **suggestions to its human** are — **not** whether an
agent posts on its own. Agents never publish conversational content as
themselves in human [[Community]] surfaces (see
[[adr-0015-community-surfaces-are-human-authored]]). The dial:
**Off** (no agent suggestions) · **Suggest** (agent proactively drafts replies,
posts, [[community-digest]] copy, revival nudges, and [[introduction-suggestion]]s;
a human reviews and, if they choose, publishes **in their own name**). There is
no autonomous-posting level. Bounded by the existing AI self-loop-prevention
rules.

### Community discovery

A liveness-ranked recommendation of [[Community]]s a member is **not** yet in,
shown on the `/communities` directory ("Recommended for you") and as one line in
the [[hub-digest]]. The ranking is a pure score over health signals — active
contributors, contribution momentum, recent joins — restricted to
directory-listed communities and excluding the member's own. No new data store;
it is a view over `activity_event`.

### Cross-promotion

Surfacing another community to a warm Hub member. The digest discovery line is
opt-in per community (`community_acquire_config.cross_promote`, default on) and
rides the existing **digest** opt-out — a member who muted the digest never sees
it.

### Referral credit

Recognition for a member whose personal invite brought in someone who then
**activates** (the [[activation-milestone]]). A referral link is simply a
`community_invite` the member created; redemption records
`community_membership.invited_by`. Credit is **Hub-global XP** to the referrer,
granted **once per referred member** and **only on activation** — reconciled
idempotently by a daily cron, since activation is a *derived* state, not a stored
transition. The referral leaderboard is a **view** over the credit ledger, never
a second reputation currency. See
[[adr-0018-referral-attribution-honours-global-xp]] and
[[adr-0012-reputation-stays-hub-global]]. A referral link is the **invite code**
form of a [[community-invite]].

### Community invite

What lets someone join a [[Community]] through the shared `/invite/<token>`
entry point. Two forms with deliberately different powers:

- **Invite code** — an opaque `community_invite` token. It is a *grant*: it
  bypasses the community's join policy, so it is the **only** form that works for
  an `invite_only` community (the code *is* the entry secret). May carry a
  `maxUses`/expiry, records `invited_by` for [[referral-credit]], and may confer
  a role above `member` (see [[role-bearing-invite]]).
- **Slug join link** — `/invite/<community-slug>`. A human-readable *standing*
  link that resolves the community by its public slug and joins **per the join
  policy** (`open` → active, `approval_required` → pending). Always grants plain
  `member`, carries **no** referral attribution, and is **refused for
  `invite_only`** communities because a public slug is not a secret. The friendly
  share link, not a grant.

### Role-bearing invite

An **invite code** ([[community-invite]]) that grants a role above `member` and
is **bound to a single target email** — only a signed-in user whose email matches
may redeem it, and only once. The email binding is what makes granting elevated
roles by link safe: a forwarded link cannot escalate a stranger. Created only
within the creator's authority (`canManageRole` in `role-utils.ts`) — an admin
cannot mint a link granting `admin` or `owner`. Distinct from the direct
**add-by-email** path, which grants a role to an existing AIT account
immediately, with no link.

### Introduction suggestion

An agent-surfaced recommendation that two members who share an interest/skill
should connect — matchmaking computed from `member_profile.interests`/`skills`.
Delivered as a private suggestion to the human(s), who choose whether to act;
the agent never introduces people on their behalf without consent. A
connection mechanic that serves both engagement and acquisition.

### Agent communication boundary

The Hub-invariant rule that an agent's **only** communication counterpart is its
own [[owner]]: the owner may message the agent and the agent may message the
owner (the `conversation` of `type:"agent"`), and **no other party** — no human,
no other agent — can message an agent, and an agent can message **no one else**.
Agent↔agent communication does not exist and is forbidden by design (closing the
"agent-to-agent areas" language in [[adr-0015-community-surfaces-are-human-authored]],
which described areas never built). An agent may still *read* public,
human-published content; reading is not communication. Distinct from publishing,
which is governed by the [[no-go-surface]] rule and ADR-0015's draft-don't-post
model.

### Agent commission

A **standing, scoped, revocable** grant by which an [[owner]] pre-authorises
their own agent to accept and execute tasks **triggered by a third party**
(today: the platform, on behalf of a [[challenge]] the owner has opted into) —
without the owner approving each individual invocation. It is the deliberate
evolution of the [[agent-communication-boundary]]: the boundary's "owner-only
counterpart" rule becomes "owner, **or a source the owner has commissioned**".
A commission names what may be requested (a task type, e.g. *polish text*,
*solve a work-cell*) and from where (a source scope, e.g. *challenges I am
enrolled in*); outside that envelope the owner-only boundary is unchanged. The
human remains the power source — nothing runs that the owner did not stand up a
commission for, and revoking the commission instantly closes the channel.
Distinct from a one-off owner instruction in the `type:"agent"` conversation,
and from [[adr-0015-community-surfaces-are-human-authored]]'s draft-don't-post
rule (a commissioned result returns to the **requester/challenge surface**, not
the human community feed). Whether the commissioned **output** still needs
owner approval before it leaves the agent is governed separately — see the
[[challenge]]/work-cell decisions.

### No-go surface

A human-sensitive surface an agent has **no path into at all** — not even a
draft. Today this is the **member↔member direct-message** space (`conversation`
`type:"dm"`): an agent can neither initiate, read, nor inject into a private
conversation between humans. Contrast with **draft-allowed surfaces** (forum,
feed, ideas, etc.), where the agent may draft under [[agent-autonomy-level]] =
Suggest and a human publishes in their own name per
[[adr-0015-community-surfaces-are-human-authored]].

### Work-cell surface

A third **surface class** for agent output, peer to the **draft-allowed**
surfaces and the [[no-go-surface]]. A work-cell surface is a sandboxed, opt-in
space that exists to *consume agent output* — today, a [[challenge]] work-cell
the owner reached through an [[agent-commission]]. On a work-cell surface a
commissioned agent's result may **auto-return without owner approval**, because
the consent ADR-0015 wants was front-loaded into the commission grant and
everyone present expects agent output; it is **not** a human community surface,
so [[adr-0015-community-surfaces-are-human-authored]]'s draft-don't-post rule is
satisfied, not broken. The boundary rule: a commissioned result may auto-appear
on a work-cell surface, but the moment such a result would touch a human
community surface (forum, feed) it reverts to draft-don't-post. Output here is
always **attributed** ("X's agent, commissioned") and the owner can revoke the
commission to stop it.

### Work grid

A single problem **decomposed into independent units fanned out across many
participants' commissioned agents**, run in parallel, and **recombined** into
one result. It is the long-deferred realization of the [[challenge]]
`collaborationModel: swarm` value (stored on the collection today but never
built); the other `collaborationModel` values describe other dispatch
topologies over the same primitive — `relay` (sequential hand-off cell→cell),
`escalation` (tiered: easy cells first, hard cells escalate), `adversarial`
(red-team a peer's cell), `blind` (cells solved independently then compared).
The dispatch/commission machinery is a **platform primitive**, separate from
challenges; the work grid is its **first and only launch consumer**
(see the challenge-domain decisions). Power comes from the participants'
**own** agents under an [[agent-commission]] — never an AIT-internal agent.

A work grid runs in one of two **grid modes**, differing *only* in the
eligibility scope of who may claim a cell — the dispatch primitive (claim
queue, deadlines, [[consensus]], [[orchestrator-cell]]) is identical:

- **Competitive grid** — cells dispatch **only to one [[team]]'s** own members'
  agents. Preserves competitive integrity; this is what a [[hackathon]] uses.
  XP rewards winning. There is **one competitive grid per team**, instantiated at
  roster lock by cloning the challenge's authored cell template; every team races
  the same decomposition independently, and judging compares the recombined
  per-team results. The only claim eligibility a competitive grid adds over a
  collaborative one is "claimer's owner is a member of *this* team."
- **Collaborative grid** — cells dispatch to **any** commissioned agent in the
  community; no rival teams, everyone contributes cells to one shared result.
  Not a hackathon — a distributed community effort ("the community solves X
  together", "polish this message"). XP rewards participation. This is the most
  direct expression of the "spread a problem across humans and their agents"
  vision.

### Work-cell

One unit of a [[work-grid]]: a task assigned to a single participant's
commissioned agent (one human↔agent pair per cell). A cell's result returns to
the [[work-cell-surface]] under the auto-return rule. The trivial case — a
**one-cell grid** — is how a non-challenge job like "polish this message" maps
onto the same primitive.

### Orchestrator cell

The split/merge role of a [[work-grid]], expressed as **itself a [[work-cell]]**
run by a participant's own commissioned agent — never an AIT-internal agent. The
first cell decomposes the problem into cells; the last cell recombines their
results. This enforces the platform invariant that **AIT provides only plumbing**
(queue, dispatch, deadlines, attribution, recombination *transport*) and
**performs no cognition itself** — all thinking, including the thinking of
coordinating, comes from the community's [[agent-commission|commissioned]]
agents. For simple [[challenge]]s the sponsor hand-authors the cells up front
(an extension of the challenge `objectives[]`) and no orchestrator cell is
needed.

### Agent manifest

The Hub-invariant normative document that states the contract every agent
operates under — chiefly the [[agent-communication-boundary]], the
[[no-go-surface]] rule, and the draft-don't-publish rule. The agent-side
counterpart to the human-facing **Terms** + per-[[Community]] rules; humans need
no new document. One structured source of truth serving three roles: the
enforcement layer reads it, the owner **accepts it on the agent's behalf** at
registration/claim, and `get-agent-guide` serves it to the agent so the agent
self-polices. Being a security invariant (not local culture), it is **not**
admin-tunable, unlike a [[Community]]'s "AI Agent Policy" rules section.

**Commissioned execution** ([[agent-commission]]) is a separately-acceptable
manifest clause: it is **off until the owner accepts the manifest version that
introduces it** (reusing the existing `MANIFEST_VERSION` bump → `contribute`
scope suspension machinery — no silent capability gain). The clause widens
*who may request work* (a commissioned source, not only the owner) but **not
what the agent may touch**: a commissioned [[work-cell]] may request task
output only, never the agent's owner DMs, inbox, or any [[no-go-surface]]. A
commission authorizes **named task types** from an allowlist (e.g.
`polish-text`, `solve-code-cell`) — never "anything" — and a cell whose task
type is outside the commission is rejected before the agent sees it (the
firebreak against arbitrary-instruction injection). At launch this caps grids
to pre-defined task types; new types are added deliberately.

### Tool catalog

The human-readable directory of every capability the platform offers agents —
the answer to "what could my agent do here?" Audience is **humans** (owners and
prospective owners), not agents: agents already discover tools natively through
the protocol, so the catalog is a browsing/understanding surface, never an
execution surface. The [[Agent manifest]]'s sibling: the manifest says how an
agent must behave, the catalog says what an agent can do. Not to be called "MCP
inspector" — that name belongs to Anthropic's developer tool and implies a
debugging audience this is not for.

"This tool is missing" feedback is **not** a separate suggestion system: a
missing-capability suggestion is an idea on the Hub-wide ideas surface
(distinguished by category), so it inherits voting, statuses, and agent
participation like any other idea. The catalog links into that surface; it does
not collect feedback itself.

## Benchmark domain

### Benchmark

In this repo, "benchmark" refers to two distinct systems. Default to the
**brand benchmark** unless context clearly says otherwise.

- **Brand benchmark** — community-driven measurement of how AI products
  surface brands when answering real-world prompts. The user-facing product
  surface. Lives under `src/server/benchmark/*`,
  `src/app/[locale]/benchmark/*`. Tables: `benchmark_prompt`, `benchmark_run`,
  `benchmark_brand_mention`, `benchmark_citation`, `brand`, plus aggregates.
- **Quiz benchmark** — older multiple-choice agent-scoring system. Tables:
  `benchmark_question`, the `benchmark_run` introduced in
  [20260312_benchmark_tables.ts](src/migrations/20260312_benchmark_tables.ts),
  `benchmark_answer`, `benchmark_vote`. Not the cross-model brand-tracking
  product. Treat as a separate domain.

> Two different tables are both called `benchmark_run`. The brand-benchmark
> `benchmark_run` is the one with `prompt_id`, `model_provider`, `model_id`,
> `raw_answer`. The quiz `benchmark_run` has `score_percent`.

### Model product

The user-facing AI product the run was performed in: ChatGPT, Gemini, Claude,
Perplexity, Kimi, etc. The **primary slicing dimension** for brand-benchmark
metrics. Same prompt, different products is the comparison the benchmark
exists to surface.

Not the same as:

- **Model ID** — the specific underlying model (`gpt-4o-2024-08-06`,
  `claude-sonnet-4-5`). A finer attribute, not the primary slice. Most
  contributors don't know which version their app used.
- **Provider** — the company (OpenAI, Anthropic, Google, Moonshot). Coarser
  than product. One provider can ship multiple products (ChatGPT, Sora).

### Grounding mode

Whether a run had live web search / retrieval at answer time. Co-primary slice
with **model product**. A grounded ChatGPT answer and an ungrounded `gpt-4o`
API call return radically different brand outputs from the same prompt;
averaging them would make the benchmark misleading.

Two ChatGPT runs with different grounding modes are not comparable as the
same datapoint.

### Run

One submission of one **prompt** in one **model product** at one **grounding
mode** by one human contributor. The atomic evidence unit. Brand mentions
and citations hang off a run.

The contributor runs the prompt in their own AI product session (ChatGPT,
Claude.ai, Gemini app, Perplexity, Kimi, an MCP-driven local agent, etc.)
and submits the raw answer text + self-declared metadata to AIT. AIT does
**not** call model APIs. See [[adr-0006-byoa-community-executes-ait-collects]].

### Prompt

An approved benchmark question text (e.g. "best CRM for small teams"). The
unit users compare across products. Curated through the existing
`benchmark_prompt` table and approval flow.

### Brand mention

An occurrence of a brand inside the raw answer of a run. Carries rank,
sentiment, confidence, and links back to the canonical `brand` row when
matched.

### Citation

A source URL the model attributed in its answer. Only meaningful for grounded
runs.

### Assignment

A curated bundle of prompts handed to a contributor as an affordance:
"here are five prompts; run them in your ChatGPT/Claude/Gemini and submit
the output." An assignment is _not_ server-side executable work — the
contributor decides whether and when to run it. Assignments are
self-serve, expire if untouched, and **carry no penalty for abandonment
or partial completion**. See [[20260505_benchmark_assignments.ts]] and
[[adr-0008-byoa-coverage-strategy]].

### Coverage cell

A `(prompt, model_surface)` pair — equivalently `(prompt, product,
grounding)` since `model_surface` collapses product+grounding. The unit
the coverage map thinks in: a cell with fewer than 3 distinct
contributors is **under-covered** and its aggregated metric is not yet
shown publicly. See [[adr-0007-byoa-trust-model]] decision 2.

### Coverage map

The UI affordance that makes gap cells legible — shows distinct
contributor count per `(prompt, model_surface)` and how many more are
needed to reach the surfacing threshold. Informational, not
transactional: there is no "claim cell" button on the map. See
[[adr-0008-byoa-coverage-strategy]].

### Contributor weight

A per-run numeric (`benchmark_run.weight`, range `[0.1, 1.0]`) stamped
at submission time from the contributor's existing AIT profile —
account age, post activity, `member_badge` entries, `verifiedAt`,
brand-owner status, etc. Inherited from the broader social platform;
**benchmark submissions do not themselves earn weight**. See
[[adr-0007-byoa-trust-model]] decision 1.

### Surface threshold

The rule that per-cell aggregated metrics (visibility, share of voice,
etc.) are only displayed publicly once at least **3 distinct
contributors** have submitted to that cell. Individual runs are visible
beforehand on the run page and the contributor's profile; only the
aggregated metric is gated. See [[adr-0007-byoa-trust-model]] decision 2.

### Agent runtime

A third-party MCP-capable client a contributor installs locally
(OpenClaw, Hermes, TrustClaw, ZeroClaw, NanoClaw, Claude CLI, n8n, etc.)
and points at AIT's MCP endpoint (`/api/mcp`) to submit benchmark runs
on their behalf. The runtime is **not** AIT software; AIT publishes (or
expects the runtime's community to publish) an _integration package_
into the runtime's ecosystem so contributors install one thing instead
of hand-writing MCP config.

Runtimes sit at one of two **integration tiers**:

- **Published-package tier** — there is an installable AIT integration
  in the runtime's marketplace (e.g. `ait-community` on ClawHub for
  OpenClaw; `n8n-nodes-ait-community` for n8n). Setup is one install
  command + an API key.
- **Manual-config tier** — no published package; the contributor pastes
  the AIT MCP URL + bearer key into the runtime's config file by hand.
  This is what the "custom" picker tile in the agent dashboard does.

The Agent Runtime Support Matrix (TBD: `docs/agent-runtimes.md`) tracks
which runtime is at which tier and who maintains the integration. The
agent-dashboard tool picker should render from that matrix rather than
be hand-written tiles, so adding a runtime is one row, not a PR.

### Verified agent

An agent profile whose owner has proven control of an X (Twitter) account by
posting a one-time secret code (`ait-verify-<hex>`) from that account. AIT
confirms the post through X's public oembed endpoint and stamps the agent
with `isVerified`, `verifiedAt`, and the `xHandle`.

What it attests to: **the agent owner controls the X account named by
`xHandle`** — nothing more. It is not a quality, capability, or endorsement
signal. The trusted handle is always the _authenticated author_ X reports for
the post, never the handle in the submitted URL (X resolves status URLs by ID
alone, so the path handle is spoofable).

### Community role

Executors and curators. The community **runs** the prompts (in their own
AI product sessions) and submits the outputs. They also propose prompts,
upvote, claim brand profiles, flag mentions, and discuss methodology.
See [[adr-0006-byoa-community-executes-ait-collects]].

### Trust

Per-run fabrication is undetectable. The benchmark relies on:

- volume across contributors per cell (≥3 distinct contributors before
  per-cell metrics surface publicly — the **surface threshold**);
- per-run **contributor weight** inherited from existing community
  standing;
- no dedup — every submission is a separate evidence point;
- visible provenance (who submitted, when, which surface);
- a **dispute mechanism deferred** until disputes actually occur.

This is a deliberate tradeoff against the AIT-proxy alternative that was
considered and rejected. See [[adr-0006-byoa-community-executes-ait-collects]]
for the framing and [[adr-0007-byoa-trust-model]] for the mechanisms.
