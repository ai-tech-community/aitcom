# People tab and Offers as a Space

Approved 2026-11-14. Small change.

## Intent

The Members page has become more than a member list: since community matching
(#564, #565) it holds the directory, "My matching profile", and for owners the
Matches and Introductions tabs. Its name should say that: **People**.

"What your community offers" is hard-coded at the top of the community menu for
every community and every visitor, even when nothing is for sale. Owners must be
able to show or hide it like any other tab: it becomes a builtin Space.

## Goals

- The `members` surface is labelled **People** (nl "Mensen", fr "Personnes") in
  the community menu, in Settings → Spaces, and as the page title. The inner
  directory tab, today also "People", becomes **Directory** (nl "Ledenlijst",
  fr "Annuaire") so the word does not repeat.
- Offers is a builtin Space with surface and slug `offers`. Owners and admins
  can hide, show, reorder and rename it in Settings → Spaces, exactly like
  Forum or Gallery.
- Existing communities keep today's menu order: Offers is placed first (where
  the hard-coded link sits now). It is shown when the community has at least
  one published offer, hidden otherwise.

## Non-goals

- No URL change. The People page stays at `/members`; Offers stays at `/offers`.
- No change to the matching feature itself. "Require a matching profile on
  join" is a separate, later design.
- No change to which offers are listed or who may buy.

## Anti-goals

- An owner's custom tab name must never be overwritten. A stored name that is
  still a default label ("Members", "Leden", "Membres") keeps following the
  viewer's language and therefore now reads "People".
- A hidden Offers tab must never break checkout. Course pages and the payment
  return URL link to `/offers` and `/offers/[offerId]`.

## Approach

Reuse the Spaces model the Magazine tab already uses (a builtin surface row in
`app.space`, hidden by `archived_at`), rather than adding a separate
"show offers" flag on the community. One menu model means reorder, rename and
hide work with no new code paths, and the agent/MCP space listing picks the
tab up for free. A community-level boolean was rejected: it would sit outside
the Spaces list, could not be reordered or renamed, and would add a second way
to decide what the menu shows.

## Behaviour

- **Hidden means "not in the menu"**, the existing rule for every builtin
  space (a hidden Gallery still opens by direct link). The `/offers` pages
  stay reachable so purchase and return links keep working.
- **New communities** get an `offers` row at the top of the default spaces,
  hidden (a new community has no published offers).
- **Existing communities**: an additive, idempotent migration inserts the
  `offers` row at position 0, shifting that community's other spaces down by
  one so their relative order is unchanged. Hidden unless the community has a
  published offer. Communities that already have an `offers` row are skipped.
- **First publish shows the tab** (builder call, made during design): when an
  owner publishes an offer and the community has never published one before
  (no offer has `published_at` set; it is never cleared), the Offers row is
  un-hidden in the same transaction. After that, publishing never re-shows a
  tab the owner hid on purpose, including unpublish-then-publish (the usual
  way to change a price). Like Magazine, the feature being switched on is what
  reveals its tab. The owner's menu refreshes right after publishing.
  Trade-off: a community whose offers were all unpublished before this change
  does not get the tab back on its next publish; the owner shows it in Spaces.
- **Default labels**: add `offers` to the default-label catalogue (en "What
  your community offers" plus the nl/fr strings already used for that title)
  and add People/Mensen/Personnes to the `members` catalogue, keeping the old
  labels so stored defaults still resolve to the current language.
- **Menu fallback**: when the spaces query fails, the menu falls back to the
  default surfaces. Offers is left out of that fallback, because it is hidden
  by default.

## Left to the builder

- Exact wiring of the `offers` surface in `space-defaults.ts`: default surface
  versus optional surface, as long as seeding, the catalogue and the
  `BuiltinSurface` type stay single-sourced.
- Grep every consumer of the surface list (menu, Settings → Spaces, agent
  community tools, tests that assert the default set) and update them.
