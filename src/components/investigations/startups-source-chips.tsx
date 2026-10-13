"use client";

import { NewsLogo } from "@/components/news/news-logo";
import { Badge } from "@/components/ui/badge";
import {
  displayStartupSourceChips,
  startupSourceFaviconUrl,
  type StartupLocale,
} from "@/lib/investigations/startups";

export function StartupsSourceChips({
  sources,
  locale,
  label,
}: {
  sources: readonly string[];
  locale: StartupLocale;
  label?: string;
}) {
  const chips = displayStartupSourceChips(sources, locale);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {label ? (
        <p className="text-foreground text-sm font-medium">{label}</p>
      ) : null}
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const favicon = startupSourceFaviconUrl(chip.href);
          return (
            <li key={chip.href}>
              <Badge asChild variant="outline">
                <a
                  href={chip.href}
                  rel="noopener noreferrer"
                  data-startup-source-chip={chip.label}
                  className="inline-flex items-center gap-1.5"
                >
                  <NewsLogo
                    src={favicon}
                    name={chip.label}
                    decorative
                    mark={favicon ?? undefined}
                    className="size-3 text-[8px]"
                  />
                  {chip.label}
                </a>
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
