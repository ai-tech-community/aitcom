# Shimmer Cycle Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the Shimmer component to cycle through an array of text/ReactNode items on a continuous loop, and use it in the hero to show "Netherlands" → Heart icon → "World".

**Architecture:** Add `cycle` and `cycleInterval` props to the existing Shimmer component. A `useState` + `useEffect` timer advances through cycle items. String items use existing `bg-clip-text` shimmer; ReactNode items (icons) render inline with color-based styling. The hero-title swaps `ScrambleText` for the new cycling `Shimmer`.

**Tech Stack:** React 19, motion/react (framer-motion v12), lucide-react, Tailwind CSS, Next.js

---

### Task 1: Add cycle state and timer to Shimmer

**Files:**
- Modify: `src/components/ai-elements/shimmer.tsx`

**Step 1: Update imports and props interface**

Add `ReactNode` to imports and extend `TextShimmerProps`:

```tsx
import type { CSSProperties, ElementType, JSX, ReactNode } from "react";
// ...
import { memo, useEffect, useMemo, useState } from "react";

export interface TextShimmerProps {
  children?: string;
  cycle?: Array<string | ReactNode>;
  cycleInterval?: number;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}
```

**Step 2: Add cycling logic inside ShimmerComponent**

Before the `return` statement, add:

```tsx
const [cycleIndex, setCycleIndex] = useState(0);

useEffect(() => {
  if (!cycle || cycle.length <= 1) return;
  const interval = setInterval(() => {
    setCycleIndex((prev) => (prev + 1) % cycle.length);
  }, (cycleInterval ?? 4) * 1000);
  return () => clearInterval(interval);
}, [cycle, cycleInterval]);

const currentItem = cycle ? cycle[cycleIndex] : children;
const isTextItem = typeof currentItem === "string";
```

**Step 3: Update dynamicSpread to handle cycle items**

Replace the existing `dynamicSpread` useMemo with:

```tsx
const dynamicSpread = useMemo(() => {
  if (cycle) {
    const maxLen = Math.max(
      ...cycle.map((item) => (typeof item === "string" ? item.length : 3))
    );
    return maxLen * spread;
  }
  return (children?.length ?? 0) * spread;
}, [children, cycle, spread]);
```

**Step 4: Run lint and build**

Run: `npx next lint && npx next build`
Expected: No type errors related to shimmer.tsx

**Step 5: Commit**

```bash
git add src/components/ai-elements/shimmer.tsx
git commit -m "feat(shimmer): add cycle and cycleInterval props with timer logic"
```

---

### Task 2: Update Shimmer rendering to support cycle items

**Files:**
- Modify: `src/components/ai-elements/shimmer.tsx`

**Step 1: Update the render to show current cycle item with fade transition**

Replace the `return` block in `ShimmerComponent` with:

```tsx
return (
  <MotionComponent
    animate={{ backgroundPosition: "0% center" }}
    className={cn(
      "relative inline-block bg-[length:250%_100%] bg-clip-text",
      "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
      isTextItem && "text-transparent",
      className
    )}
    initial={{ backgroundPosition: "100% center" }}
    style={
      {
        "--spread": `${dynamicSpread}px`,
        ...(isTextItem
          ? {
              backgroundImage:
                "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
            }
          : {}),
      } as CSSProperties
    }
    transition={{
      duration,
      ease: "linear",
      repeat: Number.POSITIVE_INFINITY,
    }}
  >
    {cycle ? (
      <span
        key={cycleIndex}
        className="inline-flex items-center transition-opacity duration-300"
      >
        {currentItem}
      </span>
    ) : (
      children
    )}
  </MotionComponent>
);
```

Key changes:
- `text-transparent` only applied for string items (icons need visible color)
- `backgroundImage` only set for string items
- Cycle items wrapped in a `<span>` with `key={cycleIndex}` for React re-mount + CSS fade
- `inline-flex items-center` ensures icon vertical alignment

**Step 2: Add layout stability — measure widest item**

Add a hidden placeholder before the visible content inside the MotionComponent, after the opening tag:

```tsx
{cycle && (
  <span className="invisible block h-0 overflow-hidden" aria-hidden="true">
    {cycle.reduce<string>((longest, item) => {
      if (typeof item === "string" && item.length > longest.length) return item;
      return longest;
    }, "")}
  </span>
)}
```

This renders the longest text string invisibly to set the minimum width and prevent layout shifts.

**Step 3: Run lint and build**

Run: `npx next lint && npx next build`
Expected: PASS, no errors

**Step 4: Commit**

```bash
git add src/components/ai-elements/shimmer.tsx
git commit -m "feat(shimmer): render cycle items with fade transition and layout stability"
```

---

### Task 3: Update hero-title to use Shimmer cycle

**Files:**
- Modify: `src/components/hero-title.tsx`

**Step 1: Replace ScrambleText with cycling Shimmer**

Replace the entire file content with:

```tsx
"use client";

import { Heart } from "lucide-react";
import { Shimmer } from "./ai-elements/shimmer";

interface HeroTitleProps {
  greeting: string;
  title: string;
}

export function HeroTitle({ greeting, title }: HeroTitleProps) {
  const words = title.split(" ");
  const lastWord = words.pop()!;
  const rest = words.join(" ");

  return (
    <h1 className="text-[32px] leading-[0.95] tracking-tighter sm:text-8xl lg:text-[96px]">
      <span className="block font-light">{greeting}</span>
      <span className="block font-extrabold">
        {rest}{" "}
        <Shimmer
          as="span"
          cycle={[
            lastWord,
            <Heart
              key="heart"
              className="inline h-[0.75em] w-[0.75em] fill-current"
            />,
            "World",
          ]}
          cycleInterval={4}
          duration={2}
          className="text-primary inline-block"
        />
      </span>
    </h1>
  );
}
```

Note: `fill-current` on Heart makes it a solid filled heart matching the text color.

**Step 2: Run lint and build**

Run: `npx next lint && npx next build`
Expected: PASS, no errors

**Step 3: Verify visually**

Run: `npm run dev`
Navigate to the homepage. Verify:
- Hero displays "AI Tech Community Netherlands" initially
- After ~4s, "Netherlands" fades to a heart icon
- After ~4s more, heart fades to "World"
- After ~4s more, "World" fades back to "Netherlands"
- Loop continues indefinitely
- No layout shift between items
- Shimmer gradient continues sweeping throughout

**Step 4: Commit**

```bash
git add src/components/hero-title.tsx
git commit -m "feat(hero): use shimmer cycle for Netherlands → heart → World animation"
```

---

### Task 4: Verify backward compatibility

**Step 1: Check existing Shimmer consumers still work**

Verify these files are unchanged and still compile:
- `src/components/ai-elements/reasoning.tsx` — uses `<Shimmer>Thinking...</Shimmer>`
- `src/components/ai-elements/terminal.tsx` — uses `<Shimmer>` with children
- `src/components/ai-elements/plan.tsx` — uses `<Shimmer>` with children

**Step 2: Full build**

Run: `npx next build`
Expected: PASS with no errors

**Step 3: Final commit (if any adjustments needed)**

```bash
git add -A
git commit -m "chore: verify shimmer backward compatibility"
```
