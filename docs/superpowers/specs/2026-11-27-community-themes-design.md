# Community themes

Draft 2026-11-27. Project.

## Intent

Community admins want their community to feel like its own place. The ask came
from Diana (owner, Belong NL, a community for internationals in the
Netherlands): "can the visual of my community be changed? Like different
background color or background image to make it more come to life?" Her
Overview today is white cards on a white page: correct, but anonymous.

We answer with a **theme selection**: an admin picks one look from a short list
we design. A look paints the community's background, its cover, and its heading
font. Everything people read and press (cards, text, buttons) stays on the
house system, so every community stays readable and still feels like the same
platform.

The goal is "this community feels like ours". It is **not** "match my company
brand exactly".

## Goals

- In **Settings → Themes**, an owner or admin sees the looks as preview tiles,
  tries one on the live page before saving, and saves or cancels.
- First release: **Plain** (today's look, the default) plus four looks:
  **Canal**, **Meadow**, **Sunset**, **Night**. Direction approved in the
  brainstorm mockups (`.superpowers/brainstorm/…/theme-directions.html`):
  - Canal: soft water blue, a row of gabled canal houses on the cover, a warm
    serif heading (Fraunces).
  - Meadow: light green, rolling hills and a small sun, a round friendly
    heading (Nunito).
  - Sunset: a peach-to-pink sky, sun rays on the cover, a display serif
    (DM Serif Display).
  - Night: deep indigo with faint stars, dark cards, a crisp technical
    heading (Space Grotesk). Night is always dark (Greg, 2026-11-27).
- The look applies on **every community page** that uses the community frame
  (Overview, Forum, Events, Gallery, Classrooms, Ideas, People, Settings, and
  the members-only view outsiders see), so the community reads as one place.
- The theme color **runs through the whole page**, not only behind cards
  (Greg chose this over "content on a white sheet", 2026-11-27). Pages
  without cards (Forum, Settings, People) show the look too.
- Each look has **one scheme**, light or dark. The site has no dark mode today
  (no `ThemeProvider`, no `.dark` on `<html>`), so there is no viewer setting
  to follow. Canal, Meadow and Sunset are light looks; Night is a dark look:
  the whole community frame, cards included, turns dark.
- Every look passes WCAG 2.2 AA (see Rendering for exactly what is checked).
  This is checked by a test, before it ships.
- Adding a sixth look later is one catalog entry plus its cover art, with no
  change to pages, storage or settings code.

## Non-goals (this design)

- **Own background picture.** It is wanted, and the design leaves a named seam
  for it (a "Your picture" look, see Later). It is not in the first release.
- Free colors, free fonts, or per-community color pickers.
- Themed directory cards, Explore street houses, emails, or the magazine. The
  magazine keeps its own theme (`src/lib/magazines/theme.ts`).
- Workspace pages (full-screen editors such as the magazine issue editor). They
  keep the plain look.

## Anti-goals (a failure even if it "works")

- Any text or control that drops below AA contrast on a themed page.
- A look that reads as cream, sand or parchment (the "AI landing page" tell
  PRODUCT.md names). Sunset in particular must read as a sky, not as beige.
- Orange in a look's canvas or cover. Signal Orange stays the single action
  color (One Voice Rule); a theme must never compete with the Post button.
  Measured rule: no canvas, pattern or cover color with OKLCH hue in 30–65
  and chroma above 0.08. A soft peach (low chroma) is fine; the mockup's
  Sunset rays and Canal roofs are not, so Canal's roofs move to brick red
  (hue below 30) and blues, and Sunset's rays to low-chroma peach and pink.
- A layout shift or a flash of the plain look before the theme appears on a
  normal visit.
- Loading all four extra font files on every community page.
- An admin's saved banner picture being hidden or replaced by theme art.

## Constraints

- Design rules (DESIGN.md): One Voice, Mono-Is-Machine and Flat-By-Default stay
  as they are. The **No-Cream Rule gets one named, scoped exception**: inside
  the community frame, a theme may paint the canvas behind the content. The
  DESIGN.md change is part of this work (see Decisions).
- Body text stays Geist Sans and machine labels stay Geist Mono. A theme only
  sets the **heading** face, on headings we name (see Fonts). Member-written
  content never changes font.
- Schema changes are hand-written Payload migrations in `src/migrations/`,
  additive only. Never `db:push`.
- Text in `messages/en.json`, `fr.json`, `nl.json`.
- Accessibility bar: WCAG 2.2 AA (PRODUCT.md). Cover art is decorative
  (`aria-hidden`). Previews are keyboard reachable and announce the selected
  look.

## Approaches considered

1. **A typed catalog of looks in code; a community stores only the look's id.**
   (Chosen.) Each look is a code entry: its colors, cover art
   component, heading font. Every look is tested for contrast before it ships,
   fonts are built in with `next/font`, and the same shape already serves
   magazine themes and badges (ADR-0039). Cost: a new look needs a release.
2. **Looks as records our team edits in Payload.** No release for a new look,
   but fonts must live in code anyway, so it only half works, and contrast can
   only be checked when someone saves, not in CI. Rejected.
3. **Each community stores its own colors and fonts; looks are presets that
   fill them in.** Most open, but it is free styling by another name: it breaks
   the design rules and makes every page cope with any color. Rejected.

Greg picked 1 on 2026-11-27.

## Decisions

### The catalog

`src/lib/communities/themes/` holds the catalog. One entry per look:

```ts
type CommunityThemeId = "plain" | "canal" | "meadow" | "sunset" | "night";

type CommunityTheme = {
  id: CommunityThemeId;
  /** i18n key under communities.themes.<id> for name and one-line description. */
  scheme: "light" | "dark";  // dark = the frame takes the site's .dark tokens first
  /**
   * Overrides of the site's own tokens inside the community frame. Anything
   * not listed keeps the scheme's value. Hex, so tests can measure them.
   */
  tokens: {
    background: string;       // the canvas
    foreground: string;
    mutedForeground: string;
    border: string;
    input: string;
    card?: string;            // light looks keep white cards; Night sets a dark card
    cardForeground?: string;
  };
  canvasPattern?: string;     // optional CSS background-image layered on the canvas
  cover: {
    palette: Record<string, string>; // every color the cover art uses, as data
    nameColor: string;               // community name on the cover
    nameBase: string;                // the cover color behind the name
  } | null;                          // null = no art (Plain)
  Cover: React.ComponentType | null; // SVG art; reads palette via CSS vars only
  headingFont: HeadingFontId | null; // null = Geist Sans (Plain)
};
```

- `plain` is a real entry (today's tokens, no art, no heading font), not a
  special case. "No row" resolves to `plain`.
- A `resolveCommunityTheme(id: string | null)` returns `plain` for null or an
  unknown id (a look removed later must not break a page).
- Colors live in TypeScript, not only in CSS, and cover art takes every color
  from its `palette` (no hard-coded colors inside the SVG), so one test can
  check every look. See Rendering for the list. Reuse `contrastRatio` from
  `src/lib/magazines/theme.ts` by moving it to a shared color helper
  (`src/lib/color/contrast.ts`), adding an OKLCH hue/chroma reader for the
  orange-band check; the magazine imports it from there.

### Storage

A side table, following `community_news_sector`:

```
app.community_theme
  community_id  varchar(255) PK → community.id ON DELETE CASCADE
  theme_id      varchar(32) NOT NULL
  updated_by    varchar(255) → user.id
  updated_at    timestamptz NOT NULL DEFAULT now()
```

- No row means Plain, so nothing changes for any existing community and no
  backfill is needed.
- Why a side table and not a column on `community`: the community row is read
  on every page and by many tests and fixtures; a side table keeps preview
  databases that skip the migration loading (the news-sector precedent), and it
  is where "Your picture" will later add its media fields without widening
  `community`.
- `theme_id` is validated against the catalog on write, not by a DB enum, so a
  new look needs no migration.

### Reading and writing

- `communities.getBySlug` returns `themeId` (resolved, never null). It is public
  data: outsiders see the look too.
- New mutation `communities.setTheme({ communityId, themeId })`: owners and
  admins only, the same check the settings layout uses, enforced on the server.
  Unknown id → `BAD_REQUEST`. Upsert into `community_theme`; selecting Plain
  deletes the row.
- Follow the field hop by hop: catalog → router input → table → `getBySlug`
  output → layout → scope. Grep every place a `getBySlug` community object is
  built by hand (fixtures, mocks, agent routers) and add `themeId`.

### Rendering

The pattern is **token scoping**, the way the house shadcn tokens are meant to
be themed: the community frame re-declares the site's own CSS custom
properties, and every component inside follows without knowing themes exist.

- `CommunityThemeScope` wraps the non-workspace frame in
  `src/app/[locale]/communities/[slug]/_community-layout-client.tsx`. It sets
  `data-community-theme="<id>"`, adds the `dark` class when the look's scheme
  is dark (`globals.css` declares dark tokens on `.dark` and the variant as
  `&:is(.dark *)`, so a scoped class works), then sets the look's `tokens` as
  inline custom properties (`--background`, `--foreground`,
  `--muted-foreground`, `--border`, `--input`, and `--card` /
  `--card-foreground` when given), the heading font variable, and the canvas
  pattern.
- The canvas fills the community frame edge to edge (the area that today has
  `px-4 py-8 sm:px-8`) and paints `bg-background` there. Because the frame
  re-declares `--background`, the ~28 places that paint `bg-background`
  inside it (for example the phone's sticky tab bar in `community-nav.tsx`)
  take the canvas automatically, which is the intent.
- Light looks keep white cards. Night sets dark cards. Signal Orange
  (`--primary`) is never overridden.
- **What the contrast test checks, for every look:** `foreground` and
  `mutedForeground` on `background` ≥ 4.5:1; `foreground` and
  `mutedForeground` on the card color ≥ 4.5:1; `border` and `input` on
  `background` ≥ 3:1 (WCAG 1.4.11, input edges must be visible); the
  `--primary` button and `--ring` focus color on `background` ≥ 3:1;
  `cover.nameColor` on `cover.nameBase` ≥ 4.5:1; and the orange-band rule over
  `background`, `canvasPattern` colors and the whole cover `palette`.
- **Hard-coded colors.** Token scoping only reaches components that use
  tokens. The builder greps the community frame's components and pages for
  literal colors (`bg-white`, `text-zinc-*`, `text-black`, hex in classNames,
  `bg-background` meant as "white card") and moves them to tokens. Night makes
  any miss visible, so Night is the acceptance check: every community page
  must read correctly in Night.
- **Cover.** On the Overview and the members-only view, where
  `CommunityBanner` renders today:
  - the community has a banner picture → the banner shows, unchanged, on the
    themed canvas;
  - no banner and the look has art → the look's `Cover` renders at the
    banner's size (`h-32 sm:h-40 lg:h-44`, rounded, bordered) with the
    community name in the heading font;
  - Plain and no banner → nothing, as today.
- **Fonts.** The four heading faces are declared with `next/font/google` in one
  module (as `magazine-font-scope.tsx` does), `preload: false` for all, so a
  page only downloads the face its look uses. `display: "swap"` with a
  size-adjusted fallback to avoid layout shift. The scope sets
  `--font-community-heading` (Geist Sans by default) and a utility
  `font-community-heading` applies it. It goes **only on headings we name**:
  the community name (identity and cover), each community page's title, and
  the section headings of house surfaces (Settings sections, the Overview's
  section titles). Not on post, thread, event or lesson titles, not on
  member-written rich text, not on magazine previews (they keep their own
  face). No blanket `h1, h2` rule inside the frame.
- **No flash of the plain look.** Today the layout fetches `getBySlug` only on
  the client, so a cold visit paints a white spinner first. Prefetch
  `communities.getBySlug` on the server in
  `src/app/[locale]/communities/[slug]/layout.tsx` and hydrate it
  (`HydrateClient`), so the first paint is themed. Keep the existing rule in
  `_community-layout-client.tsx` that waits for the query to settle (its
  comment records a server/client mismatch that once blanked the issue
  editor): with the prefetch, it settles on first render; the not-found path
  must behave the same on server and client. A test covers a cold render of a
  themed community and of a missing slug.

### Settings → Themes

- New route `src/app/[locale]/communities/[slug]/settings/themes/page.tsx`, a
  `themes` item in `SettingsSidebar` right after `general`, owners and admins.
- A grid of preview tiles, one per look, drawn from the catalog: a small
  version of the community page with the community's own name and its banner
  if it has one. Plain first. The saved look carries a "Current" mark.
- Choosing a tile **previews it on the real page around the settings form**
  (the settings page is inside the themed frame) without saving. A sticky bar
  offers **Save** and **Cancel**; leaving the page without saving drops the
  preview. Implement the preview as a client context the scope reads
  (`CommunityThemePreview`), so the scope has one input: "the look to show".
- Tiles are a radio group (arrow keys move, the selected look is announced).
- On save: toast, `getBySlug` invalidated, preview cleared.

### Agents

Agents can **suggest** a look, never apply it directly: a draft of type
`community_theme` that an admin approves in the existing drafts flow, the same
way `magazine_theme` drafts work (`src/server/magazines/magazine-theme-draft.ts`,
approval in `agent-management.ts`). One MCP tool, `suggest_community_theme`,
with the catalog ids and descriptions in its schema. This is slice 2.

### Design rules and records

- DESIGN.md: a new "Community themes" section that states the scoped exception
  to the No-Cream Rule (canvas inside the community frame only; never a
  near-white warm neutral; no orange; cards and controls stay on house tokens;
  heading face only), and lists the looks with their tokens. Update the
  No-Cream Rule's text to point at it. Grep DESIGN.md and PRODUCT.md for every
  "owners customize content, not style" style claim and fix them.
- ADR-0051: "A community's look is a theme from a typed catalog in code; the
  community stores only the theme's id." Number reserved here; check no open PR
  took 0051 before merging.

## Slices

1. **Themes you can pick.** Catalog with Plain + four looks and their cover
   art, contrast test, shared contrast helper, `community_theme` migration,
   `setTheme` + `getBySlug.themeId`, the themed frame and cover, Settings →
   Themes with live preview, en/fr/nl, DESIGN.md section, ADR-0051. No feature
   flag: the default is today's look, so nothing changes until an admin
   chooses.
2. **Agents suggest a look.** `community_theme` drafts and the MCP tool.
3. **Your picture.** See Later; needs its own short design first.

## Later: "Your picture"

A sixth catalog entry, `picture`, whose canvas is an image the admin uploads
(through the existing banner upload path and shared media), shown blurred and
dimmed behind the content so the contrast guarantees still hold, with a plain
fallback color per mode. `community_theme` gains `background_media_id` and
`background_alt`. Open questions for its own design: moderation of the image,
how strong the blur/dim must be to keep AA, and mobile cropping.

## Verification

- Unit: catalog test (the full contrast and orange-band list under
  Rendering, i18n keys in all three languages, every look has a tile
  preview), resolver (null and unknown → plain).
- Router: `setTheme` refuses members and moderators, refuses unknown ids,
  upserts, Plain deletes the row; `getBySlug` returns `themeId`. DB test on
  `aitcom_test` (127.0.0.1:55432).
- Component: the scope sets `data-community-theme` and both token sets; the
  settings page calls `setTheme` with the chosen id (assert the call, not the
  toast); Cancel calls nothing; the banner wins over cover art.
- Screens: Belong's Overview, Forum and Settings → Themes in each look at
  1920 / 1440 / 1280 / 390. In Night, every community page (Overview, Forum,
  Events, Gallery, Classrooms, Ideas, People, Settings, members-only view).
  Check no layout shift and no plain flash on a cold load.
- Full test suites of every workspace the diff touches, type-check, lint.
- Fresh code reviewer and fresh design reviewer (`/impeccable` critique against
  DESIGN.md) before the PR.

## Left to the builder

- Final art, exact token values and pattern density for each look, within the
  constraints and the contrast test. The mockup is direction, not final art.
- Tile layout and the sticky Save/Cancel bar's exact look, inside DESIGN.md.
- Copy for look names and descriptions in fr and nl.
