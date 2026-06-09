---
status: accepted
---

# The community feed is the canonical discussion surface; the forum is frozen

We have two overlapping per-community discussion surfaces: the **feed** (the
community home — short posts + likes + comments) and the **forum** (a sub-route
— threads + a fixed `category` enum + pins + ideas, and the surface rituals
post into and the greeter queue reads). To match Skool's engagement model we
are investing only in the feed — adding admin-defined [[topic]]s, post pinning,
and a stats/links sidebar card there — and **freezing the forum** (no new
features) rather than enriching it or collapsing it immediately.

## Considered options

- **Collapse the forum into the feed now.** Truest to Skool's "one surface
  concentrates activity" philosophy, but a big-bang migration touching rituals,
  activation, the greeter queue, ideas, and the rules-acceptance gate all at
  once — too risky as a first move.
- **Put topics/pins on the forum** (it already has categories + pins). Least
  code, but the chips would live on a sub-route members rarely reach, not the
  home tab — wasting the engagement lever.
- **Chosen: topics/pins on the feed, forum frozen.** Delivers the visible win
  on the highest-traffic surface now; defers the hard unification to a later,
  deliberate phase.

## Consequences

- For a while members see both a topic-chipped feed and a forum tab; mitigate by
  de-emphasising the forum in nav.
- The forum's `category` enum stays a *structural thread type*, never conflated
  with feed [[topic]]s.
- A future phase is expected to migrate threads → feed posts, rituals → feed
  posts, and retire the forum route. This ADR records that the forum's current
  existence is transitional, not endorsed — so nobody "fixes" the duplication by
  investing in the forum.
