---
status: accepted
---

# A community's look is a theme from a typed catalog

Community owners want their community to feel like its own place, not white
cards on a white page. We answer with a short list of **looks** we design
(Plain, Canal, Meadow, Sunset, Night) that an owner or admin picks in
Settings → Themes. A look paints the canvas inside the community frame, a
cover for communities without a banner picture, and one heading face.
Design: `docs/superpowers/specs/2026-11-27-community-themes-design.md`. Rules:
DESIGN.md, "Community themes".

## Decision

- **The catalog is typed data in code.** `src/lib/communities/themes/`
  holds one `CommunityTheme` entry per look: its scheme (light or dark), the
  site tokens it re-declares (`background`, `foreground`, `mutedForeground`,
  `border`, `input`, and optionally `card` / `cardForeground`, the quiet
  fills `muted`, `secondary` / `secondaryForeground`, `accent` /
  `accentForeground`, and the status colors `success`, `warning`, `info`,
  `destructive`), an optional
  canvas pattern, the cover palette with the name's color pair, and a
  heading face id. Every color is `#RRGGBB` so it can be measured. Plain is
  a real entry with today's house tokens, not a special case.
- **A community stores only the look's id.** The side table
  `app.community_theme` (`community_id` PK → `community.id` on delete
  cascade, `theme_id`, `updated_by`, `updated_at`) holds one row per
  community that chose a look (migration `20261128a_community_theme`,
  additive). No row is Plain, so no backfill was needed. A database that has
  not run the migration reads Plain, and `setTheme` refuses there.
  `theme_id` is checked against the catalog on write (`communities.setTheme`,
  owners and admins only), not by a database enum, so a new look needs no
  migration. Choosing Plain deletes the row. `resolveCommunityTheme` turns a
  missing or unknown id into Plain, so removing a look never breaks a page.
- **The look is applied by token scoping.** `CommunityThemeScope` wraps the
  non-workspace community frame, adds `dark` for a dark look (so the site's
  `.dark` tokens apply first), sets `color-scheme` to the look's scheme, and
  re-declares the look's tokens as custom properties. Components inside
  follow without knowing looks exist. A look re-declares a quiet fill or a
  status color only to keep it readable or in family on its canvas (same
  role, same hue); the house `:root` and `.dark` values never change.
  `--primary` and `--ring` are never re-declared. The heading face reaches
  only the headings that carry `font-community-heading`.
- **Contrast and the orange band are enforced in CI.**
  `src/lib/communities/themes/catalog.test.ts` checks every look against the
  floors in DESIGN.md (text ≥ 4.5:1 on canvas, pattern, card and any quiet
  fill the look sets; every status color in effect ≥ 4.5:1 on canvas,
  pattern, card and its own 10% tint; lines no fainter than Plain's; Signal
  Orange and the ring ≥ 2.5:1 on the canvas; the cover name ≥ 4.5:1), that
  no canvas, pattern, cover or token color has OKLCH hue 30–65 with chroma
  above 0.08 (the orange band), that no canvas, pattern or token color is
  a near-white warm neutral (the cream band: lightness ≥ 0.85, chroma
  above 0.005 and at most 0.08, hue 30–100), and that no surface is a
  clear yellow (hue above 65 to 100, chroma above 0.08). Plain keeps the
  house status colors and is excused only the house tint gaps DESIGN.md
  lists under "Known gaps".

## Why a catalog in code

- **Fonts have to live in code anyway.** Heading faces are loaded with
  `next/font/google` (`preload: false`, so a page downloads only its look's
  face). A look edited anywhere else would still need a release for its
  font.
- **Contrast is proven before it ships, not when someone saves.** A look in
  code runs through the catalog test on every PR, including after a house
  token changes. The design rules (One Voice, No-Cream's scoped exception)
  stay enforceable as numbers, not as a review habit.
- **One shape we already use.** Badges are a typed catalog in code
  (ADR-0039), and magazine type pairs are a fixed list in
  `src/lib/magazines/theme.ts`. A look follows the same pattern: data in
  code, an id in the database, a resolver with a safe default.
- **The id is the seam.** Storage, the router and the settings screen only
  know `CommunityThemeId`. Adding a look is a catalog entry, its cover art
  and its `communities.themes.<id>` copy in en, fr and nl; no page, storage
  or settings code changes.

## Rejected alternatives

**Looks as records our team edits in Payload.** No release for a new look,
but it only half works: the heading face must be built in with `next/font`,
so a new font still needs a release, and contrast could only be checked when
someone saves the record, not in CI before it reaches a community. Rejected.

**Each community stores its own colors and fonts, with looks as presets
that fill them in.** The most open option, but it is free styling by another
name: an owner could pick an orange canvas or a cream one, breaking the One
Voice and No-Cream rules, and every page in the frame would have to cope
with any color pair. Contrast would become a per-community runtime check
instead of a property of the product. Magazines do take one free accent,
but it colors a few marks and must clear AA when saved; a canvas covers the
whole frame. Rejected.

## Consequences

- A new look needs a release. That is the cost we chose for tested contrast
  and built-in fonts.
- The side table is where the planned "Your picture" look adds its media
  fields (`background_media_id`, `background_alt`) without widening
  `community`. It is a catalog entry like the others; its contrast
  guarantee needs its own design (blur and dim strength).
- `communities.getBySlug` returns `themeId` (resolved, never null). It is
  public: outsiders of a members-only community see the look too. The
  layout prefetches it on the server so the first paint is already themed.
- Token scoping only reaches components that use tokens. A literal color
  inside the community frame (`bg-white`, `text-zinc-*`, hex in a className)
  is a bug under a look; Night, the dark look, is the acceptance check.
- Scopes do not nest. Previews outside the frame (Settings tiles) draw
  from catalog tokens directly.
- A banner picture always wins over a look's cover art; the art only fills
  "no banner".
- Workspace routes stay plain, and the directory, Explore street, emails,
  the magazine reading view (`MagazineShell`) and the issue builder are not
  themed.
- The line floor is read from Plain's catalog entry, which copies the house
  tokens; the orange floor is a fixed 2.5:1, a little below Plain's 2.9:1,
  allowed for tinted canvases. Both house values are below WCAG 1.4.11
  site-wide, and three house status colors fall just under 4.5:1 on their
  own 10% tint (DESIGN.md, "Known gaps"). Raising them is a separate change that must also
  update every house value the catalog test copies by hand (Plain's entry
  and fixture, the card, orange and status constants, the tint-gap list);
  the test then shows which looks need new values.
- Dialogs, menus and popovers render in a portal outside the frame, so
  they keep the house light look inside Night. Accepted for slice 1.
- Agents may later suggest a look through a `community_theme` draft that an
  admin approves, never apply one directly (spec, slice 2).
