# Community Magazines — Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Magazines reach people outside their community. An issue can be a **preview** (`teaser`): anyone sees the cover, the editor's note, the contents and the start of each article, then an invitation to join that follows the community's join rule. Issues and articles get their own share images and share buttons. Editors pick one of three layouts (cover story, long read, digest). Editors see per-issue numbers (views, readers, read to the end per article, new subscribers, people who joined the community from the magazine). Platform staff can hide a magazine from `/magazines` without deleting it.

**Architecture:** `teaser` is a fourth access level of the one resolver (ADR-0042): `resolveMagazineIssueAccess` returns `none | teaser | full | editor`, and its query twin takes a required **reach** (`"teaser"` = the issue may be listed, `"full"` = its articles may be read), so every surface states which one it needs. The reading side never branches on visibility: the server decides what a level may receive (article openings only, editorial bodies withheld), and layouts render a `teaser` mode through a prop. Join attribution rides the existing `community.joined` / `community.join_requested` activity events. Reading numbers live in one small first-party table keyed by a cookieless, hashed reader key (ADR-0048). Share images are route handlers in the anonymous scope. The staff switch is a Payload admin field.

**Tech Stack:** Next.js App Router (RSC reading pages, route handlers, `next/og` `ImageResponse`), tRPC, Payload CMS 3.77 (collections, Local API, hand-written migrations), Drizzle (`app.*` tables), next-intl (en + nl), shadcn/ui primitives, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-26-community-magazines-design.md` — read "Visibility rules" (the `teaser` row, the unlisted opt-in, indexing), "Layout templates", "Stats", "Delivery slices → 6". Shape reference: `docs/superpowers/specs/2026-10-26-community-magazines-mockup.html` screen 3 (visitor teaser with a sticky join panel). DESIGN.md wins over the mockup. Read first: ADR-0042, ADR-0043, ADR-0046, ADR-0047 and `docs/superpowers/plans/2026-10-27-community-magazines-auto-draft.md` (its rulings still hold unless this plan says otherwise).

## Decisions this plan makes (spec gaps)

1. **`teaser` is an access level, not a per-surface rule.** `MagazineIssueAccess = "none" | "teaser" | "full" | "editor"`. The resolver: editors `editor`; unpublished `none`; members `full`; everyone else by the issue's _effective_ visibility: `members` → `none`, `teaser` → `teaser`, `public` → `full`. Every existing exhaustive `switch` over the access union gets a `teaser` arm in the same change (Task 2).
2. **One opt-in covers both outsider levels.** `teaser` and `public` both show the community's name and a link to everyone, so the unlisted-community confirmation (stored in the existing `publicConfirmedBy` / `publicConfirmedAt` columns, not renamed) covers either. `opensToOutsiders(v)` (`teaser`, `public` → true) is the one predicate. A recorded confirmation is kept only when the change **narrows or holds** what outsiders get: `public` → `teaser`, `public` → `public`, `teaser` → `teaser` keep it, and the saved record is `{ ...current, visibility: next }` (never `current` unchanged, which would save the old visibility). **Widening** `teaser` → `public` in a content-private community needs a fresh `confirmUnlistedPublic` from a community leader (owner/admin), because full articles then reach outsiders. Switching to `members` clears it. An unconfirmed `teaser` in an unlisted community counts as `members` for outsiders, exactly like an unconfirmed `public`. The refusal codes stay `CONFIRM_UNLISTED_PUBLIC` / `UNLISTED_PUBLIC_LEADERS_ONLY` and the input flag stays `confirmUnlistedPublic` (API compatibility); their doc comments say they cover both levels.
3. **The query twin takes a required reach.** `IssueReach = "teaser" | "full"`. `readableIssueWhere(scope, reach)` matches exactly the issues the resolver answers `teaser | full | editor` (reach `teaser`) or `full | editor` (reach `full`). Callers: listings, shelves, the home, "past issues", `readableIssueExists` (and so `mayKnowMagazine` and email subscription) use `teaser`; everything that reads an **article** (sitemap, agent/MCP search, profile work, `readableArticleWhere` users) goes through the one seam `readableArticleIssueIds(payload, scope, narrow?)` in `src/server/articles/article-access.ts` (= `readableIssueIds(payload, scope, "full", narrow)`), so no article surface ever names a reach. Only issue listings pass a reach explicitly. A teaser article is never readable outside its own page (comments, profile, search, sitemap, MCP all treat it as unreadable). The parity test pins both reaches.
4. **What a teaser reader receives** (decided on the server; the client never gets more):
   - The issue page: cover, editor's note in full, the contents list, and every item's card as a full reader gets it, except: an **article** card shows its _opening_ instead of "Read article"; an **editorial** block is a non-article item, so it shows its card only (heading and intro) and its `body` is withheld (`null`) by the editorial kind (spec: "Non-article items show their card only"). Platform items (story, news, event, thread, project) show their card, still under each reader's own access (a members-only thread stays out).
   - The **opening** = `openingOf(content)`: the plain text of the top-level text blocks (`paragraph`, `heading`, `quote`, `list`) in order, skipping every other block (code, images, embeds, rules), cut at 80 words with "…". It is plain text, never Lexical, so no code or image ever reaches a teaser reader. It is the **one** start-of-text rule: the article card's existing `excerpt` becomes `openingOf(article.content, 40)` for every access level (today it is `cutWords(lexicalPlainText(content), 40)`, which includes code text), so no view field carries text from any other rule. An article whose first text comes late still gets its first 80 words of text; an article with no text gets an empty opening (the card shows the join prompt only).
   - The article page: title, byline, image, reading time, the opening, then the join panel. No body, no contents list, no comments. The read model returns `{ mode: "teaser", article: ArticleTeaser }` (no `content` field), so the full text cannot reach the RSC payload.
5. **Teaser is a mode of each layout.** `LayoutProps.teaser: ItemTeaser | null` and `ItemRendererProps.teaser: ItemTeaser | null`, where `ItemTeaser = { inlinePrompt: ReactNode }`. Renderers do not know the join rules; they place the prompt they are given. The issue reader passes the live prompt; the builder preview passes the same presentational `MagazineJoinPromptView` with `tone="preview"` and a fixed `{ kind: "join" }` action inside the inert preview (container/presentational split, one source of copy and shape).
6. **Join prompt.** `MagazineJoinPromptView` (pure, no hooks) owns all copy and the switch over the join action; its `tone: "live" | "preview"` defaults to `"live"`. `MagazineJoinPromptProvider` wires `useCommunityJoin` and invitation responses into one shared state for the issue page's inline prompts and two responsive panel copies, with one sign-in completion effect. `MagazineJoinPrompt` consumes that state, supplying a provider when used on a standalone article. It follows the community's `joinPolicy` through the existing `useCommunityJoin` (open → "Join {community}", approval → "Ask to join {community}", invite only → plain text and a link to the community, pending → "You asked to join…"; guests are asked to sign in and come back joined). Below `xl`, the panel appears immediately after `IssueHero` in `xl:hidden`; its sticky rail copy is `hidden xl:block`, so exactly one panel is visible at any width. The live panel's button is the page's one orange action; inline prompts and preview-tone panels are `outline`. After a join or request the page refreshes, so a new member reads the full issue at once. Because the refresh removes the focused prompt (a member gets `null`), the provider moves focus to the page's main heading (`focusTargetId` prop: the issue or article `<h1>`, which carries `tabIndex={-1}`) right after a successful join or request, before `router.refresh()`; the existing `useCommunityJoin` success toast announces the result (WCAG 2.4.3).
7. **Join attribution reuses the join log, through a seam owned by communities.** `JoinSource` is a discriminated union on `via` owned by communities (`src/lib/communities/join-source.ts`); today it has one variant, `{ via: "magazine"; magazineId; issueId }`. It is an optional input of `communities.join` and `communities.requestToJoin`. The router calls only `verifyJoinSource(deps, communityId, source)` from `src/server/communities/join-sources.ts`; `deps` accepts either loaded dependencies or a lazy `() => Promise<Deps>` factory. Verification owns dependency-loading and verifier failures: it logs them and returns `null`, so joining still succeeds without a source. `JOIN_SOURCES` maps each `via` to a full `JoinSourceEntry` strategy `{ verify, metadata, condition }`; all three operations dispatch through `entryFor(source)` with no per-`via` switch. The magazine module supplies `magazineJoinSource`, including `verifyMagazineJoinSource`, which keeps the source only when the issue is **published** and belongs to that community and magazine. The router never names magazines; a future source (event page, project) adds one union variant, its zod variant, and one registry entry. An unverified source is dropped and the join still happens. It is stored as the activity metadata `joinSourceMetadata(source)` = `{ via: "magazine", magazineId, issueId }` of the existing `community.joined` / `community.join_requested` event, and read back only through `joinSourceCondition(source): SQL`; the magazine strategy owns the matching writer and parenthesized condition so they cannot drift. The join intent kept across guest sign-in carries it. A join counts for an issue when it is a `community.joined` event with that source, or a `community.join_requested` event with that source whose requester is now an active member. Rejected: a column on `community_membership` (widens a core table for one feature; the activity log is already the join record Insights reads).
8. **Email still gets public issues only.** `IssueAudience` gains `"preview"` (outsiders get the preview); each channel decides what that means: `inboxAudienceCondition("preview")` = every signed-in subscriber (members read it in full, others get the preview), `emailAudienceCondition("preview")` = nobody. The old comment in `issue-access.ts` ("teaser issues are meant to reach email subscribers") and ADR-0046 Decision 7's "teaser issues are intended to reach email" are replaced: the slice brief keeps email public-only. Subscribing by email stays open on a teaser-only magazine (reach `teaser`); such a subscriber gets the magazine's next public issue.
9. **Search engines.** `IssueCard.outsiderReach: OutsiderReach` (`none | teaser | full`) is computed **once, on the server, by the resolver**: `toIssueCard` calls `resolveMagazineIssueAccess({ viewer: NO_STANDING, community, issue })` (`teaser` → `teaser`, `full` → `full`, `none` and the impossible `editor` → `none`), following the `issueAudience` precedent. Robots tags, JSON-LD, `og:image` meta and the share buttons only read `issue.outsiderReach`; nothing on the client derives it, and `indexing.ts` loses its own restatement of the rule. The share-image route asks the same resolver (`loadReadableIssue` with `viewerId: null`), so page meta and image cannot disagree. Teaser issue and article pages are indexable: crawlers are signed out, so they only ever receive teaser content. They are not in the sitemap (reach `full`). Article JSON-LD carries `isAccessibleForFree: false` when the outsider reach is `teaser`. A magazine hidden by staff (Decision 14) is `noindex` on every page.
10. **Reading numbers live in `app.magazine_read`** (ADR-0048): one row per (issue, issue page or article, reader key) with a view count, first/last seen and a read-to-end time. The reader key is an HMAC-SHA256 (secret `BETTER_AUTH_SECRET`, domain-separated with the prefix `magazine-reader|`), cut to 32 hex chars: signed in `u` + hmac(`user|<id>`) (stable, so a member is one reader across days); signed out `a` + hmac(`anon|<UTC day>|<ip>|<user agent>`) (rotates daily, no cookie, no IP stored). No user id, IP or user agent is stored. A client beacon records it (bots without JavaScript and link prefetches do not count) through the public `magazineStats.record` procedure, which re-checks access: `none` and `editor` record nothing (editors' own visits do not count), `teaser` records views only, `full` records views and read-to-end. Rejected: `activity_event` (needs an actor id, it is the audit log Insights reads, and anonymous rows would pollute it); Vercel Analytics (not queryable per issue, and a vendor); a counter column on the Payload issue (Payload saves rewrite columns it owns, and a counter has no unique readers).
11. **New subscribers per issue** come from `magazine_subscription.source_issue_id`, set when someone subscribes from an issue or article page, on new rows only (never on a conflict update or merge), and counted once the subscription is confirmed.
12. **Who sees numbers:** the `edit` capability (editors and editor-in-chief), on `/communities/[slug]/magazine/issues/[issueId]/stats`, linked from the editor desk for published issues. Contributors do not see them (spec Goal 9 says editors).
13. **Layouts.** `ISSUE_LAYOUTS = ["cover-story", "long-read", "digest"]`. Renderers take `size: ItemSize = "lead" | "card" | "row" | "related"` instead of `lead: boolean`; every kind handles all four sizes explicitly with a `never` exhaustiveness check (ADR-0043: one renderer per kind, no `if (kind)` in layouts). `long-read`: one column of `lead` items. `digest`: an ordered list of `row` items divided by hairlines. In teaser mode a `row` article shows its title and the muted line "Members read the whole article" (no button; the panel holds it). "Next in this issue" goes through `IssueItem` with `size="related"`; article cards include their code-free excerpt in that size. The builder picks the layout in the issue details (`updateIssue({ layout })`); the automatic-drafts form lists all three from `ISSUE_LAYOUTS`.
14. **Staff moderation switch** = three Payload admin fields on `magazines`: `listingHidden` (checkbox), `listingHiddenAt`, `listingHiddenBy` (read-only, stamped by a `beforeChange` hook from the admin user). In site code the derived fact is called `staffHidden` (`MagazineSummary.staffHidden`, `isHiddenByStaff(magazine)`, indexing parameter `magazine: { staffHidden: boolean }`), never "listed", because "listed / unlisted" already means a community's `isListedInDirectory`. A hidden magazine is left out of the `/magazines` home and the sitemap and is `noindex` on its shelf, issue and article pages; its pages keep working by link for whoever may read them, and its community tab is unchanged. Site code never writes these fields (`saveMagazineSettings` sends explicit fields only). There is no magazine RSS feed today (core plan Decision 11); the slice guarantee test pins that `feed.xml` still carries no magazine article.
15. **Share images** are route handlers at `/[locale]/og/magazine/[magazineSlug]/[issueSlug]` and `/[locale]/og/magazine/[magazineSlug]/[issueSlug]/[articleSlug]` (not under the reading path, where a static segment would shadow an article slug). They always use the anonymous scope, answer 404 unless the resolver gives an outsider `teaser` or `full` (an article also must be published in that issue), and send `Cache-Control: no-store`, so a switch back to members-only shows at once. Both routes are thin (resolve locale → rate limit → `loadShareCard` → 404 or render) over **one** renderer, `renderMagazineShareImage(card, labels)` in `src/server/magazines/share-image.tsx`, which draws inside a shared black frame `BlackCard` (`src/lib/og/black-card.tsx`, the `#000` / `#EA580C` frame that `src/app/[locale]/og/route.tsx` and the badge image already draw inline). **The renderer never gets a raw remote URL:** the editor-typed cover is fetched by the route through `safeFetch` (SSRF guard, 3 s budget) and `readBodyCapped` (2 MB), kept only when the content type is `image/png | image/jpeg | image/webp | image/gif`, and passed as a `data:` URL; any failure draws the card without the image. Each route is limited per client IP (`createPerUserLimit({ windowMs: 60_000, max: 30 })` keyed by `clientIpFromHeaders`; over the limit → 429), so it is not a cheap amplifier. Share actions: copy link, the phone's share sheet when available, X, LinkedIn, email, in a generic `ShareActions` (`src/components/share/share-actions.tsx`) over a pure `shareTargets(url, title)` (`src/lib/share.ts`). `ShareActions` requires the absolute `url` from the server for its first render, Copy link, and native share. Only X and LinkedIn open a new tab; email is a normal `mailto:` link. Copy/share feedback uses only the `role="status"` line, with no toast. The social buttons show only when `issue.outsiderReach` is not `none`; members-only issues keep "Copy link" only.
16. **One migration for the slice**, `src/migrations/20261028a_magazine_growth.ts`, created in Task 1 with every database change of the slice (enum values, widened checks, staff fields, `source_issue_id`, `app.magazine_read`). If `origin/main` has a later migration when Task 1 starts, use the next free date-letter name everywhere below.

## Global Constraints

- **The constraints file handed to the coding engine with every task holds this plan's "Decisions this plan makes" section and this "Global Constraints" section verbatim.** Task text refers to "Decision N" and "the DB prefix"; both are defined there, nowhere else.
- Branch: `feat/community-magazines-growth`, created by the controller (not a task agent) from `origin/main` after `feat/community-magazines-auto-draft` has merged. If it has not merged yet, the controller stacks the branch on it and later rebases with `git rebase --onto origin/main <old base>` after the squash merge (CI runs only for PRs into main). Run `git branch --show-current` before every commit. Never `git checkout`/`git switch`, never `git stash`, never `git add -A` / `git add .`. Stage files by name and confirm every staged file is yours.
- No `Co-Authored-By`, "Generated with" or any AI credit line in commits or PRs.
- Before Task 1, after Task 5 and before opening the PR: `git fetch origin && git log origin/main --oneline | grep -i -E "magazin|teaser|preview|share|stats"; gh pr list --search magazine`. Stop if another session shipped part of this.
- **Never** run `pnpm db:apply`, `pnpm db:push`, `pnpm build`, `pnpm dev`, `drizzle-kit generate`, or anything that reads `.env`. Its `DATABASE_URL` is production, and prod applies migrations on merge. Never `source`/`.` `.env` or `.env.docker`.
- Unit test prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run`.
- **DB prefix** (use exactly; never host port 5432):
  `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test`
  If `aitcom_test` is not reachable, set it up once: `pnpm dev:db`; `docker run -d --rm --name aitcom-test-pg-forward --network aitcom_default -p 127.0.0.1:55432:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp:postgres:5432`. New tables, columns and enum values reach the test DB only through the migration's `up` (Task 1's migration test runs it). Never set `PAYLOAD_PUSH` against `aitcom_test`. A DB suite that reports _skipped_ is a setup failure: fix the env, do not continue.
- **Regenerate Payload types** (Tasks 1, 2 and 6 only): `env -u PAYLOAD_PUSH SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test RESEND_API_KEY= npx payload generate:types` (if it stops on one missing variable, pass that one inline with a dummy local value). Each task names the only hunks `git diff -- src/payload-types.ts` may show.
- Integration tests copy the `isLocalDbConfigured` guard and fixture style of `src/server/magazines/reading.integration.test.ts` and `src/server/magazines/issue-access.integration.test.ts` (unique suffix, users with member profiles, `community(label, { listed })`, `callerAs(userId)` built with `createCaller({ db, headers, session })` where needed, cleanup in `afterEach`). Cleanup also deletes the fixture's `app.activity_event`, `app.magazine_read` and `app.magazine_subscription` rows.
- Payload `number` values may come back as strings: `Number()` before comparing.
- **Running the app** (visual checks and the production build only). Commit first, then export `HEAD`: `X="$TMPDIR/aitcom-visual"; rm -rf "$X"; mkdir -p "$X"; git -C /Users/greg/coding-projects/aitcom archive HEAD | tar -x -C "$X"; ln -s /Users/greg/coding-projects/aitcom/node_modules "$X/node_modules"`. Then, in `$X`: `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test RESEND_API_KEY= BETTER_AUTH_SECRET=local-visual-check PAYLOAD_SECRET=local-visual-check pnpm exec next dev -p 3100`.
- Every user-visible string goes through next-intl in **both** `messages/en.json` and `messages/nl.json`, in everyday words, informal Dutch ("je"). The plan gives the English; the task writes natural Dutch alongside. Reading copy lives under `magazines.*`, editor copy under `magazineEditor.*`. Say "preview", "members read the whole article", "numbers", "readers", "read to the end", "hide from the Magazines page". Never "teaser", "visibility level", "reach", "access", "attribution", "beacon", "analytics", "metrics" in copy. `src/i18n/messages-parity.test.ts` must pass. Editor refusal codes reach the UI only through `readEditorError` / `editorErrorKey`.
- Design (UI tasks): read `PRODUCT.md` and `DESIGN.md` first. Tokens from `src/styles/globals.css`, primitives from `src/components/ui/`. One Voice Rule: on a teaser page the one orange is the join panel's button; on editor screens the one orange stays Save / Publish. `/ LABEL` kickers only through `<SectionLabel>`. Mono for counts, dates and numbers only; labels and explanations are Sans. Flat by default: hairline borders, no shadows, no nested cards. Loading → `<Skeleton>`, error → `<ErrorState onRetry>` or `role="alert"` text, empty → text that says what shows up here.
- Accessibility: WCAG 2.2 AA. Label every control; IDs from `useId()`. X and LinkedIn share links use `target="_blank"`, say they open in a new tab (sr-only text), and use `rel="noopener noreferrer"`; email is a normal `mailto:` link without those attributes or the new-tab announcement. Share feedback uses only the `role="status"` line, with no toast. Number tables use `<table>` with `<th scope>`. No horizontal page scroll at 390px.

## Review Focus

1. **A signed-out visitor or a signed-in non-member opens a teaser issue and one of its articles** → the HTML and the RSC payload hold the cover, the note, the contents, each article's opening (≤ 80 words, never code or image) and the join prompts, and nothing more: no article body, no editorial body, no comments; the article is not on the author's profile, in agent/MCP search, in the sitemap or readable by `canReadArticle`. Tests: Task 2 (`a teaser article is unreadable on every other surface`), Task 4 (`a teaser reader gets openings only`, `the teaser article page carries no body`), Task 10.
2. **An unlisted community's issue set to `teaser` without the recorded confirmation, or widened from a confirmed `teaser` to `public` by a non-leader** → outsiders get 404 on the issue, no share image, no listing on `/magazines`; members read it in full; resolver and query agree for both reaches; the widening needs a leader's fresh tick; a confirmed public → preview change really saves `teaser`. Tests: Task 2 (resolver table, parity matrix, `widening preview to everyone needs a leader again`, `a confirmed public issue changed to preview is a preview for outsiders`), Task 7 (`share image is 404 for a members-only or unconfirmed issue`).
3. **An editor switches a teaser or public issue back to members only** → on the very next request outsiders get 404 on the issue page, the article page and the share image (`no-store`), and `magazineSitemapPaths` and `loadMagazinesHome` drop the issue at once; the served `sitemap.xml` may lag up to an hour (`revalidate = 3600` in `src/app/sitemap.ts`, already documented in `sitemap-paths.ts`). Tests: Task 7 (`switching to members takes the share image down at once`), Task 10.
4. **Numbers that lie**: a reader reloads ten times, an editor previews, an outsider posts `record` for a members-only issue, a teaser reader posts `read_end`, someone posts an article id from another issue → views +10 but one reader; nothing for the editor; nothing for the forged rows. Known limit (Risks): a signed-out caller who rotates its user agent counts as a new reader each time, bounded by the per-IP limit. Tests: Task 8 (`record re-checks access and never trusts the client`), Task 9 (`counts views, readers, read to the end, subscribers and joins`).
5. **A guest presses Join on a teaser page, signs up, comes back** → they join with the magazine source recorded, the page shows the full issue, and the issue's numbers count one join; a forged source (another community's issue, or a draft issue) is dropped and the join still works; keyboard focus lands on the page heading. Tests: Task 3 (`a join from a magazine records its source`, `a forged source is dropped`, `the source survives sign-in`), Task 9.

## File structure

**Create**

| File                                                                                                  | Responsibility                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/migrations/20261028a_magazine_growth.ts` (+ `magazine-growth.integration.test.ts`)               | Every DB change of the slice (Decision 16).                                                                              |
| `src/server/magazines/listing.ts`                                                                     | `hiddenMagazineIds`, `isHiddenByStaff` (Task 1).                                                                         |
| `src/lib/communities/join-source.ts`                                                                  | `JoinSource` union, `joinSourceSchema` (client-safe, Task 3).                                                            |
| `src/server/communities/join-sources.ts`                                                              | `JoinSourceEntry`, `JOIN_SOURCES`, `entryFor`, `verifyJoinSource`, `joinSourceMetadata`, `joinSourceCondition` (Task 3). |
| `src/server/magazines/issue-origin.ts`                                                                | `issueOrigin` (projection of `loadIssueFactsById`), `magazineJoinSource`, `verifyMagazineJoinSource` (Task 3).           |
| `src/components/magazines/reading/magazine-join-prompt.tsx`                                           | `MagazineJoinPromptView` (pure), `MagazineJoinPromptProvider` (shared state), and `MagazineJoinPrompt` (Task 3).         |
| `src/lib/magazines/teaser.ts`                                                                         | `TEASER_OPENING_WORDS`, `cutWords`, `openingOf` (Task 4).                                                                |
| `src/components/magazines/layouts/{long-read,digest}.tsx`                                             | The two new layouts (Task 6).                                                                                            |
| `src/server/magazines/share-cards.ts`                                                                 | `loadShareCard` (Task 7).                                                                                                |
| `src/lib/og/black-card.tsx`                                                                           | `BlackCard`, the shared 1200×630 black share-image frame (Task 7).                                                       |
| `src/server/magazines/share-image.tsx`                                                                | `renderMagazineShareImage`, `loadShareCover` (Task 7).                                                                   |
| `src/app/[locale]/og/magazine/[magazineSlug]/[issueSlug]/route.tsx` and `.../[articleSlug]/route.tsx` | Share images (Task 7).                                                                                                   |
| `src/lib/share.ts`, `src/components/share/share-actions.tsx`                                          | `shareTargets` (pure) and the generic `ShareActions` (Task 7).                                                           |
| `src/lib/magazines/stats.ts`                                                                          | `READ_EVENTS`, `ReadEvent` (client-safe, Task 8).                                                                        |
| `src/lib/magazines/parse-issue-id.ts` (+ test)                                                        | Shared `parseIssueId` for builder and numbers page URL parameters (Task 9).                                              |
| `src/server/magazines/stats/{reader-key,reads,record}.ts`                                             | Reader key, the one writer of `magazine_read`, the access-checked use case (8).                                          |
| `src/server/api/routers/magazine-stats.ts`                                                            | `magazineStats.record` (Task 8).                                                                                         |
| `src/components/magazines/reading/read-tracker.tsx`                                                   | The client beacon (Task 8).                                                                                              |
| `docs/adr/0048-magazine-reading-numbers-are-first-party-tallies-keyed-by-a-cookieless-reader-key.md`  | ADR (Task 8).                                                                                                            |
| `src/server/magazines/stats/issue-stats.ts`                                                           | `loadIssueStats` (Task 9).                                                                                               |
| `src/app/[locale]/communities/[slug]/magazine/issues/[issueId]/stats/page.tsx`                        | The numbers page (Task 9).                                                                                               |
| `src/components/magazines/editor/stats/issue-stats-view.tsx`                                          | The numbers page body (Task 9).                                                                                          |
| `src/server/magazines/growth.integration.test.ts`                                                     | Slice guarantees (Task 10).                                                                                              |

**Modify** (by task): `src/lib/magazines/{values,access,visibility,indexing,item-views,paths}.ts`, `src/collections/{Magazines,MagazineIssues}.ts`, `src/payload-types.ts` (generated), `src/server/db/schema.ts`, `src/migrations/index.ts`, `src/migrations/magazine-auto-draft.integration.test.ts`, `src/server/magazines/{issue-access,readable-issues,reading,sitemap-paths,announcements,issue-service}.ts`, `src/server/articles/article-readers.test.ts`, `src/server/magazines/items/{community-content,base-input}.ts`, `src/server/magazines/items/*/kind.ts`, `src/server/magazines/subscriptions/service.ts`, `src/server/articles/article-access.ts`, `src/server/api/routers/{agent,communities,magazines,magazine-subscriptions}.ts`, `src/server/api/root.ts`, `src/server/members/profile-work.ts`, `src/components/communities/{join-community-link,use-community-join}.ts`, `src/components/magazines/items/*`, `src/components/magazines/layouts/{types,registry,cover-story}.ts(x)`, `src/components/magazines/reading/{issue-reader,issue-rail,magazine-article,magazine-shelf,subscribe-button}.tsx`, `src/components/magazines/community/magazine-tab.tsx`, `src/components/magazines/editor/{magazine-settings-form,public-opt-in,editor-desk}.tsx`, `src/components/magazines/editor/builder/{issue-details,issue-builder,live-preview,publish-dialog,use-issue-save}.ts(x)`, `src/components/magazines/editor/builder/items/editorial.tsx`, `src/components/magazines/editor/auto-draft/auto-draft-settings-form.tsx`, `src/components/magazines/test-fixtures.ts`, the magazine reading pages under `src/app/[locale]/magazines/`, `messages/{en,nl}.json`, ADR-0042, ADR-0046, `DESIGN.md`, `CONTEXT.md`.

---

## Task 1: The slice's migration and the staff switch

**Files:**

- Create: `src/migrations/20261028a_magazine_growth.ts`, `src/migrations/magazine-growth.integration.test.ts`, `src/server/magazines/listing.ts`, `src/server/magazines/listing.test.ts`
- Modify: `src/migrations/index.ts`, `src/migrations/magazine-auto-draft.integration.test.ts` (line ~271: replace `["visibility", "teaser"]` with `["visibility", "everyone"]`, since `teaser` is now allowed), `src/server/db/schema.ts`, `src/collections/Magazines.ts`, `src/collections/magazines-schema.test.ts`, `src/payload-types.ts` (generated), `src/lib/magazines/indexing.ts` (+ test), `src/server/magazines/reading.ts`, `src/server/magazines/sitemap-paths.ts`, `src/app/[locale]/magazines/[magazineSlug]/page.tsx`, `.../[issueSlug]/page.tsx`, `.../[articleSlug]/page.tsx`, `src/components/magazines/reading/magazine-article.tsx`, `src/components/magazines/test-fixtures.ts`

**Interfaces:**

- Produces (migration `up`, idempotent; first `db.execute` commits the enum values on their own, as `20261027c` does):
  - `ALTER TYPE "public"."enum_magazines_default_visibility" ADD VALUE IF NOT EXISTS 'teaser' BEFORE 'public'`; the same for `enum_magazine_issues_visibility`; `ALTER TYPE "public"."enum_magazine_issues_layout" ADD VALUE IF NOT EXISTS 'long-read'` then `'digest'`.
  - `app.magazine_auto_draft_settings`: in one `ALTER TABLE` each, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` with the same full names (as created in `20261027c_magazine_auto_draft.ts:46-48`): `"magazine_auto_draft_settings_layout_check"` → `CHECK ("layout" IN ('cover-story', 'long-read', 'digest'))`, `"magazine_auto_draft_settings_visibility_check"` → `CHECK ("visibility" IS NULL OR "visibility" IN ('members', 'teaser', 'public'))` (widening only; no row changes).
  - `magazines`: `listing_hidden boolean DEFAULT false`, `listing_hidden_at timestamp(3) with time zone`, `listing_hidden_by varchar` (`ADD COLUMN IF NOT EXISTS`).
  - `app.magazine_subscription`: `source_issue_id integer REFERENCES "public"."magazine_issues"("id") ON DELETE set null`; index `magazine_subscription_source_issue_idx` on it.
  - `app.magazine_read`: `id varchar(255) PRIMARY KEY`, `magazine_id integer NOT NULL REFERENCES public.magazines ON DELETE cascade`, `issue_id integer NOT NULL REFERENCES public.magazine_issues ON DELETE cascade`, `article_id integer REFERENCES public.articles ON DELETE cascade` (null = the issue page), `reader_key varchar(64) NOT NULL`, `views integer NOT NULL DEFAULT 0`, `read_to_end_at timestamptz`, `first_seen_at timestamptz NOT NULL`, `last_seen_at timestamptz NOT NULL`; unique `magazine_read_issue_reader_idx (issue_id, reader_key) WHERE article_id IS NULL`; unique `magazine_read_article_reader_idx (issue_id, article_id, reader_key) WHERE article_id IS NOT NULL`; index `magazine_read_magazine_idx (magazine_id)`.
  - `down`: drops `app.magazine_read`, the `source_issue_id` column, the three `listing_*` columns. Enum values and the widened checks stay (comment: Postgres cannot drop enum values; narrowing a check could reject rows that use them).
- Produces (`schema.ts`): `magazineSubscriptions.sourceIssueId: d.integer()` + the index; `export const magazineReads = appSchema.table("magazine_read", …)` mirroring the columns above (`id` with `$defaultFn(() => crypto.randomUUID())`, the two partial unique indexes via ``.where(sql`…`)``); the two widened `check(...)` strings of `magazineAutoDraftSettings`. Payload FKs stay in the migration only (precedent).
- Produces (`Magazines.ts`): fields `listingHidden` (checkbox, `defaultValue: false`, admin description "Hide this magazine from the Magazines page and from search engines. Its pages still open by link."), `listingHiddenAt` (date, `admin.readOnly`), `listingHiddenBy` (text, `admin.readOnly`, "Payload admin user who hid it"); `hooks.beforeChange: [stampListingHidden]` with
  ```ts
  export const stampListingHidden: CollectionBeforeChangeHook<Magazine>;
  // only when data.listingHidden is given and differs from originalDoc.listingHidden (null = false):
  // hidden → listingHiddenAt = now ISO, listingHiddenBy = String(req.user?.id) or null; shown → both null
  ```
- Produces (`listing.ts`):
  ```ts
  /** Ids of magazines staff hid from the Magazines page (Decision 14). */
  export async function hiddenMagazineIds(
    payload: Pick<PayloadClient, "find">,
  ): Promise<number[]>;
  /** Decision 14: the derived fact is `staffHidden`, never "listed". */
  export function isHiddenByStaff(
    magazine: Pick<Magazine, "listingHidden">,
  ): boolean; // listingHidden === true
  ```
- Produces (`reading.ts`): `MagazineSummary.staffHidden: boolean` (from `isHiddenByStaff`); `loadMagazinesHome` pass 1 adds `{ magazine: { not_in: hidden } }` when `hidden` is non-empty.
- Produces (`indexing.ts`), replacing the current signatures:
  ```ts
  export function isIssueIndexable(
    issue: IndexFacts,
    magazine: { staffHidden: boolean },
  ): boolean;
  export function isMagazineArticleIndexable(
    issue: IndexFacts,
    article: ArticleFacts,
    magazine: { staffHidden: boolean },
  ): boolean;
  /** A magazine staff did not hide, with at least one indexable issue. */
  export function isShelfIndexable(
    magazine: { staffHidden: boolean },
    issues: readonly IndexFacts[],
  ): boolean;
  ```
- Produces (`sitemap-paths.ts`): issues of hidden magazines (and their shelves and articles) are left out (narrow `readableIssueIds` with `{ magazine: { not_in: hidden } }`).

- [ ] **Step 1: Write the failing tests.**
  - `magazine-growth.integration.test.ts` (DB, copy the guard of `magazine-auto-draft.integration.test.ts`): `it("adds the values, columns and table and can run twice")` (enum ranges contain `teaser`, `long-read`, `digest`; the columns exist; `up` twice passes); `it("auto-draft settings accept the new layouts and preview, and still refuse unknown values")` (`teaser`, `long-read`, `digest` insert; `everyone`, `grid` violate with `23514`); `it("keeps one read row per reader and target")` (a second insert of the same (issue, null, key) and of the same (issue, article, key) violates `23505`; the same key on another article does not); `it("clears a subscription's source when its issue is deleted")`; `it("down removes the table and columns, up restores them")`.
  - `magazines-schema.test.ts`: `it("has the staff switch fields")`; `it("stamps who hid a magazine and clears it when shown again")` (call `stampListingHidden` with `req.user = { id: 7 }`: `{ listingHidden: true }` over `{ listingHidden: false }` → `listingHiddenBy: "7"` and an ISO `listingHiddenAt`; back to `false` → both `null`; `data` without `listingHidden` → unchanged).
  - `indexing.test.ts`: the existing cases get `{ staffHidden: false }`; `it("a hidden magazine is never indexable")` for the issue, article and shelf helpers.
  - `reading.integration.test.ts`: `it("a hidden magazine leaves the home and the sitemap but its pages still open")` (hide via `payload.update({ listingHidden: true })`: `loadMagazinesHome` lists neither the magazine nor its issue; `magazineSitemapPaths` has no path of it; `loadIssuePage` for an outsider still answers, with `magazine.staffHidden === true`); `it("saving the settings never shows a hidden magazine again")` (`saveMagazineSettings` as the owner keeps `listingHidden: true`).
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/collections/magazines-schema.test.ts src/lib/magazines/indexing.test.ts` and `<DB prefix> pnpm vitest run src/migrations/magazine-growth.integration.test.ts src/server/magazines/reading.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement** the migration (register it last in `src/migrations/index.ts`), the schema, the collection fields and hook, `listing.ts`, the `reading.ts` / `sitemap-paths.ts` changes, and the indexing helpers. The shelf page uses `isShelfIndexable(magazine, issues)`; the issue and article pages pass `data.magazine`; `magazine-article.tsx` passes it to `isMagazineArticleIndexable`. Fixtures get `staffHidden: false`.
- [ ] **Step 4: Regenerate Payload types.** Allowed hunks: `Magazine.listingHidden | listingHiddenAt | listingHiddenBy` and the matching `MagazinesSelect` keys.
- [ ] **Step 5: Run** Step 2's commands plus `<DB prefix> pnpm vitest run src/migrations` and `SKIP_ENV_VALIDATION=1 pnpm vitest run src/app/sitemap.test.ts "src/app/[locale]/magazines" src/components/magazines` → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 6: Commit:** `feat(magazines): growth migration and the staff switch that hides a magazine from the Magazines page`.

---

## Task 2: Preview is an access level on every surface

**Files:**

- Modify: `src/lib/magazines/values.ts`, `src/lib/magazines/access.ts`, `src/lib/magazines/visibility.ts`, `src/lib/magazines/indexing.ts`, `src/server/magazines/issue-access.ts`, `src/server/magazines/readable-issues.ts`, `src/server/magazines/announcements.ts`, `src/server/magazines/reading.ts`, `src/server/magazines/sitemap-paths.ts`, `src/server/magazines/issue-service.ts` (`createIssue`), `src/server/magazines/subscriptions/service.ts`, `src/server/magazines/items/community-content.ts`, `src/server/magazines/items/{article,editorial,storyline,newsItem,event,forumThread,launchpadProject}/kind.ts`, `src/server/articles/article-access.ts`, `src/server/api/routers/agent.ts`, `src/server/members/profile-work.ts`, `src/components/magazines/editor/public-opt-in.tsx` (one line, see below), the reading pages and components that called `isIssueIndexable` / `isMagazineArticleIndexable` (they now pass the card's `outsiderReach`), `src/components/magazines/test-fixtures.ts` (`outsiderReach` on fixture cards), `src/collections/Magazines.ts` / `MagazineIssues.ts` (admin descriptions of `publicConfirmedBy`: "Who confirmed showing it outside an unlisted community (preview or public)"), `src/payload-types.ts` (generated), `messages/{en,nl}.json` (`magazineEditor.autoDraft.visibilities.teaser`: "Preview for everyone"), `docs/adr/0042-*.md`, `docs/adr/0046-magazine-issues-are-announced-through-an-outbox-once-per-subscriber.md`
- Test: `src/lib/magazines/{access,visibility,indexing,values}.test.ts`, `src/server/magazines/issue-access.test.ts`, `src/server/magazines/issue-access.integration.test.ts`, `src/server/magazines/readable-issues.test.ts`, `src/server/magazines/announcements.integration.test.ts`, `src/server/articles/article-surfaces.integration.test.ts`, `src/server/magazines/platform-items-reading.integration.test.ts`

**Interfaces:**

- Produces (`values.ts`): `ISSUE_VISIBILITIES = ["members", "teaser", "public"] as const`; `ISSUE_VISIBILITY_LABELS.teaser = "Preview for everyone"`.
- Produces (`access.ts`; drop the "Slice 6 adds" comment):
  ```ts
  export type MagazineIssueAccess = "none" | "teaser" | "full" | "editor";
  export type IssueReaderAccess = Exclude<MagazineIssueAccess, "none">;
  export type ReadingMode = "teaser" | "full";
  export function readingModeOf(access: IssueReaderAccess): ReadingMode; // teaser → "teaser"; full, editor → "full"
  // articleTextModeFor: teaser → "published"; seesEditorLayer: teaser → false
  ```
- Produces (`visibility.ts`):
  ```ts
  /** `teaser` and `public` show the community to everyone (Decision 2). */
  export function opensToOutsiders(visibility: IssueVisibility): boolean; // exhaustive switch
  // effectiveVisibility: teaser follows public's rule (content-public community or confirmed → teaser, else members)
  // planVisibilityChange (Decision 2), content-private community:
  //   keep arm: (current, next) ∈ {public→public, public→teaser, teaser→teaser} with current.publicConfirmedAt
  //     → { ok: true, record: { ...current, visibility: next } }   // never `record: current`
  //   widening teaser→public, or no recorded confirmation → needs confirmUnlistedPublic from a leader
  //     (else CONFIRM_UNLISTED_PUBLIC; a non-leader's tick → UNLISTED_PUBLIC_LEADERS_ONLY, unchanged rule)
  //   content-public community: as today for both (no confirmation stored); `members` clears it
  ```
- Produces (`indexing.ts`, client-safe; no derivation of access here any more, Decision 9):
  ```ts
  export type OutsiderReach = "none" | "teaser" | "full";
  type IndexFacts = {
    status: IssueStatus;
    /** `IssueCard.outsiderReach`, computed by the resolver. */ outsiderReach: OutsiderReach;
  };
  // isIssueIndexable = !magazine.staffHidden && issue.outsiderReach !== "none"
  // isMagazineArticleIndexable adds isMagazineArticleOut; isShelfIndexable unchanged in shape
  ```
- Produces (`reading.ts`): `IssueCard.outsiderReach: OutsiderReach`, set in `toIssueCard` from
  `resolveMagazineIssueAccess({ viewer: NO_STANDING, community: { ...community, deleted: false }, issue: issueAccessFacts(issue) })`
  with an exhaustive switch (`teaser` → `"teaser"`, `full` → `"full"`, `none` / `editor` → `"none"`). `effectiveVisibility` stays on the card for badges only.
- Produces (`issue-access.ts`), one by-id facts reader with access resolved separately: `magazineArticleReach` and Task 8 use `loadIssueAccessById`; Task 3's `issueOrigin` projects `loadIssueFactsById` without resolving viewer access (no other module reads an issue by id for access):
  ```ts
  export type IssueAccessRow = {
    id: number;
    communityId: string;
    magazineId: number | null;
    status: IssueStatus;
    visibility: IssueVisibility;
    publicConfirmedAt: string | null;
  };
  /** One findByID (depth 0, select communityId/magazine/status/visibility/publicConfirmedAt, disableErrors) + issueAccessFacts; null when missing. */
  export async function loadIssueFactsById(
    deps: Pick<Deps, "payload">,
    issueId: number,
  ): Promise<IssueAccessRow | null>;
  /** loadIssueFactsById + loadMagazineIssueAccess for this viewer; null when missing. */
  export async function loadIssueAccessById(
    deps: Pick<Deps, "db" | "payload">,
    issueId: number,
    viewerId: string | null,
  ): Promise<{ issue: IssueAccessRow; access: MagazineIssueAccess } | null>;
  ```
- Produces (`issue-access.ts`): resolver per Decision 1 (switch on `effectiveVisibility`); `export type IssueAudience = "nobody" | "members" | "preview" | "everyone"`; `issueAudience`: anonymous `full` → `everyone`, anonymous `teaser` → `preview`, else the member check as today. Replace the "Slice 6 decides" comment with Decision 8.
- Produces (`announcements.ts`): `inboxAudienceCondition` `preview` → `` sql`true` ``; `emailAudienceCondition` `preview` → `` sql`false` ``.
- Produces (`readable-issues.ts`), replacing the current signatures:
  ```ts
  export type IssueReach = "teaser" | "full";
  export function readableIssueWhere(
    scope: IssueReadScope,
    reach: IssueReach,
  ): Where;
  //   outsider branch: visibility in ["teaser", "public"] for reach "teaser", equals "public" for "full";
  //   the private-community / confirmation clause wraps whichever it is; member and editor branches unchanged
  export async function readableIssueIds(
    payload: Pick<PayloadClient, "find">,
    scope: IssueReadScope,
    reach: IssueReach,
    narrow?: Where,
  ): Promise<number[]>;
  ```
  Callers per Decision 3: `reading.ts` (`readableMagazineIssues`, `loadMagazinesHome`, `readableIssueExists`) → `"teaser"`; `sitemap-paths.ts`, `agent.ts` `searchableArticleWhere`, `profile-work.ts` → `readableArticleIssueIds` (below), never `readableIssueIds` directly.
- Produces (`article-access.ts`):
  ```ts
  /** The one seam for article surfaces (Decision 3): issues whose articles the scope may read. */
  export function readableArticleIssueIds(
    payload: Pick<PayloadClient, "find">,
    scope: IssueReadScope,
    narrow?: Where,
  ): Promise<number[]>; // = readableIssueIds(payload, scope, "full", narrow)
  ```
  `magazineArticleReach` loads through `loadIssueAccessById` (its inline `findByID` goes) and gets `case "teaser": return { readable: false, inPublishedIssue }`.
- Produces (item kinds): every `switch (ctx.access)` gets `case "teaser":` behaving like `full`, except `editorial/kind.ts` `load`, which for `teaser` returns the view with `body: null` (Decision 4). `community-content.ts`: `teaser` shares the `full` arm.
- Produces (`issue-service.ts` `createIssue`): copies the magazine's confirmation when `opensToOutsiders(visibility)`, not only for `public`.
- Produces (`public-opt-in.tsx`, moved here from Task 5 so the auto-draft select never shows a dead Save between tasks): line 63 becomes `if (!opensToOutsiders(value) || !communityIsPrivate) return null;`.

- [ ] **Step 1: Write the failing tests.**
  - `issue-access.test.ts` resolver table, new rows: outsider + listed + published + `teaser` → `teaser`; outsider + unlisted + `teaser` unconfirmed → `none`; outsider + unlisted + `teaser` confirmed → `teaser`; member + `teaser` → `full`; editor + draft `teaser` → `editor`; anyone but editors + draft `teaser` → `none`. `issueAudience`: listed `teaser` → `preview`; unconfirmed unlisted `teaser` → `members`. `loadIssueAccessById` (DB, in `issue-access.integration.test.ts`): a missing id → `null`; an outsider on a listed teaser issue → `{ access: "teaser" }` with the row's `magazineId`.
  - `visibility.test.ts`: `it("preview counts as members in an unlisted community until confirmed")`; `it("narrowing keeps the confirmation and saves the new visibility")` (confirmed public → teaser: `record.visibility === "teaser"` and `publicConfirmedAt` kept; confirmed teaser → teaser: kept); `it("widening preview to everyone needs a leader again")` (confirmed teaser → public without `confirmUnlistedPublic` → `CONFIRM_UNLISTED_PUBLIC`; with it from a non-leader → `UNLISTED_PUBLIC_LEADERS_ONLY`; with it from a leader → `record.visibility === "public"` and a new `publicConfirmedAt`); → members clears it; teaser in a private community without confirmation → `CONFIRM_UNLISTED_PUBLIC`; `opensToOutsiders` for all three values.
  - `access.test.ts`: `readingModeOf`, `articleTextModeFor("teaser") === "published"`, `seesEditorLayer("teaser") === false`.
  - `indexing.test.ts`: indexable iff `outsiderReach !== "none"` and not `staffHidden`, for each reach.
  - `reading.integration.test.ts`: `it("each card carries the resolver's outsider reach")` (listed public → `full`; listed teaser → `teaser`; unlisted unconfirmed teaser, seen by a member on the community tab → `none`).
  - `issue-service.integration.test.ts`: `it("a confirmed public issue changed to preview is a preview for outsiders")` (owner confirms public in an unlisted community, publishes, then `updateIssue({ visibility: "teaser" })` → stored `visibility === "teaser"`, and `loadIssuePage` for an outsider → `access === "teaser"`).
  - `issue-access.integration.test.ts` parity: widen the fixture helper's `visibility` type from `"members" | "public"` to `IssueVisibility`; add fixture issues `listed-published-teaser-unconfirmed` (to `issues("listed", …)`), `unlisted-published-teaser-confirmed` and `unlisted-published-teaser-unconfirmed` (to `issues("unlisted", …)`); `readableByQuery(viewerId, reach)` passes the reach; `readableByResolver(viewerId, reach)` keeps an issue when the access is in `{teaser, full, editor}` (reach `teaser`) or `{full, editor}` (reach `full`). Run the matrix for **both** reaches with these exact expected lists (`publicOnly` = the existing three labels; `T` = `"listed-published-teaser-unconfirmed"`; `UTC` = `"unlisted-published-teaser-confirmed"`; `UTU` = `"unlisted-published-teaser-unconfirmed"`; `memberSet` = the existing six labels of the member row):
    - anonymous, outsider, pending member, banned admin, admin of a soft-deleted community: `teaser` → `[...publicOnly, T, UTC]`; `full` → `publicOnly`.
    - member of the unlisted community, contributor in the unlisted community: `teaser` → `[...memberSet, UTC, UTU, T]`; `full` → `[...memberSet, UTC, UTU]`.
    - staff editor and admin of the unlisted community: `teaser` → `["listed-published-public-confirmed", "listed-published-public-unconfirmed", T, ...every unlisted fixture label (now including UTC, UTU)]`; `full` → the same without `T`.
  - `article-surfaces.integration.test.ts`: `it("a teaser article is unreadable on every other surface")` — a published article in a published `teaser` issue of a listed community: `canReadArticle` for an outsider → false, `articleCommentAccess` → `not_found`; it is missing from the author's profile work for a signed-out viewer, from `agent.searchArticles` results, and from `magazineSitemapPaths`, while the issue path itself is not in the sitemap either; a member's `canReadArticle` → true.
  - `announcements.integration.test.ts`: `it("a preview issue reaches every signed-in subscriber by inbox and nobody by email")`.
  - `platform-items-reading.integration.test.ts`: `it("a preview reader gets the cards but never an editorial body")` (`loadIssuePage` for an outsider on a teaser issue: `access === "teaser"`, the editorial view has `body: null`, a members-only thread of an unlisted community stays out).
- [ ] **Step 2: Run** the unit files and `<DB prefix> pnpm vitest run src/server/magazines/issue-access.integration.test.ts src/server/articles src/server/magazines/announcements.integration.test.ts src/server/magazines/platform-items-reading.integration.test.ts src/server/magazines/reading.integration.test.ts src/server/magazines/issue-service.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement** the interfaces above. Let the compiler find every `switch` over `MagazineIssueAccess` / `IssueReaderAccess` / `IssueVisibility` / `IssueAudience` (`pnpm typecheck`) and give each an explicit arm; never a `default:`.
- [ ] **Step 4: Regenerate Payload types.** Allowed hunks: the `defaultVisibility` and `visibility` unions gain `'teaser'`; the two admin descriptions.
- [ ] **Step 5: ADR-0042**: under Decision 5 add "Amended in slice 6 (plan 2026-10-28, Decisions 1–3): `teaser` is an access level; one confirmation covers preview and public; the query twin takes a required reach; a recorded confirmation survives narrowing, widening preview to everyone needs a leader again." ADR-0046: under Decision 7, add "Amended in slice 6 (plan 2026-10-28, Decision 8): email stays public-only; a preview issue (`preview` audience) reaches signed-in subscribers through the inbox and nobody by email." and strike the "teaser issues are intended to reach email" sentence. Replace the matching comment in `issue-access.ts`.
- [ ] **Step 6: Run** Step 2's commands, then `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib src/server src/components/magazines src/collections src/i18n` and `<DB prefix> pnpm vitest run src/server/magazines src/server/api/routers src/server/members` → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 7: Commit:** `feat(magazines): preview issues are an access level on every surface`.

---

## Task 3: Joins from a magazine carry their source

**Files:**

- Create: `src/lib/communities/join-source.ts` (+ test), `src/server/communities/join-sources.ts` (+ test), `src/server/magazines/issue-origin.ts`, `src/components/magazines/reading/magazine-join-prompt.tsx` (+ test)
- Modify: `src/server/api/routers/communities.ts` (`join`, `requestToJoin`), `src/components/communities/join-community-link.ts` (+ test), `src/components/communities/use-community-join.ts` (+ test), `messages/{en,nl}.json` (`magazines.join.*`)
- Test: `src/server/api/routers/communities.integration.test.ts`

**Interfaces:**

- Produces (`join-source.ts`, client-safe):
  ```ts
  /** Where a join started (Decision 7). Owned by communities; one variant per source surface. */
  export type MagazineJoinSource = {
    via: "magazine";
    magazineId: number;
    issueId: number;
  };
  export type JoinSource = MagazineJoinSource; // a union: the next surface adds `| { via: "…"; … }`
  export const joinSourceSchema: z.ZodType<JoinSource>; // z.discriminatedUnion("via", [...]), positive ints
  ```
- Produces (`src/server/communities/join-sources.ts`, server-only, the seam):

  ```ts
  import type { Deps } from "@/server/magazines/deps";

  export type JoinSourceEntry<S extends JoinSource> = {
    verify: (deps: Deps, communityId: string, source: S) => Promise<S | null>;
    metadata: (source: S) => Record<string, string | number>;
    condition: (source: S) => SQL;
  };
  export const JOIN_SOURCES: {
    [V in JoinSource["via"]]: JoinSourceEntry<Extract<JoinSource, { via: V }>>;
  }; // { magazine: magazineJoinSource }
  function entryFor<V extends JoinSource["via"]>(
    source: Extract<JoinSource, { via: V }>,
  ) {
    return JOIN_SOURCES[source.via] as JoinSourceEntry<
      Extract<JoinSource, { via: V }>
    >;
  }
  /** entryFor(source).verify; null drops the source. Dependency-loading and verifier errors are logged and return null. */
  export async function verifyJoinSource(
    deps: Deps | (() => Promise<Deps>),
    communityId: string,
    source: JoinSource,
  ): Promise<JoinSource | null>;
  /** entryFor(source).metadata: the activity metadata writer. */
  export function joinSourceMetadata(
    source: JoinSource,
  ): Record<string, string | number>;
  /** entryFor(source).condition: the matching activity metadata reader; Task 9 uses only this. */
  export function joinSourceCondition(source: JoinSource): SQL;
  ```

  All three operations dispatch through `entryFor`, with no per-`via` switch. A new source adds one union variant, its zod variant, and one registry entry. `join-sources.test.ts` pins dispatch through the registry entry and `null` when the verifier or lazy dependency factory throws; the `joinSourceMetadata` → `joinSourceCondition` round trip is pinned in the DB test below.

- Produces (`issue-origin.ts`, a projection of Task 2's `loadIssueFactsById`, no read or viewer-access resolution of its own):
  ```ts
  export type IssueOrigin = {
    issueId: number;
    magazineId: number;
    communityId: string;
    published: boolean;
  };
  /** null when missing or the issue has no magazine. */
  export async function issueOrigin(
    deps: Pick<Deps, "payload">,
    issueId: number,
  ): Promise<IssueOrigin | null>;
  /** The full magazine strategy registered in JOIN_SOURCES; owns verification, metadata and condition. */
  export const magazineJoinSource: JoinSourceEntry<MagazineJoinSource>;
  /** Kept only when the issue is published and belongs to this community and that magazine. */
  export async function verifyMagazineJoinSource(
    deps: Deps,
    communityId: string,
    source: MagazineJoinSource,
  ): Promise<MagazineJoinSource | null>;
  ```
  The strategy writes `{ via: "magazine", magazineId, issueId }`; its SQL reader matches `metadata->>'via'` and `metadata->>'issueId'` with parameterized values, wrapping the whole `AND` condition in parentheses.
- Produces (`communities.ts`): `join` and `requestToJoin` inputs `z.object({ slug: z.string(), source: joinSourceSchema.optional() })`. After the existing policy checks: the router calls only `verifyJoinSource(async () => ({ db, payload: await getPayloadClient() }), community.id, input.source)` (it never imports from `src/server/magazines`); the verifier owns failures while loading those dependencies. `join` passes `metadata: joinSourceMetadata(verified)` to `activateMembership` when verified; `requestToJoin` passes it to the existing `logActivity` call (and on the `invited` → `pending_approval` path writes the same `community.join_requested` event with the metadata). Verification failure never fails the join.
- Produces (`join-community-link.ts`), replacing `takeJoinIntent`'s boolean:
  ```ts
  export function rememberJoinIntent(
    slug: string,
    now?: number,
    source?: JoinSource | null,
  ): void; // stores { slug, at, source }
  export type JoinIntent = { source: JoinSource | null };
  export function takeJoinIntent(slug: string, now?: number): JoinIntent | null; // a malformed stored source → source null
  ```
- Produces (`use-community-join.ts`): `useCommunityJoin({ …, source?: JoinSource })`; the runner becomes `(verb, slug, name, source?: JoinSource) => Promise<boolean>` and passes `source` to `join` / `request` only; `run()` remembers `source` with the intent; `useJoinDeepLink` passes `intent.source` on.
- Produces (`magazine-join-prompt.tsx`, `"use client"`):

  ```ts
  export type JoinPromptCommunity = {
    slug: string;
    name: string;
    joinPolicy: JoinPolicy;
  };
  /** Presentational: no hooks, owns all copy and the switch over `action.kind`. Used live and in the builder preview. */
  export function MagazineJoinPromptView(props: {
    community: JoinPromptCommunity;
    variant: "panel" | "inline";
    action: CommunityJoin["action"]; // the type `useCommunityJoin` returns
    onRun: () => void;
    busy: boolean;
    invite?: ReactNode; // the container passes `InviteResponseView` for `invited`
    tone?: "live" | "preview"; // defaults to "live"; preview buttons are outline
  }): JSX.Element | null;
  /** One shared join/invitation state and sign-in completion for all prompts on an issue page. */
  export function MagazineJoinPromptProvider(props: {
    community: JoinPromptCommunity;
    source: JoinSource;
    focusTargetId: string;
    children: ReactNode;
    finishJoin?: boolean; // defaults to true
  }): JSX.Element;
  /** Consumes shared state; supplies a provider when used on a standalone article (Decision 6). */
  export function MagazineJoinPrompt(props: {
    community: JoinPromptCommunity;
    source: JoinSource;
    variant: "panel" | "inline";
    focusTargetId: string; // id of the page's <h1>, which has tabIndex={-1}
  }): JSX.Element | null;
  ```

  By `action.kind` (in the view): `join` / `request` → button ("Join {community}" / "Ask to join {community}"; `panel` with `tone="live"` = default (orange) button, `inline` and `tone="preview"` = `outline`); `pending` → "You asked to join {community}. You can read everything once you are let in."; `invite_only` → "{community} is invite only. Ask a member for an invite." + link "Visit {community}" (`/communities/{slug}`); `member` and `unavailable` → `null`; `invited` → `InviteResponseView` with the provider's invitation state. The `panel` variant has the heading "Read the whole issue" and the line "{community} members read every article in full."; `inline` shows "Members of {community} read the whole article." before its button. The provider owns one `useJoinDeepLink(onChange)` completion when `finishJoin` is true; a standalone prompt enables it only for `panel`. `onChange` → focus `document.getElementById(focusTargetId)` first, then `router.refresh()`. Responsive panel copies consume the same provider, so they share pending/busy state and do not duplicate completion effects or IDs.

- [ ] **Step 1: Write the failing tests.**
  - `communities.integration.test.ts` (DB): `it("a join from a magazine records its source")` (open community with a magazine and a published issue; `join({ slug, source })` → the `community.joined` event's metadata equals `{ via: "magazine", magazineId, issueId }`); `it("an ask to join records its source")` (approval community → the `community.join_requested` metadata); `it("a forged source is dropped and the join still works")` (an issue of another community → joined, metadata has no `via`; a **draft** issue of this community's magazine → the same); `it("a join without a source is unchanged")`; `it("the source condition finds what the metadata wrote")` (after the magazine join, `SELECT count(*) FROM app.activity_event WHERE community_id = … AND <joinSourceCondition(source)>` → 1; with another issue's source → 0).
  - `join-community-link.test.ts`: `it("the source survives sign-in")` (remember with a source, take → `{ source }`); an expired or other-slug intent → `null`; an intent saved by the old shape (`{ slug, at }`) → `{ source: null }`.
  - `use-community-join.test.tsx`: `it("sends the source with a join and a request")` — assert on the mutation call arguments, not on the toast.
  - `magazine-join-prompt.test.tsx`: one case per action kind (labels above); the live panel is orange, inline and preview-tone panels are outline; a guest is asked to sign in and `rememberJoinIntent` carries the source; after joining, focus moves to the page heading before `router.refresh()`. A provider shared by responsive panels owns one join/invitation state and sign-in completion effect. `MagazineJoinPromptView` cases are pure renders with each `action`.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/communities src/server/communities/join-sources.test.ts src/components/communities src/components/magazines/reading/magazine-join-prompt.test.tsx` and `<DB prefix> pnpm vitest run src/server/api/routers/communities.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement** the interfaces; English copy above, natural Dutch alongside under `magazines.join.*`.
- [ ] **Step 4: Run** Step 2's commands plus `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components src/i18n src/server/articles` → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit:** `feat(communities): joins from a magazine record which issue brought them`.

---

## Task 4: Preview reading pages

**Files:**

- Create: `src/lib/magazines/teaser.ts` (+ test)
- Modify: `src/server/magazines/items/base-input.ts` (re-export `cutWords` from `teaser.ts`), `src/lib/magazines/item-views.ts`, `src/server/magazines/items/article/kind.ts`, `src/server/magazines/reading.ts`, `src/components/magazines/items/{types,registry,article-item,editorial-item}.tsx`, the other five item renderers (accept and ignore `teaser`), `src/components/magazines/layouts/{types,cover-story}.tsx`, `src/components/magazines/reading/{issue-reader,issue-rail,magazine-article,magazine-shelf}.tsx`, `src/components/magazines/community/magazine-tab.tsx`, `src/components/magazines/editor/builder/live-preview.tsx` (`teaser={null}` until Task 5), `src/app/[locale]/magazines/[magazineSlug]/[issueSlug]/[articleSlug]/page.tsx`, `src/components/magazines/test-fixtures.ts`, `messages/{en,nl}.json`
- Test: `src/lib/magazines/teaser.test.ts`, `src/components/magazines/reading/{issue-reader,magazine-article,magazine-shelf}.test.tsx`, `src/components/magazines/layouts/cover-story.test.tsx`, `src/server/magazines/reading.integration.test.ts`, `src/app/[locale]/magazines/[magazineSlug]/[issueSlug]/[articleSlug]/page.test.tsx`

**Interfaces:**

- Produces (`teaser.ts`, client-safe):
  ```ts
  export const TEASER_OPENING_WORDS = 80;
  export function cutWords(text: string, words: number): string; // moved from base-input, same behaviour
  /** Decision 4: plain text of top-level paragraph/heading/quote/list blocks, in order, cut at `words`. */
  export function openingOf(state: unknown, words?: number): string;
  ```
- Produces (`item-views.ts`): `ArticleItemView.article.opening: string`; `ArticleItemView.article.excerpt` documented "`openingOf(content, 40)`: never code"; `EditorialItemView.body: unknown` documented "null for a preview reader" (no `opening` on editorials: a non-article item shows its card only, Decision 4).
- Produces (`reading.ts`): `ReadingCommunity` and the shared `COMMUNITY_COLUMNS` stay as they are (they feed every listing card). `loadReadableIssue` loads its one community through a private single-row helper with `{ ...COMMUNITY_COLUMNS, joinPolicy: true }`, so `ReadableIssue.community` is `MagazineCommunityRow & { joinPolicy: JoinPolicy }`; `loadIssuePage` and `loadMagazineArticlePage` (only) return `community: ReadingCommunity & { joinPolicy: JoinPolicy }`. `loadMagazineArticlePage` returns `{ access; magazine; issue; nextInIssue } & ArticleReading`:
  ```ts
  export type ArticleTeaser = Pick<
    Article,
    | "id"
    | "slug"
    | "title"
    | "authorName"
    | "mediaUrl"
    | "publishedAt"
    | "updatedAt"
    | "status"
  > & {
    opening: string;
    readingMinutes: number;
  };
  export type ArticleReading =
    | { mode: "full"; article: Article }
    | { mode: "teaser"; article: ArticleTeaser }; // built field by field: never spread the Article
  ```
- Produces (`components/magazines/items/types.ts`): `export type ItemTeaser = { inlinePrompt: ReactNode }`; `ItemRendererProps<K>` gains `teaser: ItemTeaser | null`; `IssueItem` and `LayoutProps` gain `teaser: ItemTeaser | null`.
- Produces (renderers): `ArticleItem` with `teaser` → title (linked to the article page), intro, byline, then the `opening` paragraph and `teaser.inlinePrompt`, no "Read article"; without `teaser` unchanged. `EditorialItem` with `teaser` → heading and intro only (its `body` is `null`; no `LexicalRenderer`).
- Produces (`issue-reader.tsx`): `mode = readingModeOf(access)`; `teaser` mode wraps the reading view in one `MagazineJoinPromptProvider`, builds `{ inlinePrompt: <MagazineJoinPrompt variant="inline" … /> }`, and renders two copies of the panel. The `xl:hidden` copy follows `IssueHero` before the layout; `IssueRail` receives `joinPanel={<div className="hidden xl:block"><MagazineJoinPrompt variant="panel" … /></div>}` first in the sticky rail. Exactly one panel is visible at each breakpoint; both share the provider's state and effects. Source = `{ via: "magazine", magazineId: magazine.id, issueId: issue.id }`. The issue title `<h1>` gets `id={useId()}` and `tabIndex={-1}`, passed as `focusTargetId` to the provider and prompts (Decision 6).
- Produces (`magazine-article.tsx`): `mode: "teaser"` renders header (context line, title `<h1 tabIndex={-1}>` used as the prompt's `focusTargetId`, byline, reading time, image), the opening, a muted line "This is the start of the article.", the panel prompt, and "Back to the issue"; no `BlogToc`, no comments, JSON-LD with `isAccessibleForFree: false`. In `full` mode JSON-LD sets `isAccessibleForFree: issue.outsiderReach === "full"`. The page fetches comments only in `full` mode. "Next in this issue" renders through `IssueItem` with `size="related"` and `teaser={null}` in both modes (a card with title and the code-free excerpt; its link opens the next article's own preview page).
- Produces (shelf and tab): the badge comes from one `Record<IssueVisibility, "membersOnly" | "teaser" | null>` (`members` → "Members only", `teaser` → "Members read in full", `public` → none), keyed by `effectiveVisibility`.

- [ ] **Step 1: Write the failing tests.**
  - `teaser.test.ts`: `it("takes text blocks in order and stops at 80 words")`; `it("skips code, images and embeds, also when they come first")` (a code block of 50 words, then a 10-word paragraph → the 10 words, none of the code; repeat with the older-style node `{ type: "code", children: [{ type: "text", text: "…" }] }` first, see `src/lib/lexical.tsx:260-263`); `it("the 40-word excerpt follows the same rule")` (`openingOf(state, 40)` on the code-first state holds no code); `it("cuts a long first paragraph at 80 words with an ellipsis")`; `it("is empty for content without text or for malformed content")`.
  - `reading.integration.test.ts`: `it("a teaser reader gets openings only")` — outsider on a listed teaser issue: `loadIssuePage(...).access === "teaser"`; `JSON.stringify` of the result does not contain a sentence placed after word 80 of the article, nor the editorial body text; it contains the article's first sentence. `it("the teaser article page carries no body")` — `loadMagazineArticlePage` for the outsider → `mode: "teaser"`, `"content" in article === false`, `JSON.stringify` lacks the late sentence; for a member → `mode: "full"` with `content`. `it("a preview reader never gets code text")` — an article whose first block is a code block (unique marker word in it): neither `JSON.stringify(loadIssuePage(...))` nor `JSON.stringify(loadMagazineArticlePage(...))` for the outsider contains the marker (this covers `excerpt`, `opening` and `nextInIssue`). `it("only the issue and article pages carry the join rule")` — `loadIssuePage(...).community.joinPolicy` is set; a `loadMagazinesHome` card's `community` has no `joinPolicy` key.
  - `issue-reader.test.tsx`: a preview shows openings and join prompts instead of Read article; the panel follows the hero before the layout below `xl`, and its responsive copies have complementary `xl:hidden` / `hidden xl:block` classes, unique IDs, and one shared join state/completion effect; a preview editorial shows its heading and intro, not its body.
  - `magazine-article.test.tsx`: `it("a preview article shows the start, the join panel and no comments")`; `it("marks a preview article as not free in structured data")`.
  - `magazine-shelf.test.tsx`: `it("labels a preview issue 'Members read in full'")`.
  - `cover-story.test.tsx`: the lead and grid pass `teaser` to each item.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines/teaser.test.ts src/components/magazines "src/app/[locale]/magazines"` and `<DB prefix> pnpm vitest run src/server/magazines/reading.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement** the interfaces. The article kind sets `opening: openingOf(article.content)` and `excerpt: openingOf(article.content, 40)` for every level (the old `cutWords(lexicalPlainText(...), 40)` goes). The editorial kind is unchanged here (its body is already withheld for `teaser`, Task 2). New copy keys: `magazines.item.membersReadAll` ("Members read the whole article"), `magazines.article.teaserNote` ("This is the start of the article."), `magazines.shelf.teaser` ("Members read in full").
- [ ] **Step 4: Run** Step 2's commands plus `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines src/i18n` → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit:** `feat(magazines): preview pages show each article's opening and invite visitors to join`.

---

## Task 5: Editors can choose preview

**Files:**

- Create: nothing (the builder reuses Task 3's `MagazineJoinPromptView`)
- Modify: `src/components/magazines/editor/magazine-settings-form.tsx`, `src/components/magazines/editor/builder/{issue-details,issue-builder,live-preview,publish-dialog}.tsx`, `src/components/magazines/editor/auto-draft/auto-draft-settings-form.tsx`, `messages/{en,nl}.json`
- Test: `src/components/magazines/editor/magazine-settings-form.test.tsx`, `src/components/magazines/editor/builder/issue-details.test.tsx`, `src/components/magazines/editor/builder/{live-preview,publish-dialog,issue-builder}.test.tsx`, `src/components/magazines/editor/auto-draft/auto-draft-settings-form.test.tsx`

**Interfaces:**

- Consumes: `opensToOutsiders`, `publicOptInRequired` (now true for an unconfirmed `teaser` in a private community through `planVisibilityChange`), `ItemTeaser`, `LayoutProps.teaser`.
- Consumes (Task 3): `MagazineJoinPromptView` with `tone="preview"`, `action={{ kind: "join" }}`, `onRun={() => {}}`, `busy={false}`, rendered only inside the existing `inert` wrapper of `live-preview.tsx` (line ~138), so its button cannot be focused or pressed and uses `outline` to preserve Save / Publish as the editor screen's one orange action.
- Produces (UI rules):
  - Settings and issue details: three options `members` "Members only", `teaser` "Preview for everyone", `public` "Everyone", with one hint line for the chosen option: members "Only members can read it."; teaser "Everyone sees the cover, the contents and the start of each article. Members read everything."; public "Everyone can read all of it." `handleVisibility` (settings form) and `issue-details.tsx` line ~66 (`if (next !== "public") onConfirmedChange(false)`) withdraw the tick when `!opensToOutsiders(next)` **or** when the change widens `teaser` → `public` (Decision 2: a leader must tick again). The settings form's `alreadyConfirmed` (lines ~199-202, `draft.defaultVisibility === "public"`) becomes `opensToOutsiders(draft.defaultVisibility)`.
  - `PublicOptIn` already renders for `teaser` (moved to Task 2).
  - `issue-builder.tsx`: the two `=== "public"` checks (lines ~94, ~306) use `opensToOutsiders`.
  - Publish dialog: description from `Record<IssueVisibility, …>`: new `audienceTeaser` "Everyone can see the cover, the contents and the start of each article. Only members of your community read all of it. It will show on the Magazines page."
  - Live preview, Visitor mode: `members` → the existing "nothing" state; `teaser` → the layout with `teaser={{ inlinePrompt: <MagazineJoinPromptView tone="preview" variant="inline" action={{ kind: "join" }} … /> }}` and the `panel` view with `tone="preview"` under the layout, all inside the `inert` wrapper; `public` → as today. Editorials in teaser mode show heading and intro only (Task 4).
  - Automatic drafts form: the visibility select already lists `ISSUE_VISIBILITIES`; add the same hint line under it.

- [ ] **Step 1: Write the failing tests.**
  - `magazine-settings-form.test.tsx`: `it("offers preview and asks an unlisted community to confirm it")`; `it("moving from public to preview keeps the tick; moving to members clears it; moving from preview to everyone asks again")`; `it("a confirmed preview default shows as already confirmed")`.
  - `issue-details.test.tsx`: the same three tick transitions for an issue.
  - `live-preview.test.tsx`: `it("Visitor shows a preview issue with openings and a join picture")` (the join copy shows and sits inside the `inert` element; the opening text shows; the editorial body does not); the preview's join button uses `outline` rather than the default orange variant.
  - `publish-dialog.test.tsx`: the preview audience sentence.
  - `auto-draft-settings-form.test.tsx`: `it("offers preview for drafts and asks for the opt-in in an unlisted community")`.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines/editor` → FAIL.
- [ ] **Step 3: Implement.** Then `grep -rn '"public"' src/components/magazines src/server/magazines src/lib/magazines` must show no visibility comparison (`=== "public"` / `!== "public"` on a visibility value) outside `src/lib/magazines/visibility.ts` and `values.ts`; fix any hit with `opensToOutsiders` or an exhaustive switch.
- [ ] **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines src/i18n "src/app/[locale]/communities"` → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit:** `feat(magazines): editors can make an issue a preview for everyone`.

---

## Task 6: All three layouts

**Files:**

- Create: `src/components/magazines/layouts/long-read.tsx`, `src/components/magazines/layouts/digest.tsx` (+ tests)
- Modify: `src/lib/magazines/values.ts`, `src/collections/MagazineIssues.ts` (options follow the values), `src/payload-types.ts` (generated), `src/components/magazines/items/{types,registry}.tsx` and all seven renderers, `src/components/magazines/layouts/{registry,cover-story}.tsx`, `src/server/magazines/issue-service.ts` (`IssueDetailsPatch.layout`), `src/server/api/routers/magazines.ts` (`issueDetailsInput.layout`), `src/components/magazines/editor/builder/{issue-details,issue-builder,use-issue-save,live-preview}.tsx`, `src/components/magazines/reading/magazine-article.tsx` ("Next in this issue" uses `IssueItem` with `size="related"`, `teaser={null}`), `messages/{en,nl}.json`. No change in `issue-editing.ts`: `loadIssueEditorView` already returns the whole Payload `issue` and the builder already reads `issue.layout` (`issue-builder.tsx:726`).
- Test: `src/components/magazines/layouts/{cover-story,long-read,digest}.test.tsx`, `src/components/magazines/items/registry.test.tsx`, `src/server/magazines/issue-service.integration.test.ts`, `src/components/magazines/editor/builder/issue-details.test.tsx` (created in Task 5), `src/components/magazines/editor/builder/live-preview.test.tsx`, `src/lib/magazines/values.test.ts`, `src/server/magazines/auto-draft.integration.test.ts`

**Interfaces:**

- Produces (`values.ts`): `ISSUE_LAYOUTS = ["cover-story", "long-read", "digest"] as const`; labels "Cover story", "Long read", "Digest".
- Produces (`items/types.ts`): `export type ItemSize = "lead" | "card" | "row" | "related"`; `ItemRendererProps<K>` = `{ view; size: ItemSize; href; teaser: ItemTeaser | null }` (`lead: boolean` removed). Every renderer handles all four sizes explicitly with a `never` exhaustiveness check. `row` = the item's title as a link (or plain text when it has none), its kind line and at most one fact (mono date or count), no image, no excerpt, intro as one muted line; an article `row` in teaser mode adds "Members read the whole article" (no prompt). `related` = the card used by "Next in this issue" through `IssueItem`; articles include their code-free excerpt, and other kinds render their card presentation.
- Produces (layouts): `CoverStoryLayout` (lead `size="lead"`, grid `size="card"`, unchanged look); `LongReadLayout` — one column (`max-w-3xl`, `mx-auto`), every item `size="lead"`, each with its anchor id; `DigestLayout` — `<ol>` with `divide-y` hairlines, every item `size="row"`, each `<li>` with its anchor id. `LAYOUTS` maps all three.
- Produces (server): `IssueDetailsPatch.layout?: IssueLayout` written as `data.layout`; `issueDetailsInput.layout: z.enum(ISSUE_LAYOUTS).optional()`; published issues may change layout (it is presentation only).
- Produces (builder): `IssueDetailsDraft.layout: IssueLayout`; `detailsPatch` sends `layout` when it changed; issue details shows a `SegmentedControl<IssueLayout>` "Layout" with the three labels and one hint for the chosen one ("One big lead, then a grid." / "One column, read from top to bottom." / "A short list. Good for lots of news."); `LivePreview` reads `details.layout`. Automatic drafts form: `layouts.long-read` / `layouts.digest` keys.

- [ ] **Step 1: Write the failing tests.**
  - `long-read.test.tsx`: `it("renders every item in issue order, one column, as leads")`; `it("passes the preview prompt to articles")`.
  - `digest.test.tsx`: `it("renders an ordered list of rows with anchors")`; `it("a preview row says members read the whole article and has no button")`.
  - `registry.test.tsx`: `it("every kind renders a row")` (each fixture view with `size="row"` renders its title or kind line and no `img`); every kind also handles `size="related"`, and the article's related card includes its code-free excerpt.
  - `issue-service.integration.test.ts`: `it("an editor can change the layout, also after publishing")`.
  - `issue-details.test.tsx` / `live-preview.test.tsx`: `it("the layout choice changes the preview")`.
  - `auto-draft.integration.test.ts`: `it("automatic drafts accept and use every layout")` — `saveAutoDraftSettings` with `layout: "digest"` (and once with `"long-read"`) succeeds; `makeAutoDraft` now → the created issue's `layout === "digest"`.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines src/lib/magazines` and `<DB prefix> pnpm vitest run src/server/magazines/issue-service.integration.test.ts src/server/magazines/auto-draft.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Regenerate Payload types.** Allowed hunk: `MagazineIssue.layout` union gains `'long-read' | 'digest'`.
- [ ] **Step 5: Run** Step 2's commands plus `<DB prefix> pnpm vitest run src/server/magazines src/server/api/routers/magazines.integration.test.ts` and `SKIP_ENV_VALIDATION=1 pnpm vitest run src/i18n` → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 6: Commit:** `feat(magazines): long-read and digest layouts, picked in the issue builder`.

---

## Task 7: Share images and share buttons

**Files:**

- Create: `src/server/magazines/share-cards.ts` (+ integration test), `src/app/[locale]/og/magazine/[magazineSlug]/[issueSlug]/route.tsx` (+ test), `src/app/[locale]/og/magazine/[magazineSlug]/[issueSlug]/[articleSlug]/route.tsx` (+ test), `src/lib/og/black-card.tsx`, `src/server/magazines/share-image.tsx` (+ test), `src/lib/share.ts` (+ test), `src/components/share/share-actions.tsx` (+ test)
- Modify: `src/server/magazines/reading.ts` (export `loadReadableIssue`), `src/lib/magazines/paths.ts` (+ test), `src/app/[locale]/magazines/[magazineSlug]/[issueSlug]/page.tsx`, `.../[articleSlug]/page.tsx`, `src/components/magazines/reading/{issue-reader,issue-rail,magazine-article}.tsx`, `messages/{en,nl}.json`, `src/server/articles/article-readers.test.ts` (`READERS` gains `"src/server/magazines/share-cards.ts": "anonymous scope via loadReadableIssue (viewerId null); article must be published and placed in this issue"`); delete `src/components/magazines/reading/copy-link-button.tsx` if nothing else imports it
- Test: the two page tests

**Interfaces:**

- Produces (`paths.ts`):
  ```ts
  export function issueShareImagePath(
    locale: string,
    magazine: Slugged,
    issue: Slugged,
  ): string; // /{locale}/og/magazine/{m}/{i}
  export function articleShareImagePath(
    locale: string,
    magazine: Slugged,
    issue: Slugged,
    article: Slugged,
  ): string;
  ```
- Produces (`share-cards.ts`):
  ```ts
  export type ShareCard = {
    magazineName: string;
    communityName: string;
    issueNumber: number;
    issueTitle: string;
    coverImageUrl: string | null;
    article: { title: string; authorName: string | null } | null;
  };
  /** Anonymous scope only (Decision 15): null unless the outsider gets teaser or full. */
  export async function loadShareCard(
    deps: Deps,
    opts: {
      magazineSlug: string;
      issueSlug: string;
      articleSlug: string | null;
      locale: AppLocale;
    },
  ): Promise<ShareCard | null>;
  ```
  It calls `loadReadableIssue(deps, { …, viewerId: null })` and decides with an exhaustive switch on the access (`teaser`, `full` → card; `editor` cannot happen for null and is treated as `none`). An article must be published and placed in this issue.
- Produces (`src/lib/og/black-card.tsx`): `export function BlackCard(props: { children: ReactNode; aside?: ReactNode }): JSX.Element` — the 1200×630 `#000` frame with the `#EA580C` accent rule and the "AIT Community." mark, as drawn inline today by `src/app/[locale]/og/route.tsx` and the badge image (those two move onto it in a follow-up noted in the PR; not in this slice).
- Produces (`share-image.tsx`, server-only, the one renderer for both routes):
  ```ts
  export type ShareImageLabels = { issueLine: string; byline: string }; // "{magazine} · Issue {number}", "A magazine by {community}" | "By {author}"
  /** safeFetch (userAgent "AIT Community share image", timeoutMs 3000, accept "image/*") + readBodyCapped(2 MB);
   *  a `data:` URL only for image/png|jpeg|webp|gif; null on any failure. Never throws. */
  export async function loadShareCover(
    url: string | null,
  ): Promise<string | null>;
  export function renderMagazineShareImage(
    card: ShareCard,
    labels: ShareImageLabels,
    cover: string | null,
  ): ImageResponse;
  ```
  The renderer only ever gets the `data:` URL from `loadShareCover`, never `card.coverImageUrl` (SSRF, Decision 15).
- Produces (routes, ~15 lines each): `runtime = "nodejs"`; per-IP limit (`createPerUserLimit({ windowMs: 60_000, max: 30 })` at module scope, keyed by `clientIpFromHeaders(request.headers)`; over → `new Response("Too many requests", { status: 429, headers: { "Retry-After": … } })`); locale resolved like the badge image; 404 `new Response("Not found", { status: 404 })` when `loadShareCard` is null; else `renderMagazineShareImage(card, labels, await loadShareCover(card.coverImageUrl))` with `Cache-Control: no-store`. Card content: mono label line "{magazine} · Issue {number}", the title (article title for the article image, else the issue title), the byline, and the cover on the right third when present.
- Produces (pages): when `issue.outsiderReach !== "none"` (the card's resolver-computed field, Decision 9), metadata uses `buildOgImageMeta(title, description, issueShareImagePath(...))` (articles: `articleShareImagePath`); otherwise the current fallback.
- Produces (`src/lib/share.ts`, pure, client-safe): `export function shareTargets(url: string, title: string): { x: string; linkedIn: string; email: string }` (X intent and LinkedIn share-offsite URLs as in `event-share-row.tsx`, `mailto:?subject={title}&body={url}`, all encoded).
- Produces (`src/components/share/share-actions.tsx`, `"use client"`, generic, no magazine imports; copy under `share.*`): `export function ShareActions(props: { title: string; url: string; social: boolean }): JSX.Element` — "Copy link" (as the old button), then when `social`: "Share…" (only when `navigator.share` exists, after mount), "Share on X", "Share on LinkedIn", "Send by email" (`mailto:?subject={title}&body={url}`). The required absolute `url` comes from the server page's `absoluteLocaleUrl(...)`, as used for JSON-LD, and feeds `shareTargets`, Copy link, and native share from the first render. X and LinkedIn use `target="_blank"`, `rel="noopener noreferrer"`, and sr-only new-tab text; email has none of those attributes or text. Copy/share feedback uses the sr-only `role="status"` line only, with no toast. All controls are `outline` / `ghost`, never orange. The issue page passes `url` through `IssueReader` and `IssueRail`; the article page passes it to `MagazineArticle` in both modes. They set `social = issue.outsiderReach !== "none"`. The PR notes that `EventShareRow` can move onto it later.

- [ ] **Step 1: Write the failing tests.**
  - `share-cards.integration.test.ts` (DB): `it("gives a card for a public and a preview issue and its articles")`; `it("share image is 404 for a members-only or unconfirmed issue")` (members-only; unlisted unconfirmed teaser; a draft; an article not in the issue; an unpublished article → null); `it("switching to members takes the share image down at once")` (card → update visibility to `members` → null, no cache in between).
  - Route tests (both routes, mock `loadShareCard`): 404 on null; 200 `image/png` with `Cache-Control: no-store` on a card; the 31st call from one IP within a minute → 429.
  - `share-image.test.ts` (mock `safeFetch`): `it("an internal or failing cover still gives the card without the image")` (`safeFetch` rejects with the "Refusing to fetch URL" error → `loadShareCover` → null; a `text/html` answer → null; a body over 2 MB → null); `it("a good cover becomes a data URL")`; assert `renderMagazineShareImage` is never called with a non-`data:` image (spy on it from a route test with a card whose `coverImageUrl` is `http://169.254.169.254/x`).
  - `share.test.ts`: `shareTargets` encodes URL and title.
  - `paths.test.ts`: both helpers.
  - `src/components/share/share-actions.test.tsx`: members-only keeps Copy link only; server HTML carries the encoded required URL and title; X and LinkedIn open in a new tab with the sr-only announcement, while email has no new-tab attributes or announcement; Copy link and native share use the supplied URL; copy/share feedback sets the status text without calling a toast.
  - Issue page test: `it("a public or preview issue points its share card at its own image")`; `it("a members-only issue never points at a share image")`.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines/paths.test.ts src/lib/share.test.ts src/components/share src/server/magazines/share-image.test.ts "src/app/[locale]/og" "src/app/[locale]/magazines"` and `<DB prefix> pnpm vitest run src/server/magazines/share-cards.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Copy under `share.*` (generic component): "Share", "Copy link", "Link copied", "Could not copy the link", "Share…", "Share on X", "Share on LinkedIn", "Send by email", "(opens in a new tab)"; image strings under `magazines.shareImage.*`.
- [ ] **Step 4: Run** Step 2's commands plus `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines src/server/articles src/i18n` → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit:** `feat(magazines): share images and share buttons for issues and articles`.

---

## Task 8: Counting reads, and where subscribers came from

**Files:**

- Create: `src/lib/magazines/stats.ts`, `src/server/magazines/stats/reader-key.ts` (+ test), `src/server/magazines/stats/reads.ts`, `src/server/magazines/stats/record.ts`, `src/server/magazines/stats/record.integration.test.ts`, `src/server/api/routers/magazine-stats.ts`, `src/components/magazines/reading/read-tracker.tsx` (+ test), `docs/adr/0048-magazine-reading-numbers-are-first-party-tallies-keyed-by-a-cookieless-reader-key.md`
- Modify: `src/server/api/root.ts` (`magazineStats: magazineStatsRouter`), `src/components/magazines/reading/{issue-reader,magazine-article,subscribe-button,issue-rail}.tsx`, `src/server/api/routers/magazine-subscriptions.ts`, `src/server/magazines/subscriptions/service.ts`, `src/server/articles/article-readers.test.ts` (`READERS` gains `"src/server/magazines/stats/record.ts": "access re-checked by loadIssueAccessById; article must be published and placed in this issue; reads ids only"`)
- Test: `src/server/magazines/subscriptions/service.integration.test.ts`, `src/components/magazines/reading/subscribe-button.test.tsx`

**Interfaces:**

- Consumes: `magazineReads`, `magazineSubscriptions.sourceIssueId` (Task 1), `issueOrigin` (Task 3), `loadIssueAccessById` (Task 2), `createPerUserLimit`, `clientIpFromHeaders`.
- Produces (`lib/magazines/stats.ts`): `export const READ_EVENTS = ["view", "read_end"] as const; export type ReadEvent = (typeof READ_EVENTS)[number];`
- Produces (`reader-key.ts`):
  ```ts
  /** BETTER_AUTH_SECRET, trimmed; null when unset (then nothing is recorded). */
  export function readerKeySecret(env?: {
    BETTER_AUTH_SECRET?: string;
  }): string | null;
  /** Decision 10: "u" + 32 hex for a signed-in reader, "a" + 32 hex for a signed-out one (UTC day, ip, user agent). */
  export function readerKey(input: {
    viewerId: string | null;
    ip: string;
    userAgent: string;
    now: Date;
    secret: string;
  }): string;
  ```
- Produces (`reads.ts`, the only writer of `magazine_read`):
  ```ts
  export type RecordReadInput = {
    magazineId: number;
    issueId: number;
    articleId: number | null;
    readerKey: string;
    event: ReadEvent;
    now: Date;
  };
  /** One upsert on the matching partial unique index (`targetWhere`): view → views + 1, last_seen_at; read_end → read_to_end_at = COALESCE(existing, now). A new row starts at views 1 (view) or 0 (read_end). */
  export async function recordMagazineRead(
    db: Deps["db"],
    input: RecordReadInput,
  ): Promise<void>;
  ```
- Produces (`record.ts`):
  ```ts
  /** Re-checks access (Decision 10); true when a row was written. */
  export async function recordReadFor(
    deps: Deps,
    input: {
      issueId: number;
      articleId: number | null;
      event: ReadEvent;
      viewerId: string | null;
      readerKey: string;
      now: Date;
    },
  ): Promise<boolean>;
  ```
  Calls `loadIssueAccessById(deps, issueId, viewerId)` (Task 2; no by-id issue read of its own; `null` → false), then an exhaustive switch on `access`: `none` / `editor` → false; `teaser` → only `view`; `full` → both. With an `articleId`: the article must be published with `magazineIssue === issueId` (`draft: false`), else false. `read_end` without an `articleId` → false.
- Produces (`magazine-stats.ts`): `magazineStatsRouter = createTRPCRouter({ record: publicProcedure.input(z.object({ issueId: z.number().int().positive(), articleId: z.number().int().positive().optional(), event: z.enum(READ_EVENTS) })).mutation(...) })` → `{ recorded: boolean }`. Rate limit `createPerUserLimit({ windowMs: 60_000, max: 120 })` keyed by `clientIpFromHeaders(ctx.headers)` (over the limit → `{ recorded: false }`, never an error); no secret → `{ recorded: false }`.
- Produces (`read-tracker.tsx`, `"use client"`): `export function ReadTracker(props: { issueId: number; articleId?: number; trackEnd: boolean; enabled: boolean }): JSX.Element` — sends one `view` after mount (a ref guards Strict Mode); when `trackEnd`, renders an `aria-hidden` sentinel and sends one `read_end` when an `IntersectionObserver` sees it; failures are ignored silently. Issue page: `<ReadTracker issueId enabled={!seesEditorLayer(access)} trackEnd={false} />`; article page: after the body, `trackEnd = mode === "full"`.
- Produces (subscriptions): `subscribe` and `subscribeByEmail` inputs gain `sourceIssueId: z.number().int().positive().optional()`; the router keeps it only when `issueOrigin` says it is a published issue of that magazine. `subscribeAccount(db, magazineId, userId, locale, now, opts?: { sourceIssueId?: number | null })` and `subscribeByEmail(deps, input & { sourceIssueId?: number | null }, mailer, now)` write it in INSERT values only (Decision 11). `SubscribeButton` gains `issueId?: number`, sent as `sourceIssueId`; the rail and the article page pass the issue id.
- Produces (ADR-0048): Context (spec "Stats", no event store exists, privacy), Decision 10 and 11 and 7 (joins reuse the activity log), rejected options, Consequences (signed-out readers count once per day; a signed-out caller that rotates its user agent counts as a new reader each time, bounded only by the 120/min per-IP limit; readers without JavaScript are not counted; numbers start at this release, no backfill).

- [ ] **Step 1: Write the failing tests.**
  - `reader-key.test.ts`: same user → same key on different days; signed-out key changes with the UTC day, the IP or the user agent; the key never contains the user id, IP or user agent; prefixes `u` / `a`; length 33.
  - `record.integration.test.ts` (DB): `it("record re-checks access and never trusts the client")` — on a published public issue with two articles: an outsider's `view` → true; ten reloads → one row with `views` 10; an editor's view → false and no row; an outsider on a members-only issue → false; a teaser reader's `read_end` → false, their `view` → true; an article of another issue → false; `read_end` without an article → false; a member's `read_end` on an article → `read_to_end_at` set once (a second keeps the first time).
  - Router test (`magazine-stats` via `createCaller`, DB): over the rate limit → `{ recorded: false }`.
  - `read-tracker.test.tsx`: sends one view on mount; sends `read_end` once when the sentinel intersects (mock `IntersectionObserver`); sends nothing when `enabled` is false. Assert on the mutation calls.
  - `service.integration.test.ts`: `it("keeps the issue a subscriber came from, on new subscriptions only")` (account subscribe with a source → stored; subscribing again with another source → unchanged; email subscribe with a source → stored on the new row; a source from another magazine is dropped by the router).
  - `subscribe-button.test.tsx`: `it("sends the issue it was pressed on")`.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/stats src/components/magazines/reading` and `<DB prefix> pnpm vitest run src/server/magazines/stats src/server/magazines/subscriptions src/server/api/routers/magazine-subscriptions.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement** and write ADR-0048.
- [ ] **Step 4: Run** Step 2's commands plus `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/articles` and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit:** `feat(magazines): count reads with a cookieless reader key and keep where subscribers came from`.

---

## Task 9: The numbers page for editors

**Files:**

- Create: `src/server/magazines/stats/issue-stats.ts` (+ integration test), `src/app/[locale]/communities/[slug]/magazine/issues/[issueId]/stats/page.tsx` (+ test), `src/components/magazines/editor/stats/issue-stats-view.tsx` (+ test), `src/lib/magazines/parse-issue-id.ts` (+ test)
- Modify: `src/lib/magazines/paths.ts` (+ test), `src/app/[locale]/communities/[slug]/magazine/issues/[issueId]/edit/page.tsx` (shared issue-id parser), `src/components/magazines/editor/editor-desk.tsx` (+ test), `messages/{en,nl}.json`, `src/server/articles/article-readers.test.ts` (`READERS` gains `"src/server/magazines/stats/issue-stats.ts": "titles only, of articles placed in the issue; callers gate with canEditIssueAt"`), `src/server/api/routers/magazines.integration.test.ts` (the existing `canEditIssueAt` gate test)

**Interfaces:**

- Consumes: `magazineReads`, `magazineSubscriptions`, `activityEvents`, `communityMemberships`, `canEditIssueAt` (`issue-editing.ts`), `joinSourceCondition` (Task 3; the only way this module reads join metadata).
- Produces (`paths.ts`): `export function issueStatsPath(communitySlug: string, issueId: number): string; // …/magazine/issues/{id}/stats`
- Produces (`src/lib/magazines/parse-issue-id.ts`): `export function parseIssueId(raw: string): number | null` — a shared helper for the builder and numbers pages; accepts a positive whole safe integer written without leading zeroes, returns `null` for any other URL parameter, and each page calls `notFound()` on `null`.
- Produces (`issue-stats.ts`):
  ```ts
  export type IssueStats = {
    issue: {
      id: number;
      number: number;
      title: string;
      publishedAt: string | null;
      status: IssueStatus;
    };
    views: number; // SUM(views) of the issue-page rows
    readers: number; // COUNT(DISTINCT reader_key) over all rows of the issue
    newSubscribers: number; // magazine_subscription rows with this source_issue_id and confirmed_at set
    joins: number; // Decision 7, COUNT(DISTINCT actor_id)
    articles: {
      articleId: number;
      title: string;
      readers: number;
      readToEnd: number;
    }[]; // issue order
  };
  /** Null when the issue is missing. Callers gate with canEditIssueAt first. */
  export async function loadIssueStats(
    deps: Deps,
    issueId: number,
    locale: AppLocale,
  ): Promise<IssueStats | null>;
  ```
  Four queries at most (reads aggregate grouped by `article_id`, subscriptions count, joins count, article titles via one Payload `find`). The joins query filters `community_id`, then `joinSourceCondition({ via: "magazine", magazineId, issueId })` (never raw `metadata->>` here), counting `community.joined` rows and `community.join_requested` rows whose actor has an active membership now.
- Produces (page): `force-dynamic`, `robots: { index: false }`, signs guests in like the builder page, `notFound()` unless `canEditIssueAt` (so contributors and other communities get 404), renders `IssueStatsView`.
- Produces (`issue-stats-view.tsx`): `<SectionLabel>` "Numbers"; heading "How issue {number} is doing"; four stat tiles (Sans label, mono number): "Views", "Readers", "New subscribers", "Joined {community}"; a `<table>` "Articles" with columns "Article", "Readers", "Read to the end" (mono numbers, `<th scope="col">`, article titles as `<th scope="row">`); a muted note: "People who are not signed in count once a day. Your own visits as an editor are not counted." Empty state when everything is 0: "No reads yet. Numbers show up here when people open the issue." A link back to the issue builder.
- Produces (desk): each published issue row gets a secondary link "Numbers" to `issueStatsPath`.

- [ ] **Step 1: Write the failing tests.**
  - `parse-issue-id.test.ts`: accepts positive safe integer strings; rejects zero, negative, decimal, leading-zero, non-numeric, and unsafe integer parameters.
  - `issue-stats.integration.test.ts` (DB): `it("counts views, readers, read to the end, subscribers and joins")` — seed through `recordMagazineRead` and the real `communities.join` / `requestToJoin` callers: reader A views the issue twice, B once; A reads article 1 to the end, B views article 1, A views article 2 → `views 3`, `readers 2`, article 1 `{ readers 2, readToEnd 1 }`, article 2 `{ readers 1, readToEnd 0 }`; subscriptions with this source: one confirmed, one unconfirmed → `1`; joins: X joins an open community with the source, Y asks with the source and is approved, Z asks and is still pending, W joins with another issue's source → `2`.
  - Page test: `it("editors see the numbers; contributors and outsiders get 404")` (mocks `canEditIssueAt`; proves only the wiring).
  - `magazines.integration.test.ts`, the existing test `the issue builder page lets in only editors of the issue's community`: add a magazine **contributor** of this community → `false`, and the owner of `fx.other` (an editor of another community's magazine) on this community's slug → `false`. This is the DB proof behind the page's 404.
  - `issue-stats-view.test.tsx`: tiles and table render with mono numbers; the empty state; the table has row and column headers.
  - `editor-desk.test.tsx`: `it("links each published issue to its numbers")`.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines/editor "src/app/[locale]/communities/[slug]/magazine" src/lib/magazines/paths.test.ts` and `<DB prefix> pnpm vitest run src/server/magazines/stats src/server/api/routers/magazines.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Copy under `magazineEditor.stats.*` (English above).
- [ ] **Step 4: Run** Step 2's commands plus `SKIP_ENV_VALIDATION=1 pnpm vitest run src/i18n src/server/articles` → PASS; `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit:** `feat(magazines): editors see how each issue is doing`.

---

## Task 10: Slice guarantees, visual check and docs

**Files:**

- Create: `src/server/magazines/growth.integration.test.ts`
- Modify: `DESIGN.md`, `CONTEXT.md`, `docs/adr/0048-*.md` (Consequences), `docs/adr/0042-*.md` (only if Task 2's line needs correcting)

**Interfaces:**

- Consumes: everything above through `createCaller`, the reading loaders, `loadShareCard`, `magazineSitemapPaths`, `loadIssueStats` and the `feed.xml` `GET` only.

- [ ] **Step 1: Write the end-to-end guarantee test** `growth.integration.test.ts` (DB), `it("a preview issue grows the community and never leaks")`, in order:
  1. An **unlisted** community with `approval_required`; its owner sets an issue to `teaser` without the opt-in → `CONFIRM_UNLISTED_PUBLIC`; with it → saved with `publicConfirmedAt`.
  2. Published with an article (a code block first, then 120 words of text) and an editorial block. For a signed-out viewer: `loadIssuePage().access === "teaser"`; the payload holds the first 80 words and no code, no editorial body (Review Focus 1); `loadMagazineArticlePage` is `mode: "teaser"` without `content`; `canReadArticle` false; the article is absent from `magazineSitemapPaths`, the author's profile work and agent search; `feed.xml` holds no magazine article; `loadShareCard` gives a card; the issue is on `loadMagazinesHome`.
  3. A signed-in outsider asks to join with the source; the owner approves; the outsider now gets `access === "full"`; `loadIssueStats().joins === 1`.
  4. Reads recorded through `magazineStats.record` by the outsider (view, article view, read to end) and by the owner (ignored) → `views 1`, `readers 1`, article `readToEnd 1`.
  5. Staff hide the magazine (`payload.update` with an admin `user`) → it leaves the home, its pages are not indexable (`isIssueIndexable(..., data.magazine) === false`), the issue still opens for the member; the owner saving settings keeps it hidden.
  6. The owner switches the issue to `members` → on the next call the outsider who did not join gets `null` from `loadIssuePage`, `loadMagazineArticlePage` and `loadShareCard` (Review Focus 3).
- [ ] **Step 2: Run the whole slice's suites:** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib src/server src/components src/app src/collections src/i18n`, then `<DB prefix> pnpm vitest run src/migrations src/server/magazines src/server/articles src/server/members src/server/api/routers`, then `pnpm typecheck`, `pnpm lint` and `pnpm format:check` → all PASS, no DB suite skipped.
- [ ] **Step 3: Production build from the export** (Global Constraints, "Running the app", with `pnpm exec next build` in place of `next dev`) → succeeds.
- [ ] **Step 4: Visual check** on the running export (port 3100; test DB with a listed open community, an unlisted approval community, a magazine with a cover, three issues — one per layout — one of them a preview). Check each at 390px and 1440px, light and dark. Write findings in the PR description, not in a file.
  - Preview issue signed out: cover, note, contents, openings; the sticky join panel is the only orange; inline prompts are outline; no horizontal scroll; press Join → sign-in dialog → back on the page, joined, full issue.
  - Preview article page: start of the article, the note line, the panel, share buttons; no comments.
  - Each layout as a member: cover story unchanged; long read one column; digest a numbered list of rows with hairlines; anchors from the contents list land on the right item.
  - Builder: visibility with three options and hints; the opt-in for preview in the unlisted community; the layout control changes the preview; Visitor preview of a preview issue shows the join picture.
  - Share: open both share image URLs (`/en/og/magazine/...`) for the public issue (image) and the members-only one (404); the share buttons on a public issue; only "Copy link" on a members-only one.
  - Numbers page as an editor: tiles, table, empty state on a fresh issue; 404 as a contributor. Desk shows "Numbers" on published issues.
  - Payload admin: the "hide from the Magazines page" checkbox and the stamped who/when.
- [ ] **Step 5: Docs.** `DESIGN.md`: the preview page (one orange = the join panel; inline prompts outline), the three layouts and the `row` item size, share buttons (never orange), the numbers page (Sans labels, mono numbers). `CONTEXT.md`: "Preview issue (teaser)" and "Reader key" terms. ADR-0048 Consequences: what shipped and the risks below. Grep `docs/adr/0042-*.md`, `docs/adr/0046-*.md` and `CONTEXT.md` for "slice 6" / "teaser" promises and update them to what shipped (plans are history; leave them).
- [ ] **Step 6: Note for the PR description** (Greg runs production actions): the migration is additive (enum values, widened checks, three nullable/default columns, one new table); no backfill; numbers start at release; nothing changes for readers until an editor picks "Preview for everyone" or a layout.
- [ ] **Step 7: Commit:** `test(magazines): growth slice guarantees; docs`.

---

## Risks and open points (for the PR description)

- **Email stays public-only for preview issues** (Decision 8). An older code comment said preview issues would reach email subscribers; the slice brief says they do not. Signed-in subscribers get the preview in their inbox.
- **One confirmation covers preview and public, but only downwards** (Decision 2). A leader's tick for "Everyone" also covers a later switch to "Preview for everyone". Widening a confirmed preview to "Everyone" in an unlisted community needs a leader to tick again, because full articles then reach outsiders.
- **Preview pages are indexable** (Decision 9). Search engines see only the opening; Google's guidelines allow this for content behind a sign-up as long as crawlers and visitors get the same page, which they do.
- **Signed-out readers count once per day**, and readers without JavaScript are not counted. Numbers start at release; there is no history.
- **A join counts for an issue only when it starts from that issue's prompt** (or the sign-in that follows it). Someone who reads the magazine, then joins later from the community page, is not counted.
- **Email subscription stays open on a preview-only magazine.** Such a subscriber gets nothing until the magazine publishes an issue for everyone.
- **Hidden magazines** leave the Magazines page, the sitemap and search engines, but their articles still show on the author's profile and in agent search when the issue is public. Hiding is about the platform's front page, not a takedown; the existing report flow handles takedowns.
- **Share images are never cached** (`no-store`), so a switch back to members-only is instant; social sites cache them on their side for a while, which we cannot control. The editor-typed cover is fetched only through `safeFetch` (size cap, image types only) and each image route is limited to 30 calls a minute per IP.
- **Signed-out reader counts can be inflated**: the signed-out reader key includes the user agent, so one IP that rotates user agents counts as many readers, up to the 120/min per-IP limit of `magazineStats.record`. Acceptable for editor-facing numbers; a per-IP daily cap on new anonymous keys is the next step if it is abused.
- **The sitemap may lag** up to an hour after a switch back to members-only (`revalidate = 3600`); pages, share images and the home change at once.
- **Item renderers changed their props** (`lead` → `size`, plus `teaser`); every kind now owns a compact row and explicitly handles all four sizes (`lead`, `card`, `row`, `related`) with a `never` exhaustiveness check. "Next in this issue" uses `IssueItem` with `size="related"`.

## Self-review notes

- Spec coverage: `teaser` row of the visibility table and the resolver union (Task 2); unlisted opt-in for preview (Tasks 2, 5); teaser content — cover, note, contents, article openings, join prompt by `joinPolicy`, non-article cards only (Tasks 3, 4); teaser as a mode of each layout (Tasks 4, 6); indexable teaser pages, not in sitemap or feed (Tasks 1, 2, 10); email public-only (Task 2); share cards and actions (Task 7); three layouts with the builder picker and auto-draft setting (Task 6); stats — views, unique readers, read-to-end per article, new subscribers, joins with a source (Tasks 3, 8, 9), staff only (Task 9), no vendor (ADR-0048); staff moderation switch (Task 1); "switching back takes effect immediately on every surface" (Tasks 7, 10).
- Type names, each defined in one Interfaces block: `MagazineIssueAccess`, `ReadingMode`, `readingModeOf`, `opensToOutsiders`, `OutsiderReach`, `IssueCard.outsiderReach`, `IssueReach`, `readableArticleIssueIds`, `loadIssueFactsById`, `loadIssueAccessById`, `IssueAccessRow`, `IssueAudience` (`preview`), `isIssueIndexable(issue, magazine)`, `isShelfIndexable`, `hiddenMagazineIds`, `isHiddenByStaff`, `MagazineSummary.staffHidden`, `stampListingHidden`, `JoinSource`, `MagazineJoinSource`, `joinSourceSchema`, `JoinSourceEntry`, `JOIN_SOURCES`, `entryFor`, `verifyJoinSource`, `joinSourceMetadata`, `joinSourceCondition`, `IssueOrigin`, `issueOrigin`, `magazineJoinSource`, `verifyMagazineJoinSource`, `JoinIntent`, `MagazineJoinPromptProvider`, `MagazineJoinPrompt`, `MagazineJoinPromptView`, `JoinPromptCommunity`, `TEASER_OPENING_WORDS`, `openingOf`, `cutWords`, `ArticleTeaser`, `ArticleReading`, `ItemTeaser`, `ItemSize`, `ShareCard`, `loadShareCard`, `BlackCard`, `ShareImageLabels`, `loadShareCover`, `renderMagazineShareImage`, `shareTargets`, `issueShareImagePath`, `articleShareImagePath`, `ShareActions`, `READ_EVENTS`, `ReadEvent`, `readerKeySecret`, `readerKey`, `RecordReadInput`, `recordMagazineRead`, `recordReadFor`, `magazineStatsRouter`, `ReadTracker`, `IssueStats`, `loadIssueStats`, `issueStatsPath`, `parseIssueId`.
- Review Focus lines each have their test in the owning task (Tasks 2, 3, 4, 7, 8, 9, 10).
- Ordering: values that widen a union land in the task that makes every `switch` over it decide (visibility → Task 2, layouts → Task 6); the DB accepts the new values from Task 1 on, which is harmless.
- Article readers: every new module that queries `collection: "articles"` (`share-cards.ts` Task 7, `stats/record.ts` Task 8, `stats/issue-stats.ts` Task 9) adds its `READERS` entry to `src/server/articles/article-readers.test.ts` in the same task, and that task runs `src/server/articles`.

## Preflight rulings

Preflight review (spec, design, safety) found 33 points; all but the parts below were applied in place.

- Ruling: the shared `BlackCard` frame is created and used by the two new magazine images, but the existing generic image (`src/app/[locale]/og/route.tsx`) and the badge image are not moved onto it in this slice — they belong to other features with their own tests, and moving them widens this PR's review surface; the PR notes the follow-up on the magazines ticket — cost if wrong: two inline copies of the frame live a little longer (no behaviour risk).
- Ruling: share images keep `Cache-Control: no-store` (the safety reviewer's alternative `public, max-age=60` is not taken); the amplification risk is closed instead by `safeFetch` + size cap + a 30/min per-IP limit on the routes — instant takedown after a switch to members-only (Review Focus 3) matters more than CDN savings — cost if wrong: more origin renders under heavy legitimate sharing; switching to `max-age=60` later is a one-line change.
- Ruling: no lower per-IP limit or daily cap for signed-out `record` callers in this slice; the inflation risk is documented under Risks and in ADR-0048 — the numbers are editor-facing only and the 120/min per-IP limit bounds the damage; a daily cap needs its own storage — cost if wrong: a determined caller can inflate one issue's "Readers" count until the cap is added.
- Ruling: the payload field names stay `listingHidden` / `listingHiddenAt` / `listingHiddenBy` (columns `listing_hidden*`); only the derived site-code fact is renamed to `staffHidden` — "listing" (the Magazines page listing) does not clash with "listed community", and renaming DB columns now would only add churn — cost if wrong: a reader may still briefly confuse the admin field with community listing; the admin description says what it does.
