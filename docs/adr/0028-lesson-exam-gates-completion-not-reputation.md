---
status: accepted
---

# A lesson exam gates completion, not reputation

A [[lesson]] may carry an author-created [[lesson-exam]] (objective,
auto-graded questions) that — when **mandatory** — a learner must pass to mark
the lesson complete, converting that lesson's completion from **self-reported**
to **verified**. But passing an exam earns the **learner no Hub-global XP** at
launch: the exam gates *local* outcomes (lesson completion, course-pass,
progress %) and never mints reputation.

## Why verified completion still earns no XP

A reasonable reader will see "the completion is now *verified* (you proved it by
passing a test)" and ask "so why doesn't it earn XP, when our reputation rule is
*verification-gated*?" ([[adr-0012-reputation-stays-hub-global]]). The answer is
that **two different things are verified, and only one matters for reputation**:

- The exam verifies the **learner's response** against the author's answer key —
  enough to trust the *local* "did this person clear the bar" outcome.
- It does **not** verify the **bar itself**. The exam is written by the course
  author — any active member, **no pre-review**
  ([[adr-0027-classroom-is-member-authored-ordered-curriculum]]). A spammer can
  author a course with a trivial mandatory exam ("Is the sky blue? → Yes") and
  every enrollee "passes" instantly. Minting learner XP on a pass would build a
  **reputation farm** — the exact failure the no-pre-review model already guards
  against by giving **no XP for creating a course** and **no XP for self-reported
  completion**.

So the verification is real enough to gate progress (a community-local, low-stakes
outcome) but **not** real enough to mint Hub-global reputation, which must stay
gated on verification the *platform* can independently trust (consensus/test
cells), not on a member grading against their own answer key.

## Decisions

- **A mandatory exam makes its lesson's completion verified** — passing is the
  only path to the checkmark. A non-mandatory exam is a self-check; self-reported
  completion still applies.
- **Scope of the gate:** a mandatory un-passed exam blocks **its own lesson's
  completion only** — it does **not** hard-lock later lessons. The [[course]]
  stays flat and browsable.
- **Course-pass is completion-derived:** passed = every lesson complete (every
  mandatory exam cleared at its own threshold). **Never** an aggregate of exam
  scores — a learner can never be course-passed while a mandatory exam is
  unpassed. A true course-wide score gate, if ever needed, is a separate optional
  **course-level final exam**, not an average.
- **Learner reputation:** passing an exam earns the learner **no XP** at launch —
  same as self-reported completion, for the same reason (member-authored, no
  pre-review). Author XP is unchanged (per distinct enrollment).
- **Verified-completion XP is deferred,** not refused: it unlocks only alongside
  *trustworthy* grading (AI-graded or vetted question banks) — the same future
  gate as free-text questions. Minting XP now would be hard to claw back.
- **Grading model at launch:** objective, auto-graded questions only
  (multiple-choice / true-false; multi-select fast-follow). No free-text, no
  human grading, no AI grading — the only variant under which "verified" is
  honest and authoring stays zero-moderation.

## Amendment — "quiz options" extend the exam; no separate quiz entity

The "quiz options" feature is specified as an **extension of this exam**, not a
new assessment type:

- **Multi-select** (the fast-follow above) is a `type: "multi"` question graded
  **all-or-nothing** — the selected set must exactly equal the correct set, so
  every question stays strictly right-or-wrong and the score stays
  `correctCount / total`. The shape is **type-discriminated** (`single`/`boolean`
  keep `correctIndex`; `multi` adds `correctIndices[]`), so already-stored exam
  JSON needs **no migration**.
- **Feedback is driven by the existing `mandatory` flag**, not a new mode: a
  non-mandatory exam is the **practice** mode (reveals correct answers + an
  optional per-question `explanation` on submit); a mandatory exam reveals only
  score + which questions were wrong, never the answer key, so retries can't
  brute-force the gate.
- **Rejected: a separate "practice quiz" entity.** A non-gating, ungraded,
  no-XP assessment is *already* expressible as a non-mandatory exam — a parallel
  entity would duplicate the exam under a new name and add a second assessment
  surface for no semantic gain.
