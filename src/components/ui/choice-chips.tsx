"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type ChoiceChipOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

/**
 * A wrapping row of pill chips where exactly one is chosen (a filter such as
 * a topic or a category). Backed by native radio inputs like
 * `SegmentedControl`, so arrow keys and screen readers work as they do for
 * any radio group. Use `SegmentedControl` for two to four short fixed
 * choices, `ChoiceChips` for a longer list that comes from data. The chosen
 * chip is ink, never orange (One Voice Rule).
 */
function ChoiceChips<T extends string>({
  options,
  value,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: {
  options: readonly ChoiceChipOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible group name. */
  "aria-label": string;
  className?: string;
}) {
  const name = React.useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            data-slot="choice-chip"
            data-state={checked ? "active" : "inactive"}
            className={cn(
              "inline-flex h-8 shrink-0 cursor-pointer items-center rounded-full border px-3 text-sm transition-colors",
              "has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]",
              checked
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onValueChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export { ChoiceChips };
