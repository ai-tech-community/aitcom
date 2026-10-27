# Community Magazines — Contributors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A magazine has its own team. Community owners and admins (and editors-in-chief they appoint) give members the role of editor-in-chief, editor or contributor. Contributors write articles and send them to the editors. Editors approve them, ask for changes or decline them, all inside the site. When an issue that holds a contributor's article is published, the writer gets points and a "Published in a magazine" badge.

**Architecture:** Staff roles are a Drizzle table, `app.magazine_staff`. The one editorship seam (`src/server/magazines/editorship.ts`, ADR-0042) reads it. Roles map to three **capabilities** (`write`, `edit`, `manage`) in one client-safe table (`src/lib/magazines/roles.ts`). Every gate asks for a capability, never for a role. `MagazineStanding.isEditor` keeps meaning "has `edit`", so the read resolver, the read scope and every reading surface work unchanged. Handing in an article follows the article publication channel seam (ADR-0043). The magazine channel's submit policy becomes `magazine_review`. A server module chooses between "mark ready" (writers with `edit`) and "send for review" (contributors). The review reuses `reviewStatus` / `reviewNote`. Notifications are rows in the existing inbox `notification` table (ADR-0025). Credit stays where slice 1 put it, in `creditPendingMagazineArticles`. That function now also awards one new badge, a milestone.

**Tech Stack:** Next.js App Router (RSC pages), tRPC, Payload CMS 3.77 (Articles, Local API), Drizzle (`app` schema), next-intl (en + nl), shadcn/ui primitives, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-26-community-magazines-design.md`. Read "Domain model → Magazine staff", "Review, credit and where magazine articles show", "Flows 2 and 4" and "Delivery slices → 3". Read first: ADR-0042, ADR-0043, ADR-0044, `docs/superpowers/plans/2026-10-26-community-magazines-core.md` and `…-platform-content.md` with their `-rulings.md` files. Those rulings still hold unless this plan says otherwise.

## Decisions this plan makes (spec gaps)

1. **Storage: `app.magazine_staff` (Drizzle), as ADR-0043 planned.** Columns: `magazine_id` int (FK `public.magazines` ON DELETE cascade), `community_id` varchar(255), `user_id` varchar(255) (FK `app.user` ON DELETE cascade), `role` varchar(20) with a CHECK on the three roles, `assigned_by` varchar(255) (FK `app.user` ON DELETE set null), `created_at`, `updated_at`. The primary key is `(magazine_id, user_id)`, so a person has one role per magazine. There is an index on `user_id`. `community_id` is copied from the magazine. A magazine never changes community, and the batched read scope (`loadEditorScope`) needs community ids without joining a Payload table. "Never changes" is enforced: Task 1 adds `access: { update: () => false }` to the `communityId` field of `src/collections/Magazines.ts`, so Payload admin cannot move a magazine (field access only; the site's Local API calls run with `overrideAccess`, and no schema or generated type changes). We rejected a Payload collection because staff is membership-style data that the site writes, never the admin.
2. **Roles grant capabilities (Strategy-as-data table).** `contributor` → `write`. `editor` → `write`, `edit`. `editor_in_chief` → `write`, `edit`, `manage`. `write` means: write magazine articles and hand them in. `edit` means: issues (build, publish), review, see drafts. `manage` means: magazine settings and the team. Callers ask `standingCan(standing, capability)`. No code outside `roles.ts` compares role names. A new role, or a capability moving between roles, is a one-line change. Queries that must pick roles in SQL use `rolesWith(capability)` (built from the table), never a literal list. `MagazineStanding.role` is for display only (the Magazine tab desk choice goes through `roleCan`); a guard test (Task 10) fails when a role literal appears outside `roles.ts`, messages and tests.
3. **Community owner/admin = implicit editor-in-chief.** This is not stored. They cannot be given a role (`STAFF_LEADS_COMMUNITY`). Moderators are readers unless given a role. The owner/admin rule lives in one function, `leadsCommunity(communityRole)` in `editorship.ts`; `standingOf`, `listMagazineEditorIds` and `staff-service.ts` all use it, and nothing else names `"owner"`/`"admin"` for magazines.
4. **A role counts only while its holder is an active community member.** Rows are not deleted when someone leaves or is banned. They stay inert. The team page lists them as "Not a member now" with a Remove button. We rejected deleting rows from every leave, ban and remove path (five call sites in `communities.ts`): that is easy to miss, and a missed path would leave a live role behind.
5. **`manage` belongs to editors-in-chief, appointed or implicit.** The spec says "owners/admins assign the others". An appointed editor-in-chief would then be only a title. So we let editors-in-chief run the team and the settings too. _(Claude's call. Reversible by removing `manage` from `editor_in_chief` in one table row.)_ An appointed editor-in-chief need not be a community admin, so the magazine's settings and team pages move into the magazine area: `/communities/[slug]/magazine/settings` and `/communities/[slug]/magazine/team`. The old `/communities/[slug]/settings/magazine` route redirects to the new settings page.
6. **Two ways to hand in an article, chosen by capability.** A writer with `edit` marks it ready (approval, as in slice 1). A contributor sends it for review (`reviewStatus = pending_review`), and editors are notified. `handInFor(canEdit: boolean)` decides, and it is the only place that decides: the UI reads it through `MagazineWriting.handIn`, and `submitMagazineArticle` switches exhaustively on `handInFor(standingCan(standing, "edit"))`. The article editor learns which one through `ArticleDestination.handIn`. The channel policy names change: `submitPolicy: "magazine_review"` (was `editor_approves`) and the field `publishedEditPolicy` is renamed `editPolicy` (it now also governs edits before publication) with the value `"magazine"` (was `magazine_editor`). The channel still only says "the magazine decides"; the magazine module decides how.
7. **A contributor's article is locked unless it is open for the writer.** Open means: not published, and `reviewStatus` is null or `changes_requested` (`isOpenForWriter`). The one rule "may this writer still change it" is `mayWriterChange(canEdit, article)` in `src/lib/magazines/review.ts` (`canEdit || isOpenForWriter(article)`); the edit page gate, the API (update, submit, delete) and the desk links all call it. **Delete** follows the same rule: a magazine article may be deleted by its author only with `write` and while `mayWriterChange` holds (plus the existing "not published, not placed" checks); so a contributor cannot pull an article that is with the editors or approved, and a writer removed from the team cannot delete. When the writer saves an article that has changes requested, `reviewStatus` clears, so they send it again; for magazine articles the editors' `reviewNote` is **kept** until the next send-in (which sets it to null), so the note stays visible while they work. Lock check and write happen in one transaction under a row lock (Decision 12), so an autosave that read the article before it was sent in cannot change it afterwards. Writers with `edit` may always edit their own articles (slice 1 rule). Nobody in the site edits a contributor's published article in this slice (see Risks).
8. **Review decisions apply only to `pending_review` articles.** They are `approve` → `approved` (note cleared), `request_changes` → `changes_requested` (note required, 1–2000 characters), and `reject` → `rejected` (note optional). The write is a Payload update without `draft` (like `markReadyForIssue`). The Articles hooks log only `changes_requested` / `rejected` (with the writer as actor) and nothing on approval, so `reviewMagazineArticle` logs its own `magazine_article.reviewed` activity (actor: the reviewer; metadata: `{ decision, magazineId, title }`) for every decision. Magazine articles earn no submit XP: credit comes only when the issue is published (spec).
9. **Notifications are rows in the `notification` table.** The text is English, taken from `messages/en.json` (the `badges/notify.ts` precedent). Links go in `metadata.reviewPath` / `linkLabel`. They never fail the action that caused them: they are logged and dropped. Types: `magazine_role_assigned`, `magazine_article_submitted`, `magazine_article_reviewed`. There is no email in this slice.
10. **Credit: XP and the writer badges already fire on issue publish (slice 1).** This slice adds the milestone badge `magazine_published` ("Published in a magazine", glyph `book`). It is awarded right after an article's credit commits, through `awardMilestone`, which never throws. Authors credited before this slice get it from the badge backfill. The backfill gains a small `DERIVED_MILESTONES` registry: one entry now, one entry per future data-derived milestone. Greg runs the backfill CLI on prod.
11. **Who may read an unplaced magazine article does not change: editors only.** A contributor sees their own text in the article editor. The review page is an editor surface, never indexed. _This narrows the spec_ ("visible only to its author and magazine staff", where contributors are staff): contributors do not read each other's unplaced articles. Also _narrowed_: spec Goal 7 says "members can submit articles"; here only members on the team as contributor (or editor) can. Both go in ADR-0045 and the PR's "please check" list.
12. **Hand-ins, decisions, saves and deletes of a magazine article serialize on the article row.** Each runs inside `inPayloadTransaction` and first calls `lockArticle(tx, payload, articleId)` (Task 4, `payload-writes.ts`): `SELECT 1 FROM "articles" WHERE "id" = $1 FOR UPDATE`, then `payload.findByID({ draft: true, req: tx.req, disableErrors: true })` (the latest version, read after the lock). The check (`mayWriterChange`, or `reviewStatus === "pending_review"`) runs on that fresh read, and the Payload write uses `req: tx.req`. Notices are sent after commit. So of two decisions at once, the second waits, sees the new status and gets `ARTICLE_NOT_PENDING`; of two send-ins (double click), the second gets `ARTICLE_LOCKED` and no notices; an autosave in flight after a send-in gets `ARTICLE_LOCKED`. This is the shipped `publishIn` pattern (`article-publication.ts`, a conditional claim inside `inPayloadTransaction`); we lock rather than claim with a conditional UPDATE because Payload's draft saves write the latest version, not the main row's column, so the status must be read through Payload after the lock.
13. **One migration, `src/migrations/20261027a_magazine_staff.ts`.** If `origin/main` has a later migration when Task 1 starts, use the next free date-letter name everywhere below.
14. **Making an issue or the magazine public in an unlisted community stays with community owners and admins.** In slice 1 only they could pass `confirmUnlistedPublic`. An appointed editor or editor-in-chief who passes `confirmUnlistedPublic: true` (in `updateIssue` or `saveSettings`) gets `UNLISTED_PUBLIC_LEADERS_ONLY` (FORBIDDEN). They can still publish members-only issues, and public issues in a listed community. Reason: the unlisted choice belongs to the community's leaders (ADR-0030 exception in ADR-0042). `MagazineStanding` carries `leadsCommunity: boolean` for this.
15. **A contributor sees all their unpublished magazine articles on their desk**, approved ones included, as "Ready for an issue", until an issue publishes them. Only open rows (`mayWriterChange(false, row)`) link to the edit page; the rest show their status and, for changes asked or declined, the editors' note.

## Global Constraints

- Branch: `feat/community-magazines-contributors`, created by the controller (not a task agent), based on `origin/main` (the platform-content PR #505 has merged as `c6a1eb25`). Run `git branch --show-current` before every commit. Never `git checkout`/`git switch`, never `git stash`, never `git add -A` / `git add .`. Stage files by name and confirm every staged file is yours.
- No `Co-Authored-By`, "Generated with" or any AI credit line in commits or PRs.
- Before Task 1, after Task 5 and before opening the PR: `git fetch origin && git log origin/main --oneline | grep -i -E "magazin|contributor|staff"; gh pr list --search magazine`. Stop if another session shipped part of this.
- **Never** run `pnpm db:apply`, `pnpm db:push`, `pnpm build`, `pnpm dev`, `drizzle-kit generate`, or anything that reads `.env`. Its `DATABASE_URL` is production, and prod applies migrations on merge. Never `source`/`.` `.env` or `.env.docker`.
- Unit test prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run`.
- **DB test prefix** (use exactly; never host port 5432):
  `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test`
  If `aitcom_test` is not reachable, set it up once: `pnpm dev:db`; `docker run -d --rm --name aitcom-test-pg-forward --network aitcom_default -p 127.0.0.1:55432:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp:postgres:5432`. A new Drizzle table reaches the test DB only through its migration's `up` (Task 1's migration test runs it). Never set `PAYLOAD_PUSH` against `aitcom_test`. A DB suite that reports _skipped_ is a setup failure: fix the env, do not continue.
- Integration tests copy the `isLocalDbConfigured` guard and fixture style of `src/server/api/routers/magazines.integration.test.ts`: a unique suffix per test, users plus member profiles, owner/admin/moderator/member/outsider, cleanup in `afterEach`. The cleanup also deletes `app.magazine_staff` and `app.notification` rows of the fixture users.
- No Payload schema changes in this slice, so there is no `payload generate:types`. The one collection edit is field-level `access` on `Magazines.communityId` (Task 1), which changes neither the schema nor the generated types. If a task finds it needs a schema change, stop and report.
- **Running the app** (visual checks only). Commit first, then export `HEAD`: `X="$TMPDIR/aitcom-visual"; rm -rf "$X"; mkdir -p "$X"; git -C /Users/greg/coding-projects/aitcom archive HEAD | tar -x -C "$X"; ln -s /Users/greg/coding-projects/aitcom/node_modules "$X/node_modules"`. Then, in `$X`: `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=development SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test RESEND_API_KEY= BETTER_AUTH_SECRET=local-visual-check PAYLOAD_SECRET=local-visual-check pnpm exec next dev -p 3100`.
- Every user-visible string goes through next-intl in **both** `messages/en.json` and `messages/nl.json`, in everyday words. The plan gives the English; the task writes natural Dutch alongside (informal "je", as the rest of `nl.json`). Task 3 adds a key-parity test that fails when the two files' key trees differ under `magazineEditor`, `articleEditor.magazine` and `badges`. Do not use "capability", "staff", "role" or "review status" in copy. Say "team", "editor", "contributor", "job on the team", "waiting for the editors". A sentence naming someone's job uses one message per job ("You are now a contributor."), never "{role}" pasted into a sentence. Builder and desk copy lives under `magazineEditor.*`. Server refusal codes reach the UI only through `readEditorError` / `editorErrorKey`.
- Design (UI tasks): read `PRODUCT.md` and `DESIGN.md` first. Tokens come from `src/styles/globals.css`, primitives from `src/components/ui/`. One Voice Rule: on the review page **Approve** is the one orange action. On the team page **Add to the team** is the one orange action. Desk buttons stay `ink` / `outline` / `ghost`, because the tab's orange is "Read the issue". `/ LABEL` kickers come only through `<SectionLabel>`. Mono is for dates and counts only. Flat by default: hairline borders, no shadows, no nested cards. Loading → `<Skeleton>`, error → `<ErrorState onRetry>`, empty → text that teaches the next step.
- Accessibility: WCAG 2.2 AA. Label every control; take IDs from `useId()`. Destructive actions (Remove from team, Decline article) ask for confirmation in an `AlertDialog`. Status changes are announced (`role="status"`). No horizontal page scroll at 390px.

## Review Focus

1. **A contributor leaves the community, is banned or is removed from the team while their article waits.** They can no longer write, edit or send in (FORBIDDEN). Their article stays in the queue, and editors can still decide on it. An inert staff row grants nothing anywhere: write page, read scope, members-only issues. Tests: Task 2 (`a staff row without an active membership grants nothing`), Task 5 (`editors decide on an article whose writer left the team`).
2. **A contributor changes or deletes an article after sending it in**, through the API, around the UI (pending, approved, declined, published), or through an autosave already in flight. The answer is `ARTICLE_LOCKED`, and the approved text an editor saw is the text that gets published. Tests: Task 4 (`a sent, approved or declined article is locked for its contributor`, `a save racing a send-in cannot change the sent text`).
3. **A contributor or editor guesses editor URLs, calls editor procedures, approves their own article or promotes themselves**: the issue builder, the review page, the team or settings pages, every `magazines.*` procedure. They get 404 (pages) or FORBIDDEN (API), and they never see draft issues. A staff editor cannot confirm "public in an unlisted community". Tests: Task 3 (`each capability opens exactly its procedures`, `an editor cannot give themselves a job`), Task 5 (`a contributor cannot approve their own article`), Task 2 (parity rows), Task 8 and Task 9 page tests.
4. **Two decisions or two send-ins at the same moment** (two tabs, two editors, a double click). The second decision gets `ARTICLE_NOT_PENDING`, the second send-in `ARTICLE_LOCKED`, and nobody gets a second notice. Tests: Task 5 (`two decisions at once: one wins, one notice`), Task 4 (`two send-ins at once notify each editor once`).
5. **An issue with two articles by the same contributor is published, then edited again.** XP is credited once per article, the badge is awarded once, the contributor gets one `magazine_published` badge notice (the `article_author` tier writes its own notice too), and nothing is credited on approval. Test: Task 6 (`publishing credits contributors on publish only and gives the badge once`).

---

## File structure

**Create**

| File                                                                                         | Responsibility                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/magazines/roles.ts`                                                                 | `MAGAZINE_ROLES`, capabilities table, `roleCan`, `rolesWith`, `handInFor`, `isMagazineRole` (client-safe).                                                                                                                        |
| `src/lib/magazines/review.ts`                                                                | `REVIEW_DECISIONS`, `REVIEW_NOTE_MAX`, `reviewStatusFor`, `isOpenForWriter`, `mayWriterChange`, `WRITER_REVIEW_STATUSES`, `writerStatusOf` (client-safe).                                                                         |
| `src/migrations/20261027a_magazine_staff.ts` (+ `magazine-staff.integration.test.ts`)        | The staff table.                                                                                                                                                                                                                  |
| `src/server/magazines/desk.ts`                                                               | `loadMagazineDesk`: community + magazine + viewer standing by community slug, for the new magazine-area pages (settings, team, review). Existing gates keep their own lookups, which already go through `loadMagazineEditorship`. |
| `src/server/magazines/staff-service.ts`                                                      | List, search candidates, assign, remove.                                                                                                                                                                                          |
| `src/server/magazines/notifications.ts`                                                      | The inbox notices, built on one private `insertMagazineNotices`.                                                                                                                                                                  |
| `src/i18n/messages-parity.test.ts`                                                           | en/nl key parity for this slice's namespaces.                                                                                                                                                                                     |
| `src/server/magazines/article-submission.ts`                                                 | Hand-in and the contributor edit rule.                                                                                                                                                                                            |
| `src/server/magazines/article-review.ts`                                                     | Review queue, review page read model, decisions.                                                                                                                                                                                  |
| `src/components/magazines/editor/desk-list.tsx`                                              | `DeskList`, `UpdatedAt` (moved out of `editor-desk.tsx`).                                                                                                                                                                         |
| `src/components/magazines/editor/contributor-desk.tsx`                                       | The contributor's desk on the Magazine tab.                                                                                                                                                                                       |
| `src/components/magazines/editor/review/{article-review-view,review-actions}.tsx`            | The review page body and its decision controls.                                                                                                                                                                                   |
| `src/components/magazines/editor/team/magazine-team.tsx`                                     | The team page.                                                                                                                                                                                                                    |
| `src/app/[locale]/communities/[slug]/magazine/{review/[articleSlug],team,settings}/page.tsx` | Magazine-area routes.                                                                                                                                                                                                             |
| `docs/adr/0045-magazine-roles-are-capabilities-read-through-the-editorship-seam.md`          | ADR.                                                                                                                                                                                                                              |

**Modify**

`src/server/db/schema.ts`, `src/migrations/index.ts`, `src/collections/Magazines.ts` (field access only), `docs/adr/0042-*.md` ("Amended by" note), `src/server/magazines/{editorship,viewer-role,magazine-articles,errors,reading,article-publication,payload-writes,magazine-service,issue-service}.ts`, `src/server/articles/channels.ts`, `src/server/api/routers/{magazines,articles}.ts`, `src/lib/magazines/paths.ts`, `src/lib/badges/catalog.ts`, `src/server/badges/{engine,backfill}.ts`, `src/components/article-editor/destination.ts`, `src/components/magazines/editor/{editor-desk,editor-errors,magazine-article-workspace}.tsx|ts`, `src/components/magazines/community/magazine-tab.tsx`, `src/components/magazines/test-fixtures.ts`, `src/app/[locale]/communities/[slug]/magazine/articles/[articleSlug]/edit/page.tsx`, `src/app/[locale]/communities/[slug]/settings/magazine/page.tsx`, `messages/{en,nl}.json`, `CONTEXT.md`, `DESIGN.md`.

---

## Task 1: Roles, review values, the staff table and ADR-0045

**Files:**

- Create: `src/lib/magazines/roles.ts`, `src/lib/magazines/review.ts`, `src/migrations/20261027a_magazine_staff.ts`, `docs/adr/0045-magazine-roles-are-capabilities-read-through-the-editorship-seam.md`
- Modify: `src/server/db/schema.ts` (after `magazineArticleCredits`), `src/migrations/index.ts`, `src/collections/Magazines.ts` (`communityId` field gets `access: { update: () => false }`, with a comment pointing at Decision 1), `docs/adr/0042-magazine-issues-are-read-through-one-access-resolver.md` (an "Amended by ADR-0045" line under its status, and the same note beside Decision 1's "no caller changes" sentence and the "Slice 3 replaces one loader" consequence), `CONTEXT.md`
- Test: `src/lib/magazines/roles.test.ts`, `src/lib/magazines/review.test.ts`, `src/migrations/magazine-staff.integration.test.ts`

**Interfaces:**

- Produces (`roles.ts`):
  ```ts
  export const MAGAZINE_ROLES = [
    "editor_in_chief",
    "editor",
    "contributor",
  ] as const; // display order
  export type MagazineRole = (typeof MAGAZINE_ROLES)[number];
  export const MAGAZINE_CAPABILITIES = ["write", "edit", "manage"] as const;
  export type MagazineCapability = (typeof MAGAZINE_CAPABILITIES)[number];
  export function roleCan(
    role: MagazineRole | null,
    capability: MagazineCapability,
  ): boolean;
  /** The roles that grant a capability, in MAGAZINE_ROLES order: for SQL filters (`inArray(magazineStaff.role, rolesWith("edit"))`). */
  export function rolesWith(
    capability: MagazineCapability,
  ): readonly MagazineRole[];
  export type MagazineHandIn = "mark_ready" | "send_for_review";
  /** The one hand-in decision: with "edit" the writer marks it ready, otherwise sends it for review. */
  export function handInFor(canEdit: boolean): MagazineHandIn;
  export function isMagazineRole(value: string): value is MagazineRole;
  ```
- Produces (`review.ts`):
  ```ts
  export const REVIEW_DECISIONS = [
    "approve",
    "request_changes",
    "reject",
  ] as const;
  export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
  export const REVIEW_NOTE_MAX = 2000;
  export function reviewStatusFor(
    d: ReviewDecision,
  ): "approved" | "changes_requested" | "rejected";
  type ArticleState = { status?: string | null; reviewStatus?: string | null };
  /** A contributor may still change or send in the article. */
  export function isOpenForWriter(a: ArticleState): boolean;
  /** THE rule "may this writer still change (edit, send in, delete) it": canEdit || isOpenForWriter(a).
   *  Shared by the edit page gate, articles.update/submit/delete and the desk links. */
  export function mayWriterChange(canEdit: boolean, a: ArticleState): boolean;
  /** Moved from editor-desk.tsx (REVIEW_STATUSES / draftStatusOf), extended with "approved". */
  export const WRITER_REVIEW_STATUSES = [
    "pending_review",
    "changes_requested",
    "rejected",
    "approved",
  ] as const;
  export type WriterStatus = (typeof WRITER_REVIEW_STATUSES)[number] | "draft";
  export function writerStatusOf(reviewStatus: string | null): WriterStatus;
  ```
- Produces (`schema.ts`): `export const magazineStaff = appSchema.table("magazine_staff", …)` with camelCase fields `magazineId`, `communityId`, `userId`, `role` (`.$type<MagazineRole>()`), `assignedBy`, `createdAt`, `updatedAt`. Composite primary key `(magazineId, userId)`, `index("magazine_staff_user_idx").on(userId)`, and `check("magazine_staff_role_check", …)`. `user` references are as in Decision 1. There is no Drizzle reference to `magazines` (it is a Payload table); the FK lives in the migration, as with `magazineArticleCredits`.

- [ ] **Step 1: Write failing unit tests.**
  - `roles.test.ts`: `it("gives each role exactly its capabilities")`. Assert the full 3×3 matrix (`contributor`: write only; `editor`: write, edit; `editor_in_chief`: all). Also `roleCan(null, c) === false` for every `c`.
  - `it("hands in by marking ready only with edit")`. Expect `handInFor(false) === "send_for_review"` and `handInFor(true) === "mark_ready"`, and for every role `handInFor(roleCan(role, "edit"))` gives `send_for_review` only for `contributor`.
  - `it("lists the roles that grant a capability")`. `rolesWith("edit")` equals `["editor_in_chief", "editor"]`; `rolesWith("write")` equals all three; `rolesWith("manage")` equals `["editor_in_chief"]`.
  - `it("recognises only the three role names")`. `isMagazineRole("owner") === false`.
  - `review.test.ts`: `it("maps decisions to review statuses")`. `it("keeps an article open only before it is sent, or after changes were requested")`. Open: `{status:"draft", reviewStatus:null}`, `{status:"draft", reviewStatus:"changes_requested"}`, `{status:"draft"}`. Closed: `pending_review`, `approved`, `rejected`, and `{status:"published", reviewStatus:"changes_requested"}`.
  - `it("lets a writer with edit change anything, a contributor only open articles")`. `mayWriterChange(true, {status:"draft", reviewStatus:"pending_review"}) === true`; `mayWriterChange(false, …pending_review) === false`; `mayWriterChange(false, {status:"draft", reviewStatus:"changes_requested"}) === true`.
  - `it("names each writer status")`. `writerStatusOf(null) === "draft"`, `writerStatusOf("approved") === "approved"`, `writerStatusOf("weird") === "draft"`.
- [ ] **Step 2: Run them.** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines/roles.test.ts src/lib/magazines/review.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement both modules.** The capability table is a `Record<MagazineRole, ReadonlySet<MagazineCapability>>`.
- [ ] **Step 4: Write the migration integration test** `src/migrations/magazine-staff.integration.test.ts` in the style of `src/migrations/magazines.integration.test.ts` (refuses any database but `aitcom_test`):
  - `it("creates the staff table and can run twice")`. Run `up` twice. `information_schema.columns` has the seven columns.
  - `it("allows one role per person per magazine and only the three roles")`. A second insert of the same `(magazine_id, user_id)` throws a unique violation, and `role = 'owner'` throws a check violation.
  - `it("removes staff rows with their magazine and their user")`. Deleting the magazine row, or the user, deletes the staff row. For the user half, use a **bare user** created for this test with only the staff row pointing at it (no member profile, no `community_membership`: those FKs do not cascade and would block the delete). `assigned_by` pointing at a deleted user becomes null.
  - `it("down drops the table, up restores it")`.
- [ ] **Step 5: Write `20261027a_magazine_staff.ts`** in the style of `20261026a_magazines.ts`. Use `CREATE TABLE IF NOT EXISTS "app"."magazine_staff"` with the PK, FKs (`"public"."magazines"("id") ON DELETE cascade`, `"app"."user"("id") ON DELETE cascade`, `assigned_by … ON DELETE set null`), the `CHECK ("role" IN ('editor_in_chief','editor','contributor'))` and `CREATE INDEX IF NOT EXISTS "magazine_staff_user_idx"`. `down` does `DROP TABLE IF EXISTS`. The header comment says why the table is Drizzle (Decision 1) and why rows are never deleted on leave (Decision 4). Register it in `src/migrations/index.ts` as `name: "20261027a_magazine_staff"`. Run it: `<DB prefix> pnpm vitest run src/migrations/magazine-staff.integration.test.ts` → 4 tests PASS (not skipped).
- [ ] **Step 6: Write ADR-0045.** Format: `docs/adr/0044-*.md`. It records Decisions 1–7, 9, 11 (both narrowings of the spec, marked "please check") and 14. Link ADR-0042 (the editorship seam is the only reader of the table) and ADR-0043 (the channel seam's renamed policies). It states that it **amends ADR-0042**: ADR-0042 said slice 3 changes the two loaders with "no caller changes" and "callers … stay"; this slice changes callers on purpose (`requireEditorStanding` is replaced by capability gates, `loadMagazineWriting` needs `write`, the Magazine tab reads the viewer's role). Add the matching "Amended by ADR-0045" notes in ADR-0042 (see Files). Rejected options: a Payload staff collection; role checks spread across callers; deleting rows on leave. Check first that 0045 is still free: `git ls-tree -r --name-only origin/main docs/adr | tail -2` and `gh pr list --state open --json files --jq '.[].files[].path' | grep docs/adr/0045`. If it is taken, use the next free number everywhere in this plan.
- [ ] **Step 7: Update `CONTEXT.md`.** Rewrite `### Magazine editor`: it is now the `edit` capability (editor-in-chief or editor; owner/admin implicitly editor-in-chief). Add `### Magazine team`, `### Magazine role` and `### Magazine contributor` in the file's format, linking ADR-0045. (Not `### Contributor`: the benchmark domain already uses "contributor", see `### Contributor weight` and `### Run`.)
- [ ] **Step 8: Verify** with `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines src/migrations/migration-runner-contract.test.ts && pnpm typecheck` → PASS.
- [ ] **Step 9: Commit** (all files above by name): `feat(magazines): magazine roles, review values and the staff table`.

---

## Task 2: The editorship seam reads roles

**Files:**

- Create: `src/server/magazines/desk.ts`
- Modify: `src/server/magazines/editorship.ts`, `src/server/magazines/magazine-articles.ts`, `src/server/magazines/viewer-role.ts` (comment only: it names `isMagazineEditorRole`, which does not exist; say "every magazine standing (`loadMagazineEditorship`)"), `src/server/magazines/readable-issues.test.ts` (the three one-argument `editorScopeOf(...)` calls gain `, []`), `src/server/magazines/issue-access.test.ts` (the `STANDING` literals gain `role` and `leadsCommunity`)
- Test: `src/server/magazines/editorship.test.ts` (update), `src/server/magazines/editorship.integration.test.ts` (new), `src/server/magazines/issue-access.integration.test.ts` (add parity rows), existing `readable-issues.test.ts`, `issue-access.test.ts`, `reading.integration.test.ts`, `src/server/api/routers/magazines.integration.test.ts`

**Interfaces:**

- Consumes: `MagazineRole`, `MagazineCapability`, `roleCan`, `rolesWith`, `handInFor`, `mayWriterChange` (Task 1); `magazineStaff` (Task 1).
- Produces (`editorship.ts`):
  ```ts
  export type MagazineStanding = {
    /** For display only (which desk, which job name). Gates use standingCan, never this. */
    role: MagazineRole | null; // owner/admin → "editor_in_chief"; else the staff role while an active member
    isEditor: boolean; // roleCan(role, "edit") — unchanged meaning for every reader
    isMember: boolean; // active community member
    leadsCommunity: boolean; // active owner/admin (Decision 14: only they confirm "public in an unlisted community")
  };
  export const NO_STANDING: MagazineStanding; // all false / null
  /** The one owner/admin rule for magazines (replaces EDITOR_ROLES). Exported for SQL filters: LEADING_COMMUNITY_ROLES. */
  export function leadsCommunity(communityRole: CommunityRole | null): boolean;
  export const LEADING_COMMUNITY_ROLES: readonly CommunityRole[]; // ["owner", "admin"]; leadsCommunity reads it
  export function standingOf(
    communityRole: CommunityRole | null,
    staffRole: MagazineRole | null,
  ): MagazineStanding;
  export function standingCan(
    standing: MagazineStanding,
    capability: MagazineCapability,
  ): boolean;
  export function requireCapability(
    standing: MagazineStanding,
    capability: MagazineCapability,
  ): void; // FORBIDDEN
  // loadMagazineEditorship: signature unchanged; reads the staff row when magazineId !== null.
  export type StaffRoleRow = { communityId: string; role: MagazineRole };
  export function editorScopeOf(
    memberships: readonly {
      communityId: string;
      role: CommunityRole;
      status: string;
    }[],
    staff: readonly StaffRoleRow[] = [],
  ): EditorScope;
  // loadEditorScope: signature unchanged; one more query (staff rows of the user).
  export async function listMagazineEditorIds(
    database: typeof db,
    magazine: { communityId: string; magazineId: number },
  ): Promise<string[]>;
  //   active members whose community role is in LEADING_COMMUNITY_ROLES, plus staff rows with role in rolesWith("edit")
  //   whose membership is active; unique, sorted. No role literal in the query.
  ```
  `requireEditorStanding` is removed; its one caller (the router) moves to `requireCapability` in Task 3. Until then, keep it as `requireCapability(standing, "edit")`, so this task compiles. Task 3 deletes it.
- Produces (`desk.ts`):
  ```ts
  export type MagazineDesk = {
    community: {
      id: string;
      slug: string;
      name: string;
      isListedInDirectory: boolean;
    };
    magazine: Magazine | null;
    standing: MagazineStanding;
  };
  /** Null when there is no live community with this slug. */
  export async function loadMagazineDesk(
    deps: Deps,
    opts: { communitySlug: string; viewerId: string | null },
  ): Promise<MagazineDesk | null>;
  ```
- Produces (`magazine-articles.ts`):

  ```ts
  export async function requireMagazineCapability(
    deps: Deps,
    magazine: unknown,
    userId: string,
    capability: MagazineCapability,
  ): Promise<{ magazine: Magazine; standing: MagazineStanding }>; // NOT_FOUND / FORBIDDEN
  //   Keeps today's rule: a soft-deleted community (isLiveCommunity false) gives no standing → FORBIDDEN, even for a staff row.
  // requireEditorOfMagazine(deps, magazine, userId) keeps its signature: requireMagazineCapability(…, "edit").magazine
  export type MagazineWriting = {
    magazineId: number;
    magazineName: string;
    handIn: MagazineHandIn;
  };
  // loadMagazineWriting: built on loadMagazineDesk; needs "write" (was: editor); handIn = handInFor(standingCan(standing, "edit"))
  // loadMagazineArticleForEditing now returns (MagazineWriting & { article: Article; editable: boolean }) | null
  //   editable = mayWriterChange(standingCan(standing, "edit"), article)
  // DraftMagazineArticle gains: reviewNote: string | null
  ```

  Between this task and Task 4 a contributor can open the write page while `articles.create`/`update` still need `edit`. That gap is intentional and never ships (the branch merges whole); Task 4 closes it.

- [ ] **Step 1: Update the unit tests** in `editorship.test.ts`:
  - `it("owner and admin are editor-in-chief whatever their staff row")`. `standingOf("owner", "contributor").role === "editor_in_chief"` and `.leadsCommunity === true`.
  - `it("a staff role counts only for an active member")`. `standingOf(null, "editor")` equals `NO_STANDING`. `standingOf("member", "editor")` gives `{ role: "editor", isEditor: true, isMember: true, leadsCommunity: false }`.
  - `it("a contributor is a member but not an editor")`.
  - `it("a moderator without a staff row is a reader")`.
  - `editorScopeOf`: `it("adds communities where a staff role gives edit, never for inactive members")`.
  - `it("requireCapability refuses a standing without it with FORBIDDEN")`.
- [ ] **Step 2: Write `editorship.integration.test.ts`** (DB). Fixture: a community with owner, admin, moderator, member A (staff `editor`), member B (staff `contributor`), member C (staff `editor`, membership `banned`), and a magazine row created through `payload.create`.
  - `it("loadMagazineEditorship reads the staff role")`. A → editor, B → contributor, moderator → reader.
  - `it("a staff row without an active membership grants nothing")`. C gets `NO_STANDING`, and C is absent from `loadEditorScope(...).editorCommunityIds`.
  - `it("lists the editors to notify")`. `listMagazineEditorIds` equals sorted `[owner, admin, A]`.
  - `it("loadMagazineWriting answers per role")`. B → `handIn: "send_for_review"`, A → `"mark_ready"`, moderator → null.
  - `it("a contributor's article is editable only while open")`. B's article with `reviewStatus: "pending_review"` → `editable: false`. With `changes_requested` → `true`.
  - `it("a soft-deleted community gives its team nothing")`. Set the community's `deletedAt`: `requireMagazineCapability(…, B, "write")` throws FORBIDDEN, and `loadMagazineDesk` returns null.
- [ ] **Step 3: Add parity rows** in `issue-access.integration.test.ts`. The existing `readableIssueWhere returns exactly the issues the resolver lets each viewer read` fixture gains two viewers: a staff `editor` (sees the draft issue) and a staff `contributor` (sees the members-only published issue, not the draft). Both forms must agree.
- [ ] **Step 4: Run them.** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines/editorship.test.ts` and `<DB prefix> pnpm vitest run src/server/magazines/editorship.integration.test.ts src/server/magazines/issue-access.integration.test.ts` → FAIL.
- [ ] **Step 5: Implement** `editorship.ts`, `desk.ts` and the `magazine-articles.ts` changes. `loadMagazineEditorship` reads the membership and the staff row in parallel. `loadMagazineDesk` uses `isNull(communities.deletedAt)` like `loadMagazineWriting` does today. `EDITOR_ROLES` and `standingOfRole` are replaced by `LEADING_COMMUNITY_ROLES` / `leadsCommunity` / `standingOf`. Update the module comment in `editorship.ts`: slice 3 is here, the seam is now the only reader of `app.magazine_staff`, and ADR-0045 amends ADR-0042's "no caller changes".
- [ ] **Step 6: Run** the tests from Step 4 plus `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines src/server/articles` and `<DB prefix> pnpm vitest run src/server/magazines src/server/articles src/server/api/routers/magazines.integration.test.ts` → PASS. Run `pnpm typecheck` → PASS.
- [ ] **Step 7: Commit**: `feat(magazines): the editorship seam reads magazine roles`.

---

## Task 3: Team service, role notice and capability-gated editor API

**Files:**

- Create: `src/server/magazines/staff-service.ts`, `src/server/magazines/notifications.ts`
- Modify: `src/server/magazines/{errors,editorship}.ts`, `src/server/api/routers/magazines.ts`, `src/components/magazines/editor/editor-errors.ts`, `src/server/db/schema.ts` (the `notification.type` comment only), `messages/{en,nl}.json`
- Create (test): `src/i18n/messages-parity.test.ts`
- Test: `src/server/magazines/staff-service.integration.test.ts`, `src/server/magazines/notifications.test.ts`, `src/server/magazines/errors.test.ts`, `src/components/magazines/editor/editor-errors.test.ts`, `src/server/api/routers/magazines.integration.test.ts`, `src/i18n/messages-parity.test.ts`

**Interfaces:**

- Consumes: Task 2's `loadMagazineEditorship`, `requireCapability`, `standingOf`, `leadsCommunity`, `LEADING_COMMUNITY_ROLES`; Task 1's `rolesWith`, `MAGAZINE_ROLES`; `communityMagazinePath` (`src/lib/magazines/paths.ts`); `escapeLike` (`src/server/db/escape-like.ts`); `clipText` (`src/lib/text-utils.ts`).
- `staff-service.ts` never names a role or community-role literal: owner/admin through `LEADING_COMMUNITY_ROLES` / `leadsCommunity`, magazine roles through `MAGAZINE_ROLES` / `rolesWith`.
- Produces (`staff-service.ts`):
  ```ts
  export const STAFF_SEARCH_LIMIT = 10;
  export type StaffMember = {
    userId: string;
    name: string;
    image: string | null;
    role: MagazineRole;
    source: "owner" | "admin" | "assigned";
    isActiveMember: boolean;
  };
  export type StaffMagazine = { id: number; name: string; communityId: string };
  export async function listMagazineStaff(
    database: Deps["db"],
    magazine: StaffMagazine,
  ): Promise<StaffMember[]>;
  //   owners, then admins (role editor_in_chief, isActiveMember true), then assigned rows by MAGAZINE_ROLES order, then name.
  //   An assigned row whose holder is now an active owner/admin is left out (they appear once, as owner/admin; the row stays inert in the table).
  export type StaffCandidate = {
    userId: string;
    name: string;
    image: string | null;
  };
  export async function searchStaffCandidates(
    database: Deps["db"],
    magazine: StaffMagazine,
    query: string,
  ): Promise<StaffCandidate[]>;
  //   active members, not owner/admin, without a staff row; name = memberProfiles.displayName ?? user.name; ILIKE on both
  export async function assignMagazineRole(
    database: Deps["db"],
    magazine: StaffMagazine,
    input: { userId: string; role: MagazineRole },
    actor: { userId: string; community: { id: string; slug: string } },
  ): Promise<StaffMember>;
  //   STAFF_NOT_MEMBER when not an active member; STAFF_LEADS_COMMUNITY for owner/admin;
  //   ONE statement: INSERT … ON CONFLICT (magazine_id, user_id) DO UPDATE SET role = EXCLUDED.role, assigned_by = EXCLUDED.assigned_by,
  //   updated_at = now() WHERE "magazine_staff"."role" IS DISTINCT FROM EXCLUDED.role RETURNING *.
  //   A returned row → notify (new or changed job). No row → the job did not change: no notice; return the current row.
  export async function removeMagazineRole(
    database: Deps["db"],
    magazine: Pick<StaffMagazine, "id">,
    userId: string,
  ): Promise<void>; // idempotent
  ```
- Produces (`notifications.ts`). One private helper owns the shared rules; each `notify*` only builds text and recipients:
  ```ts
  type MagazineNotice = {
    userId: string;
    type: string;
    title: string;
    content: string;
    communityId: string;
    path: string;
    linkLabel: string;
    extra?: Record<string, unknown>;
  };
  /** Never throws: catches, logs `[magazines] notification failed`, returns. Clips title to 255. Writes
   *  metadata { reviewPath: path, linkLabel, communityId, ...extra }. One multi-row insert. */
  async function insertMagazineNotices(
    db: Deps["db"],
    notices: readonly MagazineNotice[],
  ): Promise<void>;
  /** The English "magazineEditor" translator (createTranslator + loadMessages("en"), as in src/server/badges/notify.ts). */
  async function magazineNoticeTranslator(): Promise<Translator>;
  export const MAGAZINE_ROLE_ASSIGNED_NOTIFICATION = "magazine_role_assigned";
  export const MAGAZINE_ARTICLE_SUBMITTED_NOTIFICATION =
    "magazine_article_submitted"; // used in Task 4
  export const MAGAZINE_ARTICLE_REVIEWED_NOTIFICATION =
    "magazine_article_reviewed"; // used in Task 5
  export type NoticeCommunity = { id: string; slug: string };
  export async function notifyRoleAssigned(
    db: Deps["db"],
    input: {
      userId: string;
      role: MagazineRole;
      magazineName: string;
      community: NoticeCommunity;
    },
  ): Promise<void>;
  //   extra: { magazineRole }
  ```
  Later tasks (4, 5, and slices 4–5) add `notify*` functions built on `insertMagazineNotices`; they never write the `notification` table directly.
- Produces (errors): `MAGAZINE_ERROR_CODES` gains `"STAFF_NOT_MEMBER"` (BAD*REQUEST), `"STAFF_LEADS_COMMUNITY"` (BAD_REQUEST), `"ARTICLE_LOCKED"` (CONFLICT), `"ARTICLE_NOT_PENDING"` (CONFLICT), `"REVIEW_NOTE_REQUIRED"` (BAD_REQUEST) and `"UNLISTED_PUBLIC_LEADERS_ONLY"` (FORBIDDEN). All six are added now, so the client map is complete once. Tasks 4–5 use `ARTICLE*\*`and`REVIEW_NOTE_REQUIRED`.
- Produces (router): `magazineProcedure(capability)` builds `writerProcedure` / `editorProcedure` / `managerProcedure`; `ctx` gains `standing`. Gates: `getSettings`, `saveSettings` → `manage`. `listIssues`, `createIssue`, every issue procedure, `pickerCandidates`, `availableArticles` → `edit`. `myDraftArticles` → `write`. Decision 14: `saveSettings` and `updateIssue` throw `UNLISTED_PUBLIC_LEADERS_ONLY` when `input.confirmUnlistedPublic === true && !ctx.standing.leadsCommunity` (one small router helper `assertMayConfirmUnlistedPublic(standing, confirm)`, called before the service). New `manage` procedures, each with input `{ slug }` plus the following:
  - `listStaff` → `StaffMember[]`
  - `searchStaffCandidates({ query: z.string().trim().max(100) })` → `StaffCandidate[]`
  - `assignStaffRole({ userId: z.string().min(1).max(255), role: z.enum(MAGAZINE_ROLES) })` → `StaffMember`
  - `removeStaffRole({ userId })` → `{ ok: true }`

  All of them answer `NOT_FOUND` while the community has no magazine (`requireMagazine`). `requireEditorStanding` is deleted.

- Produces (messages, en + nl): `magazineEditor.roles.<role>.name` ("Editor-in-chief", "Editor", "Contributor") and `.help`:
  - editor_in_chief: "Runs the magazine: its settings, its team, its issues and the articles members send in."
  - editor: "Builds and publishes issues, and reads the articles members send in."
  - contributor: "Writes articles and sends them to the editors."

  Also `magazineEditor.notifications.roleAssigned.title` "You joined the team of {magazine}", `roleAssigned.linkLabel` "Open the magazine", and one content message per job, `roleAssigned.content.<role>`: "You are now an editor-in-chief. {help}" / "You are now an editor. {help}" / "You are now a contributor. {help}" (nl with natural Dutch articles). And `magazineEditor.errors.{staffNotMember,staffLeadsCommunity,articleLocked,articleNotPending,reviewNoteRequired,unlistedPublicLeadersOnly}`:
  - staffNotMember: "Only members of this community can join the magazine team."
  - staffLeadsCommunity: "Community owners and admins already run the magazine."
  - articleLocked: "The editors have this article now, so it cannot be changed."
  - articleNotPending: "Someone already decided on this article. Reload to see what changed."
  - reviewNoteRequired: "Tell the writer what to change."
  - unlistedPublicLeadersOnly: "This community is unlisted. Only its owners and admins can make this public."

- [ ] **Step 1: Write `staff-service.integration.test.ts`** (DB; fixture as in Task 2 plus a magazine):
  - `it("lists owners and admins as editors-in-chief, then the team")`. Order and `source` as specified.
  - `it("assigns a member, changes the role, and tells them each time")`. Assign B a contributor, then an editor: one staff row, `role = "editor"`, two `magazine_role_assigned` notifications for B whose `metadata.reviewPath` is `/communities/<slug>/magazine`.
  - `it("refuses owners, admins and non-members")`. Expect `STAFF_LEADS_COMMUNITY` for the admin. Expect `STAFF_NOT_MEMBER` for the outsider and for a banned member.
  - `it("assigning the same role again sends no second notice")`.
  - `it("search finds active members not yet on the team")`. A query matching the displayName returns B, never the owner, a staff member or a banned member. `%` in the query is matched literally.
  - `it("lists a team member who left as not a member now")`. Set B's membership to `banned`: `isActiveMember: false`.
  - `it("lists someone made admin after joining the team once, as admin")`. Give B a `contributor` row, then set B's community role to `admin`: B appears exactly once, with `source: "admin"`.
  - `it("a notification failure never fails the assignment")`. Pass a `db` whose `insert(notifications)` throws (wrap the real db and throw only for that table). The role is still stored.
- [ ] **Step 2: Extend `src/server/api/routers/magazines.integration.test.ts`.**
  - Rename the existing `"only owner and admin reach editor procedures"` to `"moderators and members without a job reach no editor procedure"` (its assertions stay). Do **not** add staff rows to the shared fixture; the new tests create their own rows and users.
  - `it("each capability opens exactly its procedures")` is a table test. Write `const PROCEDURE_CAPABILITY: Record<string, MagazineCapability | "public">` covering every procedure, and first assert `Object.keys(magazinesRouter._def.procedures).sort()` equals `Object.keys(PROCEDURE_CAPABILITY).sort()`, so a new procedure without an entry fails. (Public read procedures, if any, map to `"public"` and are skipped.) Then for each viewer — staff contributor, staff editor, appointed editor-in-chief, moderator, outsider — call every gated procedure with minimal valid input (a saved magazine and one draft issue exist) and assert: FORBIDDEN exactly when the viewer's role lacks the capability (`roleCan`), and not FORBIDDEN otherwise (any other outcome, e.g. NOT_FOUND or BAD_REQUEST from input, counts as "passed the gate"). The moderator and outsider are FORBIDDEN on all.
  - `it("an editor cannot give themselves a job")`. A staff editor calls `assignStaffRole({ userId: self, role: "editor_in_chief" })` → FORBIDDEN, and their row still says `editor`. A contributor doing the same → FORBIDDEN.
  - `it("only community leaders confirm public in an unlisted community")`. Unlisted community. An appointed editor-in-chief calls `updateIssue` with `visibility: "public", confirmUnlistedPublic: true` → `UNLISTED_PUBLIC_LEADERS_ONLY`, and `saveSettings` with `defaultVisibility: "public", confirmUnlistedPublic: true` → the same. The owner doing the same succeeds.
- [ ] **Step 3: Update `errors.test.ts` and `editor-errors.test.ts`** for the six new codes (each maps to its own key). Write `src/server/magazines/notifications.test.ts` (unit, a fake db): `it("clips long titles and writes the shared metadata")`, `it("never throws when the insert fails")`. Write `src/i18n/messages-parity.test.ts`: `it("en and nl have the same keys for the magazine and badge copy")`, comparing the flattened key sets of `magazineEditor`, `articleEditor.magazine` and `badges` in `messages/en.json` and `messages/nl.json`.
- [ ] **Step 4: Run them** → FAIL.
- [ ] **Step 5: Implement** the service, the notice, the error codes, the client key map, the router factory and procedures, the unlisted-public guard, and the copy in both locales. Add the three notification types to the `notification.type` comment in `schema.ts`.
- [ ] **Step 6: Run** `<DB prefix> pnpm vitest run src/server/magazines src/server/api/routers/magazines.integration.test.ts`, `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/magazines src/components/magazines src/i18n` and `pnpm typecheck` → PASS.
- [ ] **Step 7: Commit**: `feat(magazines): magazine team service and capability-gated editor API`.

---

## Task 4: Contributors write and send articles to the editors

**Files:**

- Create: `src/server/magazines/article-submission.ts`
- Modify: `src/server/articles/channels.ts`, `src/server/api/routers/articles.ts`, `src/server/magazines/notifications.ts`, `src/server/magazines/payload-writes.ts` (`lockArticle`), `src/server/magazines/magazine-articles.ts` (`listDraftArticles` adds `reviewNote`), `src/lib/magazines/paths.ts`, `messages/{en,nl}.json`
- Test: `src/server/magazines/article-submission.integration.test.ts`, `src/server/articles/channels.test.ts`, `src/lib/magazines/paths.test.ts`, existing `src/server/api/routers/magazines.integration.test.ts`, `src/server/articles/article-surfaces.integration.test.ts`

**Interfaces:**

- Consumes: `requireMagazineCapability`, `listMagazineEditorIds`, `standingCan` (Task 2); `mayWriterChange`, `handInFor` (Task 1); `magazineError` codes `ARTICLE_LOCKED` (Task 3); `MAGAZINE_ARTICLE_SUBMITTED_NOTIFICATION`, `NoticeCommunity`, the private `insertMagazineNotices` (Task 3); `inPayloadTransaction`, `PayloadTransaction` (`payload-writes.ts`).
- Produces (`paths.ts`): `export function magazineReviewPath(communitySlug: string, articleSlug: string): string; // ${communityMagazinePath}/review/${articleSlug}`
- Produces (`channels.ts`): `ArticleSubmitPolicy = "staff_review" | "magazine_review"`; the field `publishedEditPolicy` is renamed **`editPolicy`**, type `ArticleEditPolicy = "trusted_author" | "magazine"`, with doc comments saying the magazine module decides (Decision 6). Update every reader (`grep -rn "publishedEditPolicy\|editor_approves\|magazine_editor" src`: `channels.ts`, `channels.test.ts`, `articles.ts`).
- Produces (`payload-writes.ts`):
  ```ts
  /** Decision 12: takes the article row lock (SELECT 1 FROM "articles" WHERE "id" = $1 FOR UPDATE), then reads the
   *  latest version through Payload (draft: true, req: tx.req, disableErrors: true, depth 0). Null when gone. */
  export async function lockArticle(
    tx: PayloadTransaction,
    payload: PayloadClient,
    articleId: number,
  ): Promise<Article | null>;
  ```
- Produces (`article-submission.ts`). Each runs inside `inPayloadTransaction`, starts with `lockArticle`, checks on the locked read, and writes with `req: tx.req`; notices go out after commit.
  ```ts
  /** The magazine's hand-in. FORBIDDEN without "write". Then an exhaustive switch on handInFor(standingCan(standing, "edit")):
   *  "mark_ready" → markReadyForIssue; "send_for_review" → ARTICLE_LOCKED unless mayWriterChange(false, locked),
   *  write { reviewStatus: "pending_review", reviewNote: null } (no `draft` flag, like markReadyForIssue), no XP,
   *  then notifyArticleSubmitted to listMagazineEditorIds. */
  export async function submitMagazineArticle(
    deps: Deps,
    article: Article,
    userId: string,
  ): Promise<Article>;
  /** Unexported; moved from the articles router. The caller already checked "edit". Writes { reviewStatus: "approved" }. */
  async function markReadyForIssue(
    deps: Deps,
    tx: PayloadTransaction,
    article: Article,
  ): Promise<Article>;
  /** The magazine's save (editPolicy "magazine"): FORBIDDEN without "write"; ARTICLE_LOCKED unless
   *  mayWriterChange(standingCan(standing,"edit"), locked). Applies `patch` with draft: locked.status === "draft".
   *  When locked.reviewStatus === "changes_requested": sets reviewStatus null and KEEPS reviewNote (Decision 7). */
  export async function saveMagazineArticle(
    deps: Deps,
    articleId: number,
    userId: string,
    patch: ArticlePatch,
  ): Promise<Article>;
  /** The magazine's delete rule: FORBIDDEN without "write"; ARTICLE_LOCKED unless mayWriterChange(…, locked);
   *  then the router's existing "not published / not placed" checks and payload.delete with req: tx.req. */
  export async function deleteMagazineArticle(
    deps: Deps,
    articleId: number,
    userId: string,
  ): Promise<void>;
  ```
  `ArticlePatch` is the `{ title?, content?, type?, tags?, mediaUrl? }` shape `articles.update` builds today (export it from the router's helper or define it here; one definition).
- Produces (`notifications.ts`): `notifyArticleSubmitted(db, input: { editorIds: readonly string[]; authorName: string | null; articleTitle: string; articleSlug: string; magazineName: string; community: NoticeCommunity }): Promise<void>`, built on `insertMagazineNotices`. It writes one row per editor. `reviewPath` = `magazineReviewPath(community.slug, articleSlug)`. Copy is `magazineEditor.notifications.articleSubmitted.{title,content,linkLabel}`: "{author} sent “{title}” to {magazine}" / "Read it, then approve it, ask for changes or decline it." / "Read the article". When the name is null, `{author}` is "A member".
- Router (`articles.ts`): `create` uses `requireMagazineCapability(…, "write")`. `update` keeps its author check, then switches on `channelFor(existing).editPolicy`: `trusted_author` → today's path unchanged; `magazine` → `saveMagazineArticle` (through `articleWrite`-style error mapping; a `TRPCError` passes through). `submit`'s `magazine_review` case calls `submitMagazineArticle`. `delete` keeps its author check, then switches the same way: `trusted_author` → today's path; `magazine` → `deleteMagazineArticle`. `markReadyForIssue` and the router's `magazine_editor` branch of `assertMayEdit` leave the router.

- [ ] **Step 1: Update `channels.test.ts`** to the renamed policy values. Update `paths.test.ts` with `magazineReviewPath("c", "a") === "/communities/c/magazine/review/a"`.
- [ ] **Step 2: Write `article-submission.integration.test.ts`** (DB; fixture: owner, staff editor E, contributor K, member M; magazine; tests call `createCaller` like the router suite):
  - `it("a contributor writes for the magazine; a member may not")`. `articles.create({ …, magazineId })` works for K. For M it is FORBIDDEN.
  - `it("sending in makes the article wait for the editors and tells each editor once")`. `articles.submit` by K → `reviewStatus: "pending_review"`, `status: "draft"`. There is one `magazine_article_submitted` row each for owner and E, none for K, and `reviewPath` is the review path. K's XP is unchanged.
  - `it("an editor's own hand-in still approves directly")`. E's submit → `approved`, and no submitted notice is sent.
  - `it("a sent, approved or declined article is locked for its contributor")`. For each of `pending_review`, `approved` and `rejected` (set through Payload), `articles.update`, `articles.submit` and `articles.delete` by K → `ARTICLE_LOCKED`, and the article still exists. With `changes_requested` and `reviewNote: "Shorter intro"`, `update` works, clears `reviewStatus` to null and **keeps** `reviewNote`; `submit` then works again and clears the note. A draft never sent can be deleted by K.
  - `it("a contributor removed from the team can no longer write, send in or delete")`. Delete K's staff row: `update`, `submit` and `delete` → FORBIDDEN, and the article keeps `pending_review`.
  - `it("a soft-deleted community's contributor cannot write")`. Set the community's `deletedAt`: `articles.create` with `magazineId` by K → FORBIDDEN.
  - `it("two send-ins at once notify each editor once")`. `Promise.allSettled([submit, submit])` by K: one fulfilled, one `ARTICLE_LOCKED`; exactly one submitted notice each for owner and E.
  - `it("a save racing a send-in cannot change the sent text")`. `Promise.allSettled([update({ title: "Late" }), submit()])` by K. Whatever the order: the article ends `pending_review`, and if `update` was refused the latest-version title is the original; if `update` won, it ran before the send-in (so the title is "Late" and `submit` still succeeded). Never `pending_review` with a refused submit.
  - `it("myDraftArticles shows the contributor their articles with the editor's note")`. A `changes_requested` article with `reviewNote: "Shorter intro"` comes back with `reviewNote`.
- [ ] **Step 3: Run it** → FAIL.
- [ ] **Step 4: Implement**, plus the en + nl copy (`magazineEditor.notifications.articleSubmitted.*`).
- [ ] **Step 5: Run** `<DB prefix> pnpm vitest run src/server/magazines src/server/articles src/server/api/routers/magazines.integration.test.ts`, `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/articles src/lib/magazines` and `pnpm typecheck` → PASS.
- [ ] **Step 6: Commit**: `feat(magazines): contributors send articles to the editors`.

---

## Task 5: Editors review articles in the site

**Files:**

- Create: `src/server/magazines/article-review.ts`
- Modify: `src/server/magazines/notifications.ts`, `src/server/api/routers/magazines.ts`, `messages/{en,nl}.json`
- Test: `src/server/magazines/article-review.integration.test.ts`

**Interfaces:**

- Consumes: `REVIEW_DECISIONS`, `REVIEW_NOTE_MAX`, `reviewStatusFor` (Task 1); `loadMagazineDesk`, `standingCan` (Task 2); `ARTICLE_NOT_PENDING`, `REVIEW_NOTE_REQUIRED` (Task 3); `insertMagazineNotices` (Task 3); `lockArticle`, `inPayloadTransaction` (Task 4, `payload-writes.ts`); `logActivity` (`src/server/agent/activity.ts`); `magazineArticleEditPath`, `communityMagazinePath`, `magazineReviewPath` (`paths.ts`).
- Produces (`article-review.ts`):
  ```ts
  export type PendingMagazineArticle = {
    id: number;
    slug: string;
    title: string;
    authorName: string | null;
    sentAt: string; /* updatedAt */
  };
  export async function listPendingArticles(
    payload: PayloadClient,
    magazineId: number,
  ): Promise<PendingMagazineArticle[]>;
  //   magazine = id, reviewStatus = pending_review, draft: true, sort "updatedAt" (oldest first), limit 100
  export type ArticleForReview = {
    id: number;
    slug: string;
    title: string;
    type: string | null;
    authorName: string | null;
    content: unknown;
    reviewStatus: string | null;
    reviewNote: string | null;
    updatedAt: string;
  };
  export type ReviewPageData = {
    magazine: { id: number; name: string };
    article: ArticleForReview;
  };
  /** Editors only ("edit"); the article must be this magazine's and written by a member; latest draft. Null → 404. */
  export async function loadArticleForReview(
    deps: Deps,
    opts: {
      communitySlug: string;
      articleSlug: string;
      viewerId: string | null;
    },
  ): Promise<ReviewPageData | null>;
  export async function reviewMagazineArticle(
    deps: Deps,
    magazine: Magazine,
    input: { articleId: number; decision: ReviewDecision; note?: string },
    reviewer: { userId: string; community: { id: string; slug: string } },
  ): Promise<{ reviewStatus: "approved" | "changes_requested" | "rejected" }>;
  //   REVIEW_NOTE_REQUIRED for request_changes with an empty trimmed note (checked first, before any read);
  //   inside inPayloadTransaction: lockArticle → null (deleted) or another magazine's → NOT_FOUND (never Payload's NotFound/500);
  //   ARTICLE_NOT_PENDING unless the locked read is pending_review;
  //   write { reviewStatus, reviewNote: approve ? null : note || null } with req: tx.req (no `draft` flag);
  //   after commit: logActivity(db, { actorId: reviewer.userId, actorType: "member", action: "magazine_article.reviewed",
  //     targetType: "articles", targetId: String(id), communityId, metadata: { decision, magazineId, title } }), then notifyArticleReviewed.
  //   The router gates it on "edit", so a contributor (even on their own article) gets FORBIDDEN.
  ```
- Produces (`notifications.ts`): `notifyArticleReviewed(db, input: { authorId: string; decision: ReviewDecision; note: string | null; articleTitle: string; articleSlug: string; magazineName: string; community: NoticeCommunity }): Promise<void>`, built on `insertMagazineNotices`. Links: approve and reject → `communityMagazinePath`; request_changes → `magazineArticleEditPath`. Copy goes under `magazineEditor.notifications.articleReviewed`:
  - `approved.title` "“{title}” is ready for an issue", `approved.content` "An editor of {magazine} approved your article. It goes live when an issue with it is published."
  - `changesRequested.title` "Changes asked for “{title}”", content = the note.
  - `rejected.title` "“{title}” was not accepted", content = the note, or `rejected.noNote` "An editor of {magazine} decided not to use this article."
  - `linkOpenArticle` "Open your article", `linkOpenMagazine` "Open the magazine".
- Produces (router, `edit`):
  - `reviewQueue({ slug })` → `PendingMagazineArticle[]` (`[]` without a magazine).
  - `reviewArticle({ slug, articleId: z.number().int().positive(), decision: z.enum(REVIEW_DECISIONS), note: z.string().trim().max(REVIEW_NOTE_MAX).optional() })`. It uses `requireMagazine`.
  - Add both to `PROCEDURE_CAPABILITY` (Task 3's table test) as `edit`.

- [ ] **Step 1: Write `article-review.integration.test.ts`** (DB; fixture: owner, staff editor E, contributors K and L, one article each sent in by K and L):
  - `it("lists articles waiting for the editors, oldest first")`. An approved or draft article is not listed.
  - `it("approve readies the article without publishing or crediting it")`. `reviewStatus: "approved"`, `status: "draft"`, `reviewNote` null, K's XP unchanged, and one `magazine_article_reviewed` notice for K with `reviewPath` = the tab. One `magazine_article.reviewed` activity row with `actorId` = E and `metadata.decision = "approve"`. The article now shows in `availableArticles`.
  - `it("asking for changes needs a note and sends the writer back to the editor")`. An empty note gives `REVIEW_NOTE_REQUIRED`. With the note "Add a source": `changes_requested`, `reviewNote` stored, the notice `content` is "Add a source", and `reviewPath` = the edit path.
  - `it("declining works with or without a note")`.
  - `it("a second decision is refused and sends no second notice")`. Approve, then reject → `ARTICLE_NOT_PENDING`. K has exactly one reviewed notice.
  - `it("two decisions at once: one wins, one notice")`. `Promise.allSettled([approve by E, reject by owner])` on L's article: exactly one fulfilled, the other `ARTICLE_NOT_PENDING`; L has exactly one reviewed notice, and the stored status matches the winner.
  - `it("a contributor cannot approve their own article")`. K calls `reviewArticle` (approve) on K's pending article → FORBIDDEN; `reviewStatus` stays `pending_review`.
  - `it("refuses another magazine's article, or a deleted one, as not found")`. Both → `NOT_FOUND` (a `TRPCError`, not a 500).
  - `it("editors decide on an article whose writer left the team")`. Delete L's staff row and set L's membership to `banned`. Approving L's article works, and L gets the notice.
  - `it("the review page loads for editors only")`. `loadArticleForReview` returns the latest draft text for E and the owner, and null for K (even for K's own article), the moderator and anonymous viewers.
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Implement**, plus the en + nl copy.
- [ ] **Step 4: Run** `<DB prefix> pnpm vitest run src/server/magazines src/server/api/routers/magazines.integration.test.ts` and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit**: `feat(magazines): editors approve, ask for changes or decline articles`.

---

## Task 6: "Published in a magazine" badge

**Files:**

- Modify: `src/lib/badges/catalog.ts`, `src/server/badges/{engine,backfill}.ts`, `src/server/magazines/article-publication.ts`, `scripts/backfill-badges.ts` (header comment only), `messages/{en,nl}.json` (`badges.names.magazine_published`, `badges.descriptions.magazine_published`)
- Test: `src/lib/badges/catalog.test.ts`, `src/server/magazines/issue-service.integration.test.ts`, `src/server/badges/backfill.integration.test.ts`

**Interfaces:**

- Consumes: `awardMilestone(db, userId, slug)` (`src/server/badges/engine.ts`); `creditPendingMagazineArticles` (`article-publication.ts`, unchanged signature).
- Produces:
  ```ts
  // catalog.ts MILESTONES
  /** An article published in a community magazine issue. */
  magazine_published: { glyph: "book" },
  // engine.ts
  /** A milestone found in existing data: recorded seen, no XP, activity, notification or earning moment. Returns whether it was newly earned. */
  export async function recordRetroactiveMilestone(db: BadgeDb, userId: string, slug: MilestoneSlug): Promise<boolean>;
  // backfill.ts
  /** Milestones earned from data, keyed by slug: who in this batch qualifies. One entry per data-derived milestone. */
  const DERIVED_MILESTONES: Partial<Record<MilestoneSlug, (db: Db, userIds: readonly string[]) => Promise<Set<string>>>>;
  //   magazine_published: creditedMagazineAuthorIds (below). The badges module never reads magazine tables.
  // The batch's held badges are loaded once per batch by a new `loadHeldBadges(db, userIds): Promise<Map<string, Set<string>>>`
  //   (pulled out of backfillTracks) and passed to both backfillTracks and backfillDerivedMilestones.
  // BackfillReport gains: newMilestones: Partial<Record<MilestoneSlug, number>>
  // BackfillFailure gains: { kind: "milestone"; userId: string; slug: MilestoneSlug; error: string }
  //   formatBackfillReport and every switch/branch on failure kind handle "milestone".
  // article-publication.ts
  /** Of `userIds`, the authors with at least one credited magazine article (a row in app.magazine_article_credit). */
  export async function creditedMagazineAuthorIds(db: Deps["db"], userIds: readonly string[]): Promise<Set<string>>;
  ```
- Copy (en / nl): names "Published in a magazine" / "Gepubliceerd in een magazine". Descriptions: "Had an article published in a community magazine." / "Had een artikel in een communitymagazine."

- [ ] **Step 1: Write the failing tests.**
  - `catalog.test.ts`: in `keeps milestones and the limited edition`, add `expect(catalogBadge("magazine_published")?.kind).toBe("milestone")`.
  - `issue-service.integration.test.ts`: `it("publishing credits contributors on publish only and gives the badge once")`. A contributor has two approved articles. Approving them gives no XP and no badge. Publish an issue holding both: XP = 2 × `XP_AMOUNTS.ARTICLE_PUBLISHED`, exactly one `member_badge` row `magazine_published`, and exactly one `badge_earned` notification with `metadata.badgeSlug = "magazine_published"`. Saving the published issue again changes neither.
  - `backfill.integration.test.ts`: `it("gives the magazine badge to authors credited before it existed, quietly")`. User U has a `member_profiles` row (the backfill walks members through it). Insert an article plus a `magazine_article_credit` row for U, and no badge. Every run passes `userIds: [U]`. The dry run reports `newMilestones.magazine_published === 1` and writes nothing. Apply writes one row with no notification. A second apply writes nothing.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.** In `creditOne`, keep the transaction unchanged. After it returns `true`, call `await awardMilestone(deps.db, authorId, "magazine_published")`. It runs after the commit, never throws, and a lost award is picked up by the backfill. Update the module comment. In `backfill.ts`, pull the held-badge query out of `backfillTracks` into `loadHeldBadges`, call it once per batch, and pass the map to `backfillTracks` and then to `backfillDerivedMilestones` (which skips holders and calls `recordRetroactiveMilestone` on apply). Add one `formatBackfillReport` line per milestone and the `"milestone"` failure line. Update the script header: it now also gives milestones found in data.
- [ ] **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/badges src/server/badges`, `<DB prefix> pnpm vitest run src/server/badges src/server/magazines/issue-service.integration.test.ts` and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit**: `feat(magazines): published-in-a-magazine badge`.

---

## Task 7: The writer's side in the UI — article editor and the Magazine tab desks

**Files:**

- Create: `src/components/magazines/editor/desk-list.tsx`, `src/components/magazines/editor/contributor-desk.tsx`
- Modify: `src/components/article-editor/destination.ts`, `src/components/magazines/editor/magazine-article-workspace.tsx`, `src/components/magazines/editor/editor-desk.tsx`, `src/components/magazines/community/magazine-tab.tsx`, `src/server/magazines/reading.ts` (`loadCommunityMagazineTab`), `src/server/magazines/magazine-articles.ts` (`listWriterArticles`), `src/server/api/routers/magazines.ts` (`myMagazineArticles`), `src/components/magazines/test-fixtures.ts`, `src/app/[locale]/communities/[slug]/magazine/articles/[articleSlug]/edit/page.tsx`, `messages/{en,nl}.json`
- Test: `src/components/article-editor/destination.test.ts`, `src/components/article-editor/article-editor-magazine.test.tsx`, `src/components/magazines/editor/editor-desk.test.tsx`, `src/components/magazines/editor/contributor-desk.test.tsx` (new), `src/components/magazines/community/magazine-tab.test.tsx`, `src/app/[locale]/communities/[slug]/magazine/articles/[articleSlug]/edit/page.test.tsx`, `src/server/magazines/reading.integration.test.ts`, `src/server/api/routers/magazines.integration.test.ts` (add `myMagazineArticles: "write"` to `PROCEDURE_CAPABILITY`)

**Interfaces:**

- Consumes: `MagazineWriting.handIn`, `loadMagazineArticleForEditing(...).editable`, `loadMagazineEditorship` (Task 2); `myDraftArticles` with `reviewNote` (Task 4); `reviewQueue` (Task 5); `magazineReviewPath` (Task 4); `roleCan`, `mayWriterChange`, `WRITER_REVIEW_STATUSES`, `writerStatusOf` (Task 1). Settings links use the existing `magazineSettingsPath`. The Team link and its test belong to Task 9 (`magazineTeamPath` does not exist yet).
- Produces:
  ```ts
  // destination.ts
  export type ArticleDestination =
    | { kind: "blog" }
    | {
        kind: "magazine";
        magazineId: number;
        magazineName: string;
        communitySlug: string;
        handIn: MagazineHandIn;
      };
  // DestinationBehaviour key unions gain "magazine.sendForReview", "magazine.sentForReview",
  // "magazine.reviewPrePublishTitle", "magazine.reviewPrePublishSubtitle"; chosen by an exhaustive switch on handIn
  // reading.ts — loadCommunityMagazineTab's result gains: viewerRole: MagazineRole | null  (viewerIsEditor stays).
  //   loadCommunityMagazineTab calls loadMagazineEditorship ONCE, in both branches (with and without a magazine),
  //   and sets viewerRole = standing.role and viewerIsEditor = standing.isEditor from that one standing,
  //   overriding the shelf's scope-derived flag, so the two fields cannot disagree. (loadMagazineShelf is unchanged.)
  // magazine-articles.ts
  /** The author's unpublished articles for the magazine, any review status (approved included), -updatedAt, same limit as listDraftArticles. */
  export async function listWriterArticles(
    payload: PayloadClient,
    magazineId: number,
    authorId: string,
  ): Promise<DraftMagazineArticle[]>;
  // router: myMagazineArticles({ slug }) → write; DraftMagazineArticle[]  ([] without a magazine)
  // editor-desk.tsx: the local REVIEW_STATUSES / draftStatusOf are deleted; it imports writerStatusOf from review.ts
  export function EditorDesk(props: {
    slug: string;
    canManage: boolean;
  }): JSX.Element;
  // contributor-desk.tsx
  export function ContributorDesk(props: { slug: string }): JSX.Element;
  // desk-list.tsx
  export function DeskList(props: {
    label: string;
    query: ListQuery;
    empty: string | null;
    children: ReactNode;
  }): JSX.Element;
  export function UpdatedAt(props: { value: string }): JSX.Element;
  ```
- Copy (en; nl alongside):
  - `articleEditor.magazine.sendForReview` "Send to the editors"; `sentForReview` "Sent. The editors will read it and let you know."; `reviewPrePublishTitle` "Send to the editors?"; `reviewPrePublishSubtitle` "Check your article first. You cannot change it while the editors read it. They can approve it, ask for changes or decline it."
  - `magazineEditor.desk.waiting` "Waiting for you"; `waitingEmpty` "No articles are waiting. Articles members send in show up here."; `sentOn` "Sent {date}". (`team` "Team" is added in Task 9.)
  - `magazineEditor.contributorDesk.label` "Your writing desk"; `write` "Write an article"; `articles` "Your articles"; `articlesEmpty` "You have no articles in progress. Write one and send it to the editors."; `editorNote` "Note from the editors"; `status.draft` "Not sent yet"; `status.pending_review` "With the editors"; `status.changes_requested` "Changes asked for"; `status.approved` "Ready for an issue"; `status.rejected` "Not accepted". (Separate keys from `magazineEditor.desk.reviewStatus.*`, whose wording speaks to editors.)

- [ ] **Step 1: Write the failing tests.**
  - `destination.test.ts`: `it("a contributor's magazine destination sends to the editors")`. With `handIn: "send_for_review"`, the submit label key is `"magazine.sendForReview"`, the submitted key is `"magazine.sentForReview"`, and the pre-publish keys are the review keys. With `"mark_ready"` the slice-1 keys are unchanged.
  - `article-editor-magazine.test.tsx`: the contributor destination renders the button "SEND TO THE EDITORS".
  - Edit `page.test.tsx`: `it("sends a contributor whose article is locked back to the Magazine tab")`. Mock `editable: false` → `NEXT_REDIRECT /en/communities/c/magazine`.
  - `editor-desk.test.tsx`: `it("lists articles waiting for review, linking to the review page")`, `it("shows Settings only to those who manage the magazine")` (`canManage` true → a Settings link; false → none).
  - `contributor-desk.test.tsx`: `it("shows the writer their articles with the editors' note")`. A `changes_requested` row shows "Changes asked for", "Note from the editors" and the note, and links to the edit page. A draft row ("Not sent yet") links too.
  - `it("only open articles are links")`. `pending_review` ("With the editors"), `approved` ("Ready for an issue") and `rejected` ("Not accepted", with its note) rows are not links. The link decision calls `mayWriterChange(false, row)`.
  - `it("teaches the next step when there is nothing yet")`.
  - `magazine-tab.test.tsx`: `it("shows the writing desk to contributors and the editor's desk to editors")`. The `viewerRole` values `contributor`, `editor` and `editor_in_chief` render the matching desk, and `null` renders neither.
  - `reading.integration.test.ts`: `it("the Magazine tab tells the viewer their role")`. Staff contributor → `viewerRole: "contributor"`, `viewerIsEditor: false`; staff editor → `"editor"`, `true`; owner → `"editor_in_chief"`, `true`; member → null, `false`. Check it both with a magazine and for a community without one, and that `viewerIsEditor === roleCan(viewerRole, "edit")` in every row.
  - `magazines.integration.test.ts`: `it("a contributor's desk lists their unpublished articles, approved ones too")`. `myMagazineArticles` for K returns a draft, a pending and an approved article of K's, and none of anyone else's.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.**
  - The workspace passes `writing.handIn` into the destination.
  - The edit page redirects a locked article with `redirect({ href: communityMagazinePath(slug), locale })` from `@/i18n/navigation`, or follows the existing pattern in that file.
  - Move `DeskList` / `UpdatedAt` into `desk-list.tsx`. `ContributorDesk` reads `myMagazineArticles`.
  - `EditorDesk` lists "Waiting for you" first, then Issues, Ready, Your drafts, in a `grid gap-8 @3xl:grid-cols-2`. Rows link to `magazineReviewPath` and show "Sent {date}" in mono.
  - `MagazineTab` picks the desk with an exhaustive switch on `deskFor(viewerRole)`: `"editor"` when `roleCan(role, "edit")`, `"contributor"` when only `write`, `null` otherwise.
  - The empty-state description for contributors reuses `emptyDescription`.
- [ ] **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/article-editor src/components/magazines "src/app/[locale]/communities/[slug]/magazine" src/i18n`, `<DB prefix> pnpm vitest run src/server/magazines/reading.integration.test.ts src/server/api/routers/magazines.integration.test.ts` and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit**: `feat(magazines): writing desk for contributors and review list for editors`.

---

## Task 8: The review page

**Files:**

- Create: `src/app/[locale]/communities/[slug]/magazine/review/[articleSlug]/page.tsx`, `src/components/magazines/editor/review/article-review-view.tsx`, `src/components/magazines/editor/review/review-actions.tsx`
- Modify: `messages/{en,nl}.json`
- Test: `src/app/[locale]/communities/[slug]/magazine/review/[articleSlug]/page.test.tsx`, `src/components/magazines/editor/review/review-actions.test.tsx`

**Interfaces:**

- Consumes: `loadArticleForReview`, `ReviewPageData` (Task 5); `api.magazines.reviewArticle` (Task 5); `REVIEW_NOTE_MAX` (Task 1); `readEditorError`; `LexicalRenderer` (`src/lib/lexical.tsx`); `communityMagazinePath`, `magazineReviewPath`.
- Produces:
  ```ts
  export function ArticleReviewView(props: {
    data: ReviewPageData;
    communitySlug: string;
  }): JSX.Element; // server component
  export function ReviewActions(props: {
    communitySlug: string;
    articleId: number;
    articleTitle: string;
  }): JSX.Element; // "use client"
  ```
- Page: `dynamic = "force-dynamic"`, metadata `{ title: t("metaTitle"), robots: { index: false } }`. Guests are redirected to sign-in with `redirect=` set to the review path (same shape as the write page). `null` → `notFound()`.
- Layout (community frame, workspace): a back link "Back to the Magazine tab". The title (h1) and the line "By {author} · sent {date}" (date in mono). A status line when the article is not waiting ("Approved", "Changes asked for" plus the note, "Not accepted"). The article body in `max-w-[72ch]` through `<LexicalRenderer content>`. Then `ReviewActions`, shown only for `pending_review`, in a bordered panel below the text with heading "Your decision".
- `ReviewActions`:
  - **Approve** (default/orange variant, the page's one orange) asks for nothing.
  - **Ask for changes** (`outline`) shows a labelled textarea "What should change?" (required, counter in mono, max `REVIEW_NOTE_MAX`) and a "Send to the writer" button, disabled while the trimmed note is empty. The button carries `aria-expanded` and `aria-controls` (the panel's `useId()`), and opening moves focus into the textarea.
  - **Decline** (`ghost`, destructive text) opens an `AlertDialog` "Decline this article?", body "The writer gets your note. They cannot send this article again.", with an optional note and "Decline article".
  - On success: `toast` with the outcome, then `router.push(communityMagazinePath(slug))` and `router.refresh()`.
  - On error: `role="alert"` with `tErrors(readEditorError(error).key)`. `ARTICLE_NOT_PENDING` also offers "Reload".
- Copy namespace `magazineEditor.review`: `metaTitle` "Read an article", `back`, `byline` "By {author} · sent {date}", `decision` "Your decision", `approve` "Approve", `askChanges` "Ask for changes", `changesLabel` "What should change?", `sendChanges` "Send to the writer", `decline` "Decline", `declineTitle`, `declineBody`, `declineNoteLabel` "Note for the writer (optional)", `declineConfirm` "Decline article", `cancel`, `done.approved` "Approved. It is ready for an issue.", `done.changes_requested` "Sent to the writer.", `done.rejected` "Article declined.", `status.approved`, `status.changes_requested`, `status.rejected`, `reload` "Reload".

- [ ] **Step 1: Write `page.test.tsx`** (mock style of `magazine/write/page.test.tsx`):
  - `it("sends guests to sign in and back")`.
  - `it("answers 404 when the gate says no")` (contributor, member, other community).
  - `it("renders the article and the decision panel for a waiting article")`.
  - `it("shows the decision and no panel for an article already decided")`.
- [ ] **Step 2: Write `review-actions.test.tsx`** (mock `api.magazines.reviewArticle.useMutation`, assert the **call arguments**):
  - `it("approves with one click")`. The call is `{ slug, articleId, decision: "approve" }`.
  - `it("asking for changes needs a note")`. After clicking "Ask for changes", that button has `aria-expanded="true"` and the textarea (by label "What should change?") has focus. The send button is disabled until text is typed, then the call has `decision: "request_changes", note: "Add a source"`.
  - `it("declines only after confirming, with the optional note")`.
  - `it("shows the friendly message when someone else decided first")`. The mutation error message is `ARTICLE_NOT_PENDING` → the en `articleNotPending` text and a Reload button.
  - `it("every control has a label")`. Query by role and name.
- [ ] **Step 3: Run them** → FAIL. **Step 4: Implement.** **Step 5: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/magazines "src/app/[locale]/communities/[slug]/magazine"` and `pnpm typecheck` → PASS.
- [ ] **Step 6: Commit**: `feat(magazines): review page for magazine editors`.

---

## Task 9: The team page, and the magazine settings move into the magazine area

**Files:**

- Create: `src/app/[locale]/communities/[slug]/magazine/team/page.tsx`, `src/app/[locale]/communities/[slug]/magazine/settings/page.tsx`, `src/components/magazines/editor/team/magazine-team.tsx`
- Modify: `src/lib/magazines/paths.ts`, `src/app/[locale]/communities/[slug]/settings/magazine/page.tsx` (becomes a redirect), `src/components/magazines/editor/editor-desk.tsx` (Team link), `messages/{en,nl}.json`
- Test: `src/lib/magazines/paths.test.ts`, `src/components/magazines/editor/editor-desk.test.tsx`, `src/components/magazines/editor/team/magazine-team.test.tsx`, `src/app/[locale]/communities/[slug]/magazine/team/page.test.tsx`, `src/app/[locale]/communities/[slug]/magazine/settings/page.test.tsx`

**Interfaces:**

- Consumes: `loadMagazineDesk`, `standingCan` (Task 2); `listStaff`, `searchStaffCandidates`, `assignStaffRole`, `removeStaffRole`, `StaffMember`, `StaffCandidate` (Task 3); `MAGAZINE_ROLES`, `magazineEditor.roles.*` copy (Tasks 1, 3); the existing `MagazineSettingsForm`.
- Produces (`paths.ts`):
  ```ts
  export function magazineSettingsPath(communitySlug: string): string; // CHANGED → `${communityMagazinePath}/settings`
  export function magazineTeamPath(communitySlug: string): string; // `${communityMagazinePath}/team`
  ```
- Both new pages are RSC with `dynamic = "force-dynamic"`, `robots: { index: false }`, and a sign-in redirect for guests.
  - Settings page: `desk` is null, or the viewer lacks `manage` → `notFound()`. A community without a magazine is fine for `manage` (owner/admin start one here). It renders a back link and `<MagazineSettingsForm slug>`.
  - Team page: also `notFound()` while `desk.magazine === null`.
- The old route `settings/magazine/page.tsx` becomes a server component that calls `redirect({ href: magazineSettingsPath(slug), locale })`. The settings sidebar entry stays as it is and reaches the new page through this redirect.
- `MagazineTeam({ slug }: { slug: string })` ("use client"):
  - **Add someone.** A labelled search box (debounced 250 ms, `searchStaffCandidates`). The results are a `<fieldset>` with a `<legend>` ("Choose a member") holding real `<input type="radio">` per candidate (label = name). A polite `role="status"` line announces the result count after each search ("{count, plural, =0 {No members match} one {# member found} other {# members found}}"). Then a job `Select` (label "Job on the team") with each job's help text, and the button **Add to the team** (orange, disabled until a person and a job are chosen).
  - **The team.** One row per `StaffMember`: avatar, name, role name.
    - Owners and admins show "Community owner" / "Community admin" and no controls.
    - Assigned rows get a role `Select` (change calls `assignStaffRole`) and **Remove** (`AlertDialog` "Remove {name} from the team?", body "They keep their articles. They can no longer write for the magazine or edit issues.").
    - Rows with `isActiveMember: false` show "Not a member now" and only Remove.
  - States: skeletons while loading, `ErrorState` with retry, and the empty search hint "Type a name to find members of your community.".
  - After each change: invalidate `listStaff`, announce through `role="status"` with one message per job (`assigned.<role>`: "{name} is now an editor-in-chief." / "{name} is now an editor." / "{name} is now a contributor.") or `removed` "{name} left the team.".
- Copy namespace `magazineEditor.team`: `metaTitle` "Magazine team", `title` "Team", `intro` "Choose who writes for and edits {magazine}. Owners and admins of the community always run it.", `add`, `searchLabel` "Find a member", `searchHint`, `resultsLegend` "Choose a member", `resultCount` (plural, above), `noResults` "No members match. Only members of this community can join the team.", `roleLabel` "Job on the team", `addButton` "Add to the team", `owner` "Community owner", `admin` "Community admin", `notMember` "Not a member now", `remove`, `removeTitle`, `removeBody`, `removeConfirm` "Remove", `cancel`, `assigned.<role>`, `removed`, `back`. Also `magazineEditor.settings.back` and `magazineEditor.desk.team` "Team".

- [ ] **Step 1: Write the failing tests.**
  - `paths.test.ts`: the new settings and team paths.
  - Team and settings `page.test.tsx`: `it("answers 404 to editors and contributors")`, `it("opens for owners, admins and an appointed editor-in-chief")` (the gate mock returns `standing.role`), `it("sends guests to sign in")`, and for settings `it("lets an owner start a magazine here")` (magazine null).
  - `magazine-team.test.tsx`:
    - `it("adds a found member with the chosen role")`. Assert the call is `{ slug, userId, role: "contributor" }`.
    - `it("changes a role from the row")`.
    - `it("removes only after confirming")`.
    - `it("owners and admins have no controls")`.
    - `it("marks someone who left the community")`.
    - `it("the add button stays disabled until a person and a role are chosen")`.
    - `it("shows the friendly message for STAFF_NOT_MEMBER")`.
    - `it("search results are a labelled radio group and their count is announced")`. `getByRole("group", { name: "Choose a member" })` holds `getAllByRole("radio")`; a `role="status"` element reads "2 members found".
  - `editor-desk.test.tsx`: `it("shows Team only to those who manage the magazine")` (`canManage` true → a Team link to `magazineTeamPath`; false → none).
- [ ] **Step 2: Run them** → FAIL. **Step 3: Implement**, and add the Team button to `EditorDesk` when `canManage`. **Step 4: Run** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines src/components/magazines "src/app/[locale]/communities/[slug]"` and `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit**: `feat(magazines): magazine team page; settings move to the magazine area`.

---

## Task 10: Slice guarantees, visual check and docs

**Files:**

- Create: `src/server/magazines/contributors.integration.test.ts`, `src/lib/magazines/roles-boundary.test.ts`
- Modify: `DESIGN.md`, `docs/adr/0045-magazine-roles-are-capabilities-read-through-the-editorship-seam.md` (Consequences), `CONTEXT.md` (only if a term changed during the build)

**Interfaces:**

- Consumes: everything above, through `createCaller` only (the whole slice end to end).

- [ ] **Step 1: Write the end-to-end guarantee test** `contributors.integration.test.ts` (DB). `it("a member goes from team invite to published contributor")`, in one test, in order:
  1. The owner calls `assignStaffRole` (K, contributor). K has a role notice.
  2. K calls `articles.create` with `magazineId`, then `articles.submit`. The owner has a submitted notice.
  3. The owner calls `reviewArticle` (request_changes, "Shorter intro"). K's `myDraftArticles` shows the note.
  4. K calls `articles.update`, then `articles.submit` again.
  5. The owner calls `reviewArticle` (approve). The article is in `availableArticles`, K's XP is unchanged, and there is no badge.
  6. The owner calls `createIssue`, `setIssueItems` (the article) and `publishIssue`. K's article is `published`. K's XP rose by `ARTICLE_PUBLISHED`. K holds `article_author` and `magazine_published`. The article is readable by an outsider when the issue is public.
  7. K still gets FORBIDDEN on `getIssueForEditing` and `reviewQueue`.
  8. The owner calls `removeStaffRole(K)`. K gets FORBIDDEN on `articles.create` with `magazineId`, and K's published article is still readable.
- [ ] **Step 1b: Write the role-name guard** `src/lib/magazines/roles-boundary.test.ts` (Decision 2): `it("only roles.ts names magazine roles")`. Read every `.ts`/`.tsx` file under `src/server/magazines`, `src/lib/magazines`, `src/components/magazines`, `src/server/api/routers/{magazines,articles}.ts` and `src/app/[locale]/communities/[slug]/magazine` (Node `fs`, recursive), skip `*.test.ts(x)`, `roles.ts` and `test-fixtures.ts`, and fail listing each file whose source contains `"editor_in_chief"`, `'editor_in_chief'`, `"contributor"` or `'contributor'`. Also fail when `"owner"`/`'owner'` appears in those files outside `editorship.ts` and `viewer-role.ts`. (Message keys like `roles.contributor.name` are fine: they are not quoted alone.)
- [ ] **Step 2: Run the whole slice's suites:** `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/magazines src/lib/badges src/server/magazines src/server/articles src/server/badges src/components/magazines src/components/article-editor src/components/notifications "src/app/[locale]/communities" "src/app/[locale]/magazines"`, then `<DB prefix> pnpm vitest run src/migrations src/server/magazines src/server/articles src/server/badges src/server/api/routers`, then `pnpm typecheck`, `pnpm lint` and `pnpm format:check` → all PASS, with no DB suite skipped.
- [ ] **Step 3: Production build from the export** (Global Constraints, "Running the app", with `pnpm exec next build` in place of `next dev`) → succeeds.
- [ ] **Step 4: Visual check** on the running export (port 3100, test DB with a seeded community and magazine). Check each item at 390px and 1440px, light and dark. Write findings in the PR description, not in a file.
  - Magazine tab as owner: Waiting / Issues / Ready / Drafts, plus Settings and Team. No orange on the desk.
  - Magazine tab as staff editor: no Settings and no Team.
  - Magazine tab as contributor: the writing desk only, and the "Note from the editors" block reads well.
  - Article editor as contributor: "SEND TO THE EDITORS" and the pre-publish dialog copy.
  - Review page: the article reads at 72ch. Approve is the one orange. The "Ask for changes" textarea and counter are keyboard-reachable. The decline dialog traps focus.
  - Team page: search, add, change role, remove, the "Not a member now" row. No horizontal scroll at 390px.
  - `/communities/<slug>/settings/magazine` redirects to `/communities/<slug>/magazine/settings`.
  - The notification panel shows the three new notice types with working links.
- [ ] **Step 5: Docs.** In `DESIGN.md`, add the review page and the team page (and the moved settings page) to the workspace routes named in the community-pages paragraph. In ADR-0045 Consequences, add what shipped: the routes, and the risks below. Grep `CONTEXT.md` and both earlier slice plans' rulings for "owner or admin" claims about editors that are now wrong. Fix them in `CONTEXT.md` only (plans are history).
- [ ] **Step 6: Prepare, do not run, the prod backfill** for the PR description: `pnpm exec tsx --env-file=.env scripts/backfill-badges.ts` (dry run), then add `--apply --i-understand-this-writes`. Greg runs it after merge.
- [ ] **Step 7: Commit**: `test(magazines): contributor slice guarantees; docs`.

---

## Risks and open points (for the PR description)

- **Nobody in the site can fix a typo in a contributor's published article** (Decision 7). Editors edit only their own articles. A follow-up could let editors edit any article of their magazine; file it on the magazines epic if Greg wants it.
- **Appointed editors-in-chief manage the team and the settings** (Decision 5). This goes beyond the spec's "owners/admins assign". Please check.
- **Inert staff rows come back to life if the person rejoins** (Decision 4). The team page shows them so owners can remove them. A team member later made admin is listed once, as admin; their old row stays inert and comes back if they stop being admin.
- **Two narrowings of the spec** (Decision 11): contributors do not read each other's unplaced articles, and only team members (not every member) can send articles in. Please check.
- **"Public in an unlisted community" stays with owners and admins** (Decision 14). An appointed editor sees a friendly refusal if they try. The settings form and issue builder still show the confirm box to them; hiding it for non-leaders is a small follow-up if Greg wants it.
- **Contributors cannot withdraw** an article that is with the editors or approved (Decision 7). They ask an editor to decline it instead.
- **Notices are stored in English**, like every other notification type today.
- **The staff queue in Payload admin** still lists magazine articles with `pending_review` if staff filter for them. Staff should not act there. Admin approval of a magazine article only marks it ready (channel rule), so it cannot publish anything.

## Self-review notes

- Spec coverage: staff roles with implicit owner/admin editor-in-chief and assignment from members (Tasks 1–3, 9). Contributor submission (Task 4). Editor review in the site with approve, request changes and reject, reusing `reviewStatus` (Tasks 5, 8). Contributor credit with points and badge on issue publish (slice 1 XP + Task 6). Inbox notices via the existing `notification` table (Tasks 3–5). "Visible only to its author and magazine staff" for unplaced articles: the author sees their own article in the editor, and readers are unchanged (Decision 11). Subscriptions and email are slice 4, not here.
- Type names used across tasks: `MagazineStanding.role` / `.leadsCommunity`, `standingCan`, `requireCapability`, `leadsCommunity`, `LEADING_COMMUNITY_ROLES`, `rolesWith`, `MagazineHandIn`, `handInFor`, `isOpenForWriter`, `mayWriterChange`, `writerStatusOf`, `loadMagazineDesk`, `lockArticle`, `StaffMember`, `StaffCandidate`, `PendingMagazineArticle`, `ReviewPageData`, `insertMagazineNotices`, `notifyRoleAssigned` / `notifyArticleSubmitted` / `notifyArticleReviewed`, `creditedMagazineAuthorIds`, `listWriterArticles`, `magazineReviewPath`, `magazineTeamPath`, `PROCEDURE_CAPABILITY`. Each is defined in exactly one Interfaces block above.

## Preflight rulings

Preflight review (three reviewers) was checked against the code; every finding held and was folded into the plan, except as below.

- Ruling: do not move `canEditIssueAt`, `liveCommunityBySlug` and `isLiveCommunity` onto `loadMagazineDesk` in this slice; instead the plan no longer claims `loadMagazineDesk` serves "every magazine-area page" (it serves the new settings, team and review pages) — the three existing lookups already get the standing from `loadMagazineEditorship`, so they cannot disagree on who edits; moving them touches slice-1 gates and their tests for no behaviour change — cost if wrong: a later slice that changes "live community" must update four lookups instead of one; fold them then.
- Ruling: Decision 12 uses a row lock (`SELECT … FOR UPDATE`, then a Payload read) instead of the suggested conditional `UPDATE … WHERE review_status = … RETURNING` claim — Payload's draft saves write the latest version, not the main row's `review_status`, so a claim on the main column could read a stale status; the lock serializes the same way and keeps the Articles hooks seeing a real change — cost if wrong: a lock held across a Payload save adds a few ms of waiting on the same article only.
- Ruling: the nl strings are not spelled out in the plan; a key-parity test (Task 3) plus "write natural Dutch alongside" stands in for them — the implementer writes copy in both files per task anyway — cost if wrong: weaker Dutch wording, caught in the visual check.
