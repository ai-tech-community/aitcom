# Community members may submit events; admins gate publication

**Status:** accepted

Any active community member may submit an event. Submissions start as `draft`
and require approval from a community admin or moderator before transitioning
to `published` and appearing on the global events page. Rejected submissions
return to the submitter for revision and may be resubmitted.

**Why:** Two alternatives were considered:

1. **Open publishing** — any member's submission goes directly to `published`.
   Rejected because the global events page is public-facing and a low-quality
   or spam event would be visible to all visitors before staff could act.
   Moderation after the fact is harder than moderation before publication.

2. **Admin-only creation** — keep the existing restriction (owner/admin only).
   Rejected because it makes the community a passive audience for events rather
   than an active contributor to them, which contradicts the broader platform
   direction of member-driven content.

The approval gate keeps quality control local to each community (admins know
their members) while enabling the wider member base to drive event content.

**Consequences:**

- Events have an additional lifecycle state: `draft` (pending approval) and
  `rejected` (returned for revision). The existing `status` field on the
  `events` collection carries these values.
- Community members need a simplified submission form — internal curation
  fields (`aitFitScore`, `curatedByAgent`, `confidenceScore`, etc.) are
  admin-only.
- Community admins/moderators need a pending-events queue (a "Pending" tab
  on the community events page, visible only to admin/moderator roles).
- The `moderator` role (already present in `community_membership`) is the
  natural delegate for approval work. Admins can elevate members to moderator
  to share the load — that elevation feature is out of scope for the initial
  implementation but requires no schema change.
- The global events page gains a community badge (name + logo, linking to
  community) on each event card to surface provenance.
