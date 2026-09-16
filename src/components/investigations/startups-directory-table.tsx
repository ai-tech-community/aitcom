import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StartupsFounders } from "@/components/investigations/startups-founders";
import { StartupsSourceChips } from "@/components/investigations/startups-source-chips";
import {
  STARTUP_CATEGORY_LABELS,
  buildStartupProfilePath,
  displayStartupFounders,
  displayStartupLogoUrl,
  formatStartupExitBadge,
  presentText,
  sanitizeStartupDescription,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import { cn } from "@/lib/utils";

const stickyName =
  "bg-background group-hover:bg-muted/50 sticky left-0 z-10 min-w-44 border-r";
const columnHead =
  "text-muted-foreground font-mono text-xs tracking-wider uppercase";

export function StartupsDirectoryTable({
  companies,
  locale,
  isModerator,
  copy,
  onEdit,
}: {
  companies: StartupPublicCard[];
  locale: StartupLocale;
  isModerator: boolean;
  copy: {
    logoColumn: string;
    nameColumn: string;
    descriptionColumn: string;
    foundersColumn: string;
    categoryColumn: string;
    regionColumn: string;
    stageColumn: string;
    exitColumn: string;
    sourcesColumn: string;
    jobsColumn: string;
    openJobs: string;
    openHomepage: string;
    edit: string;
    caption: string;
  };
  onEdit?: (card: StartupPublicCard) => void;
}) {
  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <Table className="border-separate border-spacing-0">
        <TableCaption className="sr-only">{copy.caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className={columnHead}>
              {copy.logoColumn}
            </TableHead>
            <TableHead scope="col" className={cn(stickyName, columnHead)}>
              {copy.nameColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.descriptionColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.categoryColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.regionColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.foundersColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.sourcesColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.jobsColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.exitColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.stageColumn}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((card) => {
            const region = presentText(card.region);
            const stage = presentText(card.stage);
            const exitBadge = formatStartupExitBadge(card, locale);
            const jobsUrl = presentText(card.jobsUrl);
            const founders = displayStartupFounders(card.founders);
            const logoUrl = displayStartupLogoUrl(card.logoUrl);
            const description = sanitizeStartupDescription(card.description);

            return (
              <TableRow
                key={card.id}
                id={card.id}
                data-startup-card={card.id}
                className="group"
              >
                <TableCell className="align-top">
                  {logoUrl ? (
                    <a href={card.homepage} rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logoUrl}
                        alt=""
                        width={32}
                        height={32}
                        data-startup-logo={logoUrl}
                        className="border-border size-8 rounded-md border object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    </a>
                  ) : null}
                </TableCell>
                <TableCell className={cn(stickyName, "align-top")}>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={buildStartupProfilePath(card.slug)}
                        data-startup-profile=""
                        className="font-medium hover:underline"
                      >
                        {card.name}
                      </Link>
                      {isModerator ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => onEdit?.(card)}
                        >
                          {copy.edit}
                        </Button>
                      ) : null}
                    </div>
                    <a
                      href={card.homepage}
                      rel="noopener noreferrer"
                      data-startup-homepage=""
                      className="text-muted-foreground text-xs hover:underline"
                    >
                      {copy.openHomepage}
                    </a>
                  </div>
                </TableCell>
                <TableCell className="max-w-64 align-top whitespace-normal">
                  {description ? (
                    <span
                      data-startup-description=""
                      className="text-muted-foreground line-clamp-2 text-sm"
                    >
                      {description}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant="secondary">
                    {STARTUP_CATEGORY_LABELS[card.category][locale]}
                  </Badge>
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  {region ? (
                    <span data-startup-region={region}>{region}</span>
                  ) : null}
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  {founders.length > 0 ? (
                    <StartupsFounders
                      founders={founders}
                      label={copy.foundersColumn}
                      compact
                    />
                  ) : null}
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <StartupsSourceChips sources={card.sources} locale={locale} />
                </TableCell>
                <TableCell className="align-top">
                  {jobsUrl ? (
                    <a
                      href={jobsUrl}
                      rel="noopener noreferrer"
                      data-startup-jobs=""
                      className="hover:underline"
                    >
                      {copy.openJobs}
                    </a>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">
                  {exitBadge ? (
                    <Badge data-startup-exit={card.exitStatus ?? ""}>
                      {exitBadge}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">
                  {stage ? (
                    <span data-startup-stage={stage}>{stage}</span>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
