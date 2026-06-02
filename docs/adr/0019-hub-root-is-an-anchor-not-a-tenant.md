# The Hub root is an anchor, not a tenant; every user is enrolled in it

**Status:** accepted

Every user is enrolled in the root [[Hub]] community (`community` row with slug
`ait`) **on signup**, and that root row is an **anchor, not a tenant**: it gives
the platform a membership row to address, digest, and rate-limit a member, but
it is **exempt from the [[community-admin]] growth machinery**.

Concretely:

- **Universal enrolment.** The signup hook enrols the new user into `ait` (and a
  one-time backfill enrols every existing user created after the original seed).
  The "user with zero `community_membership` rows" state is retired — being a
  member of the platform *is* holding the `ait` row.
- **No human organizer.** `ait` has no owner/admin acting as a community
  organizer; the organizer dashboards and growth queues never render for it.
- **Not listed, not discoverable.** `ait` is not directory-listed and is never a
  [[community-discovery]] candidate — you cannot "join" the platform you are
  already in.
- **Exempt from the growth loops.** The [[activation-funnel]],
  [[at-risk-member]], [[un-activated-newcomer]], [[greeter]], and [[ritual]]
  machinery all skip the root and operate only on tenant [[Community]]s.
- **Participates in addressing only.** The two things `ait` *does* anchor are
  the [[hub-digest]] and the [[notification-ceiling]] — the mechanisms that let
  the Hub reach a member and protect that channel.

This is [[adr-0013-hub-invariant-vs-community-policy]] applied to the root row
itself: the root is a Hub-invariant fact, not a tunable community.

**Why:** A member who belongs to no tenant community is a legitimate,
first-class state — they read and write the blog, browse events, and post in the
Hub-wide forum without ever joining a sub-community, and we do **not** force a
join. But the codebase was caught between two models: the glossary asserted
"every user is enrolled in the root community" while signup created no such row,
so Hub-wide content worked for everyone yet every reach channel (the hub-digest
recipient query, the notification ceiling's fair-share denominator) iterated
`community_membership` and therefore could not see, address, or rate-limit a
zero-membership member at all. The discovery/cross-promotion line — the one
feature meant to move these members toward a first community — lived inside a
digest they structurally never received.

We considered two ways out. **X — "Hub = just users":** retire the vestigial
root row, accept that a Hub member has no membership row, and build a brand-new
channel that does not depend on `community_membership`. **Y — "Hub = the root
community, for real":** make the documented invariant true by enrolling everyone
in `ait`, so the existing membership-driven channels (digest, ceiling) reach a
Hub-only member for free. We chose **Y** because it matches the language the
ADRs already lean on (the notification ceiling "across all their communities,"
the *consolidated* digest), and it is the only option that gives a scalable push
channel to the exact population we want to encourage — without forcing anyone
into a tenant community, since enrolment into `ait` is automatic and invisible,
not a chosen tenant join.

The decisive risk in Y is that `ait`, being a `community` row holding the entire
userbase, would otherwise inherit all the tenant-organizer machinery: the seed's
first user would "own" the platform-as-a-community, its at-risk and greeter
queues would contain every member, and it would appear as a community to "join."
The anchor-not-tenant exemption is what makes Y safe rather than catastrophic.

**Rejected alternative:** **X (retire the root row).** Honest to the code as it
stood, but it leaves the encouragement problem channel-less — we would rebuild a
parallel email/notification path for Hub-only members that duplicates the digest
and ceiling we already have. Declined: more machinery, less coherence with the
documented Hub model.

A second rejected alternative inside Y: **let `ait` be an ordinary tenant**
(keep `isListedInDirectory`, keep a human owner, let the growth loops run on it).
Declined because it floods one human's organizer queues with the whole platform
and presents "join AIT" to members already in it.

**Consequences:**

- A new precise population, the [[Hub-only member]] (only the `ait` row, no
  tenant community), replaces the ill-defined "member in no community" as the
  target of acquisition features. First-tenant-join is the goal state.
- Signup enrols into `ait`; a one-time backfill covers post-seed orphans; the
  seed's first-user `owner` of `ait` is demoted — `ait` carries no human
  organizer.
- All tenant-community queries (discovery candidates, activation, at-risk,
  greeter, rituals, organizer dashboards) must **exclude the root `ait` row**.
  A missed exclusion re-pollutes those surfaces with the whole userbase.
- Hub-only members are reachable: a dedicated Hub-only [[hub-digest]] composition
  (Hub-wide highlights + interest-matched [[community-discovery]] line) carries
  the first-join nudge, riding the existing digest cadence and opt-out, and
  auto-retires when the member joins their first tenant community.
- The encouragement surface is **join, not create** — an empty newcomer-created
  community is itself a dead room and would pollute the liveness signal discovery
  depends on; create stays available but un-nudged.
