# Shimmer Cycle Animation Design

## Overview

Extend the existing `Shimmer` component to support cycling through an array of items (text and ReactNodes) on a continuous loop. Primary use case: the hero title cycling `"Netherlands"` → `<Heart />` icon → `"World"` to express "Netherlands loves the World".

## API

```ts
interface TextShimmerProps {
  children?: string;                    // existing — still works alone
  cycle?: Array<string | ReactNode>;    // items to loop through
  cycleInterval?: number;               // seconds between swaps (default: 4)
  as?: ElementType;
  className?: string;
  duration?: number;                    // shimmer sweep speed (existing)
  spread?: number;                      // existing
}
```

- `cycle` provided → `children` ignored, component loops through items
- Only `children` provided → current behavior unchanged (backward-compatible)

### Usage

```tsx
<Shimmer
  as="span"
  cycle={["Netherlands", <Heart key="heart" className="inline h-[0.8em] w-[0.8em]" />, "World"]}
  cycleInterval={4}
  className="text-primary inline-block"
/>
```

## Animation Logic

### Cycle Timing
- `useState` index tracks current item in `cycle` array
- `useEffect` with `setInterval` advances index every `cycleInterval` seconds (wraps with modulo)
- Shimmer `duration` should align with `cycleInterval` for rhythmic feel

### Transition
- On index change, new item fades in with ~300ms opacity transition
- Layered with ongoing shimmer sweep creates effect of shimmer "revealing" next word

### Text vs ReactNode Rendering
- **String items**: `bg-clip-text` shimmer works as-is
- **ReactNode items** (e.g. `<Heart />`): `bg-clip-text` doesn't apply to SVGs; use `text-primary` color with subtle opacity pulse during shimmer sweep

### Layout Stability
- Use fixed `min-width` or hidden placeholder of longest text item to prevent layout shifts between "Netherlands" (11 chars) and "World" (5 chars)

## Files Changed

| File | Change |
|------|--------|
| `src/components/ai-elements/shimmer.tsx` | Add `cycle`, `cycleInterval` props, cycling + ReactNode logic |
| `src/components/hero-title.tsx` | Replace `<ScrambleText>` with `<Shimmer cycle={[...]} />` |

## Dependencies
- `lucide-react` — already in project, for `<Heart />` icon
- No new packages

## Unchanged
- `src/components/scramble-text.tsx` — kept, just unused in hero
- All other Shimmer consumers (reasoning.tsx, terminal.tsx, plan.tsx) — backward-compatible
