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

- **Content** (forum threads and replies, ideas, spaces and rooms,
  classroom courses, feed posts, Launchpad projects, challenges and
  spectator views, gallery, magazine, events) is public on the [[Hub]] or
  on a community that is
  **listed and open**. Everywhere else it is members-only.
- **The roster** (member list, member-stack faces, member counts) is public
  only on a community that is **listed and open**. The Hub's browse card is
  the one exception that keeps its aggregate count (ADR-0019).
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
- A listed private community keeps its discovery cards (directory, Explore,
  Featured strip, recommendations, the agent's community browse) with its
  name, description and join control. To anyone who is not a member they
  show no member faces, no member count and no activity ("N active
  recently", open rooms) — the roster rule governs faces and counts alike
  (ADR-0021), and the activity follows the content rule
  (`cardShowsMemberCount`, `cardShowsActivity`). Members still see them. The
  Hub's browse card keeps its aggregate count. Its rooms stay off the
  Explore page.
- `communities.getBySlug` tells the page whether the viewer may read the
  content (`viewerCanReadContent`). Outsiders of a members-only community get
  no liveness numbers and no member counts.
- Approval-required communities' events become members-only, like their
  forum.
- The sitemap follows the same two facts: a listed community's front page
  (`/communities/<slug>`) is listed, a private one's too, because outsiders
  see who it is and how to join there; the pages inside a members-only
  community are not.
- Every read and write of community-scoped content goes through tRPC guards
  over the seam (`src/server/communities/content-access.ts`):
  `requireReadableCommunity` / `requireReadableContentOf` for reads,
  `requireActiveMember` for writes, `requireJoinTermsReader` for rules. One
  rule, one answer: an outsider who may not read gets NOT_FOUND on a read
  and on a write alike, so a write cannot confirm what a read hides; a
  reader who is not a member gets FORBIDDEN on a write.
- A row's own public flag only widens access inside a community whose
  content is public: a course's `isPublic` (`resolveCourseAccess` takes
  `communityContentReadable`), a feed post's `visibility: "public"`
  (reels, comments, likes, polls, reports). In a members-only community
  they do nothing for outsiders, and the directory does not tag such a
  community with "learn" or "build".
- Writes need an active member in good standing: forum threads and
  replies, ideas and votes, Launchpad votes and comments on a community's
  project, and an agent's forum drafts, checked when the draft is made and
  again when it is approved (a reply draft resolves its thread's community).
  Hub-wide rows with no community stay open to any signed-in user.
- A community's rules are its join terms: readable by its readers and by
  people on the way in (an open invitation or a pending request), so an
  invitee can read them before accepting. Its topics are content; only an
  active member's read creates the default topic.
- Only managers (owner, admin, moderator) list pending or banned members.
- Hackathon and challenge spectator data (leaderboards, agent stats, grid
  status, heatmap, People's Choice, the challenge channel) follow the
  challenge's community, as ADR-0030 already said.

## Rejected alternative

**A separate visibility column** (for example `visibility: public | private`
beside the join policy). Rejected for now: every non-open join policy already
means "membership needs consent", so a second column would only allow two
combinations nobody asked for — an open-but-hidden community, or a
consent-to-join community whose inside anyone may read — and every query would
have to keep the two columns in step. Add it later only if an organizer needs
one of those modes; the seam is the one place it would change.
