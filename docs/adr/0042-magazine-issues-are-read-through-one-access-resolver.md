---
status: accepted
---

# Magazine issues are read through one access resolver

Amended by [ADR-0045](0045-magazine-roles-are-capabilities-read-through-the-editorship-seam.md):
slice 3 introduces capability gates and deliberately changes callers.

A community can run a [[magazine]]: a series of [[issue]]s, each an ordered
list of [[issue-item]]s (magazine articles and editorial text in the core
slice). An issue is read on many surfaces at once: its own page, the
per-magazine shelf, the `/magazines` home, the community's Magazine tab, the
article page, comments, the author's profile, site and agent/MCP search, and
the sitemap. This ADR decides how every one of those surfaces answers "may
this viewer read this issue?". Design:
`docs/superpowers/specs/2026-10-26-community-magazines-design.md` ("One access
resolver" under "Decided structure"; "Visibility rules").

## Context

- **Visibility is per issue, not per community.** A community may publish one
  issue to its members and the next one to the open web. The community's own
  content rule ([[community-visibility]], ADR-0030) cannot answer that alone.
- **Many readers, one answer.** If each surface computed visibility on its
  own, a change of rule (or of an issue's visibility) would reach some surfaces
  and not others. The leak we care most about is exactly that: an issue
  switched back to members still shown on the profile, in search or in the
  sitemap.
- **Unlisted communities want public issues too.** An unlisted community's
  content is members-only today (ADR-0030). A magazine is a publication, and
  its editors may deliberately want one issue read by everyone. That has to be
  a recorded choice, never an accident.
- **Precedent.** The classroom already has one access decision per course
  (`resolveCourseAccess` / `loadCourseAccess` in
  `src/server/classroom/course-access.ts`: `none | visitor | member |
  manager`, not-found on `none`). We follow its shape.

## Decision

1. **One resolver.** `resolveMagazineIssueAccess(input)` in
   `src/server/magazines/issue-access.ts` is a pure function that returns
   `none | full | editor` (the union lives in `src/lib/magazines/access.ts`,
   shared with item strategies and components).
   `loadMagazineIssueAccess(db, issue, viewerId)` loads the community
   (including `deletedAt`) and the viewer's standing in the magazine and
   calls it. The rules, in order:
   1. the community is missing or deleted → `none`;
   2. the viewer is a [[magazine-editor]] (`standing.isEditor`: an active
      owner or admin in slice 1) → `editor`;
   3. the issue is not `published` → `none`;
   4. the viewer is an active member of the community → `full`;
   5. the issue's effective visibility is `public` → `full`;
   6. otherwise → `none`.

   `none` is answered as "not found", never "forbidden", so a members-only
   issue is not confirmed to exist. `editor` is about *seeing* (drafts,
   unavailable-item markers, latest draft text), not a separate reading page.
   Moderators are readers.

   **The editorship seam.** The resolver takes the viewer's standing
   (`{ isEditor, isMember }`), never a community role. The standing comes
   from one loader in `src/server/magazines/editorship.ts`:
   `loadMagazineEditorship(db, { communityId, magazineId }, userId)` for one
   magazine and its batched twin `loadEditorScope(db, userId)` for the read
   scope. Every editor gate goes through them: the resolver's loader, the
   reading pages and Magazine tab, the builder, write and edit page gates,
   the article-editing gate and the tRPC `editorProcedure`. Slice 3 changes
   these two loaders to read per-magazine staff rows; no caller changes.
   **Amended by [ADR-0045](0045-magazine-roles-are-capabilities-read-through-the-editorship-seam.md):**
   slice 3 also changes callers to ask for `write`, `edit` or `manage`;
   `isEditor` and the read resolver's rule order stay.

2. **The access union grows with the visibility list.** Slice 1 has two issue
   visibilities, `members | public`. Slice 6 adds `teaser` to **both** the
   visibility list and the access union (`none | teaser | full | editor`) in
   the same change. Every surface handles access with an exhaustive `switch`
   (or a `Record` over the union), never `access === "editor"`, so the
   compiler lists each surface that must decide what a teaser shows: the
   item strategies receive the access value (`ItemContext.access`) and switch
   on it in `load` and `isReadable`; read models and components ask
   `articleTextModeFor(access)` and `seesEditorLayer(access)`.
   We do not declare `teaser` now: a value with no behaviour would be handled
   by guesswork.

3. **A query twin, pinned by a parity test.** Lists cannot call the resolver
   per row. `readableIssueWhere(scope)` in
   `src/server/magazines/readable-issues.ts` builds a Payload `Where` from the
   same rules, over an `IssueReadScope` (the community ids where the viewer is
   an editor or a member, the deleted ids, the content-private ids) loaded by
   `loadIssueReadScope(db, viewerId)`. A DB test runs a matrix of viewers ×
   issues and asserts that `readableIssueWhere` returns **exactly** the issues
   where `loadMagazineIssueAccess` is not `none`. A rule changed in one place
   and not the other fails that test. No surface writes its own filter.

4. **Visibility is stored concretely on each issue.** An issue stores
   `visibility`, copied from the magazine's `defaultVisibility` when the issue
   is created. The spec's "empty means inherit the magazine default" is not
   used, for two reasons: changing the magazine default must never silently
   re-expose an archive of members-only issues, and a concrete value keeps
   `readableIssueWhere` a plain query with no join to the magazine. The
   magazine default affects new issues only; the settings screen says so.

5. **The unlisted opt-in is one resolver rule.** It amends the scope of
   [ADR-0030](0030-spectator-view-shows-the-race-not-the-work.md) **for
   magazine issues only**. ADR-0030 states the community-visibility rule as:

   > Scope follows the existing community-visibility rule: a spectator view is
   > public for Hub-wide and listed-community hackathons, and members-only for
   > an unlisted community — no new policy.

   For a magazine issue, an editor of an unlisted (content-private) community
   may choose `public`. The rule lives in one pure function,
   `effectiveVisibility(issue, community)` in the client-safe
   `src/lib/magazines/visibility.ts`, used by the resolver, mirrored by
   `readableIssueWhere`, and used by every surface that shows a visibility
   (issue cards on the shelf, the builder, settings):

   - in a content-public community (the Hub or a listed community), the
     issue's visibility is its effective visibility;
   - in a content-private community, `public` counts as `public` **only when a
     confirmation is recorded** on the issue; without one it counts as
     `members`.

   Nothing else about the community becomes public: its own pages, roster and
   other content keep their ADR-0030 visibility. A public issue of an unlisted
   community shows the community's name and a link to it; the confirmation
   step says so in plain words.

6. **The confirmation is recorded per value and cleared on `members`.** The
   magazine (for its default) and the issue (for its visibility) each store
   `publicConfirmedBy` and `publicConfirmedAt`. Choosing `public` in a
   content-private community without confirming is refused
   (`CONFIRM_UNLISTED_PUBLIC`); `planVisibilityChange` in
   `src/lib/magazines/visibility.ts` is the one place that writes
   the record. Choosing `members` clears it, so going back to `public` asks
   again. A new issue created from a confirmed public default copies the
   magazine's confirmation. Because an unconfirmed `public` issue counts as
   `members` in a content-private community, **a listed community that later
   becomes unlisted does not leak** the public issues it published before:
   they become members-only for outsiders on every surface at once, until an
   editor confirms them.

7. **Surfaces that serve everyone use the anonymous scope.** The sitemap, the
   `/magazines` home, agent/MCP search and the magazine articles on an
   author's profile read with `loadIssueReadScope(db, null)`: public issues
   only, whoever asks. A member's private access must not leak into a page or
   an answer that someone else can see or cache. The per-magazine shelf, the
   community's Magazine tab, the issue page, the article page and comments
   use the viewer's own scope or `loadMagazineIssueAccess`.

8. **An article is read through its issue.** A magazine article is readable
   when it is published and the access to its [[placement]] (the issue it is
   placed in) is not `none`, or when the viewer is an editor of its community.
   `canReadArticle` dispatches on the article's [[publication-channel]] with an
   exhaustive `switch`; the blog channel keeps `isPublicArticle`.
   `publicArticleWhere` excludes magazine articles, so they never reach `/blog`
   or the blog `feed.xml`.

## Considered options

- **Visibility checks inside each surface** (the pattern before ADR-0030 moved
  community content into `content-visibility.ts`): rejected. It is exactly how
  a members-only issue would stay on the profile or in search after a switch.
- **Inherit the magazine default when the issue's visibility is empty:**
  rejected (Decision 4). It re-exposes old issues when the default changes and
  needs a join in every list query.
- **Forbid public issues in unlisted communities:** rejected. A magazine is a
  publication; a small private community may still want to publish one issue
  to everyone. The recorded confirmation keeps it deliberate.
- **Treat an unconfirmed `public` issue as public after a community becomes
  unlisted:** rejected. It turns a directory setting into a silent publishing
  decision for every past issue.
- **A per-surface exception for unlisted communities** (for example, only the
  issue page honours the opt-in): rejected. The opt-in is one rule in
  `effectiveVisibility`, so all surfaces agree.

## Consequences

- **Access never lags; the sitemap may.** The resolver and
  `readableIssueWhere` run on every request with no cache in between, so an
  issue switched from public to members leaves the issue page, `/magazines`,
  the shelf, the author's profile, agent search and comment reads on the next
  request. `src/app/sitemap.ts` is regenerated on its `revalidate` window
  (3600 s), so a sitemap may still list a URL for up to an hour after the
  switch. That URL then answers 404: the sitemap is a hint to crawlers, not an
  access path. Tests assert the sitemap's data function, not the cached file.
- **Issue saves are compare-and-set.** Two editors (or two tabs) can edit the
  same issue. Every issue write carries the `updatedAt` the client last saw and
  is a conditional update (`where: { id, updatedAt: expected }` or an
  equivalent compare-and-set). When no document is updated, the write is
  refused with `ISSUE_CHANGED` and nothing is overwritten; the builder asks
  the editor to reload. Where a JavaScript comparison of instants is needed,
  it compares `getTime()`, never strings.
- **Every new read path must use the resolver or `readableIssueWhere`.** The
  existing direct readers of articles (`sitemap.ts`, the `articles`, `agent`
  and `comments` routers, `profile-work.ts`, badge metrics) move to them in
  this slice.
- **Slice 6 work is mechanical.** Adding `teaser` widens two unions; the
  compiler then names every surface that must render a teaser.
- **Slice 3 replaces one loader.** Per-magazine staff roles change
  `loadMagazineEditorship` and `loadEditorScope` in
  `src/server/magazines/editorship.ts`; callers, the resolver and its rule
  order stay. The parity test's viewer matrix must then gain staff viewers.
  **Amended by [ADR-0045](0045-magazine-roles-are-capabilities-read-through-the-editorship-seam.md):**
  capability gates replace `requireEditorStanding`, writing requires `write`,
  and the Magazine tab reads the viewer's role through `roleCan`. Caller
  changes are intentional; the resolver and its rule order stay.
- **ADR-0030 gains one documented exception.** Any other community content
  that wants an unlisted opt-in needs its own ADR; this one covers magazine
  issues only.
