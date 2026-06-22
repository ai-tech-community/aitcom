# ASCII Discover — Design

**Date:** 2026-06-22
**Status:** Design approved — ready for implementation plan
**Register:** brand (public top-of-funnel) on the shared core system
**Related:** Community Spaces Plan 2b (rooms/spaces); `platform-multitenant-direction` memory

---

## 1. Summary

Evolve the existing public `/communities` directory into **Discover** — the platform's
front door for browsing **communities and their public spaces (rooms)** — rendered in a bespoke,
on-brand **"Town Square" ASCII narrative**. It is the top-of-funnel for the multi-tenant direction:
find a community or a public room, then join.

Decisions locked in brainstorming (do not relitigate):
- **Evolve `/communities`** into Discover (one surface, no duplicate listing page); add a `/discover`
  redirect to it.
- Surfaces **communities AND public spaces**. Public spaces get their own section; clicking one
  funnels through joining its community first (a space join requires community membership).
- **No categories/taxonomy in v1.** Use computed **liveness facets** (Trending / Newest / Largest)
  plus free-text `ilike` search. Categories are a possible later slice.
- **ASCII-spirited within the design system**, driven by a **bespoke AIT "Town Square" ASCII
  narrative** — original ASCII art only. **No third-party/Simpsons IP** (copyright/brand risk; the
  brainstorm explicitly rejected it).

This is **additive and reuse-first**: it leans on the existing `communities.list` directory query
and the `SpaceAvatar` component shipped in Plan 2b, and adds one new public procedure for
cross-community public spaces.

---

## 2. Current state (grounding)

- **Directory page:** `src/app/[locale]/communities/page.tsx` → `CommunitiesDirectory`
  (`src/components/communities/communities-directory.tsx`). Public; renders a searchable, keyset-
  paginated community list plus a members-only "Recommended for you" widget
  (`discovery/recommended-communities.tsx` → `api.discovery.recommendedForMe`).
- **Communities list query:** `communities.list` (publicProcedure, `src/server/api/routers/communities.ts`)
  — returns `{ id, name, slug, description, logoUrl, joinPolicy, memberCount, createdAt, faces[] }`;
  `ilike` search on name (debounced 300ms); keyset pagination on `(createdAt, id)`; filters
  `isListedInDirectory = true` and `deletedAt IS NULL`.
- **Community model** (`schema.ts` communities): `joinPolicy` (`open | invite_only | approval_required`),
  `isListedInDirectory` (the only public/private flag), `logoUrl`, `description`, `createdAt`,
  `deletedAt`. **No categories, no featured/trending flags** (ranking is computed at query time).
- **Liveness/discovery ranking:** `src/server/communities/discovery-queries.ts` +
  `discovery.ts` already compute activity-based signals (active contributors, recent threads, joins).
- **Spaces model** (`schema.ts` spaces): `kind` (`builtin | room`), `visibility` (`public | private | null`),
  `name`, `purpose`, `slug`, `position`, `archivedAt`, `communityId`. **Spaces are queried per-community
  only** (`spaces.list`/`listRooms` take a community slug) — there is **no cross-community space query**.
- **`SpaceAvatar`** (`src/components/communities/rooms/space-avatar.tsx`, Plan 2b): monospace
  letter-mark avatar — reused here for both community letter-marks (when no `logoUrl`) and space rows.
- **Auth boundary:** the directory and `communities.list` are public (logged-out can browse);
  joining requires auth.

---

## 3. The Town Square ASCII narrative

The visual narrative is AIT's **"The Town Square"** North Star made literal in ASCII — original art,
no third-party IP. It is decorative connective tissue layered on the existing design system
(mono `/ LABELS` via `SectionLabel`, hairline-ruled rows, mono stats, Geist Mono), never a parallel
system.

```
   /\    /\    /\        AIT — THE TOWN SQUARE
  /  \  /  \  /  \       where engineers and agents build together
 /____\/____\/____\
 |[]||  | A. |  ||[]|    > search the square_______________________  ⌕
 |__||__|____|__||__|
    o     o    Ɔ:   o    [ TRENDING ]   newest   largest
```

- **Hero banner:** an original ASCII town skyline + a small row of ASCII "townsfolk" (one is an agent
  glyph, e.g. `Ɔ:` / `[o]`), with the orange-dot `A.` mascot recurring as the town's marker. Tagline
  in Geist Sans; a terminal-style `>` search prompt.
- **Section accents:** small ASCII figures mark section breaks (`/ COMMUNITIES`, `/ SPACES`).
- **Empty states star the characters:** no results → an ASCII citizen + "the square's quiet here —
  try another search." Loading → skeleton rows (not a spinner), with the search prompt's cursor blink.
- **Accessibility:** all ASCII art is `aria-hidden="true"`; real headings (`SectionLabel`/`h*`) and
  control labels carry the accessible structure. WCAG 2.2 AA contrast; EN/NL strings (no fixed widths);
  every animation has a `prefers-reduced-motion` fallback. Art is wrapped in `<pre>`/monospace with
  `overflow` handling so it never breaks the responsive grid (collapses to a compact mark on narrow
  viewports).
- **Named-rule compliance:** No-Cream (pure white/true dark canvas); One Voice (Signal Orange only on
  the single active facet / a primary CTA, ≤10%); House Kicker (`/ LABEL` is the only section marker —
  the ASCII art is decoration beside it, not a competing eyebrow); Mono-Is-Machine (stats/counts mono,
  human copy sans); Flat-By-Default (ruled rows, no decorative shadow).

> Motion budget v1: a subtle search-cursor blink + skeleton fades only. No orchestrated page-load
> choreography (product/brand restraint).

---

## 4. Page composition

Route stays `/communities` (rebuilt as Discover); `/discover` redirects to it.

```
/ DISCOVER                                   ← ASCII Town Square hero + terminal search

[ TRENDING ]  NEWEST  LARGEST                ← facet tabs (active facet = the one Signal-Orange accent)

/ COMMUNITIES · 24                           ← SectionLabel + count
 ───────────────────────────────────────────
  AI  AIT Robotics        building robots with agents
      ●●●● +124                        128 · members        [ View ]
 ───────────────────────────────────────────
  ...                                                       [ load more ]

/ SPACES · 12   public rooms across communities
 ───────────────────────────────────────────
  RL  robotics-lab   in AIT Robotics            42 · members  [ Open ]
  EV  agent-eval     in Agent Builders          31 · members  [ Open ]
 ───────────────────────────────────────────                 [ load more ]
```

- **Hero:** ASCII Town Square banner + tagline + terminal `>` search input (one search box drives both
  sections).
- **Facets** (communities section only, v1): **Trending** (liveness ranking), **Newest**
  (`createdAt desc`), **Largest** (`memberCount desc`). The active facet is the single orange accent.
- **`/ COMMUNITIES · N`:** hairline-ruled rows — avatar (community `logoUrl` if present, else
  `SpaceAvatar` letter-mark), name, one-line description (truncate), member-face stack (`faces`), mono
  `N · members`, `View` → community overview. Keyset "load more".
- **`/ SPACES · N`:** cross-community public rooms as rows — `SpaceAvatar`, `#name`, `in {community}`,
  mono `N · members`, `Open`. Keyset "load more".
- **Logged-in extra:** the existing "Recommended for you" widget may render above Trending for
  authenticated users (reuse as-is; optional, low-risk).

---

## 5. Data & procedures

- **Communities:** reuse `communities.list` (search, keyset pagination, faces, memberCount). Add a
  `sort` input (`trending | newest | largest`) — `trending` reuses the `discovery-queries` liveness
  ranking; `newest` = `createdAt desc`; `largest` = `memberCount desc`. Keep the `isListedInDirectory`
  + `deletedAt IS NULL` filters.
- **New — public spaces discovery:** `spaces.discoverPublic` (publicProcedure):
  - Selects rooms where `kind='room'`, `visibility='public'`, `archivedAt IS NULL`, joined to
    communities where `isListedInDirectory = true` and `deletedAt IS NULL`.
  - Returns `{ spaceId, spaceName, spaceSlug, communityName, communitySlug, memberCount, faces[] }`.
  - **`memberCount` uses the grouped-count pattern** (scoped `COUNT(*) … GROUP BY space_id`, mapped by
    id) — **never** the inline correlated subquery (that mis-correlated in Plan 2b: Drizzle emits the
    interpolated outer column unqualified, yielding 0). Reference: the Plan 2b count fix.
  - `ilike` search on space name + purpose; keyset pagination consistent with `communities.list`.
- All Discover queries are **public** (logged-out browsing); join/Open actions that require auth
  redirect to sign-in.

---

## 6. Funnel & auth

- **Community row → View:** community overview. Joining follows the community's `joinPolicy`
  (`open` = one-click; `approval_required` = request). No change to existing join flow.
- **Space row → Open:** deep-links to that community's space (`/communities/{slug}/spaces/{spaceSlug}`).
  A non-community-member hits the **community join gate first** (the room page already gates on access);
  once a community member, a public room is one-click join. Nothing private is ever surfaced
  (only `visibility='public'` rooms in listed communities).
- **Logged-out:** can browse + search everything; any action needing auth → sign-in, returning to the
  intended target.

---

## 7. Components (anticipated)

| Unit | Responsibility |
|------|----------------|
| `discover-page` (rebuilt `communities/page.tsx`) | Route shell; renders hero + facets + sections |
| `town-square-hero` | ASCII banner + tagline + terminal search input (controlled) |
| `discover-facets` | Trending/Newest/Largest tabs (active = orange), drives `sort` |
| `discover-communities` | Communities section: rows, faces, keyset load-more (reuses `communities.list`) |
| `discover-spaces` | Spaces section: rows via `spaces.discoverPublic`, keyset load-more |
| `ascii-art` assets | Original ASCII art strings (hero, townsfolk, empty-state figures), `aria-hidden` |
| reuse: `SpaceAvatar`, `SectionLabel`, `Button`, `Skeleton`, `ErrorState` | existing primitives |

Each section owns its own query + pagination so they fail and load independently.

---

## 8. Testing

- **Pure:** ASCII-art assets are static strings (no test needed); any initials/slug helper unit-tested
  like `SpaceAvatar`.
- **DB-gated integration** (house pattern, `RUN_DB_TESTS=1`): `spaces.discoverPublic` returns only
  public, non-archived rooms in listed communities; excludes private rooms and rooms in unlisted/deleted
  communities; `memberCount` is the correct active count (grouped) — a regression guard against the
  Plan 2b subquery bug; search + keyset pagination behave.
- **Communities sort:** assert `newest`/`largest` ordering and that `trending` uses the liveness rank.
- **A11y/visual:** ASCII art is `aria-hidden`; headings/labels present; AA contrast; EN/NL render
  without overflow; reduced-motion path. Verified via `impeccable` during build.

---

## 9. Out of scope (v1)

- Categories / taxonomy and category pills (computed facets only for now).
- Featured / sponsored placement; paid promotion slots.
- Full-text search (keep `ilike`).
- Private-space teasers across communities (only public rooms surface on Discover).
- Cross-community space facets/sort (spaces are a single ranked/searchable list in v1).
- Any third-party character IP.

---

## 10. Build notes

- Bring `impeccable` in for the hero + rows (the user wants the design lens on this surface), composing
  the original ASCII art and holding the named rules.
- Implementation lands on its own branch off `main`; Plan 2b ships independently.
