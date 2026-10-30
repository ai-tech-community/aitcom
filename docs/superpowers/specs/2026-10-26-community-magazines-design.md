# Community Magazines — Design

Status: draft for review · 2026-10-26

## Intent

Let a community publish a magazine: a curated, periodic set of issues that its
editors assemble from original articles written with our existing rich editor,
plus the community and platform content that already lives on AIT — news items,
news storylines ("stories"), events, forum threads, launchpad projects.

A magazine is readable inside its community. When the magazine's editor
chooses, issues are also readable by anyone — including people who are not
members and not signed in — through a platform-wide `/magazines` section. The
editor is always the one who decides; nothing becomes public by default.

Why it matters:

- Communities get a high-quality, long-form voice beyond the feed and forum.
- Our news and stories get a second life, framed by a community's own view.
- Public issues are a growth loop: an outside reader discovers a community
  through its magazine and joins it.

## Goals

1. A community can have a magazine with its own name, logo, description and
   editorial team.
2. Editors publish **issues**. An issue has a cover, an editor's note, and an
   ordered list of **items**.
3. An item is one of: an original magazine article, a news storyline, a news
   item, an event, a forum thread, a launchpad project, or a free-form editorial
   block (rich text). New item kinds are added without touching the others.
4. Each issue has a **visibility**: `members` (community only), `teaser`
   (non-members see the cover, table of contents and each article's opening,
   then a join prompt), or `public` (fully readable by anyone). The magazine
   holds the default; the issue can override it.
5. Public and teaser issues appear in a platform-wide `/magazines` section
   (home with featured/newest, per-magazine archive shelf, filter by topic).
6. A magazine-quality reading view: cover, table of contents, long-read layout,
   good social share cards.
7. Members can submit articles; editors accept, request changes, or reject.
8. Anyone can subscribe to a magazine. Members are notified in the inbox;
   non-members by email with an unsubscribe link.
9. Editors see simple stats per issue: views, read-to-end, new subscribers,
   members who joined from the magazine.
10. Contributors whose article is published in an issue earn points and a badge.
11. **Auto-draft.** AIT assembles each issue's draft automatically from what
    happened in the community (and AIT News in its topics) on a schedule the
    editor sets. Everything about it is configurable by the editor, and the
    editor stays in control: they review, change and publish the draft.

## Non-goals (this design)

- Free-form page design or custom styling per magazine. Editors choose content
  and one of a few fixed layouts; the look follows DESIGN.md. This matches our
  owner-customization rule: content, not style.
- PDF export, print, paid/paywalled magazines.
- AI writing help for editors (headline suggestions, issue summary). Listed as
  a later slice; not designed here.
- Changing how news items or storylines are created. They stay staff-owned and
  global; magazines only reference them.

## Anti-goals (would be a failure even if it works)

- A members-only article or issue leaking: appearing on `/blog`, `/magazines`,
  the sitemap, `feed.xml`, search, OG images, or the agent/MCP surfaces.
- A second, parallel rich-text editor or renderer. Use the existing ones.
- One-off special cases per item kind spread across pages (`if kind === 'news'`
  in five places). Each kind has exactly one place that knows how to load and
  render it.
- Signal Orange spread across a cover. The One Voice Rule still applies.

## What exists and must be reused

| Need                                       | Existing piece                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Rich editor                                | `src/components/article-editor/` (Lexical, code + image blocks)                                                                             |
| Rich-text rendering                        | `LexicalRenderer` in `src/lib/lexical.tsx`, plus `extractHeadings`, `estimateReadingTime`                                                   |
| Article model, review flow, XP/badge hooks | `src/collections/Articles.ts` (`reviewStatus`, `beforeChange`/`afterChange`)                                                                |
| Community + roles                          | Drizzle `communities`, `communityMemberships` (owner/admin/moderator/member); `src/server/communities/role-utils.ts`                        |
| Community-scoped Payload content           | `Courses.ts` / `HostedMaterials.ts` text `communityId` pattern                                                                              |
| Access resolution precedent                | `resolveCourseAccess` / `requireReadableCourse` in `src/server/classroom/course-access.ts` (none/visitor/member/manager, NOT_FOUND on none) |
| Community visibility helpers               | `src/server/communities/content-visibility.ts`, `content-visibility-queries.ts`                                                             |
| News                                       | Drizzle `newsItems`, `newsStorylines` (global, public; storylines have `status`)                                                            |
| Inbox notifications                        | existing inbox (realtime via SSE per ADR-0025)                                                                                              |
| Email + unsubscribe                        | `EmailTemplates`, `/[locale]/unsubscribe`                                                                                                   |
| Badges                                     | typed catalog in code (ADR-0039)                                                                                                            |

## Domain model

- **Magazine** — belongs to exactly one community. Fields: name, slug (unique
  platform-wide, used in `/magazines/[slug]`), description, logo, topics/tags,
  `defaultVisibility`, `status` (active/archived). One magazine per community in
  this design (builder's call whether to enforce with a unique constraint now
  or leave room; the model must not assume one in a way that's hard to undo).
- **Issue** — belongs to one magazine. Fields: number, title, slug (unique per
  magazine), cover image, editor's note (rich text), layout template,
  `visibility` (nullable = inherit magazine default), `status`
  (draft/scheduled/published), `publishedAt`, ordered `items`.
- **Issue item** — a tagged union. Every kind has the shared fields
  (`position`, optional editor's intro line) plus its own reference:
  - `article` → a magazine article (see below)
  - `storyline` → `newsStorylines.id`
  - `newsItem` → `newsItems.id`
  - `event` → event id
  - `forumThread` → forum thread id
  - `launchpadProject` → project id
  - `editorial` → inline rich text owned by the issue
- **Magazine article** — an `Articles` document that belongs to a magazine
  (new optional `magazine` relation on Articles). It uses the same editor and
  review fields. An article appears in at most one issue.
- **Magazine staff** — per-magazine roles: `editor_in_chief`, `editor`,
  `contributor`. Community owner/admin are implicitly editor-in-chief.
  Owners/admins assign the others from community members.
- **Subscription** — (magazine, user or email), with confirmation for
  email-only subscribers and an unsubscribe token.

### Decided structure

- **Item kinds as a registry (Strategy pattern).** One module per kind under
  e.g. `src/server/magazines/items/<kind>.ts`, each implementing the same
  interface: validate reference, load for render (batched for a whole issue),
  report whether it is still readable, and a React card/body renderer. The issue
  page asks the registry; it never branches on kind. Adding "challenge" or
  "course" later = one new module + registering it. In Payload, the `items`
  field is a `blocks` field with one block per kind, so the admin and storage
  match the registry.
- **One access resolver.** `resolveMagazineIssueAccess(viewer, issue)` →
  `none | teaser | full | editor`, modeled on `resolveCourseAccess`. Every read
  path (pages, tRPC, sitemap, feed, OG, MCP/agent) calls it or a query-level
  `readableIssueWhere(viewer)` built from the same rules. No surface computes
  visibility on its own.
- **Articles stay one collection.** Magazine articles are Articles with a
  `magazine` relation, not a copy collection, so the editor, renderer, review
  flow and XP hooks are reused. `publicArticleWhere` (`src/server/articles/
public-articles`) must exclude magazine articles; their readability comes
  from the issue they are in via the resolver. An article in a magazine but not
  yet in a published issue is visible only to its author and magazine staff.
- **References, not copies, for platform content.** Storyline/news/event/etc.
  items store the id and render live, so a story that keeps developing shows its
  current state. If the referenced content becomes unreadable (unpublished,
  deleted, private), the item is skipped for that reader and shown to editors
  with a "no longer available" marker. News is global and public, so it is
  safe in every visibility level; community-private content (e.g. a forum
  thread in a private community) must pass the reader's own access check too —
  being inside a public issue never widens access to the referenced thing.
- **Storage follows precedent.** Magazine, Issue live as Payload collections
  with a text `communityId`, like `Courses`, so the Lexical editor, `blocks`
  field and admin come for free. Staff and subscriptions are relational
  membership-style data and fit Drizzle next to `communityMemberships`. Builder
  may revisit if a concrete reason appears; record the choice in an ADR.

### Visibility rules

| Issue visibility | Community member | Signed-in non-member | Anonymous  | Listed in `/magazines` |
| ---------------- | ---------------- | -------------------- | ---------- | ---------------------- |
| `members`        | full             | none (404)           | none (404) | no                     |
| `teaser`         | full             | teaser               | teaser     | yes                    |
| `public`         | full             | full                 | full       | yes                    |

- Draft/scheduled issues: editors only, everywhere.
- **Unlisted communities may publish teaser/public issues as a deliberate
  opt-in.** This intentionally overrides the community's members-only default
  (`isContentPublic`, ADR-0030) for that issue only. When an editor of an
  unlisted community picks `teaser` or `public` — on the magazine default or an
  issue — the UI warns in plain words that the community's name and a link to
  it become visible to everyone, and requires explicit confirmation; the
  confirmation is recorded (who, when) on the magazine/issue. Nothing else
  about the community becomes public: its own pages, members and other content
  keep their current visibility. The resolver encodes this as one rule, not a
  per-surface exception. Record it in an ADR that amends ADR-0030's scope.
- Teaser shows cover, editor's note, table of contents, and for each article the
  opening (first block or first ~80 words), then a join CTA that follows the
  community's `joinPolicy`. Non-article items show their card only.
- Only `public` issues go in sitemap, `feed.xml`, and are indexable. Teaser
  pages are indexable for the teaser content only (builder confirms with the
  existing indexability helpers).
- Switching an issue from public back to members takes effect immediately on
  every surface.
- No platform-staff approval before a public issue appears in `/magazines`.
  Platform staff can hide a magazine from `/magazines` (moderation switch) and
  existing post-report flow applies. _(Claude's call — reversible.)_

### Review, credit and where magazine articles show

- **Who edits.** Community editors work entirely in the site (like Courses),
  not in Payload admin. Slice 1 therefore includes an in-site magazine settings
  page and an issue builder (add/reorder items, publish). Payload admin stays a
  staff tool.
- **One review gate.** Magazine articles are reviewed by magazine staff only;
  they never enter the platform staff review queue. Staff keep the after-the-fact
  hide switch. _(Claude's call.)_
- **Credit on issue publish, not on approval.** The existing `Articles.ts` hooks
  set `status = "published"` and award `ARTICLE_PUBLISHED` XP + article badges on
  approval. For magazine articles, approval means "ready for an issue" only; the
  publish state, XP and badges fire when the issue containing the article is
  published. Split the hook through a named seam rather than an inline
  `if (doc.magazine)`. Magazine articles do count toward the existing article
  badges (they are articles), plus a new "Published in a magazine" badge in the
  ADR-0039 catalog. _(Claude's call.)_
- **Surfaces.** Magazine articles never appear on `/blog` or in the blog
  `feed.xml`. Articles whose issue is `public` appear on the author's profile,
  in site search, agent/MCP search and the sitemap, linking to the magazine URL.
  Every one of these surfaces asks the access resolver; the current direct
  readers (`sitemap.ts`, `articles`/`agent`/`comments` routers,
  `profile-work.ts`, badge metrics) are migrated to it. Comments on magazine
  articles reuse the existing article comments, readable by whoever can read
  the article. _(Claude's call.)_

## Flows

1. **Set up** — community owner/admin creates the magazine from community
   settings, picks default visibility, assigns editors.
2. **Write** — a contributor or editor writes an article in the existing editor,
   scoped to the magazine. Contributors submit for review; editors approve,
   request changes, or reject (reusing `reviewStatus`).
3. **Assemble** — editor creates an issue, picks a layout, adds items: approved
   articles, plus a picker that searches news storylines, news items, the
   community's events, forum threads, launchpad projects; writes editorial
   blocks; reorders by drag and drop; previews as member / teaser / public.
4. **Publish** — publish now or schedule. On publish: subscribers notified,
   contributors credited (points + badge), issue appears in the community's
   Magazine tab and, if teaser/public, in `/magazines`.
5. **Read** — community Magazine tab (archive shelf of covers + latest issue);
   `/magazines` home (featured, newest, by topic); `/magazines/[magazine]`
   shelf; `/magazines/[magazine]/[issue]` reading view;
   `/magazines/[magazine]/[issue]/[article]` long-read.
6. **Subscribe** — button on magazine and issue pages; signed-in → inbox
   notification per new issue; email-only → double opt-in, email per issue.

## Auto-draft

The magazine can generate its own draft issues. The editor configures it per
magazine (mockup screen 5) and reviews each draft in the normal issue builder
(mockup screen 4).

**Settings (per magazine):**

- On/off.
- Cadence: monthly (day of month), every 2 weeks, weekly, after each community
  event, or only on demand. A "Make a draft now" action always exists.
- Look-back window: since the last issue (default), last 30 days, last 7 days.
- Layout and visibility for generated drafts (visibility defaults to the
  magazine default; picking teaser/public in an unlisted community requires the
  same recorded confirmation as on an issue).
- Per source: on/off and a max count. Each source belongs to an item kind;
  sources have their own stable ids, so a kind can have several sources.
  Sources are member articles (approved for the magazine, waiting longest
  first), AIT News storylines (filtered by the magazine's topics, newest
  activity first), news headline digest (same topics, newest first), community
  events (coming up soonest first, then recaps with the most people going),
  forum threads (most replies, then views), launchpad projects (most upvotes),
  and new-member welcome (an editorial source). Approved articles have not
  been published yet and have no reads, so waiting time determines their order.
- "Never pick something already used in an earlier issue" (default on).
- What happens when a draft is ready:
  - **Notify only** (default): editors get an inbox message with a link;
    publishing is manual.
  - **Auto-publish after N days unless stopped** (default N = 3): editors are
    notified first and can edit, publish early, or cancel. Any edit by an
    editor turns auto-publish off for that draft.

**Behaviour:**

- Each auto-picked item carries a short human reason ("Approved and waiting
  since 12 October", "Matches your topic Agents") shown to editors in the
  builder, never to readers.
- If the sources yield too little (builder picks the threshold; e.g. fewer than
  3 items), no draft is made and editors are told why.
- One open auto-draft per magazine at a time; a scheduled run while a draft is
  still open does not stack a second one.
- History per magazine: draft made, items changed, published / skipped, by whom.

**Structure:**

- Suggesters live in each kind's folder, registered in the exhaustive,
  source-keyed `ITEM_SUGGESTERS` registry beside `ITEM_KINDS` (ADR-0047).
  They implement `suggest(ctx, window, config)` on `ItemSuggestionSource`,
  returning ranked candidates with a reason; `IssueItemKind` has no `suggest`
  method. The auto-drafter only orchestrates: it asks each enabled source for
  candidates, applies counts and de-duplication, and creates a normal draft
  issue through the same issue service editors use. No kind-specific logic
  lives in the auto-drafter, and the builder's "Add more" picker reuses the
  same source ranking.
- Ranking is deterministic from our own data (article waiting time, replies,
  views, upvotes, attendance, storyline recency). AI ranking or AI-written
  editor's notes are out of scope (see "Later").
- Scheduling runs through the existing cron routes (`src/app/api/cron`); the
  run must be idempotent per (magazine, period). Auto-publish uses the same
  publish path as a human publish (notifications, credit, visibility checks),
  recorded as "published automatically".

## Layout

Reading and editing screens are designed wide-first (content up to ~1600px)
and collapse to one column on phones. See the mockup
(`2026-10-26-community-magazines-mockup.html`):

1. `/magazines`: featured issue beside a "Just published" list, then a filterable
   shelf of all magazines.
2. Issue (member): three columns — sticky table of contents, the issue as a
   card mosaic, and a right rail (about + subscribe, past issues, share).
3. Issue (visitor teaser): teaser grid with a sticky join panel.
4. Issue builder: item list (reorder/remove, auto-pick reasons) · live preview
   (member / visitor / phone) · "Add more" picker by kind.
5. Auto-draft settings.

The mockup is a shape reference, not a visual spec; DESIGN.md wins on tokens
and components.

## Layout templates

A small fixed set, each a component using DESIGN.md tokens:
`cover-story` (one lead item + grid), `long-read` (single column, sequential),
`digest` (compact list, good for news-heavy issues). Teaser rendering is a mode
of each template, not a separate template.

## Stats

Per issue: views, unique readers, read-to-end per article, new subscribers,
community joins attributed to the magazine (join CTA carries a source). Shown
to magazine staff only. Builder chooses the event store, reusing any existing
analytics pattern rather than adding a vendor.

## Delivery slices (each shippable on its own)

1. **Core** — magazine + issues + magazine articles + `editorial` item,
   visibility (`members`/`public`), access resolver applied to every surface,
   community Magazine tab, `/magazines` pages, reading view with one layout.
2. **Platform content in issues** — item registry kinds `storyline`, `newsItem`,
   then `event`, `forumThread`, `launchpadProject`; picker UI; unavailable-item
   handling.
3. **Contributors** — staff roles, submission + review, contributor credit.
4. **Subscriptions** — inbox + email, scheduling.
5. **Auto-draft** — source-keyed `ITEM_SUGGESTERS` beside the item kinds,
   settings screen, cron run, notify-only mode, then
   auto-publish-after-N-days, history.
6. **Growth** — `teaser` visibility, share cards/OG, all layouts, stats,
   staff moderation switch on `/magazines`.
7. **Later** — PDF export, AI editor help, AI ranking for auto-draft.

## Constraints

- WCAG 2.2 AA; DESIGN.md rules (One Voice, No-Cream, House Kicker, Mono-Is-Machine,
  Flat-By-Default).
- en/nl: UI strings localized; article title stays localized as today; issue
  title and editor's note follow the same pattern.
- Schema changes via hand-written Payload migrations (`src/migrations`) +
  `payload generate:types`; never `db:push`.
- Realtime/notifications via the existing inbox (ADR-0025), no new channel.
- Customer-facing copy in everyday words.

## Left to the builder

- Exact table/collection names and file layout inside the stated structure.
- Whether one-magazine-per-community is a DB constraint or an app rule.
- Teaser cut-off rule details and how it interacts with code/image blocks.
- Event store for stats.
- Picker search implementation per item kind.
- ADR(s): item registry + access resolver, and the storage split.

## Claude's calls (please check)

- Visibility is per issue, defaulting from the magazine.
- An article belongs to at most one issue.
- One magazine per community for now.
- No staff pre-approval for public issues; staff can hide after the fact.
- Platform content is referenced live, not snapshotted.
- News/stories go in slice 2, right after the core.
- Magazine editors are the only review gate; staff do not pre-review.
- Contributor credit fires on issue publish; magazine articles also count toward
  existing article badges.
- Public magazine articles show on the author's profile and in search, never on `/blog`.
- Auto-draft offers "auto-publish after 3 days unless stopped" as an opt-in;
  the default is notify-only. Any editor edit cancels auto-publish for that draft.
