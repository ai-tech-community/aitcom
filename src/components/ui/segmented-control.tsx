"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const segmentedControlVariants = cva(
  "inline-flex items-center gap-0.5 rounded-md bg-secondary p-0.5 text-muted-foreground",
  {
    variants: {
      size: {
        sm: "h-7 text-xs",
        default: "h-8 text-sm",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  /** Accessible label when `label` is icon-only. */
  ariaLabel?: string;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  options: SegmentedControlOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible group name. */
  "aria-label": string;
  className?: string;
} & VariantProps<typeof segmentedControlVariants>;

/**
 * Accessible segmented toggle backed by native radio inputs — keyboard
 * navigation and screen-reader semantics come for free. Use instead of
 * hand-rolling pill-button pairs. On-system: shares the Button focus ring.
 */
function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  size,
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const name = React.useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(segmentedControlVariants({ size }), className)}
    >
      {options.map((opt) => {
        const checked = opt.value === value;
        return (
          <label
            key={opt.value}
            data-slot="segmented-control-item"
            data-state={checked ? "active" : "inactive"}
            className={cn(
              "relative inline-flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-[inherit] px-2.5 font-medium whitespace-nowrap transition-colors",
              "has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]",
              checked
                ? "bg-background text-foreground shadow-xs"
                : "hover:text-foreground",
              opt.disabled && "pointer-events-none opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
              disabled={opt.disabled}
              onChange={() => onValueChange(opt.value)}
              aria-label={opt.ariaLabel}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

export { SegmentedControl, segmentedControlVariants };
