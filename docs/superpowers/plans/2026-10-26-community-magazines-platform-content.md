# Community Magazines — Platform Content in Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editors can put AIT News stories, news items, and their community's events, forum threads and launchpad projects into an issue from an "Add more" picker, with an optional intro line per item; every reader sees each item live and only when that reader may read the referenced content, and editors see a "no longer available" marker in its place.

**Architecture:** Each new kind is one module under `src/server/magazines/items/<kind>/` (Payload block config, `IssueItemKind` strategy, picker source) plus one renderer and one builder file, wired through the three typed registries of ADR-0043 and a fourth one for picker sources. Items store the referenced id only and are loaded per issue with one batched query per kind; the item context gains a per-viewer `ItemReader` (the community content rule `hiddenContentCommunityIds`, loaded at most once per page) so community content passes the reader's own access check. Validation is strict for references an editor adds and lenient for references the issue already held, so content that goes away later becomes a marker instead of blocking the editor.

**Tech Stack:** Next.js App Router (RSC reading pages), tRPC (editor procedures), Payload CMS 3.77 (blocks, Local API), Drizzle (`app.news_item`, `app.news_storyline`, memberships), next-intl (en + nl), shadcn/ui primitives, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-26-community-magazines-design.md` (read "Decided structure → References, not copies", "Flows → Assemble", "Delivery slices → 2"). Shape reference: `docs/superpowers/specs/2026-10-26-community-magazines-mockup.html` screen 2 (story cards, event/forum/project cards, news headlines) and screen 4 ("Add more" picker with kind tabs). DESIGN.md wins over the mockup. Read first: ADR-0042, ADR-0043, `docs/superpowers/plans/2026-10-26-community-magazines-core.md` and its `-rulings.md` (rulings there still hold unless this plan says otherwise).

## Decisions this plan makes (spec gaps)

1. **References are plain ids, not Payload relationships.** `storylineId`/`newsItemId` are `text` (Drizzle uuids), `eventId`/`threadId`/`projectId` are `number`. No foreign key: deleting an event or thread never touches magazine tables, and a reference to deleted content stays in the issue and loads as a `missing` marker. (A relationship with `ON DELETE set null` on a `NOT NULL` column would make deleting referenced content fail; a nullable one would make `toInput` produce items without a reference.)
2. **Readability rules, one per kind, all taken from the content's own surfaces:**
   - `storyline`: the exported `publicStoryline` predicate in `src/server/news/storylines.ts` (published, has an overview, ≥ 2 sourced articles) — the story page's rule. Not public → `unpublished`.
   - `newsItem`: exists → readable (news is global and public).
   - `event`: status in `PUBLICLY_LISTED_EVENT_STATUSES` (`published`, `cancelled`, `completed`; the event page's and agent delivery's rule, extracted to one constant) **and** the community content rule. Otherwise `unpublished` / `no_access`.
   - `forumThread`: not `isDeleted` (else `missing`) and the community content rule (`no_access`).
   - `launchpadProject`: status `published` (else `unpublished`) and the community content rule (`no_access`), as `profileProjectsWhere` does.
   - Community content rule = `hiddenContentCommunityIds(db, viewerId)`; a null `communityId` is Hub content and always readable. Being inside a public issue never widens it.
3. **Unavailable reasons** grow from `missing | not_ready | other_magazine` to add `unpublished` and `no_access`. Readers never receive markers (unchanged registry rule).
4. **Members-only flag.** Community-scoped views (event, thread, project) carry `membersOnly: boolean` (its community's content is members-only: `hiddenContentCommunityIds(db, null)` contains it). Readers who get the view can read it anyway; editors use it: the builder row says "Only members see this" and the Visitor preview leaves it out. So the members-only set is loaded only for `editor` access (exhaustive `switch` over `IssueReaderAccess`, per `src/lib/magazines/access.ts`); for `full` access the flag is `false` without a query, and a signed-in reader's page runs `hiddenContentCommunityIds` exactly once.
5. **Strict for new, lenient for kept.** `validate` receives `isNew` per item: an item whose reference was not in the issue's stored blocks before this save. New references must exist, be readable by the editor, be in scope, and not be duplicated → else `ITEM_INVALID` (one code for missing, private, other community and unpublished, so a forged id learns nothing). Kept references only get the duplicate check, so a story unpublished after it was added never blocks the editor's other edits or publishing; it is a marker, readers skip it, and the publish dialog says how many items readers will skip. Article and editorial kinds keep their current rules. A missing `previous` (no stored blocks given) means every reference is new. The seen-set / duplicate / strict-new / lenient-kept loop is written once, `validateReferences` in `src/server/magazines/items/references.ts`, and every reference kind calls it (see Task 1).
6. **Scope of the picker** (the server enforces the same rule in `validate`): stories and news are global; events and forum threads both follow the one Hub-aware community rule (`communityContentWhere` / `communityContentMatches` in `src/server/communities/forum-scope.ts`, extracted in Task 6 from `forumThreadCommunityWhere` / `forumThreadMatchesCommunity`, which then delegate to it): `communityId = this community`, and for the Hub also content with no community (the Hub's own platform events and legacy threads have none); launchpad projects are `communityId = this community`, or unscoped projects whose author is an active member of the community (site-created projects have no `communityId` today — "member projects" in the spec).
7. **Picker sources are a registry**, `ITEM_PICKERS`, keyed by `PICKABLE_ITEM_KINDS` (every kind except `editorial`), dispatched by one editor procedure `magazines.pickerCandidates({ slug, kind, query })`. The article tab moves onto it and `availableArticles` is removed. Candidates carry the builder input, its `reference` key (`itemReference` form, so the generic picker panel can hide what the issue already holds and move focus without knowing kind-specific id fields), a title, typed `facts` the client formats, and an optional `openHref` (only articles the viewer wrote). Twelve results per search (`PICKER_LIMIT`, in `src/lib/magazines/picker.ts` so kind pickers never import the registry).
8. **The intro line becomes editable for every kind.** Selecting any row opens one item details panel: the intro field (max 280, shared base input) above the kind's own editor (editorial only). The preview follows the typed intro.
9. **A news item is one issue item.** The mockup's grouped "news digest" card is a layout concern for slice 6 (`digest` layout); here a news item renders as a compact headline card.
10. **Display choices:** dates are absolute (no "3h ago": the issue page is server-rendered and relative time would drift from hydration); every card and picker date uses the existing formatters of `src/lib/event-time.ts` — `formatEventDay(iso, locale)` ("24 Oct 2026" / "24 okt 2026") for single dates, `formatEventDayRange` for event days — never `format.dateTime` (no second date style); storyline title and overview fall back to English when the Dutch text is empty; the editor API keeps reading in the default locale (core rule).
11. **One migration for the slice**, `src/migrations/20261026b_magazine_platform_items.ts`, created by the first kind task and extended by each later kind task (unshipped until merge; ruling 31 precedent). If `origin/main` has a later migration when Task 4 starts, use the next free date-letter name instead and use it everywhere below.
12. **Cover cards drop the item count.** `IssueCard.itemCount` is the stored count (`issue.items.length`); it counts members-only and unavailable items, so an anonymous visitor would read "8 items" on `/magazines` and then find 5, and the number would reveal that hidden items exist. Per-reader counts on listings would load every kind for every cover, so Task 9 removes the count from cover cards and from `IssueCard` instead.
13. **Only the kinds a page needs are loaded.** The magazine article page needs only the issue's articles for "next in issue"; it loads through `loadIssueItemViewsOfKinds(blocks, ctx, ["article"])` (the registry filters blocks by kind id before loading), so it never runs the story, news, event, thread, project or hidden-community queries.

## Global Constraints

- Branch: `feat/community-magazines-platform-content`, created by the controller (not a task agent) from `origin/main`. Run `git branch --show-current` before every commit. Never `git checkout`/`git switch`, never `git stash`, never `git add -A` / `git add .` — stage files by name and confirm every staged file is yours.
- No `Co-Authored-By`, "Generated with" or any AI credit line in commits or PRs.
- Before Task 1, in the middle (after Task 6) and before opening the PR: `git fetch origin && git log origin/main --oneline | grep -i -E "magazin|storyline|picker"; gh pr list --search magazine` — stop if another session shipped part of this.
- **Never** run `pnpm db:apply`, `pnpm db:push`, `pnpm build`, `pnpm dev`, `drizzle-kit generate`, or anything that reads `.env` (its `DATABASE_URL` is production; prod applies migrations on merge). Never `source`/`.` `.env` or `.env.docker` from zsh; pass the few variables a command needs inline.
- Unit test prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run`.
- **DB test prefix** (use exactly; never host port 5432 — it is an SSH tunnel to a remote DB):
  `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test`
  One-time setup if `aitcom_test` is not reachable: `pnpm dev:db`; `docker run -d --rm --name aitcom-test-pg-forward --network aitcom_default -p 127.0.0.1:55432:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp:postgres:5432`. Never set `PAYLOAD_PUSH` against `aitcom_test` (prefix commands with `env -u PAYLOAD_PUSH` when unsure). A DB suite that reports *skipped* is a setup failure — fix the env, do not continue.
- Integration tests copy the `isLocalDbConfigured` guard and fixture style of `src/server/magazines/reading.integration.test.ts` (unique suffix per test, users + member profiles, `community(label, { listed })`, cleanup in `afterEach`).
- Payload `number` values may come back as strings: `Number()` before comparing or counting (`eventId`, `threadId`, `projectId`, `replyCount`, `voteCount`).
- **Regenerate Payload types** (every task that adds a block): `env -u PAYLOAD_PUSH SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test RESEND_API_KEY= npx payload generate:types` (if it stops on one missing variable, pass that one inline with a dummy local value), then `git diff -- src/payload-types.ts` must show only the new block's hunks. Do not run `generate:db-schema`.
- **Running the app** (visual checks and the production build only) — it exports `HEAD`, so it sees only committed work: always commit first, then export; fixes go in a follow-up commit and a fresh export. From a `git archive HEAD` export, never the project folder (`next dev` loads `.env` from its folder): `X="$TMPDIR/aitcom-visual"; rm -rf "$X"; mkdir -p "$X"; git -C /Users/greg/coding-projects/aitcom archive HEAD | tar -x -C "$X"; ln -s /Users/greg/coding-projects/aitcom/node_modules "$X/node_modules"`, then in `$X`: `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test RESEND_API_KEY= BETTER_AUTH_SECRET=local-visual-check PAYLOAD_SECRET=local-visual-check pnpm exec next dev -p 3100`. `PAYLOAD_PUSH` stays unset, `RESEND_API_KEY` empty.
- Every user-visible string goes through next-intl in **both** `messages/en.json` and `messages/nl.json`, in everyday words (no "reference", "entity", "kind" in copy). Reading copy lives under `magazines.item`, builder copy under `magazineEditor.builder`. Server refusal codes reach the UI only through `readEditorError` / `editorErrorKey`.
- Design (UI tasks): read `PRODUCT.md` and `DESIGN.md` first. Tokens from `src/styles/globals.css`, primitives from `src/components/ui/`. One Voice Rule — no Signal Orange on item cards or picker rows (the builder's Publish stays the one orange action). No `/ LABEL` kicker and no `01 ·` ordinals on cards: a card's kind line is plain small Sans text ("From AIT News", "Event"). Mono only for counts and dates. Flat-by-default: hairline borders, no shadows, no nested cards. Loading → `<Skeleton>`, error → `<ErrorState onRetry>`, empty → text that says what shows up here.
- Accessibility: WCAG 2.2 AA; every control labelled; IDs from `useId()`; external links (news) say they open in a new tab (sr-only text) and use `rel="noopener noreferrer"`; after "Add" removes a row the focus moves on (existing `ReadyArticles` behaviour, now generic); tabs reachable by keyboard and wrap on phones (no horizontal page scroll at 390px).

## Review Focus

1. **A public issue of an unlisted community (opt-in confirmed) holds that community's forum thread, event or project** → anonymous and signed-in non-members get neither the card nor its contents-list entry (not in the HTML), members get it, the editor gets it flagged "Only members see this", and the Visitor preview leaves it out. Tests: Task 9 (`a public issue never widens access to community content`) and Task 9 (`visitor preview leaves out members-only items`).
2. **A story is unpublished (or a thread deleted, a project archived) after the issue was published** → readers see the rest of the issue with the next item as lead and no error; the editor sees the marker with the reason; the editor can still save other changes and publish; the publish dialog says one item will be skipped. Tests: Task 1 (`kept references are validated leniently`), Task 9 (`content that goes away becomes a marker and never blocks the editor`).
3. **An editor posts a forged id to `setIssueItems`** (another community's private thread, a draft event, a project of a non-member) → `ITEM_INVALID` exactly like a non-existent id. Tests: Task 6 (`refuses a new event that is unlisted, another community's or unknown alike`), Task 7 (`refuses another community's thread`), Task 8 (`refuses a project outside the community`).
4. **The same content is added twice** (double click, two tabs, picker after reload) → the builder keeps one item, the server refuses a duplicate. Tests: Task 3 (`adding the same article twice keeps one item`), Task 4 (`refuses a duplicate story`).
5. **A Dutch reader opens an issue with a story whose Dutch title is empty** → the English title shows, never a blank card. Test: Task 4 (`falls back to English text when the Dutch text is empty`).

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/magazines/references.ts` | `itemReference(kind, id)` — the one reference key format, shared by server validation and the builder. |
| `src/lib/magazines/picker.ts` | `PICKABLE_ITEM_KINDS`, `PickableKindId`, `CandidateFact`, `PICKER_LIMIT` (client-safe; kind pickers import the limit from here, never from the registry). |
| `src/lib/events/event-status.ts` | `PUBLICLY_LISTED_EVENT_STATUSES`, `isPubliclyListedEventStatus`. |
| `src/server/magazines/items/reader.ts` | `ItemReader` + `createItemReader` (memoized community content sets). |
| `src/server/magazines/items/context.ts` | `itemContextFor` — the one way callers build an `ItemContext`. |
| `src/server/magazines/items/base-input.ts` | Shared builder input fields (`id`, `intro`), intro helpers and `cutWords`. |
| `src/server/magazines/items/references.ts` | `validateReferences` — the one seen-set / duplicate / strict-new / lenient-kept loop every reference kind uses. |
| `src/server/magazines/items/community-content.ts` | `loadCommunityContentRule(reader)` for community-scoped kinds. |
| `src/server/magazines/items/pickers.ts` | `ITEM_PICKERS` registry + `searchPickerCandidates`. |
| `src/server/magazines/items/<kind>/{block,kind,picker}.ts` for `article` (picker only), `storyline`, `newsItem`, `event`, `forumThread`, `launchpadProject` | One module per kind. |
| `src/server/magazines/items/<kind>/kind.test.ts` | Unit tests per new kind (fakes). |
| `src/server/magazines/items/platform-kinds.integration.test.ts` | DB tests of every new kind's load/validate/picker against real rows. |
| `src/server/magazines/platform-items-reading.integration.test.ts` | Cross-kind per-reader reading + editor tests. |
| `src/migrations/20261026b_magazine_platform_items.ts`, `src/migrations/magazine-platform-items.integration.test.ts` | Block tables, migration test. |
| `src/components/magazines/items/{storyline,news-item,event,forum-thread,launchpad-project}-item.tsx` | One renderer per kind. |
| `src/components/magazines/editor/builder/items/reference.ts` | `referenceBuilderKind` factory shared by every pickable kind. |
| `src/components/magazines/editor/builder/items/{storyline,news-item,event,forum-thread,launchpad-project}.ts` | Builder strategy per kind. |
| `src/components/magazines/editor/builder/picker-panel.tsx` (+ test) | Generic search-and-add list for one kind. |
| `src/components/magazines/editor/builder/item-details-panel.tsx` (+ test) | Intro line + the kind's own editor. |
| `docs/adr/0044-platform-content-in-issues-is-referenced-live-and-read-per-reader.md` | ADR. |

**Modify**

`src/server/magazines/items/{types,registry,blocks}.ts`, `items/article/kind.ts`, `items/editorial/kind.ts`, `src/lib/magazines/item-views.ts`, `src/server/magazines/{reading,issue-editing,issue-service,magazine-articles}.ts`, `src/server/api/routers/magazines.ts`, `src/server/news/{storylines,list}.ts`, `src/server/agent/event-delivery-audience.ts`, `src/server/communities/forum-scope.ts`, `src/app/[locale]/events/[slug]/page.tsx`, `src/components/magazines/items/registry.tsx`, `src/components/magazines/reading/featured-issue.tsx`, `src/components/magazines/editor/builder/{add-items-panel,issue-builder,items-model,items-model.test,item-row,live-preview,publish-dialog}.tsx|ts`, `src/server/magazines/items/article-kind.integration.test.ts`, `builder/items/{types,registry,article,editorial}.ts(x)`, `src/components/magazines/test-fixtures.ts`, `src/migrations/index.ts`, `src/server/db/payload-schema-drift.ts`, `src/collections/magazines-schema.test.ts`, `src/payload-types.ts`, `messages/{en,nl}.json`, `CONTEXT.md`.

---

## Task 1: Reader-aware item context, reference keys and kept-reference validation

**Files:**
- Create: `src/lib/magazines/references.ts`, `src/server/magazines/items/{reader,context,base-input,references}.ts`, `src/server/magazines/items/{reader,references}.test.ts`, `docs/adr/0044-platform-content-in-issues-is-referenced-live-and-read-per-reader.md`
- Modify: `src/server/magazines/items/{types,registry}.ts`, `items/article/kind.ts`, `items/editorial/kind.ts`, `src/server/magazines/{reading,issue-editing,issue-service}.ts`, `src/server/api/routers/magazines.ts`, `src/components/magazines/editor/builder/items/article.ts`, `CONTEXT.md`
- Test: `src/server/magazines/items/registry.test.ts`, `reader.test.ts`, `references.test.ts`; existing `issue-service.integration.test.ts`, `src/server/magazines/items/article-kind.integration.test.ts` (its hand-built `ctx()` at lines ~208-213 moves onto `itemContextFor`; its `validate` calls pass `isNew`), `src/server/api/routers/magazines.integration.test.ts` (call sites only). `reading.integration.test.ts` goes through `loadIssuePage` and needs no change; run it anyway.

**Interfaces:**
- Consumes: `hiddenContentCommunityIds(db, userId)` (`src/server/communities/content-visibility-queries.ts`), `Deps` (`deps.ts`), `MagazineCommunity` (`magazine-service.ts`, has `id`, `slug`), `IssueActor` (`issue-service.ts`, `{ userId; community: MagazineCommunity }`) and the router's `actorOf(ctx)`.
- Produces:
  ```ts
  // src/lib/magazines/references.ts
  export function itemReference(kind: ItemKindId, id: string | number): string; // `${kind}:${id}`
  // items/reader.ts
  export type ItemReader = {
    readonly viewerId: string | null;
    /** Communities whose content this viewer may not read. One query, on first use. */
    hiddenCommunityIds(): Promise<ReadonlySet<string>>;
    /** Communities whose content is members-only (the anonymous hidden set). Same query as above when viewerId is null. */
    membersOnlyCommunityIds(): Promise<ReadonlySet<string>>;
  };
  export function createItemReader(database: Deps["db"], viewerId: string | null): ItemReader;
  //   memoizes the *promise* of each set (not the resolved value), so concurrent first calls share one query
  // items/types.ts — ItemContext gains db, community, reader
  export type ItemCommunity = { id: string; slug: string };
  export type ItemContext = { payload; db: Deps["db"]; magazineId: number; community: ItemCommunity;
    issueId: number | null; locale: AppLocale; access: IssueReaderAccess; reader: ItemReader };
  // IssueItemKind gains / changes:
  referenceOf(stored: Stored): string | null;            // null = the issue owns the content
  validate(items: { index: number; stored: Stored; isNew: boolean }[], ctx: ItemContext): Promise<ItemProblem[]>;
  // items/context.ts
  export function itemContextFor(deps: Deps, opts: { magazineId: number; community: ItemCommunity;
    issueId: number | null; locale: AppLocale; access: IssueReaderAccess; viewerId: string | null }): ItemContext;
  // items/base-input.ts
  export const itemBaseInput: { id: z.ZodOptional<z.ZodString>; intro: z.ZodOptional<z.ZodString> }; // intro max 280
  export function storedIntro(intro: string | undefined): string | null;   // trimmed, "" → null
  export function introInput(stored: string | null | undefined): { intro?: string };
  export function cutWords(text: string, words: number): string;          // trimmed; "…" appended only when cut
  // items/references.ts — the one validation loop for reference kinds
  export function validateReferences<Stored>(
    items: readonly { index: number; stored: Stored; isNew: boolean }[],
    opts: { referenceOf: (stored: Stored) => string; acceptNew: (stored: Stored) => boolean },
  ): ItemProblem[];
  //   duplicate reference (kept or new) → { itemIndex, code: "ITEM_INVALID", detail: "duplicate" };
  //   new and !acceptNew → { itemIndex, code: "ITEM_INVALID" } (no detail); kept → only the duplicate check.
  //   Kinds batch-load their rows first, then pass a synchronous acceptNew over the loaded map.
  // registry.ts
  /** `previous` = the issue's stored blocks before this save; omitted = every reference is new. */
  export function validateIssueItems(blocks: StoredBlock[], ctx: ItemContext, previous?: readonly StoredBlock[]): Promise<ItemProblem[]>;
  /** Loads only blocks of the given kinds (filtered by kind id here, never by callers). */
  export function loadIssueItemViewsOfKinds(blocks: StoredBlock[], ctx: ItemContext, kinds: readonly ItemKindId[]): Promise<EditorItemView[]>;
  export type InputOf<K extends ItemKindId>;   // now exported (Task 2 uses it)
  // issue-editing.ts — reuses the existing IssueActor (no new editor type)
  export function loadEditorItems(deps: Deps, issue: MagazineIssue, actor: IssueActor): Promise<EditorItemView[]>;
  export function loadIssueEditorView(deps: Deps, issue: MagazineIssue, actor: IssueActor): Promise<IssueEditorView>;
  ```
  `ItemCommunity` is structurally `MagazineCommunity` (`{ id; slug }`); declare it as `Pick<MagazineCommunity, "id" | "slug">` so an `IssueActor`'s community passes straight into `itemContextFor`.

- [ ] **Step 1: Write the failing tests.**
  - `reader.test.ts` — `vi.mock("@/server/communities/content-visibility-queries")` and count calls to the mocked `hiddenContentCommunityIds` (do not count `db.select`: for a signed-in viewer that function runs two selects, its `memberOf` subquery and the main query). `it("loads each community set once, on first use")` — a signed-in viewer; call `hiddenCommunityIds()` and `membersOnlyCommunityIds()` twice each, **concurrently** with `Promise.all` (the registry loads kinds in parallel, so only concurrent calls catch a memoized value instead of a memoized promise) → `hiddenContentCommunityIds` called exactly twice, once with the viewer id and once with `null`; no call → 0 calls. `it("an anonymous reader's two sets are one query")` → called once with `null`, equal sets.
  - `references.test.ts`: `it("refuses a new reference it may not accept, never a kept one")`; `it("refuses the second copy of a reference, kept or new")` (`detail: "duplicate"`); `it("cutWords appends … only when it cuts")`.
  - `registry.test.ts`: update `ctx()` to build through `itemContextFor` with a fake reader; replace `safeParse({ kind: "storyline" })` with `{ kind: "nope" }`. Add `it("marks an item new only when its reference was not stored before")` — spy on both `ITEM_KINDS.article.validate` and `ITEM_KINDS.editorial.validate`; `validateIssueItems([articleBlock("a1",1), articleBlock("a2",2), editorialBlock("e1")], ctx, [articleBlock("old",1)])` → the article spy receives `isNew` `false` for article 1, `true` for article 2; the editorial spy receives its entry with `isNew: true`. Add `it("without previous blocks every reference is new")`. Add `it("article and editorial references")` — `ITEM_KINDS.article.referenceOf({ article: 3, ... })` is `"article:3"`, `ITEM_KINDS.editorial.referenceOf(...)` is `null`. Add `it("stores a trimmed intro")` — article and editorial `toStored` with `intro: " x "` → stored `intro: "x"`; `intro: "  "` → `null`. Add `it("loads only the asked kinds")` — `loadIssueItemViewsOfKinds` with `["article"]` over an article and an editorial block never calls the editorial kind's `load`.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/items` → FAIL (modules/exports missing).
- [ ] **Step 3: Implement** the five new modules and the interface changes. `itemContextFor` builds the reader with `createItemReader(deps.db, opts.viewerId)`. `createItemReader` keeps one promise per set (`hidden ??= hiddenContentCommunityIds(db, viewerId).then(toSet)`); for an anonymous reader both sets share the one promise. Article and editorial kinds take `itemBaseInput` and the intro helpers (`toStored` writes `storedIntro`, `toInput` spreads `introInput`) and get `referenceOf`; both ignore `isNew`. **One behaviour change:** today both kinds store `input.intro ?? null` untrimmed; `storedIntro` trims and turns `""` into `null` (the `stores a trimmed intro` test pins it). The article kind's private excerpt cut (`EXCERPT_WORDS`, `article/kind.ts:29-35`) moves onto `cutWords(lexicalPlainText(content), 40)`. The builder's `articleReference(id)` returns `itemReference("article", id)`.
- [ ] **Step 4: Move the three context builders onto `itemContextFor`.** `reading.ts` `itemViewsOf` passes `viewerId` from the page options and `community: { id, slug }` from the found community; `loadMagazineArticlePage`'s "next in issue" lookup calls `loadIssueItemViewsOfKinds(blocks, ctx, ["article"])` instead of `itemViewsOf` (Decision 13), so the article page never loads the other kinds. `issue-editing.ts` `editorContext` becomes `itemContextFor(deps, { …, access: "editor", viewerId: actor.userId, community: actor.community })`. `loadIssueEditorView` passes the issue's own stored `blocks` as `previous` to `validateIssueItems` (every saved reference is kept, so content that went away shows as a marker, not a problem — Task 9 relies on `problems: []`). `issue-service.ts` `assertItemsValid(deps, issue, blocks, actor)` builds the context from `actor` and passes `storedBlocksOf(issue)` as `previous` (in `publishIssue` the blocks are the stored ones, so every reference counts as kept). Router: `getIssueForEditing` and `setIssueItems` pass `depsOf(ctx)` and the existing `actorOf(ctx)` (no new object literal). Fix the call sites in `issue-service.integration.test.ts`, `article-kind.integration.test.ts` and `magazines.integration.test.ts`.
- [ ] **Step 5: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines src/components/magazines && pnpm typecheck` → PASS; then `<DB test prefix> pnpm vitest run src/server/magazines src/server/api/routers/magazines.integration.test.ts` → PASS, none skipped.
- [ ] **Step 6: Write ADR-0044** (check the number is free: `git ls-tree -r --name-only origin/main docs/adr | tail -2` and open PRs; renumber everywhere if taken). Format of ADR-0043. It records Decisions 1–8 and 12–13 above as the decision (references as plain ids and why no FK; the five readability rules and where each comes from; the `ItemReader` on the item context; `unpublished`/`no_access` reasons; `membersOnly`; strict-new/lenient-kept validation; `ITEM_PICKERS` and the `pickerCandidates` procedure; the intro panel), the rejected options (relationship fields with FK; snapshotting; re-validating kept references strictly; one search procedure per kind; reading as the issue's audience instead of the viewer), and consequences (a kind's `load` must never return content its reader may not read; `suggest` in slice 5 can reuse each picker module's queries). Note in Context, as observed facts not changed here: `/events/[slug]` and `launchpad.getBySlug` do not apply the community content rule.
- [ ] **Step 7: Update `CONTEXT.md`** — fix the [[item-kind]] entry (it says `storyline`… come later: now they exist, list all seven), add entries [[reference-item]] (an issue item that points at platform content and renders it live) and [[unavailable-marker]] (what editors see in place of an item its reader cannot get), linking ADR-0044. Grep CONTEXT.md for other "slice 2" / "later" claims about item kinds and fix them.
- [ ] **Step 8: Commit** — `git add` the files above by name; `git commit -m "refactor(magazines): reader-aware item context and kept-reference validation"`.

---

## Task 2: Picker source registry and the `pickerCandidates` procedure

**Files:**
- Create: `src/lib/magazines/picker.ts`, `src/server/magazines/items/pickers.ts`, `src/server/magazines/items/article/picker.ts`, `src/server/magazines/items/pickers.test.ts`
- Modify: `src/server/magazines/items/types.ts`, `src/server/magazines/magazine-articles.ts` (`listAvailableArticles` gains `query`), `src/server/api/routers/magazines.ts`. (Kind pickers import `PICKER_LIMIT` from `@/lib/magazines/picker`, never from `items/pickers.ts` — that would be an import cycle.)
- Test: `pickers.test.ts`, `src/server/api/routers/magazines.integration.test.ts`

**Interfaces:**
- Consumes: `InputOf<K>`, `ItemCommunity` (Task 1); `listAvailableArticles`, `magazineArticleEditPath` (`src/lib/magazines/paths.ts`).
- Produces:
  ```ts
  // src/lib/magazines/picker.ts (each kind task appends its id)
  export const PICKABLE_ITEM_KINDS = ["article"] as const satisfies readonly ItemKindId[];
  export type PickableKindId = (typeof PICKABLE_ITEM_KINDS)[number];
  export type CandidateFact =
    | { type: "byline"; name: string }
    | { type: "source"; host: string }
    | { type: "date"; label: "updated" | "published" | "starts" | "lastActive"; at: string }
    | { type: "count"; what: "sources" | "replies" | "upvotes"; value: number }
    | { type: "eventStatus"; status: "cancelled" | "completed" };
  export const PICKER_LIMIT = 12; // here, not in items/pickers.ts: kind pickers import it, and pickers.ts imports every kind picker
  // items/types.ts
  export type PickerContext = { deps: Deps; magazineId: number; community: ItemCommunity; viewerId: string; locale: AppLocale };
  /** What a kind's source returns; the registry adds the reference. */
  export type PickerSourceCandidate<Input> = { input: Input; title: string; facts: CandidateFact[]; openHref: string | null };
  /** What the procedure returns: `reference` is `itemReference` form, so the client never needs kind-specific id fields. */
  export type PickerCandidate<Input> = PickerSourceCandidate<Input> & { reference: string };
  export interface ItemPickerSource<Input> { search(query: string, ctx: PickerContext): Promise<PickerSourceCandidate<Input>[]> }
  // items/pickers.ts
  export const ITEM_PICKERS: { [K in PickableKindId]: ItemPickerSource<InputOf<K>> };
  export function searchPickerCandidates(kind: PickableKindId, query: string, ctx: PickerContext): Promise<PickerCandidate<IssueItemInput>[]>;
  //   fills reference = ITEM_KINDS[kind].referenceOf(ITEM_KINDS[kind].toStored(c.input)) for every candidate
  // router
  pickerCandidates: editorProcedure.input(z.object({ slug: z.string(), kind: z.enum(PICKABLE_ITEM_KINDS),
    query: z.string().trim().max(100).default("") })) // → [] when the community has no magazine
  ```

- [ ] **Step 1: Write the failing tests.** `pickers.test.ts`: `it("has one picker source per pickable kind")` — `Object.keys(ITEM_PICKERS)` equals `[...PICKABLE_ITEM_KINDS]`; `it("every pickable kind is a registry kind other than editorial")`; `it("gives every candidate its reference key")` — a stubbed article source returning `{ input: { kind: "article", articleId: 7 } … }` → `reference: "article:7"`. Router DB test (extend the existing suite): `it("pickerCandidates offers ready articles, filtered by the search")` — two approved unplaced articles "Agents at work" / "Evals", `query: "agent"` → one candidate `{ input: { kind: "article", articleId }, reference: \`article:${articleId}\`, title: "Agents at work", facts: [{ type: "byline", name }] }`; an article placed in an issue is not offered; `openHref` is the edit path only for the caller's own article; `it("pickerCandidates is for editors only")` — member → FORBIDDEN.
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Implement.** `listAvailableArticles(payload, magazineId, viewerId, query = "")` adds `{ title: { like: query } }` when the query is not empty. The article picker maps to candidates with `openHref = editableByViewer ? magazineArticleEditPath(community.slug, slug) : null`, at most `PICKER_LIMIT`. The procedure builds `PickerContext` from `ctx` (`locale: routing.defaultLocale`, like the rest of the editor API). Keep `availableArticles` for now (Task 3 removes its last caller).
- [ ] **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/items && <DB test prefix> pnpm vitest run src/server/api/routers/magazines.integration.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(magazines): picker source registry with the article source`.

---

## Task 3: Builder — generic "Add more" tabs, picker panel and intro editing

**Files:**
- Create: `src/components/magazines/editor/builder/picker-panel.tsx`, `picker-panel.test.tsx`, `item-details-panel.tsx`, `item-details-panel.test.tsx`, `builder/items/reference.ts`
- Modify: `builder/items/{types.ts,registry.tsx,article.ts,editorial.tsx,registry.test.tsx}`, `builder/{add-items-panel.tsx,issue-builder.tsx,items-model.ts,items-model.test.ts,live-preview.tsx,issue-builder.test.tsx}`, `src/server/api/routers/magazines.ts` (remove `availableArticles`), `messages/{en,nl}.json`
- Test: as listed

**Interfaces:**
- Consumes: `pickerCandidates` (Task 2), `itemTitle` (`src/components/magazines/items/registry.tsx`), `useDebouncedValue` (`src/hooks/use-debounced-value.ts`), `itemReference`.
- Produces:
  ```ts
  // builder/items/types.ts
  /** Was a closed union ("article" | "editorial" | …); now every kind id is a label key by construction,
      so Tasks 4–8 need no edit here — each adds `magazineEditor.builder.items.<kind>` in its copy step. */
  export type BuilderItemsMessage = ItemKindId | "editorialEmpty" | "openArticle";
  export type AddedContent = { title: string | null; openHref: string | null };
  export type AddPanelProps = { communitySlug: string; referencesInIssue: ReadonlySet<string>;
    onAdd: (input: IssueItemInput, added: AddedContent) => void };
  // BuilderItemKind<K> gains:  readonly AddPanel: ComponentType<AddPanelProps>;
  // BuilderItemEditorProps<K> loses onDone (the details panel owns Done).
  // builder/items/registry.tsx
  export const ADD_TAB_ORDER: readonly ItemKindId[]; // ["article", "editorial"] now; each kind task inserts its id
  // builder/items/reference.ts
  export function referenceBuilderKind<K extends PickableKindId>(opts: {
    kind: K; labelKey: BuilderItemsMessage; referenceOf: (item: BuilderItemOf<K>) => string; openLabelKey?: BuilderItemsMessage;
  }): BuilderItemKind<K>;
  // picker-panel.tsx
  export function PickerPanel(props: AddPanelProps & { kind: PickableKindId }): JSX.Element;
  // item-details-panel.tsx
  export function ItemDetailsPanel(props: { item: BuilderItem; kindLabel: string;
    onChange: (patch: Partial<BuilderItem>) => void; onDone: () => void }): JSX.Element;
  ```
  `referenceBuilderKind` behaviour: `rowTitle` = the saved view's `itemTitle` (when not a marker) ?? `titleHint` ?? `t(labelKey)`; `isSavable: () => true`; `previewView(item, saved)` = `null` before the first save, the marker unchanged (with `itemId: item.key`) when saved is unavailable, else `{ ...saved, itemId: item.key, intro: item.intro ?? null }`; `referenceKey = referenceOf`; `AddPanel` = a module-level component rendering `<PickerPanel kind={kind} …/>`.

- [ ] **Step 1: Write the failing tests.**
  - `picker-panel.test.tsx` (mock `api.magazines.pickerCandidates.useQuery`): `it("searches the kind with the typed words after a pause")` — typing "eval" calls the query with `{ slug, kind: "article", query: "eval" }` only after the debounce (fake timers, 250 ms); `it("shows each candidate's facts in plain words")` — facts `[{type:"count",what:"sources",value:14},{type:"date",label:"updated",at:"2026-10-24T10:00:00.000Z"}]` render "14 sources" and "Updated 24 Oct 2026" (en; dates through `formatEventDay`, Decision 10); `it("leaves out what the issue already holds and moves focus after Add")` — a candidate whose `reference` is in `referencesInIssue` is not listed (the panel filters and tracks focus by `candidate.reference`, never by a kind's id field); clicking Add calls `onAdd(input, { title, openHref })` and focus lands on the next row's Add button, else the empty text; `it("says nothing matches a search")` — empty result with a query shows `noMatch` with the query.
  - `item-details-panel.test.tsx`: `it("edits the intro line of any item")` — typing into "Intro line (optional)" calls `onChange({ intro: "Our take" })`; clearing it calls `onChange({ intro: undefined })`; the input has `maxLength` 280; `it("shows the kind's own editor under the intro")` — an editorial item shows the heading field, an article item does not.
  - `issue-builder.test.tsx`: replace `availableArticles` mocks with `pickerCandidates`; add `it("adding the same article twice keeps one item")` (call the AddPanel's `onAdd` twice with the same article input → one row); `it("every row opens the details panel and the preview shows the intro")` — select the article row, type an intro, the live preview card shows it.
  - `builder/items/registry.test.tsx`: `it("offers one add tab per kind")` — `ADD_TAB_ORDER` is a permutation of `Object.keys(BUILDER_ITEM_KINDS)`.
  - `items-model.test.ts`: delete the `addEditorial` describe block and import (the function is removed in Step 3).
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines/editor` → FAIL.
- [ ] **Step 3: Implement.** `AddItemsPanel` renders one tab per `ADD_TAB_ORDER` entry (`t(\`tabs.${kind}\`)`, `TabsList` wraps on narrow screens) with the kind's `AddPanel`; default tab `article`. `PickerPanel` is the old `ReadyArticles` made generic: a labelled search input (`search.<kind>` as label and placeholder), the list keyed, filtered (`!referencesInIssue.has(c.reference)`) and focus-tracked by `candidate.reference` (title + facts line: Sans for bylines/sources, Mono for counts and dates; date facts formatted with `formatEventDay(at, locale)`), `hint.<kind>` under the list, Skeleton / ErrorState / empty (`empty.<kind>`, or `noMatch` with a query). Editorial's `AddPanel` is the hint + "Add a text section" button calling `onAdd({ kind: "editorial", body: null }, { title: null, openHref: null })`. In `issue-builder.tsx` one `handleAdd(input, added)` replaces `handleAddArticle`/`handleAddEditorial`: `addItem`; `items-model.ts` `addEditorial` loses its last caller, so remove it (and its test block); store `added.title` as title hint; store `added.openHref` under the item's reference; if the kind has an `Editor`, open the details panel on it, mark it untouched when not savable and focus its first field. Every row gets `onEdit` (details panel). `onItemsSaved` invalidates `utils.magazines.pickerCandidates`. Article moves onto `referenceBuilderKind({ kind: "article", labelKey: "article", referenceOf: (i) => articleReference(i.articleId), openLabelKey: "openArticle" })`. The editorial editor drops its own section wrapper and Done button. Remove the `availableArticles` procedure and `AddableArticle`. Live preview's "unsavedArticles" note becomes `unsavedItems`.
- [ ] **Step 4: Copy (en + nl), replacing the old `add.*` keys** (`articles`, `articlesEmpty`, `editorialHint`, `addEditorial`, `addArticle`, `loadFailed`, `byAuthor` — replaced by `add.facts.byline` — and `editorial` — replaced by `add.tabs.editorial`): `add.tabs.{article: "Articles", editorial: "Text"}`, `add.search.article` "Search ready articles", `add.empty.article` "No articles are ready. Articles marked ready for an issue show up here.", `add.hint.article` "Only articles marked ready and not in another issue show here.", `add.noMatch` "Nothing matches “{query}”.", `add.addItem` "Add {title} to the issue", `add.loadFailed` "This list could not be loaded.", `add.editorialHint` (existing text), `add.addEditorial` "Add a text section", `add.facts.{byline: "By {name}", updated: "Updated {date}", published: "{date}", starts: "{date}", lastActive: "Last reply {date}", sources: "{count, plural, one {# source} other {# sources}}", replies: "{count, plural, one {# reply} other {# replies}}", upvotes: "{count, plural, one {# upvote} other {# upvotes}}", cancelled: "Cancelled", completed: "Took place"}`, `details.{intro: "Intro line (optional)", introHelp: "One line shown above this item in the issue.", done: "Done"}`, `preview.unsavedItems` "Items you just added show here once they are saved." Grep both files for every removed key and for leftover uses.
- [ ] **Step 5: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines && pnpm typecheck && pnpm lint` → PASS; `<DB test prefix> pnpm vitest run src/server/api/routers/magazines.integration.test.ts` → PASS.
- [ ] **Step 6: Commit** — `feat(magazines): generic add-more tabs, picker panel and intro editing`. (Before the visual check: "Running the app" exports `git archive HEAD`, so it only sees committed code.)
- [ ] **Step 7: Visual check** (Global Constraints "Running the app", exported after the Step 6 commit) of the builder at 390px and 1440px, light and dark, en and nl: tabs wrap, picker rows do not overflow, the details panel shows the intro field for an article row. Fix anything found in a follow-up commit (`fix(magazines): …`), re-run Step 5, re-export and re-check.

---

## Task 4: `storyline` kind (and the slice migration)

Every kind task from here has the same shape: block → migration piece → types → strategy → picker source → renderer → builder file → copy → tests. Later tasks say only what differs.

**Files:**
- Create: `src/server/magazines/items/storyline/{block,kind,picker,kind.test}.ts`, `src/migrations/20261026b_magazine_platform_items.ts`, `src/migrations/magazine-platform-items.integration.test.ts`, `src/server/magazines/items/platform-kinds.integration.test.ts`, `src/components/magazines/items/storyline-item.tsx`, `src/components/magazines/editor/builder/items/storyline.ts`
- Modify: `src/server/news/storylines.ts`, `src/lib/magazines/{item-views,picker}.ts`, `items/{blocks,registry,pickers}.ts`, `src/components/magazines/items/registry.tsx` (+ its test), `builder/items/registry.tsx`, `src/components/magazines/test-fixtures.ts`, `src/migrations/index.ts`, `src/server/db/payload-schema-drift.ts`, `src/collections/magazines-schema.test.ts`, `src/payload-types.ts`, `messages/{en,nl}.json`

**Interfaces:**
- Consumes: Tasks 1–3; `publicStoryline`, `listStorylines` (`src/server/news/storylines.ts`).
- Produces:
  ```ts
  // src/server/news/storylines.ts — one query, any status
  export type StorylineCard = { id: string; slug: string; titleEn: string; titleNl: string; overviewEn: string;
    overviewNl: string; articleCount: number; latestAt: Date | null; isPublic: boolean };
  export async function loadStorylineCards(ids: readonly string[], database?: typeof db): Promise<Map<string, StorylineCard>>;
  // item-views.ts
  export type StorylineItemView = { kind: "storyline"; itemId: string; intro: string | null;
    storyline: { slug: string; title: string; overview: string; sourceCount: number; updatedAt: string | null } };
  // UnavailableItem.reason adds "unpublished"
  // block: slug "storyline", fields [...itemBaseFields, { name: "storylineId", type: "text", required: true }]
  // input: { kind: "storyline", id?, intro?, storylineId: z.string().min(1).max(255) }
  ```

- [ ] **Step 1: Block, migration and types.** Add `storylineItemBlock` and put it in `ISSUE_ITEM_BLOCKS` after `editorial`. Get Payload's exact DDL from a scratch database (never `aitcom_test`):

```bash
docker exec aitcom-postgres-1 createdb -U postgres aitcom_magazines_scratch
# PAYLOAD_PUSH=true only here, on the throwaway scratch database
SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 PAYLOAD_PUSH=true RESEND_API_KEY= \
  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_magazines_scratch \
  pnpm exec tsx scripts/payload-push.ts
docker exec aitcom-postgres-1 pg_dump -U postgres --schema-only -n public -t 'magazine_issues_blocks_*' \
  aitcom_magazines_scratch > "$TMPDIR/magazine-blocks-ddl.sql"   # outside the repo; read it, then delete it
docker exec aitcom-postgres-1 dropdb -U postgres aitcom_magazines_scratch
```

  Create `src/migrations/20261026b_magazine_platform_items.ts` in the style of `20261026a_magazines.ts` (header comment says why each table exists and that references are plain ids on purpose — ADR-0044; every statement `IF NOT EXISTS` / `DO $$ … duplicate_object`; `down` drops in reverse). It holds only the new block table (expected `magazine_issues_blocks_storyline` with `_order`, `_parent_id`, `_path`, `id`, `intro`, `storyline_id`, `block_name`, the order/parent/path indexes and the parent FK — use Payload's names from the dump if they differ). Register it in `src/migrations/index.ts` after `20261026a_magazines`. **Drift guard (core ruling F14 applies):** `GUARDED_PAYLOAD_TABLES` does not guard the existing `magazine_issues_blocks_article` / `_editorial` tables today. Guard block tables only after the read-only drift check at the end of this step is clean for them, and then guard all of them together (`magazine_issues_blocks_article`, `_editorial`, `_storyline`, and each later kind's table as its task adds it) — or none. Record the outcome as a ruling in this plan's `-rulings.md` (create it in the core rulings' format if missing) with the verify output summary; later kind tasks follow the same ruling (guard their table iff block tables are guarded). Write `magazine-platform-items.integration.test.ts` (style of `src/migrations/magazines.integration.test.ts`: refuses any database but `aitcom_test`; `EXPECTED_COLUMNS` = `["magazine_issues_blocks_storyline.storyline_id", "magazine_issues_blocks_storyline.intro"]`): `it("creates the block tables and can run twice")`, `it("down removes them, up restores them")`. Extend `magazines-schema.test.ts`: block slugs `["article","editorial","storyline"]`, every block's first field `intro`, migration source contains `CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_storyline"` and `index.ts` contains `name: "20261026b_magazine_platform_items"`. Run `<DB test prefix> pnpm vitest run src/migrations/magazine-platform-items.integration.test.ts` → PASS (applies the table to `aitcom_test`), then regenerate Payload types (Global Constraints) and check the diff holds only the storyline block. Read-only drift check: `env -i PATH="$PATH" HOME="$HOME" SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test PAYLOAD_SECRET=local-check pnpm exec tsx scripts/db-verify-payload-schema.ts` → no missing columns.
- [ ] **Step 2: Write the failing unit tests** `storyline/kind.test.ts` (fake `loadStorylineCards` injected by `vi.mock("@/server/news/storylines")`):
  - `it("loads every story of an issue in one query")` — three items → `loadStorylineCards` called once with the three ids.
  - `it("shows a public story live, marks unpublished and deleted ones")` — editor context: public card → view with `sourceCount` 14, `updatedAt` ISO, `overview` cut to 40 words with "…" (`cutWords`); `isPublic: false` → marker `unpublished`; absent id → `missing`. Reader context through `loadIssueItemViews`: only the public one.
  - `it("falls back to English text when the Dutch text is empty")` — locale `nl`, `titleNl: ""`, `overviewNl: "  "` → English title and overview; with Dutch text → Dutch.
  - `it("refuses a new story that is not public, accepts it when kept")` — `isNew: true` + `isPublic: false` → `{ itemIndex, code: "ITEM_INVALID" }`; `isNew: false` → no problem; unknown id new → `ITEM_INVALID`.
  - `it("refuses a duplicate story")` — two items with one `storylineId` → second gets `ITEM_INVALID` with `detail: "duplicate"`, kept or not.
  - `it("round-trips input and keeps the intro")` — `toStored({ kind:"storyline", storylineId:"s1", intro:" Our take " })` → `{ intro: "Our take", storylineId: "s1" }`; `toInput` back; `referenceOf` → `"storyline:s1"`.
- [ ] **Step 3: Run** → FAIL. **Implement** `loadStorylineCards` next to `publicStoryline` (select the story columns plus the module's `articleCount`, `latestAt` and the public rule, where `id in ids`; empty ids → empty map without a query). `publicStoryline` is `and(...)`, typed `SQL | undefined`, and a bare SQL field in the select list makes Drizzle reprint columns without table names (comment at `storylines.ts:104-107`), so wrap every computed column exactly as `listStorylines` does: `articleCount: sql<number>\`${articleCount}\``, `latestAt: sql<Date | null>\`${latestAt}\``, `isPublic: sql<boolean>\`(${publicStoryline!})\``. Implement the strategy: `load` per access with an exhaustive `switch` like `articleReadingFor` (both levels read live content; the registry turns markers into skips for readers); `isReadable` exhaustive `true`; `validate` batch-loads the cards once, then returns `validateReferences(items, { referenceOf, acceptNew: (s) => cards.get(s.storylineId)?.isPublic === true })`; the overview uses `cutWords(overview, 40)`. Add `"storyline"` to `PICKABLE_ITEM_KINDS`; the picker source (importing `PICKER_LIMIT` from `@/lib/magazines/picker`) calls `listStorylines({ q: query, limit: PICKER_LIMIT })` (public stories only, its escaping and ranking) and maps to `{ input: { kind: "storyline", storylineId }, title (locale fallback), facts: [count sources, date updated (latestAt)], openHref: null }`. Register in `ITEM_KINDS`, `ITEM_PICKERS`.
- [ ] **Step 4: Renderer and builder.** `StorylineItem`: kind line "From AIT News", title linking to `/news/stories/${slug}` (`Link`), the intro (as the article card shows it), the overview (lead: full excerpt; otherwise 3-line clamp), a Mono facts line "14 sources · Updated 24 Oct 2026" (`formatEventDay(updatedAt, locale)`, Decision 10 — not `format.dateTime`), and when `lead`, a "Read the story" link. `storylineItemTitle = (v) => v.storyline.title`. Builder: `referenceBuilderKind({ kind: "storyline", labelKey: "storyline", referenceOf: (i) => itemReference("storyline", i.storylineId) })` (`labelKey` type-checks because `BuilderItemsMessage` includes every `ItemKindId` since Task 3); insert `"storyline"` in `ADD_TAB_ORDER` after `article`. Add `storylineView()` to `test-fixtures.ts`; extend the render registry test with `it("renders a story card that links to the story")` (asserts the facts line reads "14 sources · Updated 24 Oct 2026").
- [ ] **Step 5: Copy (en + nl):** `magazines.item.{storylineKind: "From AIT News", sources (plural), updated: "Updated {date}", readStory: "Read the story"}`, `magazines.item.unavailableReason.unpublished` "This was taken offline. Readers skip it until it is back.", `magazineEditor.builder.items.storyline` "Story", `add.tabs.storyline` "Stories", `add.search.storyline` "Search AIT News stories", `add.empty.storyline` "No stories found.", `add.hint.storyline` "Stories stay live: readers always see the newest version."
- [ ] **Step 6: DB test** — create `platform-kinds.integration.test.ts` (fixtures: two `newsItems` and one `newsStorylines` row with two `newsStorylineArticles` memberships whose `noteEn` is set and whose `evidence` is a ≥ 12-character substring of the news title, so `publicStoryline` holds; a magazine + draft issue through the services; cleanup deletes the story rows): `it("a story loads live and drops out when unpublished")` — load as reader shows the current title; update the title → the next load shows the new one (no snapshot); set `status: "draft"` → reader gets nothing, editor gets `unpublished`. `it("setIssueItems accepts a public story and refuses a draft one")`. `it("the stories tab searches public stories only")` — through `searchPickerCandidates("storyline", …)`.
- [ ] **Step 7: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines src/components/magazines src/collections src/server/news && <DB test prefix> pnpm vitest run src/server/magazines src/migrations/magazine-platform-items.integration.test.ts && pnpm typecheck` → PASS.
- [ ] **Step 8: Commit** — `feat(magazines): AIT News stories as issue items`.

---

## Task 5: `newsItem` kind

**Files:** Create `items/newsItem/{block,kind,picker,kind.test}.ts`, `src/components/magazines/items/news-item.tsx`, `builder/items/news-item.ts`. Modify the Task 4 list (migration, drift guard, schema test, types, registries, picker kinds, fixtures, copy), `src/server/news/list.ts`, `platform-kinds.integration.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // src/server/news/list.ts
  export async function findNewsItemsByIds(ids: readonly string[], database?: typeof db): Promise<Map<string, NewsListItem>>; // one query, no AI flags
  export async function searchNewsItems(query: string, limit: number, database?: typeof db): Promise<NewsListItem[]>;
    // title ilike %escapeLike(query)% (src/server/db/escape-like.ts — no hand-written escaping); newest first (publishedAt desc nulls last, createdAt desc); empty query = newest
  // item-views.ts
  export type NewsItemView = { kind: "newsItem"; itemId: string; intro: string | null;
    news: { url: string | null; title: string; source: string | null; publishedAt: string | null; summary: string } };
  // block: slug "newsItem", field { name: "newsItemId", type: "text", required: true }
  ```
  `url` is the item's URL only when it starts with `http://` or `https://` (else null: the card shows no link); `source` is its hostname without `www.`; `summary` = `cutWords(aiSummary ?? summary, 30)`. `validate` loads the batch once (`findNewsItemsByIds`) and returns `validateReferences(items, { referenceOf, acceptNew: (s) => found.has(s.newsItemId) })`.

- [ ] **Step 1: Block + migration piece + types** exactly as Task 4 Step 1 (append the `newsItem` block table to the same migration's `up`/`down`; extend `EXPECTED_COLUMNS` with its `news_item_id` column using Payload's dumped table name; schema test slugs gain `"newsItem"`).
- [ ] **Step 2: Failing unit tests** `newsItem/kind.test.ts`: `it("loads every news item of an issue in one query")`; `it("shows the headline with its source and marks a deleted one")` (`url: "https://www.example.com/a"` → `source: "example.com"`; missing → `missing`); `it("never links a non-web address")` (`url: "javascript:alert(1)"` → view `url: null`); `it("refuses an unknown new item and a duplicate")`; round-trip + `referenceOf` → `"newsItem:<id>"`.
- [ ] **Step 3: Implement** the list functions, strategy and picker (`facts: [source host, date published]`), registries, `PICKABLE_ITEM_KINDS` += `"newsItem"`.
- [ ] **Step 4: Renderer and builder.** `NewsItemCard` (compact): kind line "From AIT News", title as an external `<a target="_blank" rel="noopener noreferrer">` with sr-only "(opens in a new tab)" (plain text when `url` is null), Mono "example.com · 01 Nov 2026" (`formatEventDay(publishedAt, locale)`, Decision 10; the render test asserts this exact text), intro, summary only when `lead`. Builder tab after `storyline`.
- [ ] **Step 5: Copy (en + nl):** `magazines.item.{newsKind: "From AIT News", opensInNewTab}`, builder `items.newsItem` "News", `add.tabs.newsItem` "News", `add.search.newsItem` "Search news headlines", `add.empty.newsItem` "No headlines found.", `add.hint.newsItem` "Headlines link to the original article."
- [ ] **Step 6: DB test** in `platform-kinds.integration.test.ts`: `it("a news item loads live and becomes missing when deleted")`; `it("the news tab finds headlines by words in the title, including % and _")`.
- [ ] **Step 7: Run** the Task 4 Step 7 commands → PASS. **Commit** — `feat(magazines): news headlines as issue items`.

---

## Task 6: `event` kind and the community content rule

**Files:** Create `src/lib/events/event-status.ts` (+ `event-status.test.ts`), `src/server/magazines/items/community-content.ts` (+ test), `items/event/{block,kind,picker,kind.test}.ts`, `src/components/magazines/items/event-item.tsx`, `builder/items/event.ts`. Modify the Task 4 list, `src/server/agent/event-delivery-audience.ts`, `src/app/[locale]/events/[slug]/page.tsx`, `src/server/communities/forum-scope.ts` (+ its test), `platform-kinds.integration.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // src/lib/events/event-status.ts
  export const PUBLICLY_LISTED_EVENT_STATUSES = ["published", "cancelled", "completed"] as const;
  export function isPubliclyListedEventStatus(status: string | null | undefined): boolean;
  // items/community-content.ts
  export type CommunityContentRule = { readable(communityId: string | null | undefined): boolean;
    membersOnly(communityId: string | null | undefined): boolean };
  export async function loadCommunityContentRule(reader: ItemReader, access: IssueReaderAccess): Promise<CommunityContentRule>;
  //   null id: readable, not membersOnly. Exhaustive switch on access: `editor` loads both sets;
  //   `full` loads only the hidden set and membersOnly() is always false (Decision 4).
  // src/server/communities/forum-scope.ts — the Hub-aware scope, now shared by events and threads (Decision 6)
  export function communityContentWhere(community: CommunityRef): Where;        // body of today's forumThreadCommunityWhere
  export function communityContentMatches(communityId: string | null | undefined, community: CommunityRef): boolean;
  //   forumThreadCommunityWhere / forumThreadMatchesCommunity become one-line delegates (callers unchanged)
  // item-views.ts
  export type EventItemView = { kind: "event"; itemId: string; intro: string | null; membersOnly: boolean;
    event: { slug: string; title: string; date: string; endDate: string | null; city: string | null; online: boolean;
             status: "published" | "cancelled" | "completed" } };
  export function isMembersOnlyView(view: EditorItemView): boolean; // "membersOnly" in view && view.membersOnly
  // UnavailableItem.reason adds "no_access"
  // block: slug "event", field { name: "eventId", type: "number", required: true }
  ```

- [ ] **Step 1: Shared event status.** Test `it("lists published, cancelled and completed events only")`. Replace the private `LISTED_EVENT_STATUSES` in `event-delivery-audience.ts` with the shared constant, and the event page's two `{ status: { not_in: ["draft", "rejected"] } }` with `{ status: { in: [...PUBLICLY_LISTED_EVENT_STATUSES] } }` (same set over the five options). Run `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/agent src/lib/events "src/app/[locale]/events"` → PASS.
- [ ] **Step 1b: Shared Hub-aware scope.** In `forum-scope.ts` extract `communityContentWhere` / `communityContentMatches` (signatures above) and make the two forum functions delegate. Test: `it("the Hub also gets content with no community; other communities only their own")` for both functions; the existing forum-scope tests stay green unchanged.
- [ ] **Step 2: Community content rule.** Test with a fake reader: `it("reads hidden and members-only communities once for an editor")`; `it("a reader's rule reads only the hidden set")` — `full` access never calls `membersOnlyCommunityIds()` and `membersOnly()` is `false`; `it("Hub content without a community is readable and not members-only")`; `it("a hidden community is not readable; a private one is members-only")`.
- [ ] **Step 3: Block + migration piece + types** as Task 4 Step 1 (`event_id` column).
- [ ] **Step 4: Failing unit tests** `event/kind.test.ts`: `it("loads every event of an issue in one query, live documents only")` — one `payload.find({ collection: "events", where: { id: { in } }, draft: false, depth: 0, locale })`; `it("marks draft and rejected events unpublished and private ones no_access")`; `it("shows a cancelled event with its status")`; `it("flags events of a members-only community")` — editor context → `membersOnly: true`; reader context → `false`; `it("refuses a new event that is unlisted, another community's or unknown alike")` — each → `ITEM_INVALID` without `detail`; kept unlisted event → no problem; duplicate → `detail: "duplicate"`; `it("the Hub's magazine accepts the Hub's events with no community")` — a new listed event with no `communityId` is accepted for the Hub, refused for any other community.
- [ ] **Step 5: Implement.** Load: missing → `missing`; status not listed → `unpublished`; `!rule.readable(communityId)` → `no_access`; else view (`online = format === "online"`, see `EVENT_FORMAT_OPTIONS` in `src/lib/event-metadata.ts`). Validate: one batched load, then `validateReferences(items, { referenceOf, acceptNew })` where `acceptNew` = exists, listed status, `communityContentMatches(event.communityId, ctx.community)`, readable by the editor. Picker: `{ status in listed } AND communityContentWhere(ctx.community)` AND, only when the query is not empty, `{ title: { like: query } }` (as the article picker does), `sort: "-date"`, `draft: false`, `limit: PICKER_LIMIT`; facts `[date starts, eventStatus when cancelled/completed]`. `PICKABLE_ITEM_KINDS` += `"event"`.
- [ ] **Step 6: Renderer and builder.** `EventItem`: kind line "Event", title → `/events/${slug}`, Mono day from `formatEventDayRange(date, endDate, locale)` (`src/lib/event-time.ts`), "· Amsterdam" or "· Online", a muted `Badge` "Cancelled" / "Took place" for those statuses, intro. Builder tab after `newsItem`.
- [ ] **Step 7: Copy (en + nl):** `magazines.item.{eventKind: "Event", online: "Online", cancelled: "Cancelled", completed: "Took place"}`, `unavailableReason.no_access` "This is private to its community. Only people who can open it see it.", builder `items.event` "Event", `items.membersOnly` "Only members see this", `add.tabs.event` "Events", `add.search.event` "Search your community's events", `add.empty.event` "Your community has no events yet.", `add.hint.event` "Events of your community. Readers see the latest details." (ADR-0044 records that the Hub's magazine also offers the Hub's events with no community.)
- [ ] **Step 8: DB test:** `it("an event of an unlisted community loads for members, not for outsiders")` (two readers through `loadIssueItemViews` with `itemContextFor`); `it("the events tab offers only this community's listed events")` (a draft event and another community's event are not offered; an empty query lists them all).
- [ ] **Step 9: Run** the Task 4 Step 7 commands plus `src/server/agent` → PASS. **Commit** — `feat(magazines): community events as issue items`.

---

## Task 7: `forumThread` kind

**Files:** Create `items/forumThread/{block,kind,picker,kind.test}.ts`, `src/components/magazines/items/forum-thread-item.tsx`, `builder/items/forum-thread.ts`. Modify the Task 4 list and `platform-kinds.integration.test.ts`.

**Interfaces:**
- Consumes: `forumThreadMatchesCommunity`, `forumThreadCommunityWhere`, `forumThreadSitemapPath` (`src/server/communities/forum-scope.ts`), `loadCommunityContentRule` (Task 6).
- Produces:
  ```ts
  export type ForumThreadItemView = { kind: "forumThread"; itemId: string; intro: string | null; membersOnly: boolean;
    thread: { path: string; title: string; replyCount: number; authorName: string | null; lastActivityAt: string | null } };
  // path is built on the server: forumThreadSitemapPath(thread, new Map([[ctx.community.id, ctx.community.slug]]))
  //   → `/communities/${communitySlug}/forum/${slug}` (Hub slug for a thread with no community), the same link
  //   thread-card.tsx and activity-row.tsx use. A thread with no slug (path null) loads as `missing`.
  // block: slug "forumThread", field { name: "threadId", type: "number", required: true }
  ```

- [ ] **Step 1: Block + migration piece + types** as Task 4 Step 1 (`thread_id` column).
- [ ] **Step 2: Failing unit tests:** `it("loads every thread of an issue in one query")`; `it("a deleted thread is missing, a private one is no_access")`; `it("counts replies even when Payload returns them as text")` (`replyCount: "42"` → 42); `it("links to the thread on its community's forum")` (`path` is `/communities/<slug>/forum/<thread-slug>`); `it("refuses another community's thread")` — new thread whose `communityId` is another community → `ITEM_INVALID`; an unscoped thread is accepted only in the Hub's magazine (`forumThreadMatchesCommunity`).
- [ ] **Step 3: Implement.** Load: missing or `isDeleted` → `missing`; unreadable → `no_access`; else the view with its server-built `path`. Validate: one batched load, then `validateReferences(items, { referenceOf, acceptNew })` where `acceptNew` = exists, not deleted, `forumThreadMatchesCommunity(thread.communityId, ctx.community)`, readable by the editor. Picker: `forumThreadCommunityWhere(ctx.community)` AND `isDeleted not_equals true` AND, only when the query is not empty, `{ title: { like: query } }`, `sort: "-lastActivityAt"`, `limit: PICKER_LIMIT`; facts `[count replies, date lastActive, byline]`. `PICKABLE_ITEM_KINDS` += `"forumThread"`.
- [ ] **Step 4: Renderer and builder.** `ForumThreadItem`: kind line "From the forum", title → the view's `thread.path` (the community forum page, which applies the reader's own check; the renderer never builds the link itself), "By Name", Mono "42 replies", intro. Builder tab after `event`.
- [ ] **Step 5: Copy (en + nl):** `magazines.item.{forumKind: "From the forum", replies (plural)}`, builder `items.forumThread` "Forum thread", `add.tabs.forumThread` "Forum", `add.search.forumThread` "Search your community's forum", `add.empty.forumThread` "No threads found.", `add.hint.forumThread` "Threads stay live: readers see new replies too."
- [ ] **Step 6: DB test:** `it("a thread soft-deleted after it was added becomes a marker")`; `it("the forum tab offers this community's threads only")` (an empty query lists them all).
- [ ] **Step 7: Run** the Task 4 Step 7 commands → PASS. **Commit** — `feat(magazines): forum threads as issue items`.

---

## Task 8: `launchpadProject` kind

**Files:** Create `items/launchpadProject/{block,kind,picker,kind.test}.ts`, `src/components/magazines/items/launchpad-project-item.tsx`, `builder/items/launchpad-project.ts`. Modify the Task 4 list and `platform-kinds.integration.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export type LaunchpadProjectItemView = { kind: "launchpadProject"; itemId: string; intro: string | null; membersOnly: boolean;
    project: { slug: string; title: string; pitch: string; stage: "idea" | "prototype" | "mvp" | "launched"; voteCount: number; authorName: string | null } };
  // LaunchpadProjects.pitch is richText (Lexical): the view's pitch = cutWords(lexicalPlainText(project.pitch), 40)
  //   (`src/lib/lexical-text.ts`), never the raw editor state.
  /** Decision 6: the project's community, or an unscoped project by an active member. One membership query per batch. */
  export async function communityProjectFilter(deps: Pick<Deps, "db">, community: ItemCommunity,
    projects: readonly { communityId?: string | null; authorId?: string | null }[]): Promise<(p) => boolean>;
  // block: slug "launchpadProject", field { name: "projectId", type: "number", required: true }
  ```

- [ ] **Step 1: Block + migration piece + types** as Task 4 Step 1 (`project_id` column).
- [ ] **Step 2: Failing unit tests:** `it("loads every project of an issue in one query")`; `it("draft and archived projects are unpublished, private ones no_access")`; `it("refuses a project outside the community")` — unscoped project by a non-member and a project of another community → `ITEM_INVALID`; unscoped project by an active member → accepted; `it("checks membership for a whole batch in one query")`; `it("shows the pitch as plain text")` — a Lexical `pitch` state → plain words, cut to 40 with "…".
- [ ] **Step 3: Implement.** `communityProjectFilter` queries `communityMemberships` once (`communityId = community.id`, `status = "active"`, `userId in` the batch's author ids). Picker: `status equals published` AND `or: [{ communityId: { equals: ctx.community.id } }, { communityId: { exists: false } }]` (so the limit applies to this community's candidates, not the platform's top projects) AND, only when the query is not empty, `{ title: { like: query } }`, `sort: "-voteCount"`, `limit: 50`, then `communityProjectFilter` (which decides the unscoped ones by membership), then the first `PICKER_LIMIT`; facts `[count upvotes, byline]`. Load: not `published` → `unpublished`; unreadable → `no_access`. Validate: one batched load, then `validateReferences(items, { referenceOf, acceptNew })` where `acceptNew` = exists, published, passes `communityProjectFilter`, readable by the editor. `PICKABLE_ITEM_KINDS` += `"launchpadProject"`.
- [ ] **Step 4: Renderer and builder.** `LaunchpadProjectItem`: kind line "Launchpad project", title → `/launchpad/${slug}`, pitch (clamped unless lead), stage label from the existing `launchpad.stage.{idea,prototype,mvp,launched}` messages (`useTranslations("launchpad.stage")`; no new stage keys), Mono "120 upvotes", "By Name", intro. Builder tab last before `editorial`.
- [ ] **Step 5: Copy (en + nl):** `magazines.item.{projectKind: "Launchpad project", upvotes (plural)}`, builder `items.launchpadProject` "Project", `add.tabs.launchpadProject` "Projects", `add.search.launchpadProject` "Search your members' projects", `add.empty.launchpadProject` "No projects found.", `add.hint.launchpadProject` "Projects from your community or by its members."
- [ ] **Step 6: DB test:** `it("an archived project drops out for readers and is marked for editors")`; `it("the projects tab offers community projects and members' unscoped projects")` — include 50+ higher-voted published projects of another community: this community's lower-voted project is still offered; an empty query lists them all.
- [ ] **Step 7: Run** the Task 4 Step 7 commands → PASS. **Commit** — `feat(magazines): launchpad projects as issue items`.

---

## Task 9: Per-reader guarantees across kinds, editor signals and the final pass

**Files:**
- Create: `src/server/magazines/platform-items-reading.integration.test.ts`
- Modify: `builder/{item-row.tsx,issue-builder.tsx,live-preview.tsx,publish-dialog.tsx}` (+ their tests), `src/server/magazines/reading.ts` (drop `IssueCard.itemCount`), `src/components/magazines/reading/featured-issue.tsx`, the existing test that renders `FeaturedIssue` (grep `magazines-home` / `magazine-tab` tests; else create `featured-issue.test.tsx`), `src/components/magazines/test-fixtures.ts`, `messages/{en,nl}.json`
- Test: as listed

**Interfaces:**
- Consumes: `isMembersOnlyView`, `isUnavailableItem`; `loadIssuePage`, `setIssueItems`, `publishIssue`, `getIssueForEditing`.
- Produces: `ItemRowView.membersOnly: boolean`; `PublishDialog` prop `skippedCount: number`; `LivePreview` visitor mode filters with `visibleToVisitors(view: EditorItemView): boolean` (exported from `live-preview.tsx`): not a marker and not members-only.

- [ ] **Step 1: Write the failing DB tests** (`platform-items-reading.integration.test.ts`; fixtures: an **unlisted** community with owner, member and an outsider user; a magazine; one public story, one news item, one listed event, one thread and one published project of that community; one draft issue holding all five, made `public` with the opt-in confirmed, then published):
  - `it("a public issue never widens access to community content")` — `loadIssuePage` anonymous and as outsider: item kinds `["storyline", "newsItem"]`, and the page data contains no event/thread/project title; as member: all five; as editor: all five, the three community items with `membersOnly: true`; as member: `membersOnly: false` on every view (readers never get the flag).
  - `it("content that goes away becomes a marker and never blocks the editor")` — the issue order is story, news, event, thread, project; unpublish the story, soft-delete the thread, archive the project; reader page **read as the member** (the event is unlisted-community content): news item, event left, the news item is now the lead (first item); editor (`getIssueForEditing` through the router caller): markers `unpublished`, `missing`, `unpublished` and `problems: []`; `setIssueItems` with the same items plus a changed intro on the news item → saves; the intro shows to readers.
  - `it("loads each kind once per page")` — wrap `payload.find` and count calls per collection during one `loadIssuePage` as the signed-in member: `events`, `forum-threads`, `launchpad-projects` once each; and spy on `hiddenContentCommunityIds` (`vi.spyOn` on the `@/server/communities/content-visibility-queries` module namespace, or `vi.mock` with the real implementation passed through) → called exactly once with the member's id during that `loadIssuePage` (Decision 7: the community content rule loads at most once per page; members-only sets are not needed by readers).
  - `it("the article page loads only articles")` — during one `loadMagazineArticlePage`, `payload.find` is never called for `events`, `forum-threads`, `launchpad-projects`, and `hiddenContentCommunityIds` is not called (Decision 13).
- [ ] **Step 2: Write the failing component tests:** `live-preview.test` `it("visitor preview leaves out members-only items and markers")`; `item-row` `it("says when only members see an item")` ("Only members see this" in the kind line); `publish-dialog.test` `it("says how many items readers will skip")` — `skippedCount: 2` → "2 items are no longer available. Readers will not see them." and Publish stays enabled; 0 → no line; `FeaturedIssue` test `it("shows no item count on the cover")` — the cover card renders no "N items" text (Decision 12). Remove `itemCount` from `IssueCard` in `reading.ts` and from `test-fixtures.ts`; the issue page's contents list keeps its count (`issue-contents.tsx` counts the items this reader actually gets), so the `magazines.issue.itemCount` message stays.
- [ ] **Step 3: Run** → the DB tests pass or fail per the kinds' work (fix any kind that leaks — a leak is a bug in that kind's `load`, never patched in the page); component tests FAIL. **Implement** the row flag, the preview filter (member and phone modes unchanged), `skippedCount` (count of saved views that are markers) and the cover-card count removal.
- [ ] **Step 4: Copy (en + nl):** `magazineEditor.builder.publish.skipped` "{count, plural, one {# item is no longer available. Readers will not see it.} other {# items are no longer available. Readers will not see them.}}". Then check both message files hold the same keys: `node -e 'const f=(o,p="")=>Object.entries(o).flatMap(([k,v])=>typeof v==="object"?f(v,p+k+"."):[p+k]);const en=new Set(f(require("./messages/en.json")));const nl=new Set(f(require("./messages/nl.json")));console.log([...en].filter(k=>!nl.has(k)),[...nl].filter(k=>!en.has(k)))'` → `[] []`.
- [ ] **Step 5: Tests on the working tree:** `SKIP_ENV_VALIDATION=1 pnpm vitest run` (whole suite) → PASS; `<DB test prefix> pnpm vitest run src/server src/migrations src/collections` → PASS, nothing skipped; `pnpm typecheck && pnpm lint` → clean.
- [ ] **Step 6: Commit** — `feat(magazines): members-only signals, skipped-item notice and cross-kind reading tests`; `git status --short` → clean. (The visual check and the build below export `HEAD`, so they must run after this commit.)
- [ ] **Step 7: Visual check** (Global Constraints "Running the app", exported after the Step 6 commit; seed the fixture shape above in `aitcom_test` by hand through the editor UI): the issue page at 390, 1024, 1440 and 1600px, light and dark, en and nl, signed out and as member — story, news, event, thread and project cards next to an article, no orange on cards, Dutch strings do not overflow; the builder: every tab searches, the intro line edits, the Visitor preview drops members-only items, the marker shows after unpublishing a story. Fix anything found in a follow-up commit and re-export.
- [ ] **Step 8: Production build from the export** (never `pnpm build`), after the last commit, on a fresh export: in `$X` from Global Constraints, `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test RESEND_API_KEY= PAYLOAD_SECRET=local-build-check BETTER_AUTH_SECRET=local-build-check pnpm exec next build` → succeeds. `git status --short` → clean; any fix goes in a follow-up commit, then re-run Step 5 and this step on a fresh export.

---

## Self-review notes

- Spec coverage: kinds `storyline`, `newsItem`, `event`, `forumThread`, `launchpadProject` (Tasks 4–8); picker that searches each kind (Tasks 2–3 + each kind); unavailable-item handling for readers and editors (Tasks 1, 4–9); "References, not copies" — live load and per-reader check (Decision 2, Tasks 4–9, Review Focus 1); "one place per kind" (one folder + one renderer + one builder file; registries only); i18n (every task's copy step + Task 9 parity check); DESIGN rules (Global Constraints + visual checks); migration (Decision 11). Out of scope by the spec's slices: `teaser` rendering (slice 6), `suggest`/auto-draft (slice 5), digest layout (slice 6, Decision 9).
- Type names used across tasks: `ItemReader`, `ItemCommunity`, `itemContextFor`, `IssueActor` (existing, reused — no `IssueEditor`), `itemReference`, `validateReferences`, `cutWords`, `loadIssueItemViewsOfKinds`, `PICKABLE_ITEM_KINDS`, `PickerCandidate` (with `reference`), `ITEM_PICKERS`, `PICKER_LIMIT` (in `src/lib/magazines/picker.ts`), `BuilderItemsMessage` (widened in Task 3), `communityContentWhere`, `referenceBuilderKind`, `AddPanelProps`, `ADD_TAB_ORDER`, `loadCommunityContentRule`, `isMembersOnlyView`, `PUBLICLY_LISTED_EVENT_STATUSES` — each defined once in the Interfaces block of the task that creates it.
