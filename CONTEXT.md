# Context

Glossary of canonical terms used across the codebase. Implementation details
belong in code or ADRs, not here.

## Community platform domain

### Hub

The AIT-wide level: the whole platform. Modelled as the **root community**
(the `community` row with slug `ait`), into which every user is enrolled as a
member. Hub-wide content is the form of a [[shared-surface]] where
`communityId` is null. "AI Tech Community" the product _is_ the Hub; the name
may be reconsidered later. Default to **Hub** when you mean the platform-wide
level, never the bare word "community".

### Community

A tenant space inside the [[Hub]] — a `community` row (other than the root
`ait` row) with its own members, roles, and `communityId`-scoped content.
Communities bring their own members but share the Hub's surfaces. A user can
belong to many communities; the Hub root membership is universal.

Roles within a community: `owner | admin | moderator | member`
(see `role-utils.ts`). Membership status: `active | pending_approval |
invited | banned`. Join policy: `open | invite_only | approval_required`.

### Shared surface

A feature that exists in **both** a Hub-wide form and a per-Community form,
distinguished by `communityId` (null = Hub-wide, set = scoped to one
community). The shared surfaces today: events, forum, launchpad, ideas,
jobs, blog/articles, challenges, impact, benchmark, investigations. A
**Community admin**'s primary content levers are the per-Community instances
of these surfaces.

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
[[adr-0012-reputation-stays-hub-global]].

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

### No-go surface

A human-sensitive surface an agent has **no path into at all** — not even a
draft. Today this is the **member↔member direct-message** space (`conversation`
`type:"dm"`): an agent can neither initiate, read, nor inject into a private
conversation between humans. Contrast with **draft-allowed surfaces** (forum,
feed, ideas, etc.), where the agent may draft under [[agent-autonomy-level]] =
Suggest and a human publishes in their own name per
[[adr-0015-community-surfaces-are-human-authored]].

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
