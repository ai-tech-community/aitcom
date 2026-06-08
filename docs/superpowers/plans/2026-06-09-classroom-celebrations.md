# Classroom Celebration Moments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Celebrate the two peak classroom moments — passing an exam and earning the course certificate — with a confetti burst plus a framer-motion reveal, kept strictly local and cosmetic.

**Architecture:** One shared client helper `fireConfetti()` wraps `canvas-confetti` (with `prefers-reduced-motion` + SSR guards). The exam runner fires it in the existing `submitExamAttempt` `onSuccess` when the attempt passes; the course view fires it once when the certificate transitions from absent→present during the live session. framer-motion (`LazyMotion`/`m`, the pattern already used in this repo) animates the score line and the certificate banner.

**Tech Stack:** React 19, Next.js 15, framer-motion 12, canvas-confetti (new), next-intl, Vitest (jsdom).

**Spec:** [docs/superpowers/specs/2026-06-09-classroom-celebrations-design.md](../specs/2026-06-09-classroom-celebrations-design.md)

**Invariants:** celebration only — no XP, no points, no leaderboards, no new persistence. No server/schema/tRPC changes anywhere in this plan.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `package.json` | add `canvas-confetti` + `@types/canvas-confetti` | Modify |
| `src/components/classroom/celebrate.ts` | `fireConfetti()` — the single burst helper, with guards | Create |
| `src/components/classroom/celebrate.test.ts` | unit-test the reduced-motion / fire behavior | Create |
| `src/components/classroom/exam-runner.tsx` | confetti on pass + motion pop on the score line | Modify |
| `src/components/classroom/course-view.tsx` | certificate banner reveal + confetti on earn transition | Modify |

---

### Task 1: Confetti helper + dependency

A single client-only helper so the burst is configured in one place and both moments call it. It no-ops under `prefers-reduced-motion` and during SSR.

**Files:**
- Modify: `package.json` (via package manager)
- Create: `src/components/classroom/celebrate.ts`
- Test: `src/components/classroom/celebrate.test.ts`

- [ ] **Step 1: Add the dependency**

Run: `pnpm add canvas-confetti && pnpm add -D @types/canvas-confetti`
Expected: `package.json` gains `canvas-confetti` in dependencies and `@types/canvas-confetti` in devDependencies; install completes with no error.

- [ ] **Step 2: Write the failing test**

Create `src/components/classroom/celebrate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const confettiMock = vi.fn();
vi.mock("canvas-confetti", () => ({
  default: (...args: unknown[]) => confettiMock(...args),
}));

import { fireConfetti } from "./celebrate";

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("fireConfetti", () => {
  beforeEach(() => confettiMock.mockClear());

  it("fires a burst when motion is allowed", () => {
    setReducedMotion(false);
    fireConfetti();
    expect(confettiMock).toHaveBeenCalledTimes(1);
  });

  it("no-ops under prefers-reduced-motion", () => {
    setReducedMotion(true);
    fireConfetti();
    expect(confettiMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/components/classroom/celebrate.test.ts`
Expected: FAIL — `./celebrate` has no export `fireConfetti`.

- [ ] **Step 4: Implement the helper**

Create `src/components/classroom/celebrate.ts`:

```typescript
import confetti from "canvas-confetti";

/**
 * Fire a celebratory confetti burst. Cosmetic only. No-ops during SSR and for
 * users who prefer reduced motion. Call from event handlers / effects, never
 * during render.
 */
export function fireConfetti(): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 35,
    origin: { y: 0.7 },
    scalar: 0.9,
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/classroom/celebrate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/classroom/celebrate.ts src/components/classroom/celebrate.test.ts
git commit -m "feat(classroom): fireConfetti helper (reduced-motion + SSR safe)"
```

---

### Task 2: Exam-pass celebration

Fire confetti on a genuine new pass (in the mutation's `onSuccess`, an event — so it never fires when reopening an already-passed lesson), and give the "passed" score line a framer-motion pop.

**Files:**
- Modify: `src/components/classroom/exam-runner.tsx`

- [ ] **Step 1: Add imports**

In `src/components/classroom/exam-runner.tsx`, add the framer-motion and helper imports near the existing imports (top of file, after the `sonner` import):

```typescript
import { LazyMotion, domAnimation, m } from "framer-motion";
import { fireConfetti } from "./celebrate";
```

- [ ] **Step 2: Fire confetti on a passing submission**

In the `submit` mutation's `onSuccess`, add the `fireConfetti()` call on a pass. Replace the existing `onSuccess` body:

```typescript
    onSuccess: (r) => {
      setResult(r);
      if (r.passed) {
        fireConfetti();
        toast.success(t("examPassedToast", { score: r.score }));
      } else {
        toast.error(t("examFailedToast", { score: r.score }));
      }
      void utils.classrooms.get.invalidate();
    },
```

- [ ] **Step 3: Animate the passed score line**

Wrap the "already passed" line in a framer-motion pop. Replace this block:

```typescript
      {passed && !preview ? (
        <p className="text-sm font-medium text-green-600">
          {t("examAlreadyPassed", {
            score: Math.max(0, ...mine.filter((a) => a.passed).map((a) => a.score)),
          })}
        </p>
      ) : (
```

with:

```typescript
      {passed && !preview ? (
        <LazyMotion features={domAnimation}>
          <m.p
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 360, damping: 18 }}
            className="text-sm font-medium text-green-600"
          >
            {t("examAlreadyPassed", {
              score: Math.max(0, ...mine.filter((a) => a.passed).map((a) => a.score)),
            })}
          </m.p>
        </LazyMotion>
      ) : (
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/classroom/exam-runner.tsx
git commit -m "feat(classroom): celebrate a passing exam (confetti + score pop)"
```

---

### Task 3: Certificate reveal + confetti on earn

Animate the certificate banner in, and fire confetti **once** when the certificate appears for the first time during the live session (the moment of earning) — never on a later reload of an already-completed course.

**Files:**
- Modify: `src/components/classroom/course-view.tsx`

- [ ] **Step 1: Extend the React import + add framer-motion and helper imports**

In `src/components/classroom/course-view.tsx`, change the first React import from:

```typescript
import { useMemo, useState } from "react";
```

to:

```typescript
import { useEffect, useMemo, useRef, useState } from "react";
```

And add, alongside the other component imports (after `import { ExamRunner } from "./exam-runner";`):

```typescript
import { LazyMotion, domAnimation, m } from "framer-motion";
import { fireConfetti } from "./celebrate";
```

- [ ] **Step 2: Add the earn-transition effect**

Find the line `const certificateIssuedAt = data?.certificateIssuedAt ?? null;` (~line 75). Immediately after it, add:

```typescript
  // Fire confetti only when the certificate appears for the FIRST time during
  // this session (the moment of earning) — never on a reload of an already
  // completed course. `certInitialized` skips the first loaded value;
  // `hadCertOnLoad` records whether it was already earned when the page loaded.
  const certInitialized = useRef(false);
  const hadCertOnLoad = useRef(false);
  useEffect(() => {
    if (!data) return; // wait for the query's first result
    if (!certInitialized.current) {
      certInitialized.current = true;
      hadCertOnLoad.current = !!certificateIssuedAt;
      return; // first loaded value: never celebrate
    }
    if (certificateIssuedAt && !hadCertOnLoad.current) {
      hadCertOnLoad.current = true; // prevent repeat within the session
      fireConfetti();
    }
  }, [data, certificateIssuedAt]);
```

- [ ] **Step 3: Wrap the certificate banner in a reveal animation**

Replace the certificate banner block (~lines 263-274):

```typescript
            {certificateIssuedAt ? (
              <div className="rounded-md border border-green-600/30 bg-green-600/10 p-3 text-center">
                <p className="text-sm font-semibold text-green-700">
                  {t("certificateEarned")}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("certificateIssued", {
                    date: new Date(certificateIssuedAt).toLocaleDateString(),
                  })}
                </p>
              </div>
            ) : null}
```

with:

```typescript
            {certificateIssuedAt ? (
              <LazyMotion features={domAnimation}>
                <m.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 280, damping: 20 }}
                  className="rounded-md border border-green-600/30 bg-green-600/10 p-3 text-center"
                >
                  <p className="text-sm font-semibold text-green-700">
                    {t("certificateEarned")}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t("certificateIssued", {
                      date: new Date(certificateIssuedAt).toLocaleDateString(),
                    })}
                  </p>
                </m.div>
              </LazyMotion>
            ) : null}
```

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/classroom/course-view.tsx
git commit -m "feat(classroom): certificate reveal + confetti on earn"
```

---

## Final verification

- [ ] Run the unit suite: `npx vitest run src/components/classroom/celebrate.test.ts` → 2 passed.
- [ ] Typecheck: `npx tsc --noEmit` → clean.
- [ ] Manual (dev server, enrolled learner):
  - Pass an exam → confetti burst + the score line pops in.
  - Complete the last remaining lesson of a course → certificate banner springs in + confetti.
  - Reload that completed course → banner animates in, **no** confetti.
  - Enable OS "reduce motion" → pass an exam → no confetti (helper no-ops); the toast still shows.

## Out of scope (do NOT build here)

- Animated progress ring (separate visual change).
- Lesson-complete pop (can hang off `fireConfetti()` later).
- Any XP/points/leaderboard — forbidden by the spec and [ADR-0028](../../adr/0028-lesson-exam-gates-completion-not-reputation.md).
