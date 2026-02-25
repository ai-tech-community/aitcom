"use client";

import type { MotionProps } from "motion/react";
import type { CSSProperties, ElementType, JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { animate, motion } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

type MotionHTMLProps = MotionProps & Record<string, unknown>;

// Cache motion components at module level to avoid creating during render
const motionComponentCache = new Map<
  keyof JSX.IntrinsicElements,
  React.ComponentType<MotionHTMLProps>
>();

const getMotionComponent = (element: keyof JSX.IntrinsicElements) => {
  let component = motionComponentCache.get(element);
  if (!component) {
    component = motion.create(element);
    motionComponentCache.set(element, component);
  }
  return component;
};

export interface TextShimmerProps {
  children?: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
  cycle?: Array<string | ReactNode>;
  cycleInterval?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
  cycle,
  cycleInterval,
}: TextShimmerProps) => {
  const MotionComponent = getMotionComponent(
    Component as keyof JSX.IntrinsicElements
  );

  const elementRef = useRef<HTMLElement>(null);
  const [cycleIndex, setCycleIndex] = useState(0);

  // Cycle mode: imperative animation — sweep → swap text at midpoint → hold → repeat
  useEffect(() => {
    if (!cycle || cycle.length <= 1) return;
    const el = elementRef.current;
    if (!el) return;

    let cancelled = false;
    const holdMs = Math.max(0, (cycleInterval ?? 4) - duration) * 1000;

    const runCycle = async () => {
      while (!cancelled) {
        // Hold current text visible
        await delay(holdMs);
        if (cancelled) break;

        // Reset gradient to right side (start of sweep)
        el.style.backgroundPosition = "100% center";

        // Swap text at midpoint of sweep (gradient covers the text)
        const swapTimer = setTimeout(() => {
          if (!cancelled) {
            setCycleIndex((prev) => (prev + 1) % cycle.length);
          }
        }, (duration * 1000) / 2);

        // Animate the shimmer sweep from right to left
        try {
          await animate(
            el,
            { backgroundPosition: ["100% center", "0% center"] },
            { duration, ease: "linear" }
          );
        } catch {
          clearTimeout(swapTimer);
          break;
        }
      }
    };

    runCycle();
    return () => {
      cancelled = true;
    };
  }, [cycle, cycleInterval, duration]);

  const currentItem = cycle ? cycle[cycleIndex] : children;
  const isTextItem = typeof currentItem === "string";

  const dynamicSpread = useMemo(() => {
    if (cycle) {
      const maxLen = Math.max(
        ...cycle.map((item) => (typeof item === "string" ? item.length : 3))
      );
      return maxLen * spread;
    }
    return (children?.length ?? 0) * spread;
  }, [children, cycle, spread]);

  return (
    <MotionComponent
      ref={elementRef}
      // Only use declarative animation for non-cycle mode
      {...(!cycle
        ? {
            animate: { backgroundPosition: "0% center" },
            initial: { backgroundPosition: "100% center" },
            transition: {
              duration,
              ease: "linear",
              repeat: Number.POSITIVE_INFINITY,
            },
          }
        : {})}
      className={cn(
        "relative inline-block bg-[length:250%_100%] bg-clip-text",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        isTextItem && "text-transparent",
        className
      )}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          ...(isTextItem
            ? {
                backgroundImage:
                  "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
              }
            : {}),
          ...(cycle ? { backgroundPosition: "100% center" } : {}),
        } as CSSProperties
      }
    >
      {cycle && (
        <span className="invisible block h-0 overflow-hidden" aria-hidden="true">
          {cycle.reduce<string>((longest, item) => {
            if (typeof item === "string" && item.length > longest.length)
              return item;
            return longest;
          }, "")}
        </span>
      )}
      {cycle ? (
        <span key={cycleIndex} className="inline-flex items-center">
          {currentItem}
        </span>
      ) : (
        children
      )}
    </MotionComponent>
  );
};

export const Shimmer = memo(ShimmerComponent);
