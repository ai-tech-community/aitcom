import { Link } from "@/i18n/navigation";
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
import { StartupsFounders } from "@/components/investigations/startups-founders";
import { StartupsSourceChips } from "@/components/investigations/startups-source-chips";
import {
  STARTUP_CATEGORY_LABELS,
  buildStartupJobsPath,
  displayStartupFounders,
  formatStartupExitBadge,
  formatStartupListedDate,
  presentText,
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
    openRoles: string;
    sources: string;
    founders: string;
    edit: string;
  };
  onEdit?: (card: StartupPublicCard) => void;
}) {
  const region = presentText(card.region);
  const stage = presentText(card.stage);
  const logoUrl = presentText(card.logoUrl);
  const founders = displayStartupFounders(card.founders);
  const exitBadge = formatStartupExitBadge(card, locale);

  return (
    <Card className="h-full" data-startup-card={card.id}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge variant="secondary">
              {STARTUP_CATEGORY_LABELS[card.category][locale]}
            </Badge>
            {exitBadge ? (
              <Badge data-startup-exit={card.exitStatus ?? ""}>
                {exitBadge}
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
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground font-mono text-xs">
          {formatStartupListedDate(card.listedOn, locale)}
        </p>
        {region ? (
          <p className="text-muted-foreground text-sm">{region}</p>
        ) : null}
        {founders.length > 0 ? (
          <StartupsFounders founders={founders} label={copy.founders} />
        ) : null}
        <StartupsSourceChips
          sources={card.sources}
          locale={locale}
          label={copy.sources}
        />
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={card.homepage} rel="noopener noreferrer">
            {copy.openHomepage}
          </a>
        </Button>
        {card.openRoleCount > 0 ? (
          <Button asChild size="sm" variant="outline">
            <Link
              href={buildStartupJobsPath({ company: card.slug })}
              data-startup-jobs=""
            >
              {copy.openRoles.replace("{count}", String(card.openRoleCount))}
            </Link>
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
