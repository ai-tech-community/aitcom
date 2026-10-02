"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

const MAX = 100;

/**
 * Keep a value Radix accepts: it logs an error and drops a value that is not
 * finite or falls outside 0..100. Missing or non-finite reads as indeterminate
 * (null); anything else is clamped into range.
 */
export function clampProgressValue(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(MAX, Math.max(0, value));
}

/** A 0..100 progress bar. `value` is a percentage; it is clamped. */
function Progress({
  className,
  indicatorClassName,
  value: rawValue,
  ...props
}: Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, "max"> & {
  /** Override the fill color, e.g. "bg-success" for a completed bar. */
  indicatorClassName?: string;
}) {
  const value = clampProgressValue(rawValue);
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      // Pass the value through so the progressbar exposes aria-valuenow;
      // without it Radix reports an indeterminate bar.
      value={value}
      max={MAX}
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "bg-primary h-full w-full flex-1 transition-all",
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
