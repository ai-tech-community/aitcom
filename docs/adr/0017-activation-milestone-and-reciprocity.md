# Activation is an admin-tunable milestone; reciprocity is instrumented; the greeter guarantees the response

**Status:** accepted

Slice D (Activate) turns a newcomer's **activation** into a first-class outcome
the community drives toward: **joined → first [[contribution-action]] → a
response received (reciprocity) → activated**. Three decisions govern it,
extending [[adr-0013-hub-invariant-vs-community-policy]] (activation is
community-policy) and [[adr-0015-community-surfaces-are-human-authored]] (the
greeter publishes as a human; the agent only drafts).

## 1. The activation milestone is composable community policy

A [[Community]]'s `community_activation_config` defines what "activated" means:
a **contribution is the implicit baseline**, plus optional `requireResponse`
(default **on**) and `requireProfileComplete` (default **off**), within a
`windowDays` (default **7**). The default is the ADR-0013 reciprocity milestone
("first contribution **plus** a reply received within ~7 days") — the signal
that actually predicts retention. Admins may relax it to "any first
contribution" or tighten it to also require a completed profile. "Profile
complete" means both the existing `onboardingCompleted` flag **and** declared
interests + experience level.

## 2. Reciprocity is detected by instrumenting `recipient_id`, forward-only

A newcomer "received a response" when someone else replies/comments on their
content. The `activity_event` table already carries a `recipient_id` column that
went unpopulated; Slice D **populates it** on the response actions
(`thread.reply` → thread author, `feed.comment_created` → post author,
`launchpad.comment.created` → project author). A response is then any event with
`recipient_id = member`, `actor_id ≠ member`, action in the response set. This is
**forward-only**: only events logged after this ships carry the recipient, so
activation reciprocity is measured from go-live, not back-filled. We accept a
short warm-up period over a fragile historical reconstruction.

## 3. The greeter guarantees the reciprocal response

Reciprocity only predicts retention if it actually happens, so a newcomer whose
first respondable contribution sits **unanswered after a short grace (~48h) and
still inside the window** surfaces in an **awaiting-response** queue for a
greeter (owner/admin/moderator). The greeter either replies in-thread directly,
or has the agent **draft** a welcoming reply (`suggest-greeting` → a
`thread_reply` draft → `reviewDraft` publishes it in the human's name). The reply
itself completes reciprocity. The un-activated set (joined, never contributed) is
handled by re-engagement — the Slice C warm-welcome flow, plus a weekly cron that
**notifies admins** of newcomers nearing the 30-day churn line.

## 4. Onboarding steps are admin-authored per community

The hub already has a per-user onboarding checklist; Slice D adds a
**per-community** one whose steps each admin authors (title + link, ordered),
with per-member completion tracking. The member-facing checklist funnels toward
the activation goal (a first contribution) and **auto-hides once the member is
activated**, so it is a runway, not permanent furniture.

**Why:** newcomers churn from the *silent-treatment trap* — they post once,
nobody answers, they leave. Measuring activation as bare "did they post"
misses this; measuring reciprocity captures it but is useless unless the
community can *act* on a missed response in time, which is what the greeter
queue + grace window provide. Making the milestone admin-tunable keeps culture
plural (a high-volume community may relax it; a high-touch one may tighten it)
while activation stays a coherent, observable funnel. Instrumenting the existing
`recipient_id` rather than adding a "responses" table keeps the reciprocity
signal cheap and co-located with the activity heartbeat that already powers
[[active-member]]/[[at-risk-member]].

**Rejected alternatives:**
- **Hard-coded reciprocity milestone** (no config): simplest, but breaks the
  ADR-0013 community-policy split and ignores that communities differ in tempo.
- **A dedicated `response` table / historical back-fill** of reciprocity: more
  "complete," but a new write path on every reply and a brittle reconstruction
  of who-replied-to-whom across legacy data. Forward-only instrumentation of the
  existing column is enough.
- **Auto-posting greeter** (agent replies to unanswered newcomers on its own):
  maximises coverage but violates ADR-0015 — the greeting must carry a human's
  name. Agent drafts, human sends.

**Consequences:**
- New tables: `community_activation_config`, `community_onboarding_step`,
  `community_onboarding_progress`.
- `logActivity` calls for the three response actions now set `recipient_id`;
  activation queries read it. No schema change to `activity_event` (column
  exists).
- Activation status (`unactivated` / `awaiting_response` / `awaiting_profile` /
  `activated` / `stalled`) is computed by a pure, tested function from a
  member's first-contribution time, first-response time, profile flag, and the
  community config — no stored status column to drift.
- The greeter's agent drafts reuse the existing `thread_reply` draft + human
  `reviewDraft` path; no new publish path into human surfaces.
