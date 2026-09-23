import { ArrowUpRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StartupLogo } from "@/components/investigations/startups-logo";
import {
  STARTUP_CATEGORY_LABELS,
  buildStartupJobsPath,
  formatStartupExitBadge,
  sanitizeStartupDescription,
  startupHasOpenJobs,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import { cn } from "@/lib/utils";

export type StartupsProfileHeaderCopy = {
  openHomepage: string;
  rolesCta: string;
};

/** Identity block: mark, name, sourced blurb, status, and the two exits. */
export function StartupsProfileHeader({
  card,
  locale,
  copy,
}: {
  card: StartupPublicCard;
  locale: StartupLocale;
  copy: StartupsProfileHeaderCopy;
}) {
  const description = sanitizeStartupDescription(card.description);
  const exitBadge = formatStartupExitBadge(card, locale);

  return (
    <header className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8">
      <StartupMark card={card} />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" data-startup-category={card.category}>
            {STARTUP_CATEGORY_LABELS[card.category][locale]}
          </Badge>
          {exitBadge ? (
            <Badge variant="outline" data-startup-exit={card.exitStatus ?? ""}>
              {exitBadge}
            </Badge>
          ) : null}
        </div>
        <h1 className="text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance break-words">
          {card.name}
        </h1>
        {description ? (
          <p
            data-startup-description=""
            className="text-muted-foreground max-w-[65ch] text-lg leading-relaxed text-pretty"
          >
            {description}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild>
            <a
              href={card.homepage}
              rel="noopener noreferrer"
              data-startup-homepage=""
            >
              {copy.openHomepage}
              <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
          {startupHasOpenJobs(card) ? (
            <Button asChild variant="outline">
              <Link
                href={buildStartupJobsPath({ company: card.slug })}
                data-startup-jobs=""
              >
                {copy.rolesCta}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

const cropMark = "border-foreground/35 absolute size-3";

/** The company mark inside printer's crop marks. */
function StartupMark({ card }: { card: StartupPublicCard }) {
  return (
    <div
      data-startup-mark=""
      className="relative size-28 shrink-0 p-2.5 sm:size-32"
    >
      <span
        aria-hidden="true"
        className={cn(cropMark, "top-0 left-0 border-t border-l")}
      />
      <span
        aria-hidden="true"
        className={cn(cropMark, "top-0 right-0 border-t border-r")}
      />
      <span
        aria-hidden="true"
        className={cn(cropMark, "bottom-0 left-0 border-b border-l")}
      />
      <span
        aria-hidden="true"
        className={cn(cropMark, "right-0 bottom-0 border-r border-b")}
      />
      <StartupLogo card={card} size="lg" />
    </div>
  );
}
