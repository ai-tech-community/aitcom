import * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  /** Optional leading icon (e.g. a Lucide icon element). Rendered muted. */
  icon?: React.ReactNode;
  /** Short headline — what's not here. */
  title: React.ReactNode;
  /** One line that teaches the next action, not just "nothing here". */
  description?: React.ReactNode;
  /** Optional CTA (a Button/Link) that gives the user a way forward. */
  action?: React.ReactNode;
  className?: string;
};

/**
 * Consistent empty state. An empty state should teach the interface and offer a
 * next action — never a bare "No results". Use instead of improvising per-screen.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="text-muted-foreground [&_svg]:size-8" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">{title}</p>
        {description && (
          <p className="text-muted-foreground mx-auto max-w-prose text-sm">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export { EmptyState };
