"use client";

import { useFormatter, useNow } from "next-intl";

import { cn } from "@/lib/utils";

type RelativeTimeProps = {
  /** The timestamp to render relative to now. */
  date: Date | string | number;
  className?: string;
};

/**
 * Localized relative timestamp ("2 hours ago" / "2 uur geleden") via next-intl.
 * Replaces hand-rolled `timeAgo()` helpers, which were English-only and bypassed
 * the EN/NL contract. Renders a semantic <time> element with a machine dateTime.
 */
function RelativeTime({ date, className }: RelativeTimeProps) {
  const format = useFormatter();
  const now = useNow();
  const d = date instanceof Date ? date : new Date(date);
  return (
    <time
      dateTime={d.toISOString()}
      className={cn("font-mono", className)}
      suppressHydrationWarning
    >
      {format.relativeTime(d, now)}
    </time>
  );
}

export { RelativeTime };
