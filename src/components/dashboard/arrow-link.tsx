import * as React from "react";
import { ArrowRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The dashboard's quiet text link with a trailing arrow: the one action in
 * an empty state, or "see more" on a section. Ink, not Signal Orange, so it
 * never competes with the screen's one primary action.
 */
export function ArrowLink({
  href,
  children,
  className,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      href={href as never}
      onClick={onClick}
      className={cn(
        "text-foreground focus-visible:ring-ring/50 group inline-flex min-h-8 items-center gap-1 rounded-sm text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px]",
        className,
      )}
    >
      {children}
      <ArrowRight
        aria-hidden
        className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}
