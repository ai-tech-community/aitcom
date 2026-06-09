# Classroom Celebration Moments — Design

**Date:** 2026-06-09
**Status:** Approved (pending implementation plan)

## Goal

Add delightful, **local, cosmetic** celebration to the two peak moments in a learner's classroom journey:

1. **Passing an exam** — the most frequent win.
2. **Earning the course certificate** (completing the last lesson) — the biggest peak.

Each fires a confetti burst plus a [framer-motion](https://www.framer.com/motion/) reveal.

## Non-goals / invariants this must respect

This is **celebration, not reputation**. It must not introduce any of the gamification the platform has deliberately rejected:

- **No XP, points, or score for the learner** — passing earns no Hub-global reputation ([ADR-0028](../../adr/0028-lesson-exam-gates-completion-not-reputation.md)).
- **No leaderboards or cross-learner ranking** — explicitly rejected (manufactures a farmable reputation currency under member-authored, no-pre-review content).
- **No new persistence, no new badges.** The certificate is already a course-local credential; we only *animate* what exists.

Everything here is client-side, course-local, and cosmetic. It rewards the learner's own progress and nothing else.

## Approach

Use the animation tooling already in the project (`framer-motion`) for reveals, and add **`canvas-confetti`** (~6KB, zero-config, SSR-safe when fired client-side) for the burst. Both moments call one shared helper so the burst is configured in a single place.

Considered and rejected:
- **framer-motion-only burst** — reimplementing particle physics is more code and noticeably worse than real confetti.
- **tw-animate-css-only** — a CSS pop/fade is an "animation," not a "celebration"; no burst.

## Components

### `src/components/classroom/celebrate.ts` (new)

A tiny client-only helper:

```ts
export function fireConfetti(): void
```

- Wraps `canvas-confetti` with one centralized burst config (origin, spread, particle count, colors).
- **Guards `prefers-reduced-motion`**: if `window.matchMedia("(prefers-reduced-motion: reduce)").matches`, it no-ops.
- **SSR-safe**: guards `typeof window === "undefined"` and is only ever called from event handlers / effects, never during render.

This is the single place to tune the burst; both moments call it.

### Moment 1 — Exam pass (`src/components/classroom/exam-runner.tsx`)

- The existing `submitExamAttempt` mutation's `onSuccess(r)` already runs on a successful submission.
- When `r.passed === true`: call `fireConfetti()` and render the score-reveal element wrapped in a framer-motion `scale`/`opacity` pop.
- Firing in `onSuccess` (an event, not render) guarantees it triggers **only on a genuine new pass** — never when reopening an already-passed lesson.

### Moment 2 — Certificate reveal (`src/components/classroom/course-view.tsx`)

Two deliberately separated behaviors:

1. **Reveal animation** — the existing certificate banner is wrapped in a framer-motion entrance (scale/opacity). Subtle; runs whenever the banner renders, including on revisits. Harmless.
2. **Confetti on the *earning* transition only** — a `useRef` captures whether the certificate existed on first render (`initialHadCert`). A `useEffect` keyed on `certificateIssuedAt` calls `fireConfetti()` **only when it transitions from absent → present during the live session**, then marks it fired (so it never repeats within the session).
   - Completing the last lesson now → `get` refetches → `certificateIssuedAt` goes `null → set` → confetti. ✅
   - Loading an already-completed course later → `initialHadCert` is true → no confetti (earned earlier). ✅

## Files

| File | Change |
|---|---|
| `package.json` | add `canvas-confetti` + `@types/canvas-confetti` (dev) |
| `src/components/classroom/celebrate.ts` | **new** — `fireConfetti()` helper with reduced-motion + SSR guards |
| `src/components/classroom/exam-runner.tsx` | confetti on pass + motion flourish on the result |
| `src/components/classroom/course-view.tsx` | banner reveal (framer-motion) + confetti on earn transition |

No server, schema, migration, or tRPC changes.

## Testing / verification

No server logic changes, so verification is primarily visual (run the app):

- Pass an exam → confetti burst + score pop.
- Complete the last lesson of a course → certificate reveal + confetti.
- Reload an already-completed course → banner reveal, **no** confetti.
- With OS "reduce motion" on → no confetti (helper no-ops).
- `npx tsc --noEmit` → clean.

The one piece of non-visual logic worth isolating is the reduced-motion/SSR guard inside `fireConfetti()`; it can be exercised by mocking `window.matchMedia`, but it is small enough that visual verification plus typecheck is sufficient for v1.

## Out of scope (v1)

- Animated **progress ring** (replacing the flat progress bar) — separate visual change.
- **Lesson-complete** pop — can hang off the same `fireConfetti()` later.
