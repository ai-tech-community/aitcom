# Consolidated Hub digest + Hub-wide broadcast ceiling

**Status:** accepted

Applies [[adr-0013-hub-invariant-vs-community-policy]] to notifications.

Member-facing notification volume is governed at the **Hub** level, not left to
each community independently:

1. **Consolidated digest.** A member receives **one** [[hub-digest]] email,
   with a [[community-digest]] section per community they belong to. A
   community admin controls their section's content and preferred cadence; the
   Hub bundles and schedules the envelope. Empty sections are suppressed, so a
   quiet community never pads the email.

2. **Broadcast ceiling.** Time-sensitive [[broadcast]]s stay per-community for
   immediacy, but every member is protected by a Hub-wide
   [[notification-ceiling]] — a cap on promotional broadcasts per member per
   window, fair-shared across their communities. Transactional messages the
   member opted into (e.g. a reminder for an event they RSVP'd to) are exempt.

3. **One preference center.** Members control digest opt-out (per section and
   global) and broadcast preferences in a single place. Digests default to
   opt-in (members joined and expect updates); opt-out is one click.

Sensible starting defaults — tunable by the **Hub operator**, never by a
community admin (they are member-protection invariants): weekly consolidated
digest; ≤3 promotional broadcasts per member per week fair-shared across
communities; transactional/RSVP reminders exempt.

**Why:** A member in N active communities, each admin doing their job well,
receives N digests plus N×k broadcasts per week. The member does not unsubscribe
from one community — they mark *all of AIT* as spam, and every other community's
deliverability collapses with them. Per-community sending optimises each
admin's local reach while destroying the shared resource (the member's inbox and
the Hub's sender reputation). Consolidation + a Hub ceiling makes the member's
attention a governed common resource: admins compete for space inside a fixed
envelope instead of each enlarging the envelope.

**Rejected alternatives:**

- **Per-community independent sending + a global mute center** — relies on
  members configuring self-protection; the default state still pile-ups, and
  most members never open settings. Declined: defaults must be safe.
- **Strict per-community caps, no coordination** — simple, but the
  multi-community pile-up it is meant to prevent still happens linearly in the
  number of communities. Declined: doesn't solve the actual failure.

**Consequences:**

- One digest-rendering + scheduling pipeline keyed by member, fanning in
  per-community sections — not one job per community.
- A Hub-wide rate limiter sits in front of all broadcast sends, tracking
  per-member promotional volume across communities.
- The cap is a platform constant in the Hub-invariant zone; community admin
  settings expose cadence/content *preferences*, never the ceiling itself.
- Trade-off accepted: communities lose a standalone, own-branded digest email
  and some send immediacy, in exchange for Hub-wide deliverability and lower
  member fatigue.
- Broadcasts are always human-sent (an agent may *draft* one under
  [[agent-autonomy-level]] = Suggest, but a human publishes it in their own
  name — see [[adr-0015-community-surfaces-are-human-authored]]). Either way the
  send consumes the member's ceiling; agent assistance cannot buy extra member
  attention.
