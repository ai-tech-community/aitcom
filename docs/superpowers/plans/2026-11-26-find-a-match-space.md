# Find a match Space Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move community matching (Matches, My matching profile, Introductions) off the People page into its own builtin Space, "Find a match", at `/communities/<slug>/match`, added when the community saves its first connection type.

**Architecture:** `matching` becomes an optional builtin surface, like `magazine`. A shared `ensureOptionalBuiltinSpace` helper (extracted from the magazine service) appends the menu row idempotently; `communityMatching.saveType` calls it on create. An additive Payload migration backfills the row for communities that already have connection types. The People page renders only the directory; the matching tabs move into a `FindAMatch` component; old `/members?tab=…` links redirect.

**Tech Stack:** Next.js App Router, tRPC, Drizzle (Postgres, schema `app`), Payload migrations, next-intl (en/nl/fr), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-find-a-match-space-design.md`

## Global Constraints

- Surface id `matching`; space slug `match`; route `/communities/<slug>/match`.
- Menu label: en "Find a match", nl "Vind een match", fr "Trouver un match".
- The row is appended at the end of the menu (`max(position) + 1`, or 0).
- Never overwrite an owner's rename, hide, or reorder (`onConflictDoNothing` on `(community_id, slug)`).
- A room owning slug `match` makes the create fail with `MATCHING_SPACE_SLUG_TAKEN` (TRPC `CONFLICT`); never skip silently.
- Migration is additive only. Name: `20261126a_matching_space`. Never `db:push`.
- Matches and Introductions: owners and admins only. My matching profile: every active member.
- Every string in `messages/en.json`, `nl.json`, `fr.json`.
- Subagents: never `git checkout`/`git switch`; stage files by name; check `git branch --show-current` is `feat/find-a-match-page` before committing. No `Co-Authored-By` or AI credit lines.

## Review Focus

1. Owner hid or renamed "Find a match", then adds another connection type — item stays hidden/renamed (Task 1 test: second ensure is a no-op).
2. Member opens an old shared link `/members?tab=profile&ref=mail` — lands on `/match?tab=profile&ref=mail` (Task 4 test on the redirect helper).
3. Plain member opens `/match?tab=matches` — sees My matching profile, not an empty or forbidden tab (Task 4 test).
4. Signed-out visitor or pending member opens `/match` — sees the join prompt, no setup query error (Task 4 test).
5. Owner saves the first type — their menu shows the new item without a reload (Task 2: `spaces.list` invalidated on success; test asserts the invalidate call).

---

### Task 1: Shared optional builtin space helper

**Files:**
- Create: `src/server/communities/optional-space.ts`
- Create: `src/server/communities/optional-space.test.ts`
- Modify: `src/server/communities/space-defaults.ts:34` (`OPTIONAL_BUILTIN_SURFACES` gains `"matching"`; `DEFAULT_BUILTIN_LABELS.matching = ["Find a match", "Vind een match", "Trouver un match"]`)
- Modify: `src/server/magazines/magazine-service.ts:84-145` (use the helper; keep `MAGAZINE_ERROR_CODES` "SPACE_SLUG_TAKEN" behaviour)

**Interfaces:**
- Produces:
  - `export class SpaceSlugTakenError extends Error` (field `slug: string`)
  - `export async function ensureOptionalBuiltinSpace(database: SpaceWriter, communityId: string, surface: OptionalBuiltinSurface, slug: string): Promise<{ added: boolean }>` where `SpaceWriter = Pick<typeof db, "select" | "insert">` (a transaction satisfies it) and `OptionalBuiltinSurface = (typeof OPTIONAL_BUILTIN_SURFACES)[number]`.
  - Behaviour: if a row with `slug` exists and is that builtin surface → `{ added: false }`; if it exists and is anything else → throw `SpaceSlugTakenError`; else insert `{ kind: "builtin", builtinSurface: surface, name: null, slug, position: last + 1 }` with `onConflictDoNothing({ target: [spaces.communityId, spaces.slug] })`, re-check the owner (a room may have raced in → throw), return `{ added: inserted.length > 0 }`.

- [ ] **Step 1: Write failing unit tests** in `optional-space.test.ts` with a fake writer (the style of `community-matching.test.ts`): `"appends the surface after the last space"` (insert values have `position: 5` when max is 4, `name: null`, `kind: "builtin"`), `"returns added:false and inserts nothing when the surface row exists"`, `"throws SpaceSlugTakenError when a room owns the slug"`, `"puts the first space at position 0"`.
- [ ] **Step 2:** `pnpm vitest run src/server/communities/optional-space.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement the helper; add `"matching"` + labels in `space-defaults.ts`; make `ensureMagazineSpace` call the helper and map `SpaceSlugTakenError` → `magazineError("SPACE_SLUG_TAKEN")`.
- [ ] **Step 4:** Run the new test, `src/server/communities/space-defaults.test.ts`, and every magazine unit test that touches `ensureMagazineSpace` (`grep -rl ensureMagazineSpace src --include=*.test.ts`) → PASS.
- [ ] **Step 5: Commit** `feat(communities): share the optional builtin space helper`.

### Task 2: Saving the first connection type adds "Find a match"

**Files:**
- Modify: `src/server/api/routers/community-matching.ts` (`saveType` create branch)
- Modify: `src/server/api/routers/community-matching.test.ts`
- Modify: `src/components/communities/matching/type-editor.tsx` (error text + invalidate `spaces.list`)
- Modify: `src/components/communities/matching/matching.test.tsx` (type editor cases)
- Modify: `messages/{en,nl,fr}.json` (`communities.profile.matching`, `communityMatching.spaceSlugTaken`), plus any other surface-label map the type checker flags (`Record<BuiltinSurface, …>`).

**Interfaces:**
- Consumes: `ensureOptionalBuiltinSpace`, `SpaceSlugTakenError` (Task 1).
- Produces: `saveType` throws `TRPCError({ code: "CONFLICT", message: "MATCHING_SPACE_SLUG_TAKEN" })` on a slug clash.

- [ ] **Step 1: Failing router tests:** `"adds the Find a match space when a connection type is created"` (helper mock called with `(tx, communityId, "matching", "match")`), `"does not touch spaces when a type is updated"`, `"refuses with MATCHING_SPACE_SLUG_TAKEN when a room owns match"`. Mock `@/server/communities/optional-space` with `vi.hoisted`.
- [ ] **Step 2: Failing UI tests:** type editor shows `spaceSlugTaken` copy for that error; on success `utils.spaces.list.invalidate({ slug })` is called (assert on the mock call).
- [ ] **Step 3:** Run both files → FAIL.
- [ ] **Step 4:** Call the helper inside the existing transaction after the insert; map the error. In the editor, add the message branch and the invalidate. Copy:
  - `communities.profile.matching`: en "Find a match" / nl "Vind een match" / fr "Trouver un match"
  - `communityMatching.spaceSlugTaken`: en "A room already uses the address “match”. Rename that room, then save again." (nl/fr translated in the same plain register).
- [ ] **Step 5:** Run both files + `pnpm typecheck` (check `memory_pressure` first) → PASS / no errors.
- [ ] **Step 6: Commit** `feat(matching): add Find a match to the menu with the first connection type`.

### Task 3: Backfill migration

**Files:**
- Create: `src/migrations/20261126a_matching_space.ts`
- Create: `src/migrations/20261126a_matching_space.integration.test.ts` (copy the harness of `20261114c_offers_space.integration.test.ts`)
- Modify: `src/migrations/index.ts` (append entry)

- [ ] **Step 1: Failing integration tests** (rolled-back transactions): `"adds match after the last space for a community with connection types"`, `"leaves communities without connection types alone"`, `"skips a community whose slug match is already taken"`, `"re-running adds nothing"`, `"down removes only matching rows"`.
- [ ] **Step 2:** `RUN_DB_TESTS=1 DATABASE_URL=postgres://…@127.0.0.1:55432/aitcom_test pnpm vitest run src/migrations/20261126a_matching_space.integration.test.ts` → FAIL. (Never port 5432; never `.env`'s DATABASE_URL — it is production.)
- [ ] **Step 3:** `up`: one `INSERT … SELECT` over communities with ≥1 `community_connection_type` and no `space` row with slug `match`, position `coalesce(max(position), -1) + 1`, `archived_at` NULL. `down`: delete `kind='builtin' AND builtin_surface='matching'`.
- [ ] **Step 4:** Run the integration test + `src/migrations/migration-runner-contract.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(matching): backfill Find a match for communities using matching`.

### Task 4: Find a match page; People becomes the directory

**Files:**
- Create: `src/components/communities/matching/find-a-match.tsx` (`FindAMatch`)
- Rename: `members-hub-tab.ts` → `find-a-match-tab.ts` (`MATCHING_TABS = ["matches","profile","introductions"]`)
- Create: `src/components/communities/matching/find-a-match-tab.test.ts`
- Create: `src/app/[locale]/communities/[slug]/match/page.tsx`
- Modify: `src/components/communities/matching/members-hub.tsx` (directory only)
- Modify: `src/app/[locale]/communities/[slug]/members/page.tsx` (server component + redirect)
- Modify: `src/components/communities/matching/matching.test.tsx` (move tab cases to `FindAMatch`)
- Modify: `messages/{en,nl,fr}.json` (`communityMatching.findTitle`, `findDescription`, `joinToMatch`, `joinToMatchDescription`; drop `peopleTab`)

**Interfaces:**
- Produces:
  - `type MatchingTab = "matches" | "profile" | "introductions"`
  - `canOpenMatchingTab(tab, canManage): boolean`
  - `defaultMatchingTab(canManage): MatchingTab` → `"matches"` for managers, `"profile"` otherwise
  - `parseMatchingTab(params, canManage): MatchingTab` (unknown or forbidden → default)
  - `writeMatchingTab(search, tab, canManage): URLSearchParams` (default tab removes the param)
  - `matchingRedirectFromPeople(search: URLSearchParams): URLSearchParams | null` → the query to send to `/match` when `tab` is a `MatchingTab`, else `null`. All other params kept.
  - `FindAMatch({ slug }: { slug: string })`

- [ ] **Step 1: Failing pure tests** (`find-a-match-tab.test.ts`): defaults per role; member asking `matches` gets `profile`; `writeMatchingTab` drops the default; `matchingRedirectFromPeople("tab=profile&ref=mail")` → `"tab=profile&ref=mail"`; `"tab=directory"` and `""` → `null`.
- [ ] **Step 2: Failing UI tests** (`matching.test.tsx`): `CommunityMembersHub` shows no tablist and lists members for an active member; `FindAMatch` for owner shows Matches/My matching profile/Introductions with Matches selected; for a member shows no tablist and the profile form; `?tab=matches` as member shows the profile; signed-out and pending see the "Join to find a match" prompt and `setup` is not queried; tab change writes `/communities/alpha/match?ref=mail&tab=introductions` via `replaceState`, no `pushState`.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement. `FindAMatch` reuses the membership gate and `MatchingWorkspace` currently in `members-hub.tsx` (move, don't copy). Title `findTitle` "Find a match"; `findDescription` en "Say what you would like to connect about. Your organizers use it to introduce you to the right people." `joinToMatch` "Join to find a match"; `joinToMatchDescription` "Only members of this community can use matching." Translate nl/fr in the same register. `members/page.tsx`: async server page reading `searchParams`; when `matchingRedirectFromPeople` returns a query, `redirect({ href: \`/communities/${slug}/match?${q}\`, locale })` from `@/i18n/navigation`; otherwise render `<CommunityMembersHub key={slug} slug={slug} />`. `match/page.tsx`: client page like the current members page, rendering `<FindAMatch key={slug} slug={slug} />`.
- [ ] **Step 5:** Run the matching folder tests, `_community-layout-client.test.tsx`, and `pnpm typecheck` + `pnpm lint` on changed files → PASS.
- [ ] **Step 6: Commit** `feat(matching): give matching its own Find a match page`.

### Task 5: Whole-branch verification

- [ ] `grep -rn "members-hub-tab\|peopleTab\|MembersHubTab" src messages` → no hits.
- [ ] `grep -rn "OPTIONAL_BUILTIN_SURFACES\|Record<BuiltinSurface" src` → every consumer handles `matching` (MCP `SPACE_TYPES`, nav, compose-spaces, agent-communities).
- [ ] Full Vitest suite for the web workspace (one run, after `memory_pressure`), `pnpm typecheck`, `pnpm lint`.
- [ ] Run the app against the local test DB and check: owner saves first type → menu item appears; People has no tabs; `/members?tab=profile` lands on `/match?tab=profile`.
- [ ] `git status --short` clean, then push and open the PR (pattern, what it buys, rejected Offers-style approach).
