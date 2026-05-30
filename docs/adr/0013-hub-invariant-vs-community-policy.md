# Hub-invariant vs community-policy: where the configurability line falls

**Status:** accepted

Every community-facing feature must be classified into one of two zones, and
the zone decides whether it is a fixed platform rule or an admin-tunable
setting:

- **Hub-invariant zone — fixed, never per-community.** Anything that must stay
  consistent across the whole Hub to preserve **cross-identification**: a
  member's identity, their global reputation/XP (`member_profile.xp`), their
  badges (`member_badge`), and any signal that travels with the person across
  communities. These are platform laws. A [[community-admin]] cannot override
  them. (See [[adr-0012-reputation-stays-hub-global]].)

- **Community-policy zone — admin-configurable, with opinionated defaults.**
  Anything about a single [[Community]]'s local culture and cadence: engagement
  [[ritual]]s, [[agent-autonomy-level]], the activation-milestone definition,
  [[active-member]] activity windows, [[community-digest]] cadence/opt-out,
  join policy, feed-post policy. The platform ships the **mechanism plus a
  sensible default**; the admin tunes the **policy**.

**Default for the activation milestone** (the first such policy this ADR
settles): "first [[contribution-action]] **plus** a reply/reaction received
within ~7 days" — the reciprocity that actually predicts retention. Admins may
relax it to "first contribution (any)" or tighten it to "profile + interest
completed," but the default protects newcomers from the silent-treatment churn
trap.

**Why:** The product sells one portable identity. If reputation or identity
were tunable per community, a member would be a different person in each space
and cross-identification would collapse — so those stay fixed. But local
culture is exactly what makes a sub-community worth joining; forcing every
community onto one engagement cadence would homogenise them and strip admins of
the levers they need to grow. The split lets identity stay coherent Hub-wide
while culture stays plural. It also gives a fast decision rule for every future
feature: *does this need to be the same for a person everywhere? → fixed.
Is it about how one community runs itself? → admin policy.*

**Consequences:**

- New features get triaged into a zone before design. Identity-zone features
  have no `communityId` and no admin setting; culture-zone features get a
  per-community policy row + a documented default.
- Keep the configurable surface **disciplined**: expose a knob only when a real
  community would plausibly set it differently. Default-first; lean on defaults
  over settings to avoid config sprawl and support burden. A knob nobody
  changes is a fixed rule wearing a costume.
- Admin settings UI is organised by this line: "Community policy" (tunable)
  is visibly separate from Hub-wide facts the admin cannot change.
- The rejected alternative — make everything configurable — was declined for
  config sprawl and inconsistency; the opposite — fix everything for
  simplicity — was declined because it kills the local culture that is a
  community's reason to exist.
