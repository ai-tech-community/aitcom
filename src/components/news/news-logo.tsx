"use client";

import { useState } from "react";
import { Newspaper } from "lucide-react";

import { newsLogoInitial } from "@/lib/news/logo";
import { cn } from "@/lib/utils";

/**
 * A news logo at the same size as the table marks. A missing URL or a
 * failed load becomes a muted rounded tile: the name's initial, or a
 * newspaper mark when the name has none.
 */
export function NewsLogo({
  src,
  name,
  decorative = false,
  className,
  mark,
}: {
  src: string | null;
  name: string;
  /** Hide the mark from the accessibility tree when nearby text names it. */
  decorative?: boolean;
  className?: string;
  /** Optional data hook, used by source chips. */
  mark?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = name.trim();
  const initial = newsLogoInitial(label);

  if (!src || failed) {
    const named = !decorative && initial != null;
    return (
      <span
        role={named ? "img" : undefined}
        aria-label={named ? label : undefined}
        aria-hidden={named ? undefined : true}
        data-news-logo-fallback=""
        data-startup-source-favicon={mark}
        className={cn(
          "bg-muted text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-[10px] leading-none font-medium",
          className,
        )}
      >
        {initial ?? (
          <Newspaper aria-hidden className="size-[60%]" strokeWidth={1.75} />
        )}
      </span>
    );
  }

  return (
    // Real host favicon. next/image cannot allow every company domain.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={decorative ? "" : label}
      title={label || undefined}
      width={20}
      height={20}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      data-news-logo=""
      data-startup-source-favicon={mark}
      className={cn("size-5 shrink-0 rounded-sm object-contain", className)}
      ref={(node) => {
        if (node?.complete && node.naturalWidth === 0) setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}
