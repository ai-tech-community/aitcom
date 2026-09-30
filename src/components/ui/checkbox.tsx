"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * `tone="primary"` (default) ticks in Signal Orange. `tone="ink"` ticks in
 * the foreground colour, for screens whose one orange is already spent on a
 * primary action (One Voice Rule) — e.g. a form with many checkboxes above
 * its orange Save button.
 */
function Checkbox({
  className,
  tone = "primary",
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  tone?: "primary" | "ink";
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        tone === "ink"
          ? "data-[state=checked]:bg-foreground data-[state=checked]:text-background data-[state=checked]:border-foreground"
          : "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary",
        className,
      )}
      data-tone={tone}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
