# People tab and Offers as a Space — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the community Members tab to People, and turn the hard-coded "What your community offers" menu link into a builtin Space owners can hide, show, reorder and rename.

**Architecture:** Builtin menu tabs are rows in `app.space` (`kind = 'builtin'`, hidden by `archived_at`), defined in `src/server/communities/space-defaults.ts`. Offers becomes one more builtin surface, seeded hidden on new communities, backfilled by an additive migration for existing ones, and un-hidden on a community's first published offer. The rename is copy plus the default-label catalogue that lets stored default names follow the viewer's language.

**Tech Stack:** Next.js App Router, tRPC, Drizzle (app schema), hand-written Payload migrations (`src/migrations/*.ts` + `index.ts`), next-intl (`messages/{en,nl,fr}.json`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-14-people-tab-and-offers-space-design.md`

## Global Constraints

- URLs do not change: People stays at `/communities/{slug}/members`, Offers at `/communities/{slug}/offers` and `/offers/{offerId}`.
- A hidden space only leaves the menu; its page stays reachable (existing rule for every builtin space).
- A custom space name is never overwritten. Old default labels ("Members", "Leden", "Membres") must still count as defaults.
- Copy, exact: `communities.profile.members` = en "People", nl "Mensen", fr "Personnes". `communities.profile.offers` = en "What your community offers", nl "Het aanbod van je community", fr "Les offres de votre communauté" (same as `payments.offersTitle`). `communityMatching.title` = en "People", nl "Mensen", fr "Personnes". `communityMatching.peopleTab` = en "Directory", nl "Ledenlijst", fr "Annuaire".
- Migration is additive and idempotent, takes only `{ db }`, is registered in `src/migrations/index.ts`, and is **never applied** by the implementer (`.env` DATABASE_URL is production). DB tests run only against `aitcom_test` on `127.0.0.1:55432` with `RUN_DB_TESTS=1` — never `localhost:5432` (SSH tunnel to a remote DB).
- Do not run `pnpm dev` to check the UI: it uses the production database, which will not have the offers rows until the migration ships.
- Never `git checkout`/`git switch`; branch is `feat/people-tab-and-offers-space`. Stage files by name.

## Review Focus

1. A community whose owner renamed the Members tab (e.g. "Crew") — must still show "Crew", not "People". (Task 1 test.)
2. A stored builtin name "Members" from older seeding — must now read "People" in English and "Mensen" in Dutch. (Task 1 test.)
3. Running the migration twice, or on a community that already has an `offers` row — positions must not shift a second time. (Task 3 test.)
4. Owner hid Offers, then publishes a second offer — tab must stay hidden. (Task 4 test.)
5. Publishing an event/course offer that replaces an earlier published offer for the same resource — must not count as "first publish". (Task 4 test.)

---

### Task 1: Rename Members to People

**Files:**
- Modify: `messages/en.json`, `messages/nl.json`, `messages/fr.json` (`communities.profile.members`, `communityMatching.title`, `communityMatching.peopleTab`)
- Modify: `src/server/communities/space-defaults.ts` (`DEFAULT_BUILTIN_LABELS.members`)
- Test: `src/server/communities/space-defaults.test.ts`

**Interfaces:**
- Produces: no new names. `isDefaultBuiltinLabel("members", x)` is true for Members, Membres, Leden, People, Mensen, Personnes.

- [ ] **Step 1: Write the failing tests** in `space-defaults.test.ts`:

```ts
it("treats old and new Members labels as the default name", () => {
  for (const label of ["Members", "Leden", "Membres", "People", "Mensen", "Personnes"]) {
    expect(isDefaultBuiltinLabel("members", label), label).toBe(true);
  }
  expect(isDefaultBuiltinLabel("members", "Crew")).toBe(false);
});

it("labels the members surface People in every language", () => {
  expect(en.communities.profile.members).toBe("People");
  expect(nl.communities.profile.members).toBe("Mensen");
  expect(fr.communities.profile.members).toBe("Personnes");
});

it("keeps an owner's own name for the members tab", () => {
  expect(
    resolveSpaceLabel({ kind: "builtin", builtinSurface: "members", name: "Crew" }, t),
  ).toBe("Crew");
  expect(
    resolveSpaceLabel({ kind: "builtin", builtinSurface: "members", name: "Members" }, t),
  ).toBe("T:members");
});
```

(Put the last one inside the existing `describe("resolveSpaceLabel")` so `t` is in scope.)

- [ ] **Step 2: Run** `pnpm vitest run src/server/communities/space-defaults.test.ts` — Expected: FAIL on the copy assertions.

- [ ] **Step 3: Change the copy** to the exact strings in Global Constraints, and append `"People", "Mensen", "Personnes"` to `DEFAULT_BUILTIN_LABELS.members`.

- [ ] **Step 4: Run** the same command plus `pnpm vitest run src/components/communities/matching` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/nl.json messages/fr.json src/server/communities/space-defaults.ts src/server/communities/space-defaults.test.ts
git commit -m "feat(communities): call the members tab People"
```

---

### Task 2: Offers is a builtin space, seeded hidden, rendered from spaces

**Files:**
- Modify: `src/server/communities/space-defaults.ts`
- Modify: `src/server/communities/seed-default-spaces.ts` (doc comment only, if behaviour lives in `buildDefaultSpaceRows`)
- Modify: `src/components/communities/community-nav.tsx` (remove the hard-coded `offers` item)
- Modify: `messages/{en,nl,fr}.json` (`communities.profile.offers`)
- Test: `src/server/communities/space-defaults.test.ts`, `src/components/communities/community-nav.test.tsx`

**Interfaces:**
- Produces, in `space-defaults.ts`:
  - `BUILTIN_SURFACES` — unchanged: the six surfaces shown by default (still the menu's error fallback, so Offers stays out of it).
  - `HIDDEN_DEFAULT_SURFACES = ["offers"] as const` — seeded on every community, hidden.
  - `BuiltinSurface` includes `"offers"`; `DEFAULT_BUILTIN_LABELS.offers` = the three `communities.profile.offers` strings.
  - `DefaultSpaceRow` gains `archivedAt: Date | null`; `builtinSurface` widens to `DefaultBuiltinSurface | "offers"`.
  - `buildDefaultSpaceRows(communityId: string, now: Date = new Date()): DefaultSpaceRow[]` — returns `offers` at position 0 with `archivedAt: now`, then the six `BUILTIN_SURFACES` at positions 1–6 with `archivedAt: null`.

- [ ] **Step 1: Write the failing tests.** In `space-defaults.test.ts`, update the existing `buildDefaultSpaceRows` cases and add:

```ts
it("seeds Offers first and hidden, then the six shown surfaces", () => {
  const now = new Date("2026-11-14T00:00:00Z");
  const rows = buildDefaultSpaceRows("comm-1", now);
  expect(rows.map((r) => r.slug)).toEqual([
    "offers", "forum", "events", "gallery", "classroom", "ideas", "members",
  ]);
  expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(rows[0]).toMatchObject({ builtinSurface: "offers", archivedAt: now });
  expect(rows.slice(1).every((r) => r.archivedAt === null)).toBe(true);
});
```

Extend the "every locale's catalogue label" test's surface list with `...HIDDEN_DEFAULT_SURFACES`.

In `community-nav.test.tsx`, replace the offers assertion in the first test and add:

```ts
it("shows Offers only when the community's spaces include it", () => {
  m.spacesError = false;
  m.spaces = [
    { id: "s0", kind: "builtin", builtinSurface: "offers", name: null, slug: "offers", position: 0 },
    { id: "s1", kind: "builtin", builtinSurface: "forum", name: null, slug: "forum", position: 1 },
  ];
  renderNav("member");
  const links = screen.getAllByRole("link").map((l) => l.textContent);
  expect(links.slice(0, 3)).toEqual(["Overview", en.payments.offersTitle, "Forum"]);
});

it("leaves Offers out when it is hidden (not in the list)", () => {
  m.spacesError = false;
  m.spaces = [
    { id: "s1", kind: "builtin", builtinSurface: "forum", name: null, slug: "forum", position: 1 },
  ];
  renderNav("member");
  expect(screen.queryByRole("link", { name: en.payments.offersTitle })).toBeNull();
});

it("leaves Offers out of the fallback menu", () => {
  renderNav("member"); // spacesError = true
  expect(screen.queryByRole("link", { name: en.payments.offersTitle })).toBeNull();
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/server/communities/space-defaults.test.ts src/components/communities/community-nav.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above; add `communities.profile.offers` to the three message files; delete the hard-coded `offers` entry (and the now-unused `tPayments`) from `community-nav.tsx`. `seedDefaultSpaces` keeps inserting `buildDefaultSpaceRows(communityId)` with `onConflictDoNothing`; update its doc comment to say Offers is seeded hidden.

- [ ] **Step 4: Grep consumers and fix them:** `git grep -n "BUILTIN_SURFACES\|BuiltinSurface\|buildDefaultSpaceRows\|builtinSurface" -- src`. `compose-spaces.tsx` labels through `tProfile(k)` and needs no change beyond the new message key. Update `spaces.integration.test.ts` / `backfill-default-spaces.test.ts` expectations that assert the default row count or order.

- [ ] **Step 5: Run** the Step 2 command plus `pnpm vitest run src/server/communities src/components/communities/settings` and `pnpm typecheck` — Expected: PASS.

- [ ] **Step 6: Commit** (add each changed file by name)

```bash
git commit -m "feat(communities): make Offers a builtin space owners can hide"
```

---

### Task 3: Backfill the Offers space for existing communities

**Files:**
- Create: `src/migrations/20261114c_offers_space.ts`
- Modify: `src/migrations/index.ts` (import + entry after `20261114b_magazine_gallery_items`)
- Test: `src/migrations/20261114c_offers_space.integration.test.ts`

Before creating, re-check `origin/main` for a `20261114c_*` migration; take the next free letter if taken.

**Interfaces:**
- Produces: `up({ db }: MigrateUpArgs)`, `down({ db }: MigrateDownArgs)`.

- [ ] **Step 1: Write the failing integration test**, modelled on `20261114a_drop_event_gallery_media.integration.test.ts` (same `isLocalDbConfigured` guard, every case in a rolled-back transaction, migration called as `migration.up({ db: tx } as never)`). Cases:
  - `"adds Offers first and hidden for a community with no published offer"` — seed community + forum@0, members@1; after `up`: offers@0 with `archived_at` not null, forum@1, members@2.
  - `"adds Offers shown for a community with a published offer"` — seed a `payment_offer` with `published = true`; after `up`: offers row `archived_at` is null.
  - `"keeps a hidden space hidden and the order of rooms"` — seed a hidden gallery and a room; relative order and `archived_at` unchanged, positions +1.
  - `"is idempotent"` — run `up` twice; positions equal those after the first run, exactly one offers row.
  - `"skips a community that already has an offers row"` — seed offers@3 hidden; after `up` nothing in that community changed.
  - `"down removes only builtin offers rows"`.

- [ ] **Step 2: Run** `RUN_DB_TESTS=1 DATABASE_URL=postgres://…@127.0.0.1:55432/aitcom_test pnpm vitest run src/migrations/20261114c_offers_space.integration.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `up`** as one statement so shift and insert commit together and a re-run finds no targets:

```sql
WITH targets AS (
  SELECT c."id" FROM "app"."community" c
  WHERE NOT EXISTS (
    SELECT 1 FROM "app"."space" s
    WHERE s."community_id" = c."id" AND s."slug" = 'offers'
  )
), shifted AS (
  UPDATE "app"."space" SET "position" = "position" + 1
  WHERE "community_id" IN (SELECT "id" FROM targets)
  RETURNING 1
)
INSERT INTO "app"."space"
  ("id", "community_id", "kind", "builtin_surface", "slug", "position", "archived_at")
SELECT gen_random_uuid()::text, t."id", 'builtin', 'offers', 'offers', 0,
  CASE WHEN EXISTS (
    SELECT 1 FROM "app"."payment_offer" o
    WHERE o."community_id" = t."id" AND o."published"
  ) THEN NULL ELSE now() END
FROM targets t;
```

`down`: `DELETE FROM "app"."space" WHERE "kind" = 'builtin' AND "builtin_surface" = 'offers'` (positions keep their +1; gaps are harmless). Register in `index.ts`.

- [ ] **Step 4: Run** the Step 2 command and `pnpm vitest run src/migrations/migration-runner-contract.test.ts` — Expected: PASS. Do **not** run `db:apply` or `payload migrate`.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/20261114c_offers_space.ts src/migrations/20261114c_offers_space.integration.test.ts src/migrations/index.ts
git commit -m "feat(communities): backfill the Offers space for existing communities"
```

---

### Task 4: First published offer shows the Offers tab

**Files:**
- Create: `src/server/communities/offers-space.ts`
- Create: `src/server/communities/offers-space.integration.test.ts`
- Modify: `src/server/api/routers/community-payments.ts` (`publishOffer` transaction)
- Test: `src/server/api/routers/community-payments.test.ts`

**Interfaces:**
- Produces: `showOffersSpaceOnFirstPublish(tx: Tx, communityId: string): Promise<boolean>` — when the community has **no** row in `payment_offer` with `published = true`, sets `archived_at = null` on its `offers` builtin space and returns `true`; otherwise changes nothing and returns `false`. `Tx` as exported from `activate-membership.ts`.

- [ ] **Step 1: Write the failing integration tests** (same guard and rollback pattern as Task 3):
  - `"shows a hidden Offers tab when nothing is published yet"` → returns true, `archived_at` null.
  - `"leaves a hidden tab hidden when an offer is already published"` → returns false, `archived_at` unchanged.
  - `"does nothing when the community has no offers row"` → returns false, no row created.
  - `"only touches the given community"` → another community's hidden offers row stays hidden.

- [ ] **Step 2: Run** with the Task 3 DB env — Expected: FAIL.

- [ ] **Step 3: Implement** `showOffersSpaceOnFirstPublish`. In `publishOffer`, call it inside the existing transaction **right after the advisory lock and before any `paymentOffers` update**, only when `input.published` is true — so a course/event offer replacing an earlier published one sees that earlier offer and does not count as a first publish. Call `invalidateSquareRooms()` after commit when it returned true, matching `spaces.setEnabled`.

- [ ] **Step 4: Add the router wiring test** to `community-payments.test.ts`: mock `@/server/communities/offers-space`; give the caller a db fake whose `select` chain returns the offer, policy and connection, and whose `transaction(fn)` calls `fn(tx)` with a recording `tx`. Assert `showOffersSpaceOnFirstPublish` was called once with `(tx, "community-A")` for `published: true`, called **before** the first `tx.update`, and not called for `published: false`.

- [ ] **Step 5: Run** `pnpm vitest run src/server/api/routers/community-payments.test.ts` and the Step 2 command — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/communities/offers-space.ts src/server/communities/offers-space.integration.test.ts src/server/api/routers/community-payments.ts src/server/api/routers/community-payments.test.ts
git commit -m "feat(payments): show the Offers tab when a community publishes its first offer"
```

---

### Task 5: Whole-branch verification

- [ ] **Step 1:** `git status --short` — only this plan's files changed; nothing unstaged.
- [ ] **Step 2:** `pnpm typecheck` and `pnpm lint` on changed files — Expected: no errors.
- [ ] **Step 3:** Full suite `pnpm test` — Expected: no new failures (compare any failure against `main`).
- [ ] **Step 4:** DB suites with the test DB env: `src/migrations/20261114c_offers_space.integration.test.ts`, `src/server/communities/offers-space.integration.test.ts`, `src/server/api/routers/spaces.integration.test.ts`, `src/server/communities/backfill-default-spaces.test.ts` — Expected: PASS.
- [ ] **Step 5:** Re-check `origin/main` and open PRs for parallel work on spaces/offers/members, and for a migration that took `20261114c`.
