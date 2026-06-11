---
status: accepted
---

# Module is an optional, behaviour-free grouping between course and lesson

[[adr-0027-classroom-is-member-authored-ordered-curriculum]] kept the [[course]]
**flat** and deferred grouping: "a module grouping may be added later without a
breaking migration." This ADR exercises that option. We add a [[module]] as a
first-class collection (`title`, `order`, optional `summary`) with a **nullable
`module` FK on the lesson**, so existing courses keep `module = null` and render
flat with **zero data migration** — honouring the non-breaking promise literally.

## Decisions

- **Opt-in per course, never mixed.** A course is *either* flat (no modules, the
  default) *or* fully moduled (every lesson in a module). "Is moduled" is
  **derived** (has ≥1 module), not a stored flag — a flag can drift from reality.
- **First-class collection, not a denormalised `moduleTitle` on the lesson.** A
  module has identity: renaming is one update, it can carry a summary, and it can
  be reordered as a unit. This matches the codebase grain (lessons, resources are
  their own tables, not blobs).
- **Behaviour-free.** A module restructures *display and ordering only*. It has
  **no completion of its own** (a "3/5 done" badge is a read-time rollup of
  existing [[lesson]] completions, never stored), **no module-level exam**
  (assessment stays on the lesson via [[lesson-exam]]), and **no sequential
  gating**. Module gating would contradict ADR-0028's load-bearing invariant that
  an exam "blocks its own lesson's completion only — it does not hard-lock later
  lessons (the course stays flat and browsable)."
- **Set-based progress is untouched.** Reading order becomes the tuple
  `(module.order, lesson.order)`, but `courseProgressPercent`, `coursePassed`,
  the certificate, and the enrollment/XP signals are all keyed on `course_id` and
  the *set* of a course's lessons — grouping changes presentation, not the
  completion model.
- **Lifecycle preserves the invariant.** A module is deleted only when **empty**
  (its lessons are moved out first) — we never cascade-delete lessons, which would
  destroy lesson content and learners' `lesson_completion` history. Reverting to
  flat is an explicit atomic **dissolve** (null every lesson's `module`, delete
  all modules), the only sanctioned moduled→flat path, so the binary
  flat-or-fully-moduled invariant holds at every moment.

## Rejected

- **Mandatory hierarchy** (Coursera's uniform Course→Module→Lesson): forces
  ceremony onto two-lesson courses and requires touching every existing row.
- **Module-level quizzes and sequential unlock** (Coursera's model): a second
  assessment surface and a direct violation of the flat-and-browsable invariant.
  If sequencing is ever wanted, it is a new ADR with its own trade-off.
