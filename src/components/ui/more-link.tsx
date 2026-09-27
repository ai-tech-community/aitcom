import type { ComponentProps } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The quiet "see more" link at the end of a section ("Explore communities",
 * "View all events"): muted mono label and a small arrow. It stays as quiet
 * as the label beside it, but its target is at least 24px tall
 * (`min-h-6`, WCAG 2.2 SC 2.5.8) so it is easy to hit on touch screens.
 * Internal links only: it goes through the locale-aware `Link` and uses a
 * straight arrow, never the external-link arrow.
 */
export function MoreLink({
  className,
  children,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      data-slot="more-link"
      className={cn(
        "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex min-h-6 items-center gap-1.5 rounded-sm py-1 font-mono text-xs tracking-wider transition-colors outline-none focus-visible:ring-[3px]",
        className,
      )}
      {...props}
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
    </Link>
  );
}
