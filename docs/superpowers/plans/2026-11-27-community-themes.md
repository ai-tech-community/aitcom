# Community Themes Implementation Plan (slice 1: themes you can pick)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners and admins pick a look for their community (Plain, Canal, Meadow, Sunset, Night) in Settings → Themes, with a live preview; the look paints every page of the community frame.

**Architecture:** A typed, pure-data catalog in `src/lib/communities/themes/` is the single source of looks; React-only parts (cover art, `next/font` faces) live in `src/components/communities/theme/` and are keyed by the same ids, so the catalog stays testable in node and dependencies point inward. A community stores only a theme id in a side table (`app.community_theme`, missing row = Plain). `CommunityThemeScope` applies a look by **token scoping**: it re-declares the site's own CSS custom properties inside the community frame, so components follow without knowing themes exist.

**Tech Stack:** Next.js App Router, tRPC + React Query (RSC hydration), Drizzle (read/write) + hand-written Payload migrations (schema), Tailwind v4 tokens in `src/styles/globals.css`, next-intl (en/fr/nl), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-27-community-themes-design.md`

## Global Constraints

- Looks in this slice: `plain` (default), `canal`, `meadow`, `sunset`, `night`. Night is `scheme: "dark"`; the others are `"light"`.
- Every look passes, by test: `foreground` and `mutedForeground` on `background` ≥ 4.5:1; the same two on the card color ≥ 4.5:1; `border` and `input` on `background` at least as high as Plain's (`#EBEBEB` on `#FFFFFF`, about 1.2:1 — the house value today); `--primary` (`oklch(0.705 0.213 47.604)`, measured as its sRGB clip `#FF6900`) and `--ring` on `background` ≥ 2.5:1 (Plain has about 2.9:1 on white; the house orange is below 3:1 today, a site-wide topic); `cover.nameColor` on `cover.nameBase` ≥ 4.5:1.
- Orange band: no `background`, pattern or cover-palette color with OKLCH hue in **30–65** and chroma **> 0.08**.
- `--primary` is never overridden by a theme. Body text stays Geist Sans, labels Geist Mono; a theme sets only `--font-community-heading`.
- Heading faces: canal = Fraunces, meadow = Nunito, sunset = DM Serif Display, night = Space Grotesk, plain = none (Geist Sans). All `next/font/google`, `preload: false`, `display: "swap"`.
- Schema: hand-written Payload migration in `src/migrations/`, additive only, registered in `src/migrations/index.ts`. Never `db:push`. `.env` points at production: never run `db:apply` yourself.
- Text in `messages/en.json`, `messages/fr.json`, `messages/nl.json`.
- Workspace-variant pages (`resolveCommunityLayoutVariant(...) === "workspace"`) stay plain.
- A banner picture, when set, always shows; theme cover art only replaces "no banner".
- Every agent checks `git branch --show-current` is `feat/community-themes` before each commit, stages files by name, never `git add -A`, never `git stash`, never `git checkout`/`git switch`. Another session edits this tree: commit only files this task lists.
- Commit messages: conventional, no AI credit lines.

## Review Focus

1. **A stored id that is no longer in the catalog** (a look removed later, or a typo written by hand) → the community renders Plain, no crash. Test in Task 2 (resolver) and Task 3 (store read).
2. **A preview database that has not run the migration** → `getBySlug` still answers with `themeId: "plain"`; `setTheme` answers `PRECONDITION_FAILED`, not a 500. Tests in Task 3 and Task 4.
3. **Admin previews Night, then leaves Settings → Themes without saving** → the rest of the community shows the saved look again. Test in Task 6 (preview cleared on unmount).
4. **A moderator or member calls `setTheme` directly** (the UI hides the page, the server must still refuse) → `FORBIDDEN`. Test in Task 4.
5. **A community with a banner picks a look with art** → the banner shows, the cover art does not. Test in Task 6.

---

### Task 1: Shared color helper

**Files:**
- Create: `src/lib/color/contrast.ts`
- Create: `src/lib/color/contrast.test.ts`
- Modify: `src/lib/magazines/theme.ts` (import from the helper; delete the moved functions, keep re-exports only if other files import them from here — grep `from "@/lib/magazines/theme"` for `contrastRatio|relativeLuminance|normalizeHexColor`)

**Interfaces:**
- Produces:
  - `normalizeHexColor(raw: string): string | null` (moved as is)
  - `relativeLuminance(hex: string): number` (moved)
  - `contrastRatio(foreground: string, background: string): number` (moved)
  - `oklchOf(hex: string): { l: number; c: number; h: number }` (new; `h` in degrees 0–360, `0` when `c < 1e-4`)
  - `isInOrangeBand(hex: string): boolean` — `h >= 30 && h <= 65 && c > 0.08`

- [ ] **Step 1: Write the failing tests** in `contrast.test.ts`:
  - `contrastRatio("#000000", "#FFFFFF")` ≈ 21 (`toBeCloseTo(21, 1)`).
  - `oklchOf("#FFFFFF")` → `l` ≈ 1, `c` < 1e-4.
  - Signal Orange as sRGB `#F54A00` → `isInOrangeBand` true; `Math.abs(h - 47.6) < 1.5` (hex rounding moves the hue a little).
  - `isInOrangeBand("#F4E6DC")` (soft peach, low chroma) → false.
  - `isInOrangeBand("#B23A2E")` (brick red, hue below 30) → false.
  - `isInOrangeBand("#2E5E8C")` (blue) → false.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/color/contrast.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Move the three functions from `src/lib/magazines/theme.ts`. `oklchOf` is the standard sRGB → linear → OKLab (Björn Ottosson's matrices) → LCh conversion:

```ts
// linear sRGB (from channelLuminance's transfer) → LMS
const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
// c = hypot(A, B); h = (atan2(B, A) in degrees + 360) % 360
```
- [ ] **Step 4: Run** the new test and `pnpm exec vitest run src/lib/magazines` → PASS.
- [ ] **Step 5: Commit** `src/lib/color/contrast.ts src/lib/color/contrast.test.ts src/lib/magazines/theme.ts` (plus any import sites changed): `refactor(color): share contrast and add an OKLCH reader`.

---

### Task 2: The theme catalog

**Files:**
- Create: `src/lib/communities/themes/types.ts`
- Create: `src/lib/communities/themes/catalog.ts`
- Create: `src/lib/communities/themes/catalog.test.ts`
- Modify: `messages/en.json`, `messages/fr.json`, `messages/nl.json` (add `communities.themes.<id>.name` and `.description` for all five ids)

**Interfaces:**
- Consumes: Task 1 `contrastRatio`, `isInOrangeBand`, `normalizeHexColor`.
- Produces (from `catalog.ts`, re-exported by `src/lib/communities/themes/index.ts`):
  - `type CommunityThemeId = "plain" | "canal" | "meadow" | "sunset" | "night"`
  - `type CommunityThemeTokens = { background: string; foreground: string; mutedForeground: string; border: string; input: string; card?: string; cardForeground?: string }` (hex `#RRGGBB`)
  - `type CommunityTheme = { id: CommunityThemeId; scheme: "light" | "dark"; tokens: CommunityThemeTokens; canvasPattern: { image: string; size: string; colors: string[] } | null; cover: { palette: Record<string, string>; nameColor: string; nameBase: string } | null; headingFont: "fraunces" | "nunito" | "dm-serif-display" | "space-grotesk" | null }`
  - `COMMUNITY_THEMES: readonly CommunityTheme[]` — order: plain, canal, meadow, sunset, night (the tile order)
  - `COMMUNITY_THEME_IDS: [CommunityThemeId, ...CommunityThemeId[]]` (for `z.enum`)
  - `DEFAULT_COMMUNITY_THEME_ID: CommunityThemeId = "plain"`
  - `isCommunityThemeId(value: unknown): value is CommunityThemeId`
  - `resolveCommunityTheme(id: string | null | undefined): CommunityTheme`

`canvasPattern.colors` lists every color used inside `image` so the orange test can see it. Plain's tokens are today's light values from `globals.css` converted to hex (`--background` `#FFFFFF`, `--foreground` ≈ `#0A0A0A`, …). Night's tokens start from the `.dark` block's values with an indigo canvas (mockup direction `oklch(0.24 0.05 275)`) and a dark card. Exact values for the other looks are the builder's, inside the tests; mockup directions: Canal canvas `oklch(0.955 0.025 230)`, Meadow `oklch(0.96 0.03 145)`, Sunset a low-chroma peach→pink that reads as sky, not beige.

- [ ] **Step 1: Write the failing tests** in `catalog.test.ts`, one `describe.each(COMMUNITY_THEMES)`:
  - `foreground` and `mutedForeground` on `background` ≥ 4.5.
  - the same two on `card ?? (scheme === "dark" ? <dark card hex> : "#FFFFFF")` ≥ 4.5, using `cardForeground ?? foreground` for the first.
  - `contrastRatio(border, background)` and `contrastRatio(input, background)` ≥ the same ratio for Plain (lines no fainter than today's house lines).
  - `"#FF6900"` (primary, sRGB clip of the token) on `background` ≥ 2.5.
  - `cover`: `contrastRatio(nameColor, nameBase)` ≥ 4.5.
  - no color in `[tokens.background, ...canvasPattern.colors, ...Object.values(cover.palette)]` is `isInOrangeBand`.
  - every hex passes `normalizeHexColor(x) === x`.
  - `en`, `fr`, `nl` messages each have non-empty `communities.themes.<id>.name` and `.description` (import the JSON files).
  - plus: `resolveCommunityTheme(null).id === "plain"`, `resolveCommunityTheme("gone").id === "plain"`, `resolveCommunityTheme("canal").id === "canal"`; `COMMUNITY_THEMES[0].id === "plain"`; ids are unique; exactly `night` has `scheme: "dark"`; `plain` has `cover === null` and `headingFont === null`, every other look has both.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/communities/themes` → FAIL.
- [ ] **Step 3: Implement** the types, catalog and resolver, and the 5×2 message strings per language (en names: Plain, Canal, Meadow, Sunset, Night; descriptions one short sentence each in everyday words, e.g. Canal "Soft water blue with a row of canal houses."). Tune values until every assertion passes; do not loosen a threshold.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** the four files + three message files: `feat(communities): a catalog of community looks`.

---

### Task 3: Storage

**Files:**
- Create: `src/migrations/<date><suffix>_community_theme.ts` — use the next free name on `origin/main` **at commit time** (`git fetch && git ls-tree --name-only origin/main src/migrations/`). Another session is adding `20261127a_community_news_sources`; if that is still unmerged, use `20261127b_community_theme`.
- Modify: `src/migrations/index.ts` (import + append entry, same shape as the others)
- Modify: `src/server/db/schema.ts` (add `communityThemes` next to `communityNewsSectors`)
- Create: `src/server/communities/theme-store.ts`
- Create: `src/server/communities/theme-store.test.ts` (unit, fake db)
- Create: `src/server/communities/theme-store.integration.test.ts` (DB, header copied from `directory.integration.test.ts`)

**Interfaces:**
- Consumes: Task 2 `resolveCommunityTheme`, `CommunityThemeId`, `DEFAULT_COMMUNITY_THEME_ID`.
- Produces:
  - `readCommunityThemeId(db: SqlDb, communityId: string): Promise<CommunityThemeId>` — unknown/missing row/missing table → `"plain"`.
  - `writeCommunityThemeId(db: SqlDb, communityId: string, themeId: CommunityThemeId, userId: string): Promise<void>` — `plain` deletes the row; otherwise upsert `theme_id`, `updated_by`, `updated_at = now()`.
  - `isMissingCommunityThemeSchema(error: unknown): boolean` — true when the error text mentions `community_theme`.
  - Drizzle table `communityThemes` (`app.community_theme`).

Migration `up` (and `down` = `DROP TABLE IF EXISTS "app"."community_theme"`):

```sql
CREATE TABLE IF NOT EXISTS "app"."community_theme" (
  "community_id" varchar(255) PRIMARY KEY
    REFERENCES "app"."community"("id") ON DELETE CASCADE,
  "theme_id" varchar(32) NOT NULL,
  "updated_by" varchar(255) REFERENCES "app"."user"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
```

Follow `readCommunityNewsSector` / `writeCommunityNewsSector` in `src/server/news/sectors.ts` for the raw-SQL shape and the missing-schema fallback.

- [ ] **Step 1: Write failing unit tests** (`theme-store.test.ts`, fake `execute`): a row `{ theme_id: "canal" }` → `"canal"`; a row `{ theme_id: "gone" }` → `"plain"`; no row → `"plain"`; `execute` throwing `relation "app.community_theme" does not exist` → `"plain"`; `execute` throwing another error → rethrows; `writeCommunityThemeId(db, "c1", "plain", "u1")` issues a `DELETE` (assert the SQL text contains `DELETE FROM "app"."community_theme"`).
- [ ] **Step 2: Write the failing DB test** (`theme-store.integration.test.ts`, auto-skips without `RUN_DB_TESTS=1`): write `canal` then read `canal`; write `night` over it then read `night`; write `plain` then the row is gone; deleting the community cascades the row.
- [ ] **Step 3: Run** unit test → FAIL.
- [ ] **Step 4: Implement** migration, index entry, Drizzle table, store.
- [ ] **Step 5: Run** unit test → PASS. Apply the migration to the test DB only and run the DB test:
  `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 PAYLOAD_PUSH=false NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm exec vitest run src/server/communities/theme-store.integration.test.ts` → PASS (not skipped). Also run `src/server/db/payload-schema-drift.test.ts` and `src/migrations/migration-runner-contract.test.ts` → PASS.
- [ ] **Step 6: Commit** the six files: `feat(communities): store a community's theme`.

---

### Task 4: Read and write the theme through the API

**Files:**
- Modify: `src/server/api/routers/communities.ts` (`getBySlug` return; new `setTheme` in the admin section after `updateSettings`)
- Modify: `src/server/api/routers/communities-get-by-slug.test.ts` (mock `@/server/communities/theme-store`, assert `themeId`)
- Create: `src/server/api/routers/communities-set-theme.test.ts` (same mocking style as `communities-get-by-slug.test.ts`)
- Modify: every hand-built `getBySlug`-shaped object. Find them with `grep -rn "viewerCanReadContent" src --include='*.ts*'` (fixtures, mocks, stories); add `themeId: "plain"`.

**Interfaces:**
- Consumes: Task 3 `readCommunityThemeId`, `writeCommunityThemeId`, `isMissingCommunityThemeSchema`; Task 2 `COMMUNITY_THEME_IDS`.
- Produces:
  - `getBySlug` output gains `themeId: CommunityThemeId` (public).
  - `communities.setTheme` — `communityProcedure`, input `{ slug: string; themeId: z.enum(COMMUNITY_THEME_IDS) }`, returns `{ themeId }`. Owner/admin only (`ctx.communityRole`), else `FORBIDDEN`. Missing schema → `PRECONDITION_FAILED` with message "Themes are not available until the database migration runs." Logs activity `community.theme_updated` with `metadata: { themeId }` (same `logActivity` call shape as `updateSettings`).

- [ ] **Step 1: Write failing tests:**
  - get-by-slug: with the store mocked to `"meadow"`, the result has `themeId: "meadow"`.
  - set-theme: owner → calls `writeCommunityThemeId(db, "c1", "canal", <userId>)` and returns `{ themeId: "canal" }`; admin → same; moderator → `FORBIDDEN` and the store is not called; member → `FORBIDDEN`; `themeId: "gone"` → zod `BAD_REQUEST`; store throwing a missing-schema error → `PRECONDITION_FAILED`; activity logged with action `community.theme_updated`.
- [ ] **Step 2: Run** both files → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files and `pnpm typecheck` (check `memory_pressure` first) → PASS. Typecheck is what finds hand-built objects missing `themeId`; fix each.
- [ ] **Step 5: Commit** the router, both tests and every fixture touched: `feat(communities): read and set a community's theme`.

---

### Task 5: Prefetch the community on the server

**Files:**
- Modify: `src/app/[locale]/communities/[slug]/layout.tsx`
- Create or modify: `src/app/[locale]/communities/[slug]/layout.test.tsx`

**Interfaces:**
- Consumes: `api`, `HydrateClient` from `src/trpc/server.ts`.
- Produces: the client layout's `api.communities.getBySlug.useQuery({ slug })` is already resolved on first render for an existing community.

`layout.tsx` awaits `params`, calls `void api.communities.getBySlug.prefetch({ slug })`, and wraps `CommunityLayoutClient` in `<HydrateClient>`. Look at `src/app/[locale]/communities/[slug]/magazine/issues/[issueId]/edit/page.tsx` for the prefetch-and-hydrate shape already used in this frame. Do not change `_community-layout-client.tsx`'s `isPending` / `notFound()` logic or its comment; the prefetch makes the query settled on first render, and a missing slug prefetches a `NOT_FOUND` that hydrates as an error, so the client takes the same `notFound()` path the server took.

- [ ] **Step 1: Write failing test** (`layout.test.tsx`): with `api.communities.getBySlug.prefetch` mocked, rendering the layout for slug `belong` calls `prefetch({ slug: "belong" })` once and renders its children inside `HydrateClient`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test and the existing tests under `src/app/[locale]/communities/[slug]` → PASS.
- [ ] **Step 5: Manual check** (dev server against the dev env, not prod; stop it after): open an existing community with JS throttled. The first HTML already has the community identity (no spinner). A missing slug shows the not-found page, with no hydration error in the console.
- [ ] **Step 6: Commit** `layout.tsx layout.test.tsx`: `perf(communities): prefetch the community on the server`.

---

### Task 6: Apply the look to the frame

**Files:**
- Create: `src/components/communities/theme/heading-fonts.ts` (`next/font` declarations, `headingFontClass(id): string`)
- Create: `src/components/communities/theme/covers/{canal,meadow,sunset,night}-cover.tsx`
- Create: `src/components/communities/theme/cover-art.ts` (`COMMUNITY_COVER_ART: Record<CommunityThemeId, ComponentType | null>`)
- Create: `src/components/communities/theme/community-theme-preview.tsx` (context)
- Create: `src/components/communities/theme/community-theme-scope.tsx`
- Create: `src/components/communities/theme/community-theme-cover.tsx`
- Create: `src/components/communities/theme/community-theme-scope.test.tsx`
- Modify: `src/styles/globals.css` (`--font-community-heading` in `@theme`; `[data-community-theme]` canvas-pattern rule)
- Modify: `src/app/[locale]/communities/[slug]/_community-layout-client.tsx`
- Modify: `src/components/communities/community-identity.tsx` (h1 gets `font-community-heading`)

**Interfaces:**
- Consumes: Task 2 `resolveCommunityTheme`, `CommunityTheme`, `CommunityThemeId`; Task 4 `community.themeId`.
- Produces:
  - `CommunityThemePreviewProvider({ children })` and `useCommunityThemePreview(): { previewId: CommunityThemeId | null; setPreviewId(id: CommunityThemeId | null): void }`.
  - `CommunityThemeScope({ themeId, className, children })` — shows `previewId ?? themeId`. Renders one `div` with `data-community-theme={id}`, `className` + `dark` when `scheme === "dark"` + `bg-background text-foreground` + the heading font's variable class, and `style` with `--background`, `--foreground`, `--muted-foreground`, `--border`, `--input`, and `--card` / `--card-foreground` when set, `--community-canvas-image` / `--community-canvas-size` when a pattern exists, and `--community-cover-<key>` for each cover palette entry.
  - `CommunityThemeCover({ community, className })` — renders `CommunityBanner` when `community.bannerUrl`; else the active look's art (from `COMMUNITY_COVER_ART`, `aria-hidden`) with `community.name` in `font-community-heading` and `cover.nameColor`; else nothing. Same box as the banner: `h-32 w-full rounded-lg border sm:h-40 lg:h-44`.
  - Tailwind utility `font-community-heading` (from `--font-community-heading: var(--community-heading-face), var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif`).

In `_community-layout-client.tsx`: wrap the non-workspace branch in `CommunityThemePreviewProvider` + `CommunityThemeScope themeId={community.themeId}` (the scope takes over the `px-4 py-8 sm:px-8` frame div so the canvas is edge to edge); replace the `CommunityBanner` call with `CommunityThemeCover`. The workspace branch is untouched. Cover SVGs take every color from `var(--community-cover-<key>)`; no literal colors in them.

- [ ] **Step 1: Write failing tests** (`community-theme-scope.test.tsx`):
  - `themeId="canal"` → element has `data-community-theme="canal"`, style `--background` equals the catalog's canal background, no `dark` class.
  - `themeId="night"` → has the `dark` class and `--card` set.
  - `themeId="plain"` → `data-community-theme="plain"`, no `--card` override.
  - with the provider and `setPreviewId("night")` from a child → the scope shows night; unmounting that child after calling `setPreviewId(null)` in its cleanup → back to the saved look (Review Focus 3 — the Themes page in Task 7 owns the cleanup; this test pins that the scope follows `null`).
  - cover: `bannerUrl` set + `canal` → an `img[data-community-banner]`, no `[data-community-cover-art]` (Review Focus 5); no banner + `canal` → art present and the name text rendered; no banner + `plain` → renders nothing.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** fonts, covers, context, scope, cover, CSS, layout wiring, identity h1 class. Art direction is the approved mockup with the Global Constraints' orange rule (Canal roofs brick red below hue 30 and blues; Sunset rays low-chroma peach and pink).
- [ ] **Step 4: Run** the test, `src/components/communities`, and `src/app/[locale]/communities` tests → PASS.
- [ ] **Step 5: Commit** the files listed above: `feat(communities): paint the community frame with its look`.

---

### Task 7: Settings → Themes

**Files:**
- Create: `src/app/[locale]/communities/[slug]/settings/themes/page.tsx` (client page, same shape as `settings/topics/page.tsx`)
- Create: `src/components/communities/settings/theme-settings.tsx`
- Create: `src/components/communities/settings/theme-tile.tsx`
- Create: `src/components/communities/settings/theme-settings.test.tsx`
- Modify: `src/components/communities/settings/settings-sidebar.tsx` (item `{ key: "themes", href: \`${basePath}/themes\` }` right after `general`)
- Modify: `messages/en.json`, `fr.json`, `nl.json` (`communities.settings.sidebar.themes`; `communities.settings.themes.{title, intro, current, previewing, save, cancel, saved, error}`)

**Interfaces:**
- Consumes: Task 2 `COMMUNITY_THEMES`; Task 4 `api.communities.setTheme`, `getBySlug.themeId`; Task 6 `useCommunityThemePreview`, `COMMUNITY_COVER_ART`.
- Produces: `ThemeSettings({ slug })`.

Behaviour: tiles are a radio group (`role="radiogroup"`, each tile `role="radio"`, `aria-checked`, roving tab index, arrow keys move). Each tile is a small drawing of the community page in that look, with the community's name (and its banner, if set). The saved look shows a "Current" mark. Choosing a tile calls `setPreviewId(id)` (or `null` when it equals the saved look). While a preview differs from the saved look, a sticky bar shows "Previewing <name>" with Save and Cancel. Save → `setTheme.mutate({ slug, themeId })`, on success toast `saved`, invalidate `communities.getBySlug`, `setPreviewId(null)`. Cancel → `setPreviewId(null)`, no mutation. Unmount → `setPreviewId(null)`. Error → toast `error`, the preview stays. en copy: title "Themes", intro "Choose how your community looks. Members and visitors see it on every page.", current "Current", previewing "Previewing {name}", save "Save theme", cancel "Cancel", saved "Theme saved.", error "The theme could not be saved. Try again."

- [ ] **Step 1: Write failing tests** (`theme-settings.test.tsx`, mock tRPC as other settings tests do):
  - five radios in catalog order; the saved one (`canal`) has `aria-checked="true"` and the "Current" mark.
  - clicking Night calls `setPreviewId("night")` and shows the Save bar.
  - Save calls `setTheme.mutate` with `{ slug: "belong", themeId: "night" }` exactly (assert the call, not the toast).
  - Cancel calls `setPreviewId(null)` and never calls `mutate`.
  - unmounting calls `setPreviewId(null)`.
  - ArrowRight from Canal focuses Meadow.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** page, components, sidebar item, messages.
- [ ] **Step 4: Run** the test and the existing `settings-sidebar` tests → PASS.
- [ ] **Step 5: Commit** the files listed above: `feat(communities): pick a theme in settings`.

---

### Task 8: Every community page reads right in every look

**Files:**
- Modify: community components and pages that hard-code colors. Find them with `grep -rnE "bg-white|text-black|(text|bg|border)-(zinc|gray|neutral|slate|stone)-[0-9]|#[0-9a-fA-F]{6}" src/components/communities "src/app/[locale]/communities/[slug]"` (skip tests and the theme covers). Move each to the matching token (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`).
- Modify: page titles and house section headings, to add `font-community-heading`: each community page's title heading, Settings section headings, and the Overview's section titles. Not post, thread, event or lesson titles, not member-written rich text, not magazine previews.

**Interfaces:** none new.

- [ ] **Step 1: Screenshot pass, before fixes.** Dev server (dev env), Belong-like test community, each look, at 1920 / 1440 / 1280 / 390: Overview, Forum, Settings → Themes. In Night, also Events, Gallery, Classrooms, Ideas, People, Settings → General, and the members-only view as a signed-out visitor of a private community. Save to the scratchpad and list unreadable spots.
- [ ] **Step 2: Fix** each spot by moving it to tokens; add `font-community-heading` to the named headings.
- [ ] **Step 3: Screenshot pass, after.** Same set. No unreadable text, inputs visible, no orange in any canvas, no layout shift on load, workspace pages (magazine issue editor) still plain.
- [ ] **Step 4: Run** `pnpm exec vitest run src/components/communities "src/app/[locale]/communities"` → PASS.
- [ ] **Step 5: Commit** each touched file by name: `fix(communities): every page follows the community's look`.

---

### Task 9: Design rules and the decision record

**Files:**
- Modify: `DESIGN.md` — new section "Community themes" (the scoped No-Cream exception: canvas inside the community frame only; never a near-white warm neutral; the orange band rule with its numbers; `--primary` never overridden; cards and controls on house tokens; heading face only, on named headings; the five looks with their tokens and faces). Edit the No-Cream Rule paragraph to point at it. Grep `DESIGN.md` and `PRODUCT.md` for claims that owners never change style (`grep -niE "custom(ize|isation)|owner.*(style|color|font)" DESIGN.md PRODUCT.md`) and fix each hit.
- Create: `docs/adr/0051-a-communitys-look-is-a-theme-from-a-typed-catalog.md` — in the format of `docs/adr/0050-…`. Decision: a typed catalog in code; the community stores only the id in `app.community_theme`; the look is applied by token scoping. Rejected: Payload-edited themes, per-community colors (reasons from the spec's Approaches). Check `git ls-tree --name-only origin/main docs/adr/` and open PRs first; take the next free number if 0051 is gone.

- [ ] **Step 1: Write** both documents.
- [ ] **Step 2: Check** `grep -n "Community themes" DESIGN.md` hits the new section and the No-Cream pointer.
- [ ] **Step 3: Commit** `DESIGN.md PRODUCT.md docs/adr/0051-*.md`: `docs: record community themes in the design rules and ADR-0051`.

---

### Task 10: Whole-branch verification

- [ ] **Step 1:** `git status --short` shows no change of ours uncommitted (another session's files may appear; leave them).
- [ ] **Step 2:** Check `memory_pressure`, then `pnpm typecheck`, `pnpm lint`, `pnpm test` → all PASS. Paste failures, do not summarize them away.
- [ ] **Step 3:** DB test from Task 3 against `aitcom_test` → PASS, not skipped.
- [ ] **Step 4:** Re-search `origin/main` and open PRs for "theme" to make sure no parallel session shipped this.
- [ ] **Step 5:** Fresh code reviewer (branch ref only) and fresh design reviewer (`/impeccable` critique against DESIGN.md, given the screenshot set). Fix real findings, commit, re-run Step 2.
- [ ] **Step 6:** Stop the dev server and any background jobs.
