# Community Magazines — Core Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A community owner/admin can start a magazine, write magazine articles, assemble issues from those articles and editorial blocks, and publish them as members-only or public; readers find them in the community's Magazine tab and, when public, at `/magazines`.

**Architecture:** Magazines and issues are Payload collections with a text `communityId` (the `Courses` precedent); issue items are a Payload `blocks` field whose block list comes from an item-kind registry (Strategy: one module per kind with `validate`, batched `load`, `isReadable`, plus one renderer per kind). Every read path goes through one access resolver (`resolveMagazineIssueAccess`) or its query twin (`readableIssueWhere`). Magazine articles stay in `Articles` with a `magazine` relation; a named *publication channel* seam (`channelFor(article)`) decides how review, publish and credit work, so magazine articles skip the staff queue, never reach `/blog`, and are published and credited when their issue is published.

**Tech Stack:** Next.js App Router (RSC for reading pages), tRPC (editor mutations), Payload CMS 3.77 (collections, blocks, Lexical), Drizzle (communities, memberships, spaces), next-intl (en + nl), shadcn/ui primitives, `@dnd-kit/sortable` (already installed), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-26-community-magazines-design.md` (read fully). Shape reference: `docs/superpowers/specs/2026-10-26-community-magazines-mockup.html` screens 1 (`/magazines`), 2 (issue, member view) and 4 (issue builder). DESIGN.md wins over the mockup on tokens and components.

## Decisions this plan makes (spec gaps)

1. **Editors in slice 1 are the community's active owner/admin.** One predicate, `isMagazineEditorRole(role)`, is the seam that slice 3 replaces with per-magazine staff roles. Moderators are readers.
2. **An issue stores a concrete `visibility`**, copied from the magazine's `defaultVisibility` when the issue is created. The spec's "nullable = inherit" is not used: changing the magazine default must never silently re-expose an archive of members-only issues, and a concrete value lets `readableIssueWhere` be a plain query. The magazine default affects only new issues (the settings screen says so).
3. **Unlisted-community opt-in is recorded per value**: `publicConfirmedBy` / `publicConfirmedAt` on the magazine (for the default) and on the issue (for its visibility). Choosing `members` clears the record, so going back to `public` asks again. A new issue created from a confirmed public default copies the magazine's confirmation. The resolver treats `public` in a content-private community **without** a confirmation as `members` — so a listed community that later becomes unlisted does not leak its unconfirmed public issues.
4. **One magazine per community is a DB rule** (unique index on `magazines.community_id`). Dropping an index later is cheap; a race cannot create two.
5. **No `magazine.status` (archive) and no `scheduled` issue status in this slice.** Neither has behaviour in slice 1; slice 4 adds `scheduled` with scheduling. Issues are `draft | published`; a published issue cannot go back to draft in this slice (its visibility can change at any time).
6. **An article's placement is stored on the article** (`magazineIssue` relation), written only by the issue service, next to the `article` block that holds its order. This makes "an article appears in at most one issue" structural and gives every surface a cheap article → issue lookup.
7. **Magazine articles in slice 1 are written by editors.** "Mark ready" sets `reviewStatus = approved` directly (the editor is the review gate) without publishing or XP. Publishing, `ARTICLE_PUBLISHED` XP and the existing article badges fire on the draft → published transition when an issue containing the article is published (also when added to an already published issue). The new "Published in a magazine" badge is slice 3.
8. **Agent/MCP search, the sitemap and author profiles use the anonymous scope** (public issues only), whoever asks.
9. **The Magazine tab is a builtin space surface `magazine`**, created when the magazine is created, so the existing Spaces settings can rename, hide and reorder it. It is not part of the five default surfaces for new communities.
10. **One reading URL per issue**: `/magazines/[magazine]/[issue]` for every visibility; the resolver answers 404 for readers who may not see it. The `/magazines` home lists public issues only; the per-magazine shelf lists what the viewer may read.
11. **No magazine RSS feed in this slice.** The blog `feed.xml` excludes magazine articles.
12. **Issue slugs lock on publish** (links must not break); magazine slugs are editable (shelf links change; acceptable for slice 1, noted in the settings help text).

## Global Constraints

- Branch: `feat/community-magazines-core`, created by the controller (not a task agent) from `origin/main` once PR #495 (spec) is merged, or stacked on `feat/community-magazines-design` if it is not. Run `git branch --show-current` before every commit. Never `git checkout`/`git switch`, never `git stash`, never `git add -A` / `git add .` — stage files by name.
- No `Co-Authored-By` or any AI credit line in commits or PRs.
- Before Task 1 and again before opening the PR: `git fetch origin && git log origin/main --oneline | grep -i magazin; gh pr list --search magazine` — stop if another session shipped part of this.
- **Never** run `pnpm db:apply`, `pnpm db:push`, `pnpm build`, `drizzle-kit generate`, or anything with `.env`'s `DATABASE_URL` (it is production; prod applies migrations on merge).
- Unit test prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run`.
- **DB test prefix** (use exactly; never host port 5432 — it is an SSH tunnel to a remote DB):
  `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test`
  One-time setup if `aitcom_test` is not reachable: `pnpm dev:db`; `docker run -d --rm --name aitcom-test-pg-forward --network aitcom_default -p 127.0.0.1:55432:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp:postgres:5432`; `docker exec aitcom-postgres-1 createdb -U postgres aitcom_test`; `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test SKIP_ENV_VALIDATION=1 pnpm exec drizzle-kit push --force`. Never set `PAYLOAD_PUSH` against `aitcom_test` (if `.env.docker` is sourced, `unset PAYLOAD_PUSH`). A DB suite that reports *skipped* is a setup failure — fix the env, do not continue.
- Integration tests copy the `isLocalDbConfigured` guard from `src/server/api/routers/classroom-access.integration.test.ts:4-15` and the fixture style there (unique suffix per test, `createCaller`, `getPayloadClient`).
- Payload `number` columns may come back as strings: use `Number()` / `incrementNumeric` (`src/server/payload-numeric.ts`) before arithmetic on `issue.number`.
- Every user-visible string goes through next-intl in **both** `messages/en.json` and `messages/nl.json`, in everyday words. New namespaces: `magazines` (reading pages) and `magazineEditor` (settings, builder, article writing). Server error codes map to friendly text through one map per namespace; raw `err.message` never reaches a toast.
- Design (UI tasks): read `PRODUCT.md` and `DESIGN.md` first. Tokens from `src/styles/globals.css`, primitives from `src/components/ui/`. One Voice Rule — Signal Orange only for the single primary action (Publish / Read the issue) and the active state. `/ LABEL` kickers only via `<SectionLabel>`; no `01 ·` eyebrows stacked on a kicker (table-of-contents ordinals are list numbers in Geist Mono, nothing more). Mono only for numbers, dates, counts. Flat-by-default: hairline borders, no decorative shadows, no nested cards, no side stripes. Loading → `<Skeleton>`, error → `<ErrorState onRetry>`, empty → `<EmptyState>` that teaches the next step. Gate-Before-Fail for guests.
- Accessibility: WCAG 2.2 AA; every control labelled; IDs from `useId()`; reorder works by keyboard and from a menu; covers have alt text (issue title).
- Payload type changes: regenerate with the command in Task 1 Step 6 and commit `src/payload-types.ts` with only this slice's hunks.

## Review Focus

1. **A listed community becomes unlisted after it published public issues without a recorded confirmation** → those issues become members-only for outsiders on every surface at once (page, `/magazines`, sitemap, profile, agent search, comments). Tests: Task 2 (`resolver: unconfirmed public in an unlisted community is members-only`) and Task 3 (parity matrix row `listed→unlisted`).
2. **An article edited as a Payload draft version, then published by its issue** → readers see the latest text, not the text from the first save. Test: Task 6 (`publish shows the latest draft content to readers`).
3. **An article removed from a published issue and placed in another one** → it disappears from the first issue and its old URL 404s; XP is not granted twice. Test: Task 6 (`moving a published article does not credit twice and drops the old placement`).
4. **Two editors (or two tabs) save the same issue** → the stale save gets `ISSUE_CHANGED` and nothing is overwritten. Test: Task 6 (`stale expectedUpdatedAt is refused`) and Task 13 (builder shows the reload message).
5. **An issue switched from public back to members** → it leaves `/magazines`, the sitemap, the author's profile, agent search and comment reads on the next request, with no cache in between. Test: Task 9 (`switching to members removes the article from every surface`).

---

## File structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/magazines/values.ts` | Shared value lists: `ISSUE_VISIBILITIES`, `ISSUE_STATUSES`, `ISSUE_LAYOUTS`, slug pattern. No imports from server. |
| `src/lib/magazines/paths.ts` | `magazinePath`, `issuePath`, `magazineArticlePath`, community tab/builder paths. |
| `src/lib/magazines/item-views.ts` | Serializable item view DTOs (`IssueItemView` union) shared by server loaders and renderers. |
| `src/collections/shared/article-rich-text.ts` | The Articles Lexical editor config, extracted so issues reuse the same editor features. |
| `src/collections/Magazines.ts`, `src/collections/MagazineIssues.ts` | Payload collections. |
| `src/migrations/20261026a_magazines.ts` | Tables, enums, indexes, article columns, locked-docs columns. |
| `src/server/magazines/issue-access.ts` | `resolveMagazineIssueAccess` (pure) + `loadMagazineIssueAccess` (DB). |
| `src/server/magazines/visibility-change.ts` | Pure rule for changing a visibility, incl. unlisted opt-in record. |
| `src/server/magazines/deps.ts` | `Deps` and `PayloadClient` types shared by magazine services. |
| `src/server/magazines/readable-issues.ts` | `loadIssueReadScope`, `readableIssueWhere`, `readableIssueIds`. |
| `src/server/magazines/items/types.ts` | `IssueItemKind` Strategy interface. |
| `src/server/magazines/items/article/{block,kind}.ts`, `items/editorial/{block,kind}.ts` | One folder per kind: Payload block config (pure) and the strategy. |
| `src/server/magazines/items/blocks.ts` | `ISSUE_ITEM_BLOCKS` for the Payload config (imports only `block.ts` files). |
| `src/server/magazines/items/registry.ts` | `ITEM_KINDS`, input schema, `validateIssueItems`, `loadIssueItemViews`. |
| `src/server/magazines/article-publication.ts` | Publish placed magazine articles and credit them (the issue-publish side of the channel seam). |
| `src/server/magazines/magazine-service.ts` | Create/update magazine settings, `ensureMagazineSpace`. |
| `src/server/magazines/issue-service.ts` | Create, update, set items, publish, delete draft. |
| `src/server/magazines/reading.ts` | Read models for every reading page. |
| `src/server/magazines/errors.ts` | `MagazineErrorCode` list + `magazineError(code)` TRPCError factory. |
| `src/server/articles/channels.ts` | Publication channel seam: `channelFor`, `blogChannel`, `magazineChannel`. |
| `src/server/articles/credit.ts` | `creditArticlePublication` (XP + badges + activity), extracted from `Articles.ts`. |
| `src/server/articles/article-access.ts` | `readableArticleWhere`, `canReadArticle` — the one article read rule. |
| `src/server/api/routers/magazines.ts` | Editor procedures. |
| `src/components/magazines/items/registry.tsx` + `article-item.tsx`, `editorial-item.tsx` | Render registry, one renderer per kind. |
| `src/components/magazines/layouts/cover-story.tsx` + `layouts/registry.ts` | The one layout template. |
| `src/components/magazines/reading/*` | Issue reader (TOC, mosaic, rail), article long-read, home, shelf. |
| `src/components/magazines/editor/*` | Settings form, builder, article destination glue. |
| `src/app/[locale]/magazines/page.tsx`, `[magazineSlug]/page.tsx`, `[magazineSlug]/[issueSlug]/page.tsx`, `[magazineSlug]/[issueSlug]/[articleSlug]/page.tsx` | Reading routes (RSC). |
| `src/app/[locale]/communities/[slug]/magazine/page.tsx`, `magazine/write/page.tsx`, `magazine/articles/[articleSlug]/edit/page.tsx`, `magazine/issues/[issueId]/edit/page.tsx`, `settings/magazine/page.tsx` | Community tab and editor routes. |
| `docs/adr/0042-magazine-issues-are-read-through-one-access-resolver.md`, `docs/adr/0043-magazine-issue-items-are-a-registry-of-kind-strategies.md` | ADRs. |

**Modify**

`src/collections/Articles.ts` (fields + hooks via channel), `src/payload.config.ts`, `src/migrations/index.ts`, `src/server/db/payload-schema-drift.ts`, `src/server/db/schema.ts` (`spaces.builtinSurface` type), `src/server/communities/space-defaults.ts`, `src/server/articles/public-articles.ts`, `src/server/api/routers/{articles,comments,agent}.ts`, `src/server/api/root.ts`, `src/app/sitemap.ts`, `src/server/members/profile-work.ts`, `src/components/members/profile/work-entries.ts`, `src/app/[locale]/blog/edit/[slug]/page.tsx`, `src/components/article-editor/{article-editor.tsx,types.ts}`, `src/lib/communities/layout-variant.ts`, `src/components/communities/settings/settings-sidebar.tsx`, `src/components/navbar.tsx`, `messages/{en,nl}.json`, `CONTEXT.md`, `DESIGN.md`, `src/payload-types.ts`.

---

## Task 0: ADRs, glossary and design-frame record

**Files:**
- Create: `docs/adr/0042-magazine-issues-are-read-through-one-access-resolver.md`, `docs/adr/0043-magazine-issue-items-are-a-registry-of-kind-strategies.md`
- Modify: `CONTEXT.md`, `DESIGN.md`

**Interfaces:** Produces the vocabulary every later task uses: *magazine*, *issue*, *issue item*, *item kind*, *magazine article*, *placement*, *publication channel*, *magazine editor*.

- [ ] **Step 1: Check ADR numbers are still free:** `git fetch origin && git ls-tree -r --name-only origin/main docs/adr | tail -3` and `gh pr list --state open --json files --jq '.[].files[].path' | grep docs/adr/004`. If 0042/0043 are taken, use the next free numbers and update every reference in this plan's later tasks.
- [ ] **Step 2: Write ADR-0042** (format of `docs/adr/0041-*.md`: front-matter `status: accepted`, Context, Decision, Consequences). It decides: one resolver (`none | full | editor`; slice 6 adds `teaser` to both the visibility list and the access union, so exhaustive switches find every surface); `readableIssueWhere` built from the same rules and pinned by a parity test; concrete per-issue visibility (Decision 2); the unlisted opt-in as one resolver rule that **amends ADR-0030's scope** for magazine issues only (link ADR-0030 and quote its line 58 rule); confirmation recorded who/when and cleared on `members`; anonymous scope for sitemap/agent/profile.
- [ ] **Step 3: Write ADR-0043.** It decides: item kinds as a Strategy registry (interface in Task 5), Payload `blocks` generated from the registry, renderers in a typed render registry so a missing renderer is a compile error; `suggest` is added in slice 5, not declared now; storage split (magazine + issue in Payload with text `communityId`; staff and subscriptions will be Drizzle in slices 3–4); articles stay one collection behind the publication-channel seam; placement stored on the article (Decision 6). Record what was rejected: a `MagazineArticles` copy collection, inline `if (doc.magazine)` branches, snapshotting platform content.
- [ ] **Step 4: Add glossary entries to `CONTEXT.md`** for the eight terms above, in the file's existing format, linking the two ADRs.
- [ ] **Step 5: Record two named page-frame exceptions in `DESIGN.md` § Page frame:** (a) `/magazines` home and shelf — `max-w-[1600px]` frame on `px-4 sm:px-8` gutters, showroom like the Explore page; (b) the issue reading view — three columns from `xl` (`xl:grid-cols-[14rem_minmax(0,1fr)_18rem]`: sticky contents, item mosaic, sticky rail), two from `lg` (rail drops below), one column on phones; the article long-read keeps a reading measure (`max-w-[72ch]`) inside the same frame. Also add the issue builder to the list of workspace routes in the community-pages paragraph.
- [ ] **Step 6: Commit**

```bash
git add docs/adr/0042-magazine-issues-are-read-through-one-access-resolver.md docs/adr/0043-magazine-issue-items-are-a-registry-of-kind-strategies.md CONTEXT.md DESIGN.md
git commit -m "docs(magazines): ADRs for issue access and item registry"
```

---

## Task 1: Collections, article fields and the migration

**Files:**
- Create: `src/lib/magazines/values.ts`, `src/collections/shared/article-rich-text.ts`, `src/collections/Magazines.ts`, `src/collections/MagazineIssues.ts`, `src/server/magazines/items/article/block.ts`, `src/server/magazines/items/editorial/block.ts`, `src/server/magazines/items/blocks.ts`, `src/migrations/20261026a_magazines.ts`
- Modify: `src/collections/Articles.ts` (fields only), `src/payload.config.ts`, `src/migrations/index.ts`, `src/server/db/payload-schema-drift.ts`, `src/payload-types.ts`
- Test: `src/collections/magazines-schema.test.ts`, `src/migrations/magazines.integration.test.ts`

**Interfaces:**
- Produces (`src/lib/magazines/values.ts`):
  ```ts
  export const ISSUE_VISIBILITIES = ["members", "public"] as const;
  export type IssueVisibility = (typeof ISSUE_VISIBILITIES)[number];
  export const ISSUE_STATUSES = ["draft", "published"] as const;
  export type IssueStatus = (typeof ISSUE_STATUSES)[number];
  export const ISSUE_LAYOUTS = ["cover-story"] as const;
  export type IssueLayout = (typeof ISSUE_LAYOUTS)[number];
  export const MAGAZINE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // 3–60 chars
  export const MAX_MAGAZINE_TOPICS = 5;
  ```
- Produces collections: `magazines` (fields in order: `name` text req max 120, `slug` text req unique index, `communityId` text req **unique** index, `description` textarea max 500, `logoUrl` text, `topics` array of `{ topic: text }` maxRows 5, `defaultVisibility` select default `members`, `publicConfirmedBy` text, `publicConfirmedAt` date, `createdBy` text req) and `magazine-issues` (`magazine` relationship→magazines req index, `communityId` text req index, `number` number req, `title` text req **localized**, `slug` text req, `coverImageUrl` text, `editorNote` richText **localized** (shared editor), `layout` select default `cover-story`, `visibility` select req default `members` index, `publicConfirmedBy` text, `publicConfirmedAt` date, `status` select req default `draft` index, `publishedAt` date index, `publishedBy` text, `items` blocks = `ISSUE_ITEM_BLOCKS`; collection `indexes: [{ fields: ["magazine", "slug"], unique: true }, { fields: ["magazine", "number"], unique: true }]`). Both `admin.group: "Magazines"`, no `access` override (Payload admin users only — the site reads through server code).
- Produces blocks: `article` (`intro` text max 280, `article` relationship→articles req) and `editorial` (`intro` text max 280, `heading` text max 160 localized, `body` richText req localized, shared editor). A shared `itemBaseFields` array holds `intro`.
- Produces on `articles`: `magazine` relationship→magazines (index, sidebar), `magazineIssue` relationship→magazine-issues (index, sidebar, `admin.readOnly`, description "Set by the issue builder").
- Produces: `articleRichTextEditor` and `ArticleImageBlock` exported from `src/collections/shared/article-rich-text.ts`; `Articles.ts` imports them (no behaviour change).

- [ ] **Step 1: Write the failing schema test** `src/collections/magazines-schema.test.ts` (style of `hosted-materials-schema.test.ts`):
  - `it("defines the magazine fields in order, one magazine per community")` — field names equal the list above; `communityId.unique === true`; `slug.unique === true`; `defaultVisibility` options map to `[...ISSUE_VISIBILITIES]`, default `"members"`.
  - `it("defines issue fields, compound uniqueness and localized text")` — `title.localized`, `editorNote.localized === true`; `MagazineIssues.indexes` equals the two compound indexes; `status` options equal `[...ISSUE_STATUSES]`, default `"draft"`; `layout` options equal `[...ISSUE_LAYOUTS]`.
  - `it("builds the items blocks from the registry blocks")` — `items.blocks.map(b => b.slug)` equals `["article", "editorial"]`; every block's first field is `intro`.
  - `it("adds magazine and placement relations to articles")` — `Articles` has `magazine` (relationTo `magazines`) and `magazineIssue` (relationTo `magazine-issues`, readOnly).
  - `it("ships an idempotent migration registered in the index")` — the migration source contains `CREATE TABLE IF NOT EXISTS "magazines"`, `CREATE TABLE IF NOT EXISTS "magazine_issues"`, `CREATE UNIQUE INDEX IF NOT EXISTS "magazines_community_id_idx"`, `ADD COLUMN IF NOT EXISTS "magazine_id"`, `ADD COLUMN IF NOT EXISTS "version_magazine_id"`, `"magazines_id" integer REFERENCES "magazines"("id") ON DELETE cascade`, `DROP TABLE IF EXISTS "magazine_issues"`; `src/migrations/index.ts` contains `name: "20261026a_magazines"`.
- [ ] **Step 2: Run it:** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/collections/magazines-schema.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement** the values file, the shared rich-text extraction, the block files, `blocks.ts`, both collections, the Articles fields, and register `Magazines` and `MagazineIssues` in `payload.config.ts` after `HostedMaterials`.
- [ ] **Step 4: Get Payload's exact DDL from a scratch database, then write the migration.** Payload names block, locale and version tables itself; do not guess them.

```bash
docker exec aitcom-postgres-1 createdb -U postgres aitcom_magazines_scratch
SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 PAYLOAD_PUSH=true \
  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_magazines_scratch \
  pnpm exec tsx scripts/payload-push.ts
docker exec aitcom-postgres-1 pg_dump -U postgres --schema-only -n public \
  -t 'magazine*' -t 'enum_magazine*' -t articles -t _articles_v -t payload_locked_documents_rels \
  aitcom_magazines_scratch > "$TMPDIR/magazines-ddl.sql"   # outside the repo; read it, then delete it
docker exec aitcom-postgres-1 dropdb -U postgres aitcom_magazines_scratch
```

Transcribe into `src/migrations/20261026a_magazines.ts` in the style of `20260928d_hosted_materials.ts`: enums in `DO $$ … EXCEPTION WHEN duplicate_object` blocks; every table/index `IF NOT EXISTS`; the new `articles` and `_articles_v` columns (`magazine_id`, `magazine_issue_id`, `version_magazine_id`, `version_magazine_issue_id`) with FKs `ON DELETE set null` and indexes; `payload_locked_documents_rels` columns `magazines_id` and `magazine_issues_id`; `down` drops in reverse order. The header comment says why each piece exists. Register it in `src/migrations/index.ts`. Add `"magazines"`, `"magazine_issues"`, `"articles"` and `"_articles_v"` to `GUARDED_PAYLOAD_TABLES` so a deploy with a missing column fails loudly instead of breaking every article query.
- [ ] **Step 5: Write the migration integration test** `src/migrations/magazines.integration.test.ts` (style of `collector-run-preset.integration.test.ts`: refuses any database but `aitcom_test`; this is also how the test DB gets the tables):
  - `it("creates the tables and article columns and can run twice")` — `up` twice; `information_schema.columns` has `magazines.community_id`, `magazine_issues.visibility`, `articles.magazine_id`, `articles.magazine_issue_id`, `_articles_v.version_magazine_id`.
  - `it("enforces one magazine per community and unique issue slugs per magazine")` — second insert with the same `community_id` throws a unique violation; same `(magazine_id, slug)` throws.
  - `it("down removes the tables and columns, up restores them")`.

Run: `<DB test prefix> pnpm vitest run src/migrations/magazines.integration.test.ts` → PASS (3 tests executed, not skipped).
- [ ] **Step 6: Regenerate Payload types**

```bash
set +eu; set -a; . /Users/greg/coding-projects/aitcom/.env.docker >/dev/null 2>&1; set +a; unset PAYLOAD_PUSH; SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test npx payload generate:types
git diff -- src/payload-types.ts | grep '^[-+]' | grep -v '^[-+][-+]' | grep -iv 'magazine' | head -20
```

Expected: `Magazine` and `MagazineIssue` interfaces, `magazine`/`magazineIssue` on `Article`, select/locked-document entries. The grep prints only braces and field lines belonging to those additions; restore any unrelated hunk by hand. Do not run `generate:db-schema`.
- [ ] **Step 7: Verify** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/collections src/migrations/migration-runner-contract.test.ts && pnpm typecheck` → PASS.
- [ ] **Step 8: Commit** (all files above by name) — `feat(magazines): magazine and issue collections with migration`.

---

## Task 2: Visibility rule and the issue access resolver

**Files:**
- Create: `src/server/magazines/issue-access.ts`, `src/server/magazines/visibility-change.ts`, `src/server/magazines/errors.ts`
- Test: `src/server/magazines/issue-access.test.ts`, `src/server/magazines/visibility-change.test.ts`

**Interfaces:**
- Consumes: `IssueVisibility`, `IssueStatus` (Task 1); `isContentPublic`, `CommunityVisibility` (`src/server/communities/content-visibility.ts`); `CommunityRole` (`src/server/communities/role-utils.ts`).
- Produces:
  ```ts
  export type MagazineIssueAccess = "none" | "full" | "editor";
  export function isMagazineEditorRole(role: CommunityRole | null): boolean; // owner|admin — the slice-3 seam
  export type IssueAccessInput = {
    viewer: { userId: string | null; role: CommunityRole | null }; // role = active membership role or null
    community: (CommunityVisibility & { deleted: boolean }) | null;
    issue: { status: IssueStatus; visibility: IssueVisibility; publicConfirmedAt: string | null };
  };
  export function resolveMagazineIssueAccess(input: IssueAccessInput): MagazineIssueAccess;
  /** The visibility a non-member effectively gets: an unconfirmed public issue in a content-private community counts as members. */
  export function effectiveVisibility(issue: IssueAccessInput["issue"], community: CommunityVisibility): IssueVisibility;
  export type LoadableIssue = { communityId: string; status: string; visibility: string; publicConfirmedAt?: string | null };
  export async function loadMagazineIssueAccess(database: typeof db, issue: LoadableIssue, viewerId: string | null): Promise<MagazineIssueAccess>;
  ```
  ```ts
  // visibility-change.ts
  export type VisibilityRecord = { visibility: IssueVisibility; publicConfirmedBy: string | null; publicConfirmedAt: string | null };
  export function planVisibilityChange(input: {
    next: IssueVisibility; current: VisibilityRecord; community: CommunityVisibility;
    confirmUnlistedPublic: boolean; actorId: string; now: Date;
  }): { ok: true; record: VisibilityRecord } | { ok: false; code: "CONFIRM_UNLISTED_PUBLIC" };
  ```
  ```ts
  // errors.ts
  export const MAGAZINE_ERROR_CODES = ["CONFIRM_UNLISTED_PUBLIC","MAGAZINE_EXISTS","MAGAZINE_SLUG_TAKEN","SPACE_SLUG_TAKEN","ISSUE_CHANGED","ISSUE_SLUG_TAKEN","ISSUE_SLUG_LOCKED","ISSUE_EMPTY","ISSUE_NOT_DRAFT","ITEM_INVALID","ARTICLE_PLACED","ARTICLE_NOT_READY","ARTICLE_MAGAZINE_LOCKED"] as const;
  export type MagazineErrorCode = (typeof MAGAZINE_ERROR_CODES)[number];
  export function magazineError(code: MagazineErrorCode, trpcCode?: TRPC_ERROR_CODE_KEY): TRPCError; // message = code; default trpcCode per code
  ```

- [ ] **Step 1: Write the failing tests.** `issue-access.test.ts` — a table test over viewer × community × issue:

```ts
it.each([
  // [label, role, listed, status, visibility, confirmedAt, expected]
  ["editor sees a draft", "owner", true, "draft", "members", null, "editor"],
  ["admin is editor", "admin", false, "published", "members", null, "editor"],
  ["moderator is a reader", "moderator", true, "draft", "members", null, "none"],
  ["member reads a members issue", "member", false, "published", "members", null, "full"],
  ["outsider: members issue is hidden", null, true, "published", "members", null, "none"],
  ["outsider reads public in a listed community", null, true, "published", "public", null, "full"],
  ["outsider: unconfirmed public in an unlisted community is members-only", null, false, "published", "public", null, "none"],
  ["outsider reads confirmed public in an unlisted community", null, false, "published", "public", "2026-10-26T10:00:00.000Z", "full"],
  ["nobody but editors sees a draft", "member", true, "draft", "public", null, "none"],
])("resolver: %s", ...);
it("a deleted or missing community is none for everyone, editors included");
it("the Hub counts as content-public (slug 'ait', unlisted)");
```

`visibility-change.test.ts`:
- `it("public in an unlisted community without confirmation is refused")` → `{ ok: false, code: "CONFIRM_UNLISTED_PUBLIC" }`.
- `it("records who and when on confirmed public")` → `publicConfirmedBy === actorId`, `publicConfirmedAt === now.toISOString()`.
- `it("keeps an existing confirmation when re-saving public")` — no new confirmation needed, record unchanged.
- `it("members clears the confirmation")`.
- `it("public in a listed community needs no confirmation and records none")`.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/issue-access.test.ts src/server/magazines/visibility-change.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Order of rules in `resolveMagazineIssueAccess`: community missing/deleted → `none`; editor role → `editor`; status not `published` → `none`; active role → `full`; `effectiveVisibility(...) === "public"` → `full`; else `none`. `loadMagazineIssueAccess` mirrors `loadCourseAccess` (`src/server/classroom/course-access.ts:66-92`): community by id incl. `deletedAt`, membership by (community, user), `active = status === "active"`.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** — `feat(magazines): issue access resolver and visibility rule`.

---

## Task 3: Query twin — `readableIssueWhere` and the parity test

**Files:**
- Create: `src/server/magazines/readable-issues.ts`, `src/server/magazines/deps.ts`
- Test: `src/server/magazines/readable-issues.test.ts`, `src/server/magazines/issue-access.integration.test.ts`

**Interfaces:**
- Consumes: `resolveMagazineIssueAccess`, `loadMagazineIssueAccess` (Task 2); `HUB_SLUG`.
- Produces:
  ```ts
  export type IssueReadScope = {
    editorCommunityIds: readonly string[];   // active owner/admin
    memberCommunityIds: readonly string[];   // active, any role
    privateCommunityIds: readonly string[];  // content-private: unlisted and not the Hub
    deletedCommunityIds: readonly string[];
  };
  export async function loadIssueReadScope(database: typeof db, viewerId: string | null): Promise<IssueReadScope>;
  export function readableIssueWhere(scope: IssueReadScope): Where;
  /** Ids of issues readable in this scope, optionally narrowed (e.g. by magazine). */
  export async function readableIssueIds(payload: PayloadClient, scope: IssueReadScope, narrow?: Where): Promise<number[]>;
  ```
  Also create `src/server/magazines/deps.ts` exporting `type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>` and `type Deps = { db: typeof db; payload: PayloadClient }`; every later magazine module imports them from there. `readableIssueWhere` = `communityId not_in deleted` AND (`communityId in editor` OR (`status = published` AND (`communityId in member` OR (`visibility = public` AND (`communityId not_in private` OR `publicConfirmedAt exists`))))). Branches whose id list is empty are omitted (never emit `in: []`).

- [ ] **Step 1: Write the failing unit test** `readable-issues.test.ts`:
  - `it("anonymous scope: published, public, and listed or confirmed")` — exact `Where` object for `{ editor: [], member: [], private: ["c-priv"], deleted: [] }`.
  - `it("omits empty id lists instead of emitting in: []")` — `JSON.stringify(where)` has no `"in":[]`.
  - `it("editor communities see every status")`.
- [ ] **Step 2: Write the failing DB parity test** `issue-access.integration.test.ts`: fixtures = listed community, unlisted community, Hub-like listed check skipped; viewers = anonymous, outsider, member of unlisted, admin of unlisted; issues = every combination of status × visibility × confirmed in both communities, plus one issue in a soft-deleted community.
  - `it("readableIssueWhere returns exactly the issues the resolver lets each viewer read")` — for every viewer: `new Set(await readableIssueIds(payload, scope))` (narrowed to fixture ids) equals the set of fixture issues where `await loadMagazineIssueAccess(...) !== "none"`.
  - `it("listed→unlisted: an unconfirmed public issue disappears for outsiders in both forms")` — flip `isListedInDirectory` to false, reload scope; the issue is gone from the where-result and the resolver returns `none`; a confirmed one stays.
- [ ] **Step 3: Run** unit: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/readable-issues.test.ts`; DB: `<DB test prefix> pnpm vitest run src/server/magazines/issue-access.integration.test.ts` → FAIL.
- [ ] **Step 4: Implement.** `loadIssueReadScope`: one membership query for the viewer (role + status), one community query for `privateCommunityIds` (unlisted, slug ≠ `HUB_SLUG`) and `deletedCommunityIds` (`deletedAt` not null). Same scale note as `hiddenContentCommunityIds` (the id lists grow with communities; fine today).
- [ ] **Step 5: Run** both → PASS (DB tests executed, not skipped).
- [ ] **Step 6: Commit** — `feat(magazines): readable issue query with resolver parity test`.

---

## Task 4: Article publication channel seam

**Files:**
- Create: `src/server/articles/channels.ts`, `src/server/articles/credit.ts`
- Modify: `src/collections/Articles.ts` (hooks), `src/server/articles/public-articles.ts`
- Test: `src/server/articles/channels.test.ts`, `src/server/articles/public-articles.test.ts`, `src/collections/articles-channel.integration.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // channels.ts — the only place that looks at `magazine` to decide behaviour
  export type ArticleChannelId = "blog" | "magazine";
  type ArticleData = { status?: string | null; publishedAt?: string | null; reviewStatus?: string | null; authorType?: string | null; magazine?: unknown };
  export interface ArticleChannel {
    readonly id: ArticleChannelId;
    /** beforeChange: adjust status/publishedAt for a review status change. Mutates `data`. */
    onReviewChange(data: ArticleData, originalDoc: ArticleData | undefined): void;
    /** afterChange: whether reaching `approved` publishes and credits now. */
    readonly creditsOnApproval: boolean;
  }
  export const blogChannel: ArticleChannel;     // today's behaviour, moved verbatim
  export const magazineChannel: ArticleChannel; // approval → status untouched; rejected/changes_requested → draft
  export function channelFor(article: { magazine?: unknown }): ArticleChannel;
  /** beforeChange guard: an article never moves into, out of, or between magazines. */
  export function assertMagazineUnchanged(data: ArticleData, originalDoc: ArticleData | undefined): void; // throws Error("ARTICLE_MAGAZINE_LOCKED")
  ```
  ```ts
  // credit.ts
  export async function creditArticlePublication(
    database: typeof db,
    article: { id: number; authorId: string; type: string | null; title: string },
    options: { action: "article.approved" | "magazine_article.published"; req?: PayloadRequest },
  ): Promise<void>; // awardXp(ARTICLE_PUBLISHED) + badges (onArticleApprovedAfterSave when req, else onArticleApproved) + logActivity
  ```
  `publicArticleWhere()` gains `{ magazine: { exists: false } }`; `isPublicArticle` returns false when `magazine` is set (accepts `magazine?: unknown`).

- [ ] **Step 1: Write the failing unit tests.**
  `channels.test.ts`:
  - `it("blog approval publishes and stamps publishedAt")`, `it("blog pending_review moves to draft")` — the existing `Articles.ts` cases, now against `blogChannel`.
  - `it("magazine approval leaves status and publishedAt alone")` — `{ reviewStatus: "approved", status: "draft" }` from `pending_review` stays `draft`, `publishedAt` undefined; `magazineChannel.creditsOnApproval === false`; `blogChannel.creditsOnApproval === true`.
  - `it("magazine changes_requested sends a draft back to draft")`.
  - `it("channelFor reads the magazine relation, populated or as an id")` — `{ magazine: 3 }`, `{ magazine: { id: 3 } }` → magazine; `{ magazine: null }`, `{}` → blog.
  - `it("refuses moving an article into, out of, or between magazines")` — three throws with `ARTICLE_MAGAZINE_LOCKED`; creating with a magazine (no originalDoc) is allowed.
  `public-articles.test.ts`: update the expected `publicArticleWhere()` object (third `and` entry `{ magazine: { exists: false } }`); add `[{ status: "published", authorType: "member", reviewStatus: "approved", magazine: 4 }, false]` to the table.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/articles` → FAIL.
- [ ] **Step 3: Implement.** In `Articles.ts`, `beforeChange` becomes: resolve `const merged = { ...originalDoc, ...data }`; `assertMagazineUnchanged(data, originalDoc)`; if `merged.authorType === "member"` call `channelFor(merged).onReviewChange(data, originalDoc)`. `afterChange` keeps the guard clauses and, on the approval transition, calls `creditArticlePublication(db, doc, { action: "article.approved", req })` only when `channelFor(doc).creditsOnApproval`; the changes_requested/rejected activity stays as is. No other `magazine` check is added anywhere in the hook.
- [ ] **Step 4: Write the DB test** `src/collections/articles-channel.integration.test.ts`:
  - `it("approving a magazine article does not publish it or grant XP")` — create a magazine + a member article in it, update `reviewStatus: "approved"`; reload with `draft: false`: `status === "draft"`, `publishedAt == null`; the author's `memberProfiles.xp` is unchanged.
  - `it("approving a blog article still publishes and grants XP")` — `status === "published"`, XP increased by `XP_AMOUNTS.ARTICLE_PUBLISHED`.
  - `it("refuses to move a blog article into a magazine")` — `payload.update({ data: { magazine } })` rejects with `ARTICLE_MAGAZINE_LOCKED`.
- [ ] **Step 5: Run** unit + `<DB test prefix> pnpm vitest run src/collections/articles-channel.integration.test.ts src/server/badges` → PASS. Also run `SKIP_ENV_VALIDATION=1 pnpm vitest run src/app/feed.xml src/app/\[locale\]/blog src/server/members` (callers of `publicArticleWhere`).
- [ ] **Step 6: Commit** — `feat(articles): publication channel seam for magazine articles`.

---

## Task 5: Item registry with `article` and `editorial` kinds

**Files:**
- Create: `src/lib/magazines/item-views.ts`, `src/server/magazines/items/types.ts`, `src/server/magazines/items/article/kind.ts`, `src/server/magazines/items/editorial/kind.ts`, `src/server/magazines/items/registry.ts`
- Test: `src/server/magazines/items/registry.test.ts`, `src/server/magazines/items/article-kind.integration.test.ts`

**Interfaces:**
- Produces (`item-views.ts`, no server imports):
  ```ts
  export type ArticleItemView = { kind: "article"; itemId: string; intro: string | null;
    article: { id: number; slug: string; title: string; authorName: string | null; excerpt: string; readingMinutes: number; imageUrl: string | null } };
  export type EditorialItemView = { kind: "editorial"; itemId: string; intro: string | null; heading: string | null; body: unknown /* Lexical JSON */ };
  export type IssueItemView = ArticleItemView | EditorialItemView;
  export type ItemKindId = IssueItemView["kind"];
  export type UnavailableItem = { kind: ItemKindId; itemId: string; unavailable: true; reason: "missing" | "not_ready" | "other_magazine" };
  export type EditorItemView = IssueItemView | UnavailableItem; // editors only
  ```
- Produces (`items/types.ts`):
  ```ts
  export type ItemContext = { payload: PayloadClient; magazineId: number; issueId: number | null; locale: AppLocale; editor: boolean };
  export type ItemProblem = { itemIndex: number; code: "ITEM_INVALID" | "ARTICLE_PLACED" | "ARTICLE_NOT_READY"; detail?: string };
  export interface IssueItemKind<K extends ItemKindId, Input extends { kind: K }, Stored extends { id?: string; intro?: string | null }> {
    readonly kind: K;
    readonly input: z.ZodType<Input>;                    // builder input for this kind
    toStored(input: Input): Omit<Stored, "id">;          // Payload block data (without blockType)
    validate(items: { index: number; stored: Stored }[], ctx: ItemContext): Promise<ItemProblem[]>; // batched
    load(items: Stored[], ctx: ItemContext): Promise<Map<string, Extract<IssueItemView, { kind: K }> | UnavailableItem>>; // batched, keyed by block id
    isReadable(view: Extract<IssueItemView, { kind: K }>, ctx: ItemContext): boolean;
  }
  ```
- Produces (`registry.ts`):
  ```ts
  export const ITEM_KINDS: { [K in ItemKindId]: IssueItemKind<K, any, any> };
  export const issueItemInputSchema: z.ZodDiscriminatedUnion<"kind", ...>; // built from ITEM_KINDS[*].input
  export type IssueItemInput = z.infer<typeof issueItemInputSchema>;
  export function toStoredItems(inputs: IssueItemInput[]): Array<{ blockType: ItemKindId } & Record<string, unknown>>;
  export async function validateIssueItems(blocks: StoredBlock[], ctx: ItemContext): Promise<ItemProblem[]>;
  /** Readers get readable views in order; editors also get UnavailableItem markers in place. */
  export async function loadIssueItemViews(blocks: StoredBlock[], ctx: ItemContext): Promise<EditorItemView[]>;
  ```
  Kind inputs: `article` → `{ kind: "article"; id?: string; articleId: number; intro?: string }`; `editorial` → `{ kind: "editorial"; id?: string; heading?: string; body: unknown; intro?: string }`.
  Article rules: `validate` — the article exists, its `magazine` is `ctx.magazineId` (`ITEM_INVALID`), `reviewStatus === "approved"` (`ARTICLE_NOT_READY`), `magazineIssue` is null or `ctx.issueId` (`ARTICLE_PLACED`); `load` — one `payload.find({ id: { in } })`, `draft: ctx.editor` (editors preview latest text, readers read the published doc), excerpt = first ~40 words via `extractPlainText`, `readingMinutes` via `estimateReadingTime`, `imageUrl` = `mediaUrl`; `isReadable` — for readers the loaded article must be `status === "published"`. Editorial rules: `validate` — body has at least one non-empty text node; `load` — straight from the block; `isReadable` — always.

- [ ] **Step 1: Write the failing unit test** `registry.test.ts`:
  - `it("has exactly one kind module per block and the same slugs as the Payload blocks")` — `Object.keys(ITEM_KINDS)` equals `ISSUE_ITEM_BLOCKS.map(b => b.slug)`.
  - `it("parses builder input by kind and rejects unknown kinds")` — `{ kind: "storyline" }` fails.
  - `it("rejects an empty editorial body")` → one `ITEM_INVALID` problem with the right `itemIndex`.
  - `it("calls each kind's load once per issue, not once per item")` — spy kinds with three article blocks + two editorial blocks: each `load` called once.
  - `it("keeps order, drops unreadable items for readers and marks them for editors")`.
- [ ] **Step 2: Write the failing DB test** `article-kind.integration.test.ts`:
  - `it("refuses an article from another magazine, one not approved, and one placed in another issue")` — three problems with the three codes.
  - `it("readers never see an unpublished article; editors see it with its latest draft text")`.
- [ ] **Step 3: Run** unit + DB commands for these two files → FAIL.
- [ ] **Step 4: Implement** the view types, interface, two kinds and registry. The registry groups blocks by `blockType` and dispatches through `ITEM_KINDS[kind]`; there is no `switch` on kind anywhere outside the record literal.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** — `feat(magazines): issue item registry with article and editorial kinds`.

---

## Task 6: Magazine and issue services (create, edit, items, publish)

**Files:**
- Create: `src/server/magazines/magazine-service.ts`, `src/server/magazines/issue-service.ts`, `src/server/magazines/article-publication.ts`
- Modify: `src/server/communities/space-defaults.ts`, `src/server/db/schema.ts` (type of `spaces.builtinSurface` only — no DDL)
- Test: `src/server/magazines/space-defaults.test.ts` (or extend the existing space-defaults test), `src/server/magazines/issue-service.integration.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  ```ts
  // space-defaults.ts
  export const OPTIONAL_BUILTIN_SURFACES = ["magazine"] as const;
  export type BuiltinSurface = (typeof BUILTIN_SURFACES)[number] | (typeof OPTIONAL_BUILTIN_SURFACES)[number];
  // DefaultSpaceRow.builtinSurface keeps only the five defaults
  ```
  ```ts
  // magazine-service.ts
  // Deps, PayloadClient: from src/server/magazines/deps.ts (Task 3)
  export type MagazineSettingsInput = { name: string; slug: string; description?: string; logoUrl?: string | null;
    topics: string[]; defaultVisibility: IssueVisibility; confirmUnlistedPublic?: boolean };
  export async function saveMagazineSettings(deps: Deps, community: { id: string; slug: string; isListedInDirectory: boolean },
    input: MagazineSettingsInput, actorId: string): Promise<Magazine>;   // create or update; topics trimmed+lowercased, deduped, max 5
  export async function ensureMagazineSpace(database: typeof db, communityId: string): Promise<void>; // throws SPACE_SLUG_TAKEN when a room owns slug "magazine"
  export async function getMagazineForCommunity(payload: PayloadClient, communityId: string): Promise<Magazine | null>;
  ```
  ```ts
  // issue-service.ts
  export type IssueActor = { userId: string; community: { id: string; slug: string; isListedInDirectory: boolean } };
  export async function createIssue(deps: Deps, magazine: Magazine, input: { title: string }, actor: IssueActor): Promise<MagazineIssue>;
  export type IssueDetailsPatch = { title?: string; slug?: string; coverImageUrl?: string | null; editorNote?: unknown;
    visibility?: IssueVisibility; confirmUnlistedPublic?: boolean };
  export async function updateIssueDetails(deps: Deps, issue: MagazineIssue, patch: IssueDetailsPatch, expectedUpdatedAt: string, actor: IssueActor): Promise<MagazineIssue>;
  export async function setIssueItems(deps: Deps, issue: MagazineIssue, items: IssueItemInput[], expectedUpdatedAt: string, actor: IssueActor): Promise<MagazineIssue>;
  export async function publishIssue(deps: Deps, issue: MagazineIssue, expectedUpdatedAt: string, actor: IssueActor): Promise<MagazineIssue>;
  export async function deleteDraftIssue(deps: Deps, issue: MagazineIssue, actor: IssueActor): Promise<void>;
  ```
  ```ts
  // article-publication.ts — the issue-publish side of the channel seam
  /** Publishes placed articles that are not yet published and credits each once (draft → published only). */
  export async function publishPlacedArticles(deps: Deps, articleIds: number[]): Promise<{ published: number[] }>;
  ```
  Behaviour pinned here: `createIssue` → `number = max(existing)+1` (numeric coercion), `slug` from title (fallback `issue-<number>`; conflict → append `-<number>`), `communityId` copied from the magazine, `visibility`/confirmation copied from the magazine default. Every write first checks `issue.updatedAt === expectedUpdatedAt` (`ISSUE_CHANGED`). `updateIssueDetails`: slug change on a published issue → `ISSUE_SLUG_LOCKED`; visibility through `planVisibilityChange`. `setIssueItems`: `toStoredItems` → `validateIssueItems` (any problem → `ITEM_INVALID` / the problem's code, with `itemIndex` in the message data) → save blocks → sync placement: set `magazineIssue = issue.id` on articles now in the list, clear it on articles that left the list; if the issue is already published, `publishPlacedArticles` for new ones. `publishIssue`: refuses non-draft (`ISSUE_NOT_DRAFT`), empty items (`ISSUE_EMPTY`), any validation problem; publishes articles first, then sets `status = published`, `publishedAt`, `publishedBy` (so a retry after a partial failure completes; `publishPlacedArticles` is idempotent). `deleteDraftIssue`: drafts only, clears placements.

- [ ] **Step 1: Write the failing unit test** — `it("magazine is an optional surface, not one of the five defaults")`: `buildDefaultSpaceRows("c").map(r => r.slug)` equals the five; `OPTIONAL_BUILTIN_SURFACES` contains `"magazine"`.
- [ ] **Step 2: Write the failing DB tests** `issue-service.integration.test.ts`:
  - `it("creates the magazine once per community and adds the Magazine tab")` — second create → `MAGAZINE_EXISTS`; a `spaces` row `builtinSurface = "magazine"`, `slug = "magazine"`, position after the others.
  - `it("a room called magazine blocks the tab with SPACE_SLUG_TAKEN instead of silently skipping")`.
  - `it("numbers issues per magazine and copies the default visibility and confirmation")`.
  - `it("public on an unlisted community needs confirmation, records who and when")` — without flag → `CONFIRM_UNLISTED_PUBLIC`; with flag → `publicConfirmedBy === actor`, `publicConfirmedAt` set.
  - `it("stale expectedUpdatedAt is refused")` → `ISSUE_CHANGED`, stored items unchanged.
  - `it("places and unplaces articles as the item list changes")`.
  - `it("an article cannot be in two issues")` → `ARTICLE_PLACED`.
  - `it("publish publishes and credits placed articles once")` — article `status = published`, `publishedAt` set, author XP +`ARTICLE_PUBLISHED` exactly once, writer badge metric (`src/server/badges/metrics.ts`) counts it.
  - `it("publish shows the latest draft content to readers")` — edit the article with `draft: true` after approval; publish the issue; `findByID({ draft: false })` returns the edited content.
  - `it("moving a published article does not credit twice and drops the old placement")` — remove from issue A (published), add to issue B, publish B: XP unchanged since first publish; `magazineIssue === B.id`; loading A's items no longer includes it.
  - `it("refuses to publish an empty issue or one with an invalid item")`.
  - `it("locks the slug once published")` → `ISSUE_SLUG_LOCKED`.
- [ ] **Step 3: Run** both → FAIL.
- [ ] **Step 4: Implement.** Unique-violation errors from Payload/Postgres on magazine slug/community and issue slug map to `MAGAZINE_SLUG_TAKEN` / `MAGAZINE_EXISTS` / `ISSUE_SLUG_TAKEN`. Article publish mirrors the trusted-author path in `src/server/api/routers/articles.ts:217-235` (`payload.update` without `draft`), then `creditArticlePublication(db, article, { action: "magazine_article.published" })`, only when the article's status was not already `published`.
- [ ] **Step 5: Run** both → PASS; also `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/communities src/components/communities` (nav/spaces users of `BuiltinSurface`).
- [ ] **Step 6: Commit** — `feat(magazines): magazine and issue services with publish and credit`.

---

## Task 7: Editor API — `magazines` router and magazine article writes

**Files:**
- Create: `src/server/api/routers/magazines.ts`
- Modify: `src/server/api/root.ts`, `src/server/api/routers/articles.ts`
- Test: `src/server/api/routers/magazines.integration.test.ts`

**Interfaces:**
- Consumes: Task 6 services, `communityProcedure` (`src/server/api/trpc.ts:293`; input must carry the **community** `slug`), `isMagazineEditorRole`.
- Produces router `magazines` (all `communityProcedure`; every procedure first calls `requireMagazineEditor(ctx.communityRole)` → `FORBIDDEN`):
  | Procedure | Input (besides `slug`) | Returns |
  |---|---|---|
  | `getSettings` (query) | — | `{ magazine: Magazine \| null; communityIsPrivate: boolean }` |
  | `saveSettings` | `MagazineSettingsInput` (zod mirrors the type; `slug` field named `magazineSlug`) | `Magazine` |
  | `listIssues` (query) | — | `Array<Pick<MagazineIssue,"id"\|"number"\|"title"\|"slug"\|"status"\|"visibility"\|"publishedAt"\|"coverImageUrl"\|"updatedAt">>` incl. drafts, newest first |
  | `createIssue` | `{ title }` | `{ id }` |
  | `getIssueForEditing` (query) | `{ issueId }` | `{ issue; items: EditorItemView[]; storedItems: IssueItemInput[]; communityIsPrivate }` |
  | `updateIssue` | `{ issueId; expectedUpdatedAt } & IssueDetailsPatch` | `MagazineIssue` |
  | `setIssueItems` | `{ issueId; expectedUpdatedAt; items: IssueItemInput[] }` | `{ issue; items: EditorItemView[] }` |
  | `publishIssue` | `{ issueId; expectedUpdatedAt }` | `MagazineIssue` |
  | `deleteDraftIssue` | `{ issueId }` | `{ ok: true }` |
  | `availableArticles` (query) | — | approved, unplaced articles of this magazine: `{ id; title; authorName; updatedAt }[]` |
  | `myDraftArticles` (query) | — | caller's magazine articles not yet approved |
  An issue id from another community → `NOT_FOUND` (load issue, compare `communityId`).
- `articles` router changes: `create` accepts optional `magazineId` (caller must be editor of that magazine's community, else `FORBIDDEN`; stored as `magazine`); `submit` goes through the channel: for `magazineChannel` the caller must be a magazine editor and the update sets `reviewStatus: "approved"` only (no submit XP, no trusted shortcut); `myArticles` adds `magazine: { exists: false }`; `update` on a magazine article requires the author to still be a magazine editor; `delete` refuses a placed article (`ARTICLE_PLACED`).

- [ ] **Step 1: Write the failing DB tests** `magazines.integration.test.ts` (fixtures: owner, admin, moderator, member, outsider):
  - `it("only owner and admin reach editor procedures")` — moderator/member/outsider get `FORBIDDEN` on `getSettings`, `createIssue`, `publishIssue`.
  - `it("an issue id from another community is NOT_FOUND")`.
  - `it("full editor flow: settings → write → mark ready → add → publish")` — `saveSettings`, `articles.create({ magazineId })`, `articles.submit` → `reviewStatus approved`, `status draft`, no XP; `availableArticles` lists it; `createIssue`, `setIssueItems([article, editorial])`, `publishIssue`; article now `published`.
  - `it("a magazine article never enters the staff review queue")` — after `articles.submit`, `payload.find({ collection: "articles", where: { reviewStatus: { equals: "pending_review" } } })` does not contain it.
  - `it("magazine articles are not in My articles")` — `articles.myArticles` excludes it.
  - `it("a member who is not an editor cannot create a magazine article")` → `FORBIDDEN`.
- [ ] **Step 2: Run** `<DB test prefix> pnpm vitest run src/server/api/routers/magazines.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement** the router, register `magazines: magazinesRouter` in `root.ts`, and the `articles.ts` changes. Thin procedures: parse, gate, call the service; services throw `magazineError(...)`.
- [ ] **Step 4: Run** it plus `<DB test prefix> pnpm vitest run src/server/api/routers/classroom-access.integration.test.ts src/server/api/routers/communities.integration.test.ts` and `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/api` → PASS.
- [ ] **Step 5: Commit** — `feat(magazines): editor API and magazine article writes`.

---

## Task 8: Read models for reading pages

**Files:**
- Create: `src/server/magazines/reading.ts`, `src/lib/magazines/paths.ts`
- Test: `src/lib/magazines/paths.test.ts`, `src/server/magazines/reading.integration.test.ts`

**Interfaces:**
- Produces (`paths.ts`): `magazinePath(m: { slug: string }): string` → `/magazines/<m>`; `issuePath(m, i: { slug: string })`; `magazineArticlePath(m, i, a: { slug: string })`; `communityMagazinePath(communitySlug)`; `issueBuilderPath(communitySlug, issueId: number)`.
- Produces (`reading.ts`; all take `deps: Deps`, `viewerId: string | null`, `locale: AppLocale`):
  ```ts
  export type IssueCard = { id: number; number: number; title: string; slug: string; coverImageUrl: string | null; publishedAt: string | null;
    visibility: IssueVisibility; itemCount: number; magazine: { name: string; slug: string; logoUrl: string | null }; community: { name: string; slug: string } };
  export async function loadMagazinesHome(deps, opts: { locale; topic?: string }): Promise<{ featured: IssueCard | null; justPublished: IssueCard[]; magazines: MagazineCard[]; topics: string[] }>; // anonymous scope always
  export async function loadMagazineShelf(deps, opts: { magazineSlug; viewerId; locale }): Promise<null | { magazine; community; issues: IssueCard[]; viewerIsEditor: boolean }>;
  export async function loadIssuePage(deps, opts: { magazineSlug; issueSlug; viewerId; locale }): Promise<null | { access: Exclude<MagazineIssueAccess,"none">; magazine; community; issue: IssueCard & { editorNote: unknown; layout: IssueLayout }; items: EditorItemView[]; pastIssues: IssueCard[]; readingMinutes: number }>;
  export async function loadMagazineArticlePage(deps, opts: { magazineSlug; issueSlug; articleSlug; viewerId; locale }): Promise<null | { access; magazine; issue: IssueCard; article: Article; nextInIssue: ArticleItemView | null }>;
  export async function loadCommunityMagazineTab(deps, opts: { communitySlug; viewerId; locale }): Promise<null | { magazine; latest: IssueCard | null; issues: IssueCard[]; viewerIsEditor: boolean }>;
  ```
  `MagazineCard = { name; slug; logoUrl; description; topics: string[]; community: { name; slug }; latest: IssueCard }`. Rules: `null` = the page answers 404 (also when the magazine exists but the viewer may read nothing and is not in a content-public community). Home uses `loadIssueReadScope(db, null)` regardless of viewer; shelf/tab/issue/article use the viewer's scope or `loadMagazineIssueAccess`. The article page requires `article.magazineIssue === issue.id` and the issue access ≠ `none`; readers read `draft: false`, editors `draft: true`. Topics on home = the 8 most common topics across listed magazines.

- [ ] **Step 1: Write the failing tests.** `paths.test.ts`: one assertion per path helper. `reading.integration.test.ts`:
  - `it("home lists only public issues, newest first, featured = newest with a cover")` — a member viewer still does not see members-only issues on home.
  - `it("home filters magazines by topic")`.
  - `it("shelf: members see members-only issues, outsiders only public ones")`.
  - `it("shelf of a magazine in a private community with no public issue is null for outsiders")`.
  - `it("issue page is null for outsiders on a members issue and for everyone but editors on a draft")`.
  - `it("article page is null when the article is not placed in that issue")`.
  - `it("the community tab returns null when the community has no magazine")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines` and `<DB test prefix> pnpm vitest run src/server/magazines/reading.integration.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(magazines): read models for magazine pages`.

---

## Task 9: Every existing article surface asks the access rule

**Files:**
- Create: `src/server/articles/article-access.ts`, `src/server/articles/article-readers.test.ts`
- Modify: `src/server/api/routers/comments.ts`, `src/server/api/routers/agent.ts`, `src/app/sitemap.ts`, `src/server/members/profile-work.ts`, `src/components/members/profile/work-entries.ts`, `src/app/[locale]/blog/edit/[slug]/page.tsx`
- Test: `src/server/articles/article-access.test.ts`, `src/app/sitemap.test.ts`, `src/server/members/profile-work.test.ts`, `src/components/members/profile/work-entries.test.ts`, `src/server/articles/article-surfaces.integration.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** Blog-public articles, plus magazine articles placed in one of these readable issues and published. */
  export function readableArticleWhere(readableIssueIds: readonly number[]): Where;
  /** The one per-article read check (comments, any by-id read). */
  export async function canReadArticle(deps: Deps, article: Pick<Article,"id"|"status"|"authorType"|"reviewStatus"|"magazine"|"magazineIssue"|"authorId">, viewerId: string | null): Promise<boolean>;
  /** /blog/<slug> or the magazine path, for links on profiles, search and the sitemap. */
  export async function articleHrefs(payload: PayloadClient, articles: Pick<Article,"id"|"slug"|"magazineIssue">[]): Promise<Map<number, string>>;
  ```
  `canReadArticle` dispatches on `channelFor(article).id` with an exhaustive `switch` (blog → `isPublicArticle`; magazine → status published and `loadMagazineIssueAccess` of its placement ≠ `none`, or viewer is an editor of its community). `ProfileWorkArticle` gains `href: string`; `work-entries.ts` uses it.
- Surface changes: `comments.list` and `comments.create` call `canReadArticle` (`NOT_FOUND` when false; `create` keeps its "unpublished" message for blog drafts); `agent` article search uses `readableArticleWhere(await readableIssueIds(payload, await loadIssueReadScope(db, null)))` plus the title filter, and drops the bogus `communityId` condition on articles; `sitemap.ts` gains an injected `getMagazinePaths: () => Promise<string[]>` (default: `/magazines`, every shelf with a public issue, every public issue, every published article in a public issue — anonymous scope) and its article query switches to `publicArticleWhere()`; `profileArticlesWhere(userId, publicIssueIds)` = author AND `readableArticleWhere(publicIssueIds)`; `blog/edit/[slug]` → `notFound()` for a magazine article.

- [ ] **Step 1: Write the readers guard test** `article-readers.test.ts`: `it("every module that queries the articles collection is a reviewed reader")` — scan `src/**/*.{ts,tsx}` (excluding tests) for `collection: "articles"` and assert the file set equals: `src/app/sitemap.ts`, `src/app/feed.xml/route.ts`, `src/app/[locale]/blog/page.tsx`, `src/app/[locale]/blog/[slug]/page.tsx`, `src/app/[locale]/blog/edit/[slug]/page.tsx`, `src/server/api/routers/{articles,comments,agent}.ts`, `src/server/members/profile-work.ts`, `src/server/badges/metrics.ts`, `src/server/articles/article-access.ts`, `src/server/magazines/{reading,article-publication,issue-service}.ts`, `src/server/magazines/items/article/kind.ts`. The failure message says: "A new articles reader must use publicArticleWhere / readableArticleWhere / canReadArticle — add it here after review."
- [ ] **Step 2: Write the failing unit tests.** `article-access.test.ts`: `it("readableArticleWhere with no readable issues is the blog rule only")`; `it("adds placed, published magazine articles for readable issues")` (exact `Where`). `sitemap.test.ts`: `it("lists magazine paths from the injected source")`; `it("magazine path lookup failure still returns the other entries")`; `it("uses the public article rule for /blog entries")`. `work-entries.test.ts`: the entry `href` comes from `article.href`. `profile-work.test.ts`: `profileArticlesWhere(userId, [7])` exact `Where`.
- [ ] **Step 3: Write the failing DB test** `article-surfaces.integration.test.ts` — one magazine article in a published public issue of a listed community:
  - `it("public: on the profile with the magazine link, in agent search, in the sitemap, comments readable")`.
  - `it("never on /blog, the blog feed query or My articles")` — `publicArticleWhere()` find excludes it.
  - `it("switching to members removes the article from every surface")` — `updateIssue({ visibility: "members" })`, then: profile list lacks it, agent search lacks it, `getMagazinePaths()` lacks the issue and article, `comments.list` for an outsider → `NOT_FOUND`, for a member → OK.
  - `it("badge metrics count a published magazine article and not an approved unpublished one")`.
- [ ] **Step 4: Run** → FAIL. **Step 5: Implement.** **Step 6: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/articles src/app/sitemap.test.ts src/app/sitemap-lastmod.test.ts src/server/members src/components/members src/app/api/mcp` and `<DB test prefix> pnpm vitest run src/server/articles/article-surfaces.integration.test.ts` → PASS.
- [ ] **Step 7: Commit** — `feat(magazines): route every article surface through the access rule`.

---

## Task 10: Item renderers, the cover-story layout and the issue reading page

**Files:**
- Create: `src/components/magazines/items/registry.tsx`, `article-item.tsx`, `editorial-item.tsx`, `src/components/magazines/layouts/registry.ts`, `src/components/magazines/layouts/cover-story.tsx`, `src/components/magazines/reading/issue-reader.tsx`, `issue-contents.tsx`, `issue-rail.tsx`, `issue-cover.tsx`, `src/app/[locale]/magazines/[magazineSlug]/[issueSlug]/page.tsx`
- Modify: `messages/en.json`, `messages/nl.json` (`magazines` namespace)
- Test: `src/components/magazines/items/registry.test.tsx`, `src/components/magazines/layouts/cover-story.test.tsx`, `src/components/magazines/reading/issue-reader.test.tsx`

**Interfaces:**
- Consumes: `IssueItemView`, `EditorItemView` (Task 5), `loadIssuePage`, paths (Task 8), `LexicalRenderer` (`src/lib/lexical.tsx`).
- Produces:
  ```ts
  export type ItemRendererProps<K extends ItemKindId> = { view: Extract<IssueItemView, { kind: K }>; lead: boolean; href: (articleSlug: string) => string };
  export const ITEM_RENDERERS: { [K in ItemKindId]: React.ComponentType<ItemRendererProps<K>> }; // a missing kind is a type error
  export function IssueItem(props: { view: EditorItemView; lead: boolean; href: ... }): JSX.Element; // renders the registry entry, or the editor-only "No longer available" marker
  export type LayoutProps = { items: EditorItemView[]; href: ...; editorNote: React.ReactNode };
  export const LAYOUTS: { [L in IssueLayout]: React.ComponentType<LayoutProps> };
  export function IssueReader(props: { data: NonNullable<Awaited<ReturnType<typeof loadIssuePage>>>; locale: AppLocale }): JSX.Element;
  ```
  Shape (mockup screen 2): left — sticky contents (`<nav aria-label>` with an `<ol>`: "From the editor", then each item title; reading time and item count in mono); centre — cover (masthead, issue number + month in mono, title), editor's note card (`<SectionLabel>From the editor</SectionLabel>`, `LexicalRenderer`), then the layout; right rail — about the magazine + link to the community (Ink button "Visit {community}" — no subscribe in this slice), past issues (3), share (Copy link only). `cover-story`: first item is the lead (wide card, larger heading, excerpt, "Read article"), the rest a responsive `@container` grid; editorial items render their body. The page: RSC, `notFound()` when `loadIssuePage` is null; `generateMetadata` uses the same loader (null → empty metadata); `robots: { index: false }` unless the issue is `public`; `buildOgMeta` with title, magazine name and cover. Editors on a draft see a quiet "Draft — only editors can see this" note and an "Edit issue" link.

- [ ] **Step 1: Write the failing tests.**
  - `registry.test.tsx`: `it("renders each kind through its own renderer")`; `it("shows editors a 'No longer available' marker and renders nothing else for it")`.
  - `cover-story.test.tsx`: `it("renders the first item as the lead and the rest in the grid, in order")`; `it("an issue of only editorial blocks still renders")`.
  - `issue-reader.test.tsx`: `it("contents list links to every item anchor in order")`; `it("only one primary (orange) button on the page")` — at most one element with the `bg-primary` button variant; `it("draft notice and Edit link appear only for editors")`.
- [ ] **Step 2: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines` → FAIL. **Step 3: Implement** (DESIGN.md frame exception (b) from Task 0). **Step 4: Run** → PASS.
- [ ] **Step 5: Visual check** in the running app (`pnpm dev` uses `.env` = production DB — **do not**; run against the test DB: `set +eu; set -a; . .env.docker; set +a; unset PAYLOAD_PUSH; SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm exec next dev`) at 390px, 1024px, 1440px and 1600px, light and dark, en and nl. Fix overflow from Dutch strings.
- [ ] **Step 6: Commit** — `feat(magazines): issue reading view with the cover-story layout`.

---

## Task 11: Article long-read page

**Files:**
- Create: `src/components/magazines/reading/magazine-article.tsx`, `src/app/[locale]/magazines/[magazineSlug]/[issueSlug]/[articleSlug]/page.tsx`
- Modify: `messages/{en,nl}.json`
- Test: `src/components/magazines/reading/magazine-article.test.tsx`

**Interfaces:**
- Consumes: `loadMagazineArticlePage` (Task 8), `LexicalRenderer`, `extractHeadings`, `estimateReadingTime`, `BlogToc` (`src/components/blog/blog-toc.tsx`), `ArticleComments` (`src/components/blog/article-comments.tsx`, props `{ articleId, initialComments, currentUserId }`), `JsonLd`.
- Produces: `MagazineArticle(props: { data; comments; currentUserId?: string })`. Layout: breadcrumb-like context line (magazine › issue N, Geist Sans), title, author + reading time (mono for minutes/date), body at `max-w-[72ch]`, headings TOC from `lg` (reuse `BlogToc`), "Next in this issue" card, then comments. JSON-LD `Article` with `isPartOf` the issue only when the issue is public. Same `notFound`/metadata/`robots` rules as Task 10.

- [ ] **Step 1: Failing tests:** `it("renders the body with the shared Lexical renderer and a contents list from its headings")`; `it("links back to the issue and to the next article in the issue")`; `it("emits JSON-LD only for a public issue")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines/reading` → PASS. **Step 5: Visual check** as in Task 10.
- [ ] **Step 6: Commit** — `feat(magazines): magazine article long-read page`.

---

## Task 12: `/magazines` home, magazine shelf and the top-nav link

**Files:**
- Create: `src/components/magazines/reading/magazines-home.tsx`, `featured-issue.tsx`, `issue-cover-card.tsx`, `magazine-shelf.tsx`, `src/app/[locale]/magazines/page.tsx`, `src/app/[locale]/magazines/[magazineSlug]/page.tsx`
- Modify: `src/components/navbar.tsx`, `messages/{en,nl}.json` (`nav.magazines`, `magazines.*`)
- Test: `src/components/magazines/reading/magazines-home.test.tsx`, `magazine-shelf.test.tsx`, `src/components/navbar.test.tsx` (if present; else add the assertion to the closest existing navbar test)

**Interfaces:**
- Consumes: `loadMagazinesHome`, `loadMagazineShelf`, `IssueCard`, `MagazineCard` (Task 8).
- Produces: `MagazinesHome({ data, activeTopic })`, `MagazineShelf({ data })`, `IssueCoverCard({ issue, size: "sm" | "md" | "lg" })` (one cover component reused by home, shelf, community tab and rail: masthead = magazine name, issue number + month in mono, title; uses `coverImageUrl` with a neutral token background when missing — no orange fills).
  Home (mockup screen 1): `<SectionLabel>Magazines</SectionLabel>`, h1 "Stories from the communities building AI" (copy in both locales, everyday words), featured issue beside "Just published" (4), then "All magazines" with topic filter chips (`?topic=`; links, `aria-current` on the active one, ink not orange) and a grid of `MagazineCard`s. Empty home → `EmptyState` explaining magazines and linking to `/communities`. Shelf: magazine identity (logo, name, community link, description, topics), issues grid; members-only issues carry a neutral "Members only" badge for members. Both pages RSC with `generateMetadata` (`localeAlternates`). Navbar: `{ href: "/magazines", key: "magazines", shortcut: <an unused letter — grep the list first>, primary: false }`.

- [ ] **Step 1: Failing tests:** home — `it("features the newest issue and lists the next four as just published")`, `it("topic chips filter by link and mark the active topic")`, `it("shows a teaching empty state when nothing is public yet")`; shelf — `it("marks members-only issues for members")`, `it("links every cover to its issue path")`; navbar — `it("has a Magazines link")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** with DESIGN.md frame exception (a). **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines src/components/navbar*` → PASS. **Step 5: Visual check** as in Task 10.
- [ ] **Step 6: Commit** — `feat(magazines): magazines home and magazine shelf`.

---

## Task 13: Community Magazine tab and magazine settings

**Files:**
- Create: `src/app/[locale]/communities/[slug]/magazine/page.tsx`, `src/components/magazines/community/magazine-tab.tsx`, `src/components/magazines/editor/editor-desk.tsx`, `src/components/magazines/editor/magazine-settings-form.tsx`, `src/components/magazines/editor/public-opt-in.tsx`, `src/components/magazines/editor/editor-errors.ts`, `src/app/[locale]/communities/[slug]/settings/magazine/page.tsx`
- Modify: `src/components/communities/settings/settings-sidebar.tsx` (key `magazine` after `classroom`), `messages/{en,nl}.json` (`communities.profile.magazine`, `communities.settings.sidebar.magazine`, `magazineEditor.*`)
- Test: `magazine-tab.test.tsx`, `magazine-settings-form.test.tsx`, `public-opt-in.test.tsx`, `editor-errors.test.ts`

**Interfaces:**
- Consumes: `loadCommunityMagazineTab` (Task 8), tRPC `magazines.getSettings/saveSettings/listIssues/createIssue/availableArticles/myDraftArticles` (Task 7), `IssueCoverCard` (Task 12).
- Produces:
  - `editorErrorKey(code: string | undefined): MessageKey` — maps every `MagazineErrorCode` to a `magazineEditor.errors.*` key, unknown → `generic`.
  - `PublicOptIn({ communityIsPrivate, value, confirmed, onConfirmedChange })` — shown only when `value === "public"` and the community is private; plain words: "Your community is private. If you show this to everyone, anyone on the internet will see your community's name and a link to it. Your members, posts and other pages stay private." plus a required checkbox "I understand, show this outside the community". Used by settings (default visibility) and the builder (issue visibility).
  - `MagazineSettingsForm({ slug })` — name, address (`magazineSlug`, live preview of `/magazines/<slug>`), description, logo upload (same `fetch("/api/upload")` call as `src/components/classroom/builder/course-details-pane.tsx:60-80`), topics (max 5), default visibility via `SegmentedControl` (Members only / Everyone) with help text "Applies to new issues only", `PublicOptIn`. Save button is the page's one primary action. Errors through `editorErrorKey`.
  - `MagazineTab` (server-rendered from `loadCommunityMagazineTab`): latest issue large cover + "Read the issue" (primary), archive shelf of covers. `EditorDesk` (client, rendered only when `viewerIsEditor`): "New issue" (creates and routes to the builder), "Write an article" (→ `/communities/<slug>/magazine/write`), drafts list (issues with status), "Ready for an issue" articles list, link to settings. No magazine: editors get an `EmptyState` "Start a magazine" → settings; others `notFound()`.
- [ ] **Step 1: Failing tests:** `editor-errors.test.ts` — `it("maps every MagazineErrorCode to a message key present in en and nl")` (iterate `MAGAZINE_ERROR_CODES`, load both JSON files); `public-opt-in.test.tsx` — `it("appears only for public in a private community and blocks save until checked")`; `magazine-settings-form.test.tsx` — `it("sends confirmUnlistedPublic only when the box is checked")` (assert on the mutation call, not the result), `it("shows a friendly message for MAGAZINE_SLUG_TAKEN")`; `magazine-tab.test.tsx` — `it("shows the editor desk only to editors")`, `it("empty state for editors when there is no magazine yet")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines src/components/communities` → PASS. **Step 5: Visual check** as in Task 10, inside the community frame (rail + `@container` columns, never screen breakpoints).
- [ ] **Step 6: Commit** — `feat(magazines): community magazine tab and magazine settings`.

---

## Task 14: Issue builder

**Files:**
- Create: `src/app/[locale]/communities/[slug]/magazine/issues/[issueId]/edit/page.tsx`, `src/components/magazines/editor/builder/issue-builder.tsx`, `builder-top-bar.tsx`, `items-list.tsx`, `items-model.ts`, `item-row.tsx`, `add-items-panel.tsx`, `editorial-item-editor.tsx`, `issue-details.tsx`, `live-preview.tsx`, `publish-dialog.tsx`
- Modify: `src/lib/communities/layout-variant.ts` (`["magazine", "issues", null, "edit"]`), `messages/{en,nl}.json`
- Test: `items-model.test.ts`, `issue-builder.test.tsx`, `publish-dialog.test.tsx`, `src/lib/communities/layout-variant.test.ts`

**Interfaces:**
- Consumes: tRPC `getIssueForEditing`, `updateIssue`, `setIssueItems`, `publishIssue`, `availableArticles` (Task 7); `RichTextEditor` (`src/components/article-editor/rich-text-editor.tsx`); `useAutosave` pattern (`src/components/classroom/builder/use-autosave.ts`); `LAYOUTS`, `IssueItem` (Task 10); `PublicOptIn`, `editorErrorKey` (Task 13).
- Produces:
  ```ts
  // items-model.ts (pure)
  export type BuilderItem = IssueItemInput & { key: string };
  export function moveItem(items: BuilderItem[], from: number, to: number): BuilderItem[];
  export function removeItem(items: BuilderItem[], key: string): BuilderItem[];
  export function addArticle(items: BuilderItem[], articleId: number): BuilderItem[];  // no duplicates
  export function addEditorial(items: BuilderItem[]): BuilderItem[];
  export function publishBlockers(input: { title: string; items: BuilderItem[]; problems: ItemProblem[] }): Array<"NO_TITLE" | "NO_ITEMS" | "INVALID_ITEM">;
  ```
  Shape (mockup screen 4): workspace route (no community chrome). Top bar: back to the Magazine tab, kicker `/ <magazine> · Issue <n> · Draft|Published`, title, save status (Saving… / Saved / Couldn't save — Retry), **Publish** (the one orange button; becomes disabled "Published" after). Left: issue details (title, slug — read-only once published, cover upload, editor's note in `RichTextEditor`, visibility `SegmentedControl` + `PublicOptIn`), then the items list (drag handle via `@dnd-kit/sortable`, plus a `⋯` menu with Move up / Move down / Remove for keyboard and mobile; unavailable items show the editor marker). Centre: live preview rendering the real `LAYOUTS[layout]` with two modes via `SegmentedControl`: Member / Phone (narrow frame); a "Visitor" mode shows what outsiders get (nothing for members-only, the full issue for public). Right: "Add more" panel with two tabs in this slice — Articles (from `availableArticles`, Add button) and Editorial block (adds an empty block). Items save through `setIssueItems` with `expectedUpdatedAt`, debounced like `useAutosave`; details through `updateIssue`. `ISSUE_CHANGED` shows "This issue changed somewhere else — Reload", never a silent overwrite. Publish dialog lists blockers from `publishBlockers`, says who will be able to read it (members only / everyone), and on success links to the reading page.
- [ ] **Step 1: Failing tests:** `items-model.test.ts` — move up/down/edges, remove, no duplicate article, blockers for empty title/no items/invalid item. `layout-variant.test.ts` — `["magazine","issues","5","edit"]` → `workspace`; `["magazine"]` → `standard`. `issue-builder.test.tsx` — `it("reorders by the menu and saves the new order with expectedUpdatedAt")` (assert on the `setIssueItems` call input), `it("shows the reload message on ISSUE_CHANGED and keeps local edits")`, `it("blocks Publish when visibility is public in a private community until the box is checked")`. `publish-dialog.test.tsx` — `it("lists blockers and disables Publish while any remain")`, `it("names the audience in plain words")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Server gate in `page.tsx`: `getSession()` → sign-in redirect; issue must belong to this community and the viewer must be a magazine editor, else `notFound()` (Gate-Before-Fail). **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines src/lib/communities` → PASS. **Step 5: Visual + keyboard check** as in Task 10: reorder by keyboard and by menu, focus rings, 1440/1600 widths, phone.
- [ ] **Step 6: Commit** — `feat(magazines): issue builder`.

---

## Task 15: Writing magazine articles with the existing editor

**Files:**
- Create: `src/components/article-editor/destination.ts`, `src/app/[locale]/communities/[slug]/magazine/write/page.tsx`, `src/app/[locale]/communities/[slug]/magazine/articles/[articleSlug]/edit/page.tsx`
- Modify: `src/components/article-editor/article-editor.tsx`, `src/components/article-editor/types.ts`, `src/components/article-editor/pre-publish-dialog.tsx` (copy only), `messages/{en,nl}.json` (`articleEditor.magazine.*`)
- Test: `src/components/article-editor/destination.test.ts`, `src/components/article-editor/article-editor-magazine.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type ArticleDestination = { kind: "blog" } | { kind: "magazine"; magazineId: number; magazineName: string; communitySlug: string };
  export function destinationBehaviour(d: ArticleDestination): {
    createExtras: { magazineId?: number };
    afterSubmitHref: string;              // "/blog/my-articles" | communityMagazinePath(slug)
    submitLabelKey: "submitForReview" | "magazine.markReady";
    showTrustedPublish: boolean;          // false for magazine
  };
  ```
  `ArticleEditorProps` gains `destination?: ArticleDestination` (default `{ kind: "blog" }`). The editor reads every destination difference from `destinationBehaviour` — no `destination.kind ===` checks in the component. Pages: server gate (session → sign-in redirect; viewer must be magazine editor; the edit page requires the article to belong to this community's magazine and the viewer to be its author), standard community frame.
- [ ] **Step 1: Failing tests:** `destination.test.ts` — both behaviours exactly. `article-editor-magazine.test.tsx` — `it("creates the draft with the magazine id")` (assert on `articles.create` input), `it("labels the action 'Mark ready for an issue' and returns to the Magazine tab")`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/article-editor` → PASS.
- [ ] **Step 5: Commit** — `feat(magazines): write magazine articles in the article editor`.

---

## Task 16: Whole-branch verification

- [ ] **Step 1: Freshness check** — `git fetch origin && git log origin/main --oneline | grep -i magazin; gh pr list --search magazine`. If `origin/main` moved, rebase, re-check the migration name/date and ADR numbers against main, and re-run Task 1 Step 6 if `src/payload-types.ts` conflicts.
- [ ] **Step 2: Full suites** — `pnpm typecheck && pnpm lint && SKIP_ENV_VALIDATION=1 pnpm vitest run` → all pass. Then the whole DB suite: `<DB test prefix> pnpm vitest run --dir src` → all DB tests executed (none skipped) and pass. CI runs Node 20; if a jsdom/localStorage test fails only here, reproduce with `npx node@20` before changing code.
- [ ] **Step 3: Production build check** (never `pnpm build`): `NODE_ENV=production PAYLOAD_PUSH=false SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm exec next build` → succeeds.
- [ ] **Step 4: End-to-end walk in the browser** against the test DB (Task 10 Step 5 command): create a magazine in an unlisted community (confirmation required for public), write and mark an article ready, build an issue with an article and an editorial block, publish as members-only, check it is 404 signed out; switch to public with confirmation, check `/magazines`, the shelf, the issue, the article, the author profile and `/sitemap.xml`; switch back to members and check they are gone.
- [ ] **Step 5:** `git status --short` is clean; then hand over for a fresh-agent review of the branch (give it only the branch name and "review this branch against `docs/superpowers/specs/2026-10-26-community-magazines-design.md` slice 1").
