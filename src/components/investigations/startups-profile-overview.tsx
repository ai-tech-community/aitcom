import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { StartupsFounders } from "@/components/investigations/startups-founders";
import { StartupsMap } from "@/components/investigations/startups-map";
import { StartupsSourceChips } from "@/components/investigations/startups-source-chips";
import {
  STARTUP_CATEGORY_LABELS,
  buildStartupJobsPath,
  displayStartupFounders,
  displayStartupLogoUrl,
  displayStartupSources,
  formatStartupExitBadge,
  presentText,
  sanitizeStartupDescription,
  startupOverviewTiles,
  verifiedStartupPin,
  type StartupLocale,
  type StartupOverviewTile,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import { sourcedStartupPlaceLabel } from "@/lib/investigations/startups-places";
import { cn } from "@/lib/utils";

export type StartupsProfileOverviewCopy = {
  tileLogo: string;
  tileBlurb: string;
  tileCategory: string;
  tileRegion: string;
  tileStage: string;
  tileExit: string;
  tileFounders: string;
  tileJobs: string;
  tileSources: string;
  tileMap: string;
  openJobs: string;
  openRoles: string;
};

export function StartupsProfileOverview({
  card,
  locale,
  copy,
}: {
  card: StartupPublicCard;
  locale: StartupLocale;
  copy: StartupsProfileOverviewCopy;
}) {
  const tiles = startupOverviewTiles(card);
  if (tiles.length === 0) return null;

  return (
    <div
      data-startup-profile-bento
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      {tiles.map((tile) => (
        <OverviewTile
          key={tile}
          tile={tile}
          card={card}
          locale={locale}
          copy={copy}
        />
      ))}
    </div>
  );
}

function OverviewTile({
  tile,
  card,
  locale,
  copy,
}: {
  tile: StartupOverviewTile;
  card: StartupPublicCard;
  locale: StartupLocale;
  copy: StartupsProfileOverviewCopy;
}) {
  const title = tileTitle(tile, copy);
  const wide = tile === "blurb" || tile === "founders" || tile === "sources";
  return (
    <section
      data-startup-profile-tile={tile}
      aria-labelledby={`startup-tile-${tile}`}
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-4 self-stretch rounded-xl border p-6 shadow-sm",
        wide && "md:col-span-2",
      )}
    >
      <h2
        id={`startup-tile-${tile}`}
        className="text-lg font-semibold tracking-tight"
      >
        {title}
      </h2>
      <TileBody tile={tile} card={card} locale={locale} copy={copy} />
    </section>
  );
}

function tileTitle(
  tile: StartupOverviewTile,
  copy: StartupsProfileOverviewCopy,
): string {
  switch (tile) {
    case "logo":
      return copy.tileLogo;
    case "blurb":
      return copy.tileBlurb;
    case "category":
      return copy.tileCategory;
    case "region":
      return copy.tileRegion;
    case "stage":
      return copy.tileStage;
    case "exit":
      return copy.tileExit;
    case "founders":
      return copy.tileFounders;
    case "jobs":
      return copy.tileJobs;
    case "sources":
      return copy.tileSources;
    case "map":
      return copy.tileMap;
  }
}

function TileBody({
  tile,
  card,
  locale,
  copy,
}: {
  tile: StartupOverviewTile;
  card: StartupPublicCard;
  locale: StartupLocale;
  copy: StartupsProfileOverviewCopy;
}) {
  const logoUrl = displayStartupLogoUrl(card.logoUrl);
  const description = sanitizeStartupDescription(card.description);
  const region = presentText(card.region);
  const stage = presentText(card.stage);
  const exitBadge = formatStartupExitBadge(card, locale);
  const founders = displayStartupFounders(card.founders);
  const sources = displayStartupSources(card.sources);
  const pin = verifiedStartupPin(card);
  const place = sourcedStartupPlaceLabel(card.region);

  switch (tile) {
    case "logo":
      return logoUrl ? (
        <a href={card.homepage} rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            width={80}
            height={80}
            data-startup-logo={logoUrl}
            className="border-border size-20 rounded-md border object-cover"
          />
        </a>
      ) : null;
    case "blurb":
      return description ? (
        <p data-startup-description="" className="text-sm leading-relaxed">
          {description}
        </p>
      ) : null;
    case "category":
      return (
        <Badge variant="secondary">
          {STARTUP_CATEGORY_LABELS[card.category][locale]}
        </Badge>
      );
    case "region":
      return region ? (
        <p data-startup-region={region} className="text-sm">
          {region}
        </p>
      ) : null;
    case "stage":
      return stage ? (
        <p data-startup-stage={stage} className="text-sm">
          {stage}
        </p>
      ) : null;
    case "exit":
      return exitBadge ? (
        <Badge data-startup-exit={card.exitStatus ?? ""}>{exitBadge}</Badge>
      ) : null;
    case "founders":
      return founders.length > 0 ? (
        <StartupsFounders founders={founders} label={copy.tileFounders} />
      ) : null;
    case "jobs":
      return card.openRoleCount > 0 ? (
        <Link
          href={buildStartupJobsPath({ company: card.slug })}
          data-startup-jobs=""
          className="hover:underline"
        >
          {copy.openRoles.replace("{count}", String(card.openRoleCount))}
        </Link>
      ) : null;
    case "sources":
      return sources.length > 0 ? (
        <StartupsSourceChips sources={sources} locale={locale} />
      ) : null;
    case "map":
      return (
        <div className="flex flex-col gap-3">
          {place ? (
            <p data-startup-region={place} className="text-sm">
              {place}
            </p>
          ) : null}
          {pin ? <StartupsMap pins={[pin]} /> : null}
        </div>
      );
  }
}
