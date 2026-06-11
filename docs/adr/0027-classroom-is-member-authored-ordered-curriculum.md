---
status: accepted
---

# Classroom is a member-authored, ordered curriculum (Launchpad model)

The [[classroom]] is built as its own Course/Lesson collections — **not** an
extension of `articles` — and is **member-authored**: any active community
member may create a [[course]], published immediately with no pre-review,
following the [[launchpad]] authoring model rather than the curated `articles`
model.

## Why a distinct surface (not articles, not launchpad)

A reasonable reader will see the overlap and ask "why not reuse articles
(which already has `tutorial`/`talk_recording` types) or launchpad?" The answer
is the one irreducible feature neither can express: **an ordered, multi-lesson
structure with per-member progress** — a series you work through and track
completion on. An article is a single curated published piece (with a public
RSS + review lifecycle a course shouldn't inherit); a launchpad project is a
single showcased thing. Overloading either would distort it and leak course
content into the blog/RSS.

## Why member-authored (reversal of the original admin-only draft)

The first draft of this ADR scoped courses to admin/owner authoring (Skool's
model). We reversed that: member-authored classrooms fit the platform's
"engineers and AI agents build together" ethos, turn the classroom into a
contribution surface, and differentiate from Skool (owner-only courses). The
codebase already proves the model — [[launchpad]] lets any member author and
publish immediately with post-hoc moderation; we apply the same to courses
rather than the heavier curated `articles` review flow.

## Decisions

- **Authoring:** any *active* community member creates a course; published
  immediately, **no pre-review**. Per-community `classroomCreatePolicy`
  (`all_members` default | `admins_only`) lets a community restrict creation
  — community policy, per [[adr-0013-hub-invariant-vs-community-policy]].
- **Moderation:** post-hoc — creator owns/edits/archives their own; mods/admins
  unpublish or remove. (Not articles-style pre-review, which bottlenecks admins.)
- **Visibility:** members-only by default; **public requires admin/mod
  promotion** — a creator cannot self-publish unvetted content to the open web.
- **Structure:** flat Course → ordered Lessons (a module grouping may be added
  later without a breaking migration). *Exercised in
  [[adr-0034-module-is-an-optional-behaviour-free-grouping]]: an opt-in,
  behaviour-free module layer via a nullable FK, no migration.* Lessons are
  YouTube embed/reference +
  rich text + resource links; no native video hosting.
- **Enrollment & progress:** explicit [[course-enrollment]] (modelled on event
  registration); per-lesson completion → course progress %.
- **Reputation:** the creator earns small Hub-global XP **per distinct member
  enrollment** (others valuing the work, like `LAUNCHPAD_RECEIVE_VOTE`).
  **No XP** for merely creating a course (would reward spam under no-pre-review)
  and **no XP** for an enrollee's own self-reported completions (farmable).
- **Signal:** distinct-enrollment count + completion — no separate up-vote
  (that is launchpad's role).
- **Not coupled** to a level-gating / leaderboard loop (unbuilt); no `minLevel`.
