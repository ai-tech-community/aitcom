import * as React from "react";

import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";

/**
 * One titled block inside an investigation tab. The house kicker names it, an
 * optional sentence explains how to read it, and `framed` draws the hairline
 * container for content (charts, tables) that has no border of its own.
 */
export function DashboardSection({
  title,
  hint,
  action,
  framed = false,
  className,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  framed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className={cn("flex flex-col", className)}>
      <div className="border-border flex items-baseline justify-between gap-3 border-b pb-2">
        <SectionLabel as="h2" id={id} bordered={false}>
          {title}
        </SectionLabel>
        {action}
      </div>
      {hint && <p className="text-muted-foreground mt-2 text-sm">{hint}</p>}
      <div
        className={cn(
          "mt-4 min-w-0 flex-1",
          framed && "border-border rounded-xl border p-4",
        )}
      >
        {children}
      </div>
    </section>
  );
}
