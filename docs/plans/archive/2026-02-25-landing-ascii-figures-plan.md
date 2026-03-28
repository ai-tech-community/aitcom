# Landing ASCII Figures Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace abstract landing-page ASCII figure animations with literal, semantically aligned scenes for Build, Compete, and Connect.

**Architecture:** Create three specialized scene components with deterministic keyframe morph animation and low-cost accent motion. Integrate them by swapping imports/usages in the existing feature card component without altering layout or modal behavior.

**Tech Stack:** Next.js 15, React 19 client components, TypeScript, Tailwind CSS.

---

### Task 1: Add Build Scene Component

**Files:**
- Create: `src/components/ascii-build-scene.tsx`

**Step 1: Write the frame template set for terminal/scaffold progression.**
**Step 2: Implement deterministic frame cycling and cursor/status accent updates.**
**Step 3: Render ASCII text in existing mono visual style classes.**
**Step 4: Verify TypeScript compiles for the new component.**

### Task 2: Add Compete Scene Component

**Files:**
- Create: `src/components/ascii-compete-scene.tsx`

**Step 1: Write leaderboard/race keyframes with rank and bar changes.**
**Step 2: Implement tick-based score flicker accent.**
**Step 3: Reuse same rendering cadence and visual style.**
**Step 4: Verify component compiles cleanly.**

### Task 3: Add Connect Scene Component

**Files:**
- Create: `src/components/ascii-connect-scene.tsx`

**Step 1: Write network keyframes with signal route transitions.**
**Step 2: Implement node pulse/signal accent updates.**
**Step 3: Keep deterministic output and stable spacing.**
**Step 4: Verify component compiles cleanly.**

### Task 4: Integrate Scenes into Feature Cards

**Files:**
- Modify: `src/components/feature-modals.tsx`

**Step 1: Replace old ASCII imports with new scene imports.**
**Step 2: Swap render mapping for `FIG. 1/2/3`.**
**Step 3: Ensure no layout or interaction regressions in this component.**

### Task 5: Verify and Finalize

**Files:**
- Modify (if needed): `src/components/ascii-*.tsx`

**Step 1: Run `pnpm check` and capture output.**
**Step 2: Resolve lint/type issues if present.**
**Step 3: Re-run `pnpm check` to confirm clean status.**
**Step 4: Summarize changed files and behavior.
