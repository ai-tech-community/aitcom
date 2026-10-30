---
status: accepted
---

# Magazine issue items are a registry of kind strategies

An [[issue]] of a [[magazine]] is an ordered list of [[issue-item]]s. The core
slice has two [[item-kind]]s: `article` (a [[magazine-article]]) and
`editorial` (rich text owned by the issue). Slice 2 adds platform content
(`storyline`, `newsItem`, `event`, `forumThread`, `launchpadProject`), slice 5
adds auto-draft suggestions per kind, and later kinds (a challenge, a course)
are already on the wish list. This ADR decides how kinds are modelled, where
magazine data is stored, and how magazine articles reuse `Articles` without
branching on "is this a magazine article?" all over the code. Design:
`docs/superpowers/specs/2026-10-26-community-magazines-design.md` ("Decided
structure"; "Review, credit and where magazine articles show").

## Context

- **Kinds multiply.** Every kind needs the same five things: a builder input,
  a stored shape, a check that the reference is valid, a batched load for a
  whole issue, and a renderer. If the issue page, the builder and the service
  each `switch` on the kind, each new kind touches every one of them and a
  forgotten branch fails quietly.
- **Payload already stores ordered, typed lists.** A `blocks` field gives an
  ordered list of typed rows, an admin UI and generated types for free. Its
  block list must match the kinds exactly.
- **Articles already have the editor, renderer, review flow, XP and badges.**
  A magazine article needs all of them, with three differences: magazine
  editors (not platform staff) review it, it never reaches `/blog`, and it is
  published and credited when its issue is published, not when it is approved.
- **Precedent.** ADR-0039 (badges) and ADR-0040 (data collectors) both chose
  a typed catalog of strategies in code over per-case branches.

## Decision

1. **Item kinds are Strategies in one registry.** Each kind is one folder
   under `src/server/magazines/items/<kind>/` with a pure Payload block config
   (`block.ts`) and a strategy (`kind.ts`) implementing the `IssueItemKind`
   interface in `src/server/magazines/items/types.ts`: the builder input
   schema, `toStored` / `toInput`, a batched `validate`, a batched `load` (one
   query per kind per issue, never one per item) and `isReadable`.
   `ITEM_KINDS` in `items/registry.ts` maps every kind id to its strategy; the
   type is a mapped type over the kind union, so a kind without a strategy is
   a compile error. The registry groups an issue's blocks by kind and
   dispatches through `ITEM_KINDS[kind]`; there is no `switch` on the kind
   outside that record. Adding a kind is one new folder plus one registry
   entry.

2. **The Payload `blocks` field is generated from the registry's block
   configs.** `ISSUE_ITEM_BLOCKS` (`items/blocks.ts`, importing only the
   `block.ts` files so the Payload config stays free of server code) is the
   `items` field of the `magazine-issues` collection. A unit test pins that
   the registry's kind ids and the block slugs are the same list. Storage and
   the admin therefore always match the kinds.

3. **Renderers live in a typed render registry.** `ITEM_RENDERERS` in
   `src/components/magazines/items/registry.tsx` maps every kind id to its
   React renderer with the same mapped type, so a kind without a renderer is a
   compile error. Server strategies and client renderers share only the
   serializable item views in `src/lib/magazines/item-views.ts`; the issue page
   asks the render registry and never branches on the kind.
   Renderers handle every `ItemSize` exhaustively: `lead`, `card`, `row`,
   and `related`. The related size is the compact recommendation at the end
   of an article; article recommendations include their opening excerpt.
   Recommendations go through `IssueItem`, just like layout items, without
   renderer-specific props.

   The issue builder has its own twin, `BUILDER_ITEM_KINDS` in
   `src/components/magazines/editor/builder/items/registry.tsx`, with one
   file per kind next to it: the kind's label, how its row is named, its
   editor panel (if the issue owns its content), its save rule, its preview
   view and, for kinds that reference content kept elsewhere, the reference
   that keeps that content in an issue at most once. The builder, its item
   model and the live preview dispatch through it; a parity test pins its
   keys to `ITEM_KINDS` and `ITEM_RENDERERS`.

4. **`suggest` is not declared now.** Auto-draft (slice 5) adds a `suggest`
   method to the interface when it has a caller. An optional method with no
   behaviour would be implemented by guesswork and tested by nothing.

   Superseded by ADR-0047: suggesters are a parallel registry keyed by source, not a method on the kind interface.

5. **Storage split.** The magazine and its issues are Payload collections
   (`magazines`, `magazine-issues`) with a text `communityId`, following
   `Courses` and `HostedMaterials`: the Lexical editor, the `blocks` field and
   the admin come for free. One magazine per community is a unique index on
   `magazines.community_id`. Magazine staff (slice 3) and subscriptions
   (slice 4) are relational, membership-style data and will be Drizzle tables
   next to `communityMemberships`.

6. **Articles stay one collection behind a publication-channel seam.** A
   magazine article is an `Articles` document with a `magazine` relation. The
   [[publication-channel]] seam (`src/server/articles/channels.ts`) is the only
   place that looks at `magazine` to decide behaviour: `channelFor(article)`
   returns `blogChannel` (today's behaviour, moved verbatim) or
   `magazineChannel` (approval means "ready for an issue": status, publish
   date, XP and badges are left alone). The `Articles` hooks call the channel;
   they contain no magazine check of their own. Publishing and crediting a
   magazine article happen in the issue service when its issue is published
   (`src/server/magazines/article-publication.ts`, through the shared
   `creditArticlePublication`). An article never moves into, out of, or
   between magazines (`ARTICLE_MAGAZINE_LOCKED`).

7. **Placement is stored on the article.** An article's [[placement]] is a
   `magazineIssue` relation on the article, written only by the issue service,
   next to the `article` block that holds its order in the issue. This makes
   "an article appears in at most one issue" structural, and gives every
   surface (article page, profile, search, comments) a cheap article → issue
   lookup for the access check in ADR-0042.
   - The issue service claims placement with one raw conditional `UPDATE` of
     the article's main row (`magazine_issue_id IS NULL`) in the transaction
     that saves the issue's blocks: of two issues racing for one article, one
     wins and the other gets `ARTICLE_PLACED`.
   - It then brings the latest version in line with a Payload update with
     `draft: true` (preflight F22 as amended). A draft save writes only a new
     version built on the latest one, so a pending draft edit of a published
     article is carried forward and never pushed live by a move.
   - Every other Payload save of an article writes the main row's current
     placement, read `FOR NO KEY UPDATE` on the save's own transaction (the
     `Articles` `beforeChange` hook, `placementForSave`). Payload's update is
     a read-modify-write of the whole row with no lock; without this, a save
     that read the article before a claim committed would write the old
     placement back. A create or a duplicate is never placed.

8. **Publishing and crediting a magazine article.** An issue publish (or an
   article added to a published issue) moves its placed articles from draft
   to published with one raw conditional `UPDATE` of the main row (`status IS
DISTINCT FROM 'published'`), then a non-draft Payload update so readers get
   the latest draft text. A retry skips what is already published.
   Publishing is not what keeps the credit exactly-once; the credit claim is:
   - The claim is a row in `app.magazine_article_credit` (`article_id`
     primary key), a Drizzle-owned table outside Payload's columns. It is
     inserted with `ON CONFLICT DO NOTHING` in the SAME database transaction
     as `creditArticlePublication` (XP, badges, activity): a credit that
     throws rolls the claim back, a claim row that exists means the credit
     happened, and of two runs at once the second waits on the key and then
     conflicts. Payload never reads or writes the table, so no article save
     (which rewrites the columns it owns from the version it read) and no
     admin duplicate can reset or copy it. A duplicate of a magazine article
     also starts unpublished (`magazineChannel.onDuplicate`).
   - "Pending" is a property of the article, not of the issue it sits in: a
     published member article of the magazine with no claim row. After every
     publish or save of a published issue the service credits the
     magazine's pending articles. A credit that failed is therefore retried
     on the next such save even after the article moved to another issue or
     left every issue. A scheduled sweep, if wanted later, runs the same
     query.

## Considered options

- **A `MagazineArticles` copy collection:** rejected. It duplicates the
  editor wiring, the renderer, the review fields and the XP and badge hooks,
  and the two copies drift. One collection with a channel seam reuses them.
- **Inline `if (doc.magazine)` branches** in the `Articles` hooks, the blog
  queries and the readers: rejected. Each new channel (or rule change) would
  hunt for every branch. The channel seam names the variation once.
- **Snapshotting platform content into the issue** (copying a storyline's or
  event's text when it is added): rejected. A developing story should show its
  current state, and a snapshot can keep showing content that was since
  unpublished or made private. Items store references and render live; an
  unreadable reference is skipped for readers and marked for editors.
- **A `switch` on the kind in the page, builder and service:** rejected for
  the reasons in Context; the registry and render registry replace it.
- **Placement only in the issue's `items`** (no relation on the article):
  rejected. "At most one issue" would need a scan of every issue's blocks, and
  every article surface would need the same scan to find the issue.

## Consequences

- **Adding a kind is local.** A new kind is one server folder, one renderer,
  one builder file and three registry entries (server, render, builder); the
  compiler and the parity tests catch a missing piece.
- **A Payload migration per new kind.** Each block is its own table, so a new
  kind ships with a hand-written migration (`src/migrations`) and regenerated
  `payload-types.ts`.
- **The issue service owns placement.** Any code that changes an issue's
  items must go through it, or `magazineIssue` and the blocks drift apart.
- **Two places run the credit.** Blog approval and issue publish both call
  `creditArticlePublication`. For a magazine article the guard against a
  double credit is the claim row in `app.magazine_article_credit`, committed
  with the credit (decision 8), not the idempotent publish: a retried issue
  publish, an article moved between issues, a racing article save or an
  admin duplicate never credits twice. Code that changes how magazine
  articles are published must keep crediting through that claim.
- **Placement and the credit claim are not Payload-writable.** Neither can be
  set through Payload's API or admin: placement is carried forward from the
  main row by the `Articles` hook, and the claim is not a Payload field. Only
  the issue service writes them.
- **Staff and subscriptions will cross stores.** Slices 3 and 4 join Payload
  magazines (text `communityId`, numeric magazine id) with Drizzle rows by id,
  as classroom already does with courses and memberships.
