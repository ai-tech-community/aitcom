---
status: accepted
---

# Classroom is a distinct surface from articles

The [[classroom]] (ordered [[course]]s of video [[lesson]]s with per-member
progress) is built as its own collections, **not** as an extension of the
existing `articles` surface — even though an article of type `tutorial` or
`talk_recording` (title + rich text + `mediaUrl`) closely resembles a lesson.

## Why this is not obvious

A reasonable reader will see the overlap and ask "why not just add ordering and
progress to articles?" The answer: a [[lesson]] and an article have different
lifecycles. An article is a published blog post with a public RSS feed and a
submission-review flow; a lesson is internal, ordered, progress-tracked
curriculum, member-gated by default. Overloading `articles` would leak lessons
into the public blog/RSS and force the article review flow onto curriculum, and
the ordering/grouping/progress fields would distort a model that is fine as a
flat publish queue.

## Scope chosen

- Flat structure (Course → Lessons); a module grouping level may be added later
  without a breaking migration.
- YouTube embed/reference only — **no native video hosting**.
- Course `visibility`: members (default) or public (a join hook).
- Lesson completion is self-reported and **earns no XP** (trivially farmable),
  consistent with the verification-gated XP rule.
- No level/XP gating — deliberately not coupled to the (unbuilt) gamification
  leaderboard loop.
