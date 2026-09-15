import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  STARTUP_CATEGORY_LABELS,
  STARTUP_EXIT_STATUS_LABELS,
  displayStartupFounders,
  displayStartupSources,
  formatStartupListedDate,
  presentText,
  startupSourceLabel,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";

export function StartupsCard({
  card,
  locale,
  isModerator,
  copy,
  onEdit,
}: {
  card: StartupPublicCard;
  locale: StartupLocale;
  isModerator: boolean;
  copy: {
    openHomepage: string;
    openJobs: string;
    sources: string;
    founders: string;
    edit: string;
  };
  onEdit?: (card: StartupPublicCard) => void;
}) {
  const region = presentText(card.region);
  const stage = presentText(card.stage);
  const logoUrl = presentText(card.logoUrl);
  const sources = displayStartupSources(card.sources);
  const founders = displayStartupFounders(card.founders);
  const exitStatus = card.exitStatus;
  const acquirer = presentText(card.acquirer);
  const exitOn = presentText(card.exitOn);
  const jobsUrl = presentText(card.jobsUrl);

  return (
    <Card className="h-full" data-startup-card={card.id}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">
              {STARTUP_CATEGORY_LABELS[card.category][locale]}
            </Badge>
            {exitStatus ? (
              <Badge data-startup-exit={exitStatus}>
                {STARTUP_EXIT_STATUS_LABELS[exitStatus][locale]}
              </Badge>
            ) : null}
          </div>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              width={40}
              height={40}
              className="border-border size-10 rounded-md border object-cover"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : null}
        </div>
        <CardTitle className="text-base">{card.name}</CardTitle>
        {stage ? <CardDescription>{stage}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground font-mono text-xs">
          {formatStartupListedDate(card.listedOn, locale)}
        </p>
        {region ? (
          <p className="text-muted-foreground text-sm">{region}</p>
        ) : null}
        {exitStatus && (acquirer || exitOn) ? (
          <p className="text-muted-foreground font-mono text-xs">
            {[acquirer, exitOn].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {founders.length > 0 ? (
          <div data-startup-founders="">
            <p className="text-foreground text-sm font-medium">
              {copy.founders}
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {founders.map((founder) => (
                <li key={`${founder.name}-${founder.url ?? ""}`}>
                  {founder.url ? (
                    <a
                      href={founder.url}
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
                    >
                      {founder.name}
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {founder.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {sources.length > 0 ? (
          <div>
            <p className="text-foreground text-sm font-medium">
              {copy.sources}
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {sources.map((href) => (
                <li key={href}>
                  <a
                    href={href}
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
                  >
                    {startupSourceLabel(href, locale)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={card.homepage} rel="noopener noreferrer">
            {copy.openHomepage}
          </a>
        </Button>
        {jobsUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={jobsUrl} rel="noopener noreferrer" data-startup-jobs="">
              {copy.openJobs}
            </a>
          </Button>
        ) : null}
        {isModerator ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onEdit?.(card)}
          >
            {copy.edit}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
