# Find a match as its own Space

## Intent

The community People page holds four tabs: Directory, Matches, My matching
profile, and Introductions. Two different jobs share one page: browsing who is
in the community, and matching (members fill a profile, owners and admins pair
people and track introductions). Matching gets its own menu item, **Find a
match**, so each page does one job and matching is easy to find.

## Goals

- People shows only the member directory. No tab strip.
- A new builtin Space, **Find a match** (surface `matching`, slug `match`),
  holds Matches, My matching profile, and Introductions at
  `/communities/<slug>/match`.
- The menu item appears when the community turns matching on: the owner saves
  the first connection type. It is added at the end of the menu.
- Old links `/communities/<slug>/members?tab=matches|profile|introductions`
  land on the same tab of the new page.

## Non-goals

- No change to how matching works (profiles, matches, introductions, types).
- No change to the People page name. It stays "People" (owner-renamable).
- Matching settings stay where they are, under community settings.

## Anti-goals

- A member must never land on an empty matching page from the menu. The item
  only exists once matching is set up.
- An owner's rename, hide, or reorder of the item is never overwritten.
- Saving a connection type must never fail silently to add the item.

## Approaches

1. **Add the item when matching is turned on (chosen).** Same pattern as the
   Magazine tab: `matching` joins `OPTIONAL_BUILTIN_SURFACES`; the shared,
   idempotent `ensureOptionalBuiltinSpace` (also used by Magazine) inserts the
   row when a connection type is created, inside the same transaction. A
   one-off additive migration backfills the row for communities that already
   have an active connection type (1 on prod today). Communities that never
   use matching get nothing.
2. **Hidden item for every community** (Offers pattern): seed a hidden row for
   all communities, show it on the first connection type. Rejected: a backfill
   for every community, and an owner can show it before matching exists,
   which puts members on an empty page.

## Design

- **Surface.** `matching` added to `OPTIONAL_BUILTIN_SURFACES` and
  `DEFAULT_BUILTIN_LABELS` (en "Find a match", nl "Vind een match", fr
  "Trouver un match"). Every place that enumerates builtin surfaces (nav
  labels, Spaces settings, MCP `SPACE_TYPES`, agent-communities router) learns
  the new value.
- **Creation.** `ensureOptionalBuiltinSpace(tx, communityId, surface, slug)`
  in `src/server/communities/optional-space.ts`, called from
  `communityMatching.saveType` on every create with the named
  `MATCHING_SPACE = { surface: "matching", slug: "match" }` seam from
  `space-defaults.ts`. Idempotent (`onConflictDoNothing` on community + slug),
  so an owner's rename, hide or move is kept. If a room owns slug `match`,
  the save fails with `MATCHING_SPACE_SLUG_TAKEN` and an owner-facing message
  that points to support (a room's slug cannot be changed by renaming it).
  Owner-only mutation, so only owners see that error. After a save, the
  editor refreshes the menu and the Spaces settings list.
- **Backfill.** Hand-written Payload migration
  `20261126a_matching_space`: insert a `matching` builtin row at the end of
  the menu for each community with at least one active connection type and
  no `match` slug row. Additive only.
- **People page.** `CommunityMembersHub` renders `MemberDirectory` for
  everyone. `members/page.tsx` becomes a server component that redirects any
  old matching `?tab=` to `/match?tab=…`, keeping other params.
- **Find a match page.** `communities/[slug]/match/page.tsx` renders a
  `FindAMatch` component: the current matching tabs, minus Directory. Tab
  rules move from `members-hub-tab.ts` to a matching-tab module: Matches and
  Introductions for owners and admins, My matching profile for every active
  member. Default tab: Matches for owners and admins, My matching profile for
  members. With one tab, no tab strip. The membership gate uses the
  server-seeded auth user (as the forum page does), so a member never sees
  the join prompt while the session loads. Non-members see a join prompt
  (pending members see a "you asked to join" line); the frame's Join button
  is the action, so the prompt adds no second one. When
  the community has no active connection type, the existing empty states of
  the profile form ("Connection questions are on their way") and Matches tab
  already cover it; no new empty state is added.
- **Copy.** Page title "Find a match"; lead line in plain words about telling
  the community what you want to connect about. All strings in en, nl, fr.

## Left to the builder

- Exact component and file names, test split, and the empty/join state copy.
