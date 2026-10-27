---
status: accepted
---

# Platform content in issues is referenced live and read per reader

A [[magazine]] [[issue]] can include platform stories, news items, events,
forum threads and launchpad projects alongside its own articles and editorial
text. These [[reference-item]]s stay live: an issue never copies their text
or widens who may read them. This ADR extends the kind strategies of
[[adr-0043-magazine-issue-items-are-a-registry-of-kind-strategies]] and the issue
access resolver of
[[adr-0042-magazine-issues-are-read-through-one-access-resolver]]. Design:
`docs/superpowers/specs/2026-10-26-community-magazines-design.md` ("References,
not copies", "Assemble", delivery slice 2); implementation plan:
`docs/superpowers/plans/2026-10-26-community-magazines-platform-content.md`
(Decisions 1–8 and 12–13).

## Context

- **An issue and its content have separate audiences.** An unlisted community
  may deliberately publish a public issue (ADR-0042). That choice does not
  expose its private forum, events or projects to outsiders.
- **Referenced content changes independently.** A story can be unpublished,
  a thread deleted or a project archived after an editor adds it. The rest of
  the issue must remain readable and editable; the editor needs an
  [[unavailable-marker]] in place of what went away.
- **Kinds share work within a read.** Several kinds need the same viewer's
  hidden communities. Loading them separately for every item or kind would
  repeat queries, including when the registry loads kinds concurrently.
- **Existing surfaces are not uniform.** As observed when making this
  decision, `/events/[slug]` filters event status but does not apply the
  community content rule, and `launchpad.getBySlug` does not apply it either.
  Those surfaces are not changed here. Magazine items apply the rule to their
  own reader regardless of what a destination page currently does.

## Decision

1. **Platform references are plain ids, without foreign keys.** `storylineId`
   and `newsItemId` are text UUIDs from Drizzle; `eventId`, `threadId` and
   `projectId` are numeric Payload ids. Deleting content never changes an
   issue's stored blocks: its id stays and loads as `missing`. A relationship
   with `ON DELETE SET NULL` either fails against a required column or leaves
   builder input without its required reference. The existing magazine
   article relationships and placement rules stay as ADR-0043 defines them.
   `itemReference(kind, id)` produces the shared `kind:id` identity used by
   strategies, validation and the builder; block ids identify placements,
   not the referenced content. The client-safe input-to-reference functions
   in `src/lib/magazines/references.ts` are shared by the builder and
   strategies; parity tests pin stored and builder identities together.
   `referenceOf` returns null for content the
   issue owns, such as editorial text.

2. **Each platform kind uses its content's readability rule, for the actual
   viewer.** The five rules and their sources are:
   - `storyline`: the exported `publicStoryline` predicate in
     `src/server/news/storylines.ts`, used by the story page: published, a
     non-empty overview and at least two sourced articles. Otherwise it is
     `unpublished`.
   - `newsItem`: existence is enough; news is global and public.
   - `event`: status in `PUBLICLY_LISTED_EVENT_STATUSES` (`published`,
     `cancelled`, `completed`), extracted from the event page's and agent
     delivery's existing status rules, plus the community content rule.
     Failures are `unpublished` or `no_access`.
   - `forumThread`: not `isDeleted` (otherwise `missing`), plus the community
     content rule (`no_access`), following forum reads.
   - `launchpadProject`: status `published` (otherwise `unpublished`), plus
     the community content rule (`no_access`), as `profileProjectsWhere` in
     `src/server/members/profile-work.ts` does.

   The community content rule comes from
   `hiddenContentCommunityIds(db, viewerId)` in
   `src/server/communities/content-visibility-queries.ts`. A null
   `communityId` is Hub content and always readable. Being in a public issue
   never bypasses this rule. `itemContextFor` builds the common `ItemContext`
   with Payload, Drizzle, magazine, community, issue, locale, issue access and
   an `ItemReader` for the viewer. The reader lazily memoizes the promises of
   the hidden-community and anonymous members-only sets, so concurrent kinds
   share one query per set. For an anonymous viewer both methods share the
   same promise and query. Item saves reuse their validation context when
   loading the returned editor views. Nothing is cached across requests.

3. **Unreadable content becomes a marker only for editors.** The unavailable
   reasons add `unpublished` and `no_access` to `missing`, `not_ready` and
   `other_magazine`. A kind returns the reason without the inaccessible
   content; the registry skips markers for readers. Item order is preserved
   among the views the reader actually receives.

4. **Community-scoped views carry `membersOnly`.** Event, thread and project
   views set this flag when their community is in
   `hiddenContentCommunityIds(db, null)`. It describes the content's audience,
   even though the viewer receiving the view can read it. Editors see
   "Only members see this"; Visitor preview omits those items. The
   members-only set is requested only for `editor` access, with an exhaustive
   switch over `IssueReaderAccess`. For `full` access the flag is false
   without a members-only query: a signed-in reader needs the hidden set
   only, loaded once across the community-scoped kinds.

5. **Validate new references strictly and kept references leniently.**
   `validateIssueItems` compares reference keys with the issue's stored
   blocks before the save and passes `isNew` to each kind. A changed block id
   does not make the same reference new; omitting previous blocks makes
   every reference new. New platform references must exist, be readable by
   the editor, be in scope and be unique. Missing, private, unpublished and
   out-of-scope ids all produce `ITEM_INVALID` without detail, so a forged id
   learns nothing. Kept references get only the duplicate check, allowing
   other edits and publication when content has gone away. Duplicates,
   whether kept or new, produce `ITEM_INVALID` with `detail: "duplicate"`
   for the second copy. Each kind batch-loads its rows, then calls the one
   synchronous `validateReferences` loop with its acceptance predicate.
   Article and editorial validation keep their existing rules. Editor
   reads and publication pass the issue's saved blocks as previous blocks;
   unavailable platform references therefore appear as markers without
   becoming publish problems. The publish dialog reports how many items
   readers will skip.

6. **Picker scope and server validation use the same rule.** Stories and news
   are global. Events and forum threads belong to this community; the Hub's
   magazine also accepts content with no community. The shared Hub-aware
   `communityContentWhere` / `communityContentMatches` functions in
   `src/server/communities/forum-scope.ts` express that rule, with the existing
   forum functions delegating to them. Launchpad projects belong to this
   community, or have no community and an author with active membership in
   it. `items/launchpadProject/scope.ts` pairs the picker's SQL membership
   predicate with validation's bounded author check, with a parity test.
   The picker checks membership with `EXISTS`, so it never loads a whole
   community's member ids. Readability still applies within that scope.

7. **Picker sources form a typed registry.** `ITEM_PICKERS` is keyed by
   `PICKABLE_ITEM_KINDS` (every kind except editorial) and dispatched through
   the single editor procedure
   `magazines.pickerCandidates({ slug, kind, query, exclude })`. The article tab moves
   to it and `availableArticles` is removed. Each candidate carries builder
   input, the shared reference key, a title, typed facts formatted by the
   client and an optional `openHref` only for an article the viewer wrote.
   Each source excludes the issue's reference ids before applying its limit;
   the router bounds the exclusion array. A generic picker can move focus
   after adding without knowing a kind's id field. Searches return twelve results
   (`PICKER_LIMIT` in the client-safe `src/lib/magazines/picker.ts`), including
   when the query is empty.

   Saved items use the optional `openHrefs(items, ctx)` strategy seam, keyed
   by content reference and aggregated by the registry into
   `getIssueForEditing.openHrefs`. The article strategy applies the same
   author gate as its edit page. The builder consumes this map and candidate
   links without naming article ids or constructing kind-specific paths.

8. **Every kind has an editable intro line.** Selecting a row opens one item
   details panel with an intro field above the kind's own editor (editorial
   only). The shared base input limits it to 280 characters. Storage trims
   it and stores a blank intro as null; the preview follows the typed intro.

9. **Cover cards omit item counts.** The stored count includes members-only
   and unavailable items. Showing it would both mislead anonymous visitors
   and reveal that hidden items exist; deriving a per-reader count on every
   listing would load every kind for every cover. Cover cards and
   `IssueCard` drop the count. The issue's contents list can count the items
   actually loaded for that reader.

10. **Load only the kinds a page needs.** The magazine article page's "next
    in issue" uses `loadIssueItemViewsOfKinds(blocks, ctx, ["article"])`.
    The registry filters blocks before loading, so that page runs no story,
    news, event, thread, project or hidden-community query. Callers never
    filter stored blocks by kind themselves.

## Considered options

- **Payload relationships with foreign keys for platform references:**
  rejected. Deletion would either fail or erase the reference needed to
  round-trip the block and show a missing marker (Decision 1).
- **Snapshot content into the issue:** rejected. Stories must keep developing
  live, and an old snapshot could keep showing unpublished or private text.
- **Strictly revalidate kept references on every save and publish:** rejected.
  Independent content changes would block unrelated edits and publication.
  Markers explain what readers skip without breaking the rest of the issue.
- **One search procedure per kind:** rejected. It spreads dispatch, input
  handling and picker behaviour across the router and client. One registry
  and one procedure keep kind-specific queries in their own modules.
- **Read as the issue's audience rather than its viewer:** rejected. A public
  issue cannot grant outsiders access to private community content, and
  members must still receive the content their own membership allows.

## Consequences

- **A kind's `load` must never return content its reader may not read.** The
  issue access resolver grants access to the publication; each kind enforces
  the referenced content's rule. This includes contents-list entries, not
  just visible cards. Registry filtering never substitutes for that check.
- **A reference survives its source.** Deletions and visibility changes need
  no magazine-table writes. Readers see the remaining items in order;
  editors see markers and can keep editing or publishing.
- **Shared context bounds query work.** Each kind batch-loads once per issue;
  the request's `ItemReader` shares community sets even across concurrent
  loads and validation, including the views returned after an item save.
  Article-only pages avoid unrelated kinds entirely.
- **Editor links stay within kinds.** Kinds that offer a saved-item edit
  destination implement `openHrefs`; the router and builder only carry the
  resulting reference-keyed map.
- **Suggestions can reuse picker queries.** Slice 5 can add `suggest` using
  each picker module's queries and scope rules, without introducing another
  set of content access rules or premature strategy methods.
