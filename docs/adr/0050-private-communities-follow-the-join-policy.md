---
status: accepted
---

# Private communities follow the join policy

**Amends** the content and roster rule of
[ADR-0021](0021-profile-visibility-governs-member-stack-faces.md),
[ADR-0030](0030-spectator-view-shows-the-race-not-the-work.md) and the
"Community visibility" entry in `CONTEXT.md`.

## Decision

A [[community]] is **private** unless its join policy is `open`. Both
`invite_only` and `approval_required` are private. Listing in the directory
(`isListedInDirectory`) stays a separate fact: a private community may still
show in the directory and on the Featured strip.

- **Content** (forum threads and replies, ideas, spectator views, gallery,
  magazine, events) is public on the [[Hub]] or on a community that is
  **listed and open**. Everywhere else it is members-only.
- **The roster** (member list, member-stack faces, the member counts shown
  with them) is public only on a community that is **listed and open**.
- An outsider who may not read gets "not found", never "forbidden", as
  before. On the community page they see only the banner, logo, name,
  description and the join control, with a short panel saying how to get in.
- Join rules do not change: `invite_only` joins by invite code only
  (ADR-0019); `approval_required` joins by request and an organizer's yes.
- A magazine's owner opt-in (`publicConfirmedAt`, ADR-0042) that lets an
  issue reach outsiders now covers every members-only community, private or
  unlisted.

The rule lives in one place: `src/server/communities/content-visibility.ts`
(`isOpenCommunity`, `isPrivateCommunity`, `isPublicCommunity`,
`isContentPublic`, `isRosterPublic`) with its SQL twins in
`content-visibility-queries.ts` (`publicCommunitySql`,
`contentPublicCommunitySql`, `contentPrivateCommunitySql`). The events gate
(`eventCommunityIsPublic`, `hiddenEventCommunityIds`) and the Explore rooms
read these instead of keeping their own copy.

## Why

Listing is **discoverability**: whether people can find the community. The
join policy is **consent**: whether the organizers choose who comes in. An
organizer who asks to approve or invite each member is saying the inside is
for members. Deciding access from listing alone let a listed invite-only
community show its forum, members, faces, activity, gallery and magazine to
anyone — the opposite of what its organizers set up.

Events already had a second, looser copy of the rule (listed and `open` or
`approval_required`). Two rules for one question drift; this ADR folds them
into one.

## Consequences

- `CommunityVisibility` carries `joinPolicy`. Every place that builds one
  selects `COMMUNITY_VISIBILITY_COLUMNS` and copies through
  `communityVisibilityOf` / `communityRefOf`, so a future visibility fact
  reaches every caller instead of being dropped by a field-by-field copy.
- A listed private community's directory card keeps its name, description,
  join control and aggregate member count (like the Hub's browse card), but
  shows no member faces. Its rooms stay off the Explore page.
- `communities.getBySlug` tells the page whether the viewer may read the
  content (`viewerCanReadContent`). Outsiders of a members-only community get
  no liveness numbers and no member counts.
- Approval-required communities' events become members-only, like their
  forum.
- The sitemap already omits every community whose content is not public, so
  private communities and their pages leave it.
- Some write paths still check only that a thread or post is visible, not
  that the writer is a member. Those are tracked as follow-up work; this ADR
  covers what outsiders can read.

## Rejected alternative

**A separate visibility column** (for example `visibility: public | private`
beside the join policy). Rejected for now: every non-open join policy already
means "membership needs consent", so a second column would only allow two
combinations nobody asked for — an open-but-hidden community, or a
consent-to-join community whose inside anyone may read — and every query would
have to keep the two columns in step. Add it later only if an organizer needs
one of those modes; the seam is the one place it would change.
