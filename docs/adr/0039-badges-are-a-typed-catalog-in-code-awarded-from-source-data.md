---
status: proposed
---

# Badges are a typed catalog in code, earned from source data by one engine

Only 8 of our 26 badges can be earned today. The award checks for
attendance, challenges and agents exist but nothing calls them, several
badges have no trigger at all, and badges are also written from places
that bypass the catalog (benchmark coverage, challenge prize text). The
badge count on a profile and the badges it shows disagree as a result.

We keep the badge catalog as **typed data in code**, and every badge is
earned by **one engine** that reads the count it needs from the source
tables. Design: `docs/superpowers/specs/2026-10-02-member-profile-and-badges-design.md`.

## Why a catalog in code, not an admin-editable collection

- **A badge is a rule.** Earning "Writer II" means "5 approved articles",
  which is a query. A badge an admin adds without a rule is a badge nobody
  can earn — exactly the state 18 of today's badges are in.
- **Types catch drift.** Slugs, tracks and thresholds are checked at
  build time, and every badge must have EN and NL names.
- **Admins keep the case they need.** Per-event prizes ("Winner — RAG Hack
  2026") are **awards**: records tied to the challenge that granted them,
  not entries in the catalog.

## Why earn from source data, through one engine

- **No counters to drift.** A track's metric is read from the table that
  is the truth (attendance, approved articles, completed challenges) at
  the moment something changes. Nothing has to be kept in sync.
- **Idempotent.** Earning inserts every tier reached, guarded by the
  existing `(userId, badgeSlug)` unique index. Calling it twice, or
  re-running it over every member as a backfill, is safe.
- **One seam.** Source code says which track may have changed
  (`evaluateBadges(db, userId, ["writer"])`). Thresholds live only in the
  catalog. A new track is a catalog entry plus one metric function; no
  caller changes.

## Consequences

- The `check*Badges` helpers in `src/lib/gamification.ts` go away; their
  call sites (and the missing ones) call the engine.
- Existing slugs stay the stored identifiers of their tier, so no stored
  row is renamed. Badges that were never awardable are removed from the
  catalog after the backfill confirms no member holds them.
- Free-text prize rows in `member_badge` move to `member_award`.
- Lowering a threshold later grants the badge on the next evaluation;
  raising one never revokes an earned badge.
