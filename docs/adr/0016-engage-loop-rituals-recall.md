# Rituals are system-posted scaffolding; digest recall is admin-configurable; the draft queue is community-scoped

**Status:** accepted

Slice C (Engage) closes the loop **[[Ritual]] → content → [[community-digest]]
recall → participation → Ritual**. Three decisions govern how it does so without
violating [[community-surfaces-are-human-authored]] (ADR-0015) or the
consolidated-digest rules (ADR-0014).

## 1. Rituals are structural scaffolding the system posts in an admin's name

A [[Ritual]] is the community's **recurring heartbeat** — a scheduled prompt
thread (weekly, on a chosen weekday) such as "introduce yourself" or "show your
work." Each occurrence materialises as a `forum_threads` post authored by a
real community admin (`authorUserId`, the *author-of-record*), and the system
may post it **automatically** on schedule (`mode = auto`) or hold it for an
admin to approve first (`mode = review`).

System auto-posting here does **not** contradict ADR-0015: a ritual is the
community's own scaffolding posted in a *human admin's* name, not an agent
masquerading as a participant. The agent's only touchpoint is **drafting ritual
definitions** (`suggestRitual` → an admin approves → the ritual is created);
the agent never authors or posts occurrences. So ADR-0015's "agents advise,
humans publish" rule is satisfied — the human who owns the ritual is the
publisher of every occurrence it emits.

## 2. Digest recall content is per-community, admin-configurable

The `ritualItems` slot of each [[community-digest]] section is filled from a
per-community `community_engage_config` with three independent toggles:
`ritualRecap` (this week's ritual activity), `ritualReminder` (the upcoming
ritual), and `atRiskLine` (a personalised "we've missed you" line shown only to
the recipient if they are an [[at-risk-member]]). Defaults: recap **on**,
reminder **on**, at-risk **off**. The at-risk line surfaces sensitive
engagement status into a member-facing email, so it is **opt-in** and gated to
owner/admin. The admin owning section content matches ADR-0014's "admin controls
section content and preferred cadence."

## 3. The advisory draft queue is community-scoped and role-gated

A [[Community]] has an owner plus multiple admins and moderators. Slice C's
community-level drafts (ritual suggestions, welcome nudges, broadcast drafts)
are therefore actionable by **any qualifying admin of the draft's community**,
gated by the actor's `communityRole` against `metadata.communityId` — not by
who owns the agent that drafted it. The draft's `agentId`/`ownerId` are kept as
**provenance only**. Role lines: owner/admin/moderator manage rituals and send
welcome DMs; owner/admin configure digest toggles and draft/send broadcasts
(deliverability + the sensitive at-risk toggle).

**Why:** the heartbeat must be reliable, so a ritual cannot depend on one person
clicking "post" every week — yet authorship must stay human, so the post carries
a real admin's name and admins can hold rituals for review when they want.
Recall is the digest's job, but blasting "we miss you" lines or exposing at-risk
status without an admin's choice would erode trust, so recall content is
opt-in-configurable. And because communities are run by teams, tying a draft to
a single owner created a bottleneck and contradicted the multi-admin reality;
scoping the queue to the community keeps any admin able to act.

**Rejected alternatives:**
- **Per-occurrence approval for every ritual** (no auto mode): safer but the
  heartbeat skips whenever an admin is away — defeating the point of a ritual.
  Kept as the opt-in `review` mode instead of the only mode.
- **Agent drafts per-occurrence copy**: more surface and more drafts to manage
  for little gain; the approved template drives occurrences. Deferred.
- **Single-owner draft queue** (Slice F's model): simpler, but bottlenecks a
  team-run community. Declined for the new draft types.

**Consequences:**
- New tables: `ritual`, `ritual_occurrence` (unique `(ritualId, scheduledFor)`
  as the no-transaction claim guard), `community_engage_config`.
- A stale `pending` review occurrence is **superseded** (→ `skipped`) when the
  ritual is next due, so the heartbeat stays current rather than queuing.
- `reviewDraft` gains `welcome_nudge` (organizer→member DM) and `broadcast`
  (reuses the Slice B broadcast send + ceiling) branches; the DM dedup/send is
  extracted to a shared `sendOrganizerDM` helper.
- Slice F's revival/introduction drafts remain owner-scoped for now; unifying
  them to community scope is a tracked follow-up, not part of this slice.
