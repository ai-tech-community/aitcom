"use client";

import type { MotionProps } from "motion/react";
import type { CSSProperties, ElementType, JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { memo, useEffect, useMemo, useState } from "react";

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
    Component as keyof JSX.IntrinsicElements,
  );

  const [cycleIndex, setCycleIndex] = useState(0);

  useEffect(() => {
    if (!cycle || cycle.length <= 1) return;
    const interval = setInterval(
      () => {
        setCycleIndex((prev) => (prev + 1) % cycle.length);
      },
      (cycleInterval ?? 4) * 1000,
    );
    return () => clearInterval(interval);
  }, [cycle, cycleInterval]);

  const currentItem = cycle ? cycle[cycleIndex] : children;
  const isTextItem = typeof currentItem === "string";

  const dynamicSpread = useMemo(() => {
    if (cycle) {
      const maxLen = Math.max(
        ...cycle.map((item) => (typeof item === "string" ? item.length : 3)),
      );
      return maxLen * spread;
    }
    return (children?.length ?? 0) * spread;
  }, [children, cycle, spread]);

  return (
    <MotionComponent
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-[length:250%_100%] bg-clip-text",
        "[background-repeat:no-repeat,padding-box] [--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))]",
        className,
        isTextItem && "text-transparent",
      )}
      initial={{ backgroundPosition: "100% center" }}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          ...(isTextItem
            ? {
                backgroundImage:
                  "var(--bg), linear-gradient(var(--shimmer-color, var(--color-muted-foreground)), var(--shimmer-color, var(--color-muted-foreground)))",
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
      {cycle && (
        <span
          className="invisible block h-0 overflow-hidden"
          aria-hidden="true"
        >
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
