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
   Magazine tab: `matching` joins `OPTIONAL_BUILTIN_SURFACES`; an idempotent
   `ensureMatchingSpace` inserts the row when the first connection type is
   saved, inside the same transaction. A one-off additive migration backfills
   the row for communities that already have connection types (1 on prod
   today). Communities that never use matching get nothing.
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
- **Creation.** `ensureMatchingSpace(tx, communityId)` in
  `src/server/communities/`, called from `communityMatching.saveType` on
  create. Idempotent (`onConflictDoNothing` on community + slug). If a room
  owns slug `match`, the save fails with `MATCHING_SPACE_SLUG_TAKEN` and a
  clear owner-facing message, same as the Magazine rule. Owner-only mutation,
  so only owners see that error.
- **Backfill.** Hand-written Payload migration (`src/migrations/`): insert a
  `matching` builtin row at the end of the menu for each community with at
  least one connection type and no `match` slug row. Additive only.
- **People page.** `CommunityMembersHub` renders `MemberDirectory` for
  everyone. `members/page.tsx` becomes a server component that redirects any
  old matching `?tab=` to `/match?tab=…`, keeping other params.
- **Find a match page.** `communities/[slug]/match/page.tsx` renders a
  `FindAMatch` component: the current matching tabs, minus Directory. Tab
  rules move from `members-hub-tab.ts` to a matching-tab module: Matches and
  Introductions for owners and admins, My matching profile for every active
  member. Default tab: Matches for owners and admins, My matching profile for
  members. With one tab, no tab strip. Non-members see a join prompt. When
  the community has no active connection type, the existing empty states of
  the profile form ("Connection questions are on their way") and Matches tab
  already cover it; no new empty state is added.
- **Copy.** Page title "Find a match"; lead line in plain words about telling
  the community what you want to connect about. All strings in en, nl, fr.

## Left to the builder

- Exact component and file names, test split, and the empty/join state copy.
