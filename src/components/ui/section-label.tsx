import * as React from "react";

import { cn } from "@/lib/utils";

type SectionLabelProps = React.ComponentProps<"h2"> & {
  /** Render as a different element (e.g. "h3", "div") while keeping the style. */
  as?: React.ElementType;
  /** Show the bottom hairline rule. Defaults to true. */
  bordered?: boolean;
  /** Show the leading "/ " marker. Defaults to true. */
  marker?: boolean;
};

/**
 * The house kicker — the one sanctioned section marker (DESIGN.md House Kicker
 * Rule). Monospace, muted, ruled, with a leading "/ ". Use this instead of
 * re-typing `font-mono text-xs tracking-wider text-muted-foreground` everywhere,
 * and never stack other eyebrows or numbered markers on top of it.
 *
 * @example <SectionLabel>Communities</SectionLabel>  // renders: / COMMUNITIES
 */
function SectionLabel({
  as: Comp = "h2",
  bordered = true,
  marker = true,
  className,
  children,
  ...props
}: SectionLabelProps) {
  return (
    <Comp
      data-slot="section-label"
      className={cn(
        "text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase",
        bordered && "border-border border-b pb-2",
        className,
      )}
      {...props}
    >
      {marker && <span aria-hidden="true">/ </span>}
      {children}
    </Comp>
  );
}

export { SectionLabel };
