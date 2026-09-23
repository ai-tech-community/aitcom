import { ArrowUpRight, Pencil } from "lucide-react";

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
import { StartupLogo } from "@/components/investigations/startups-logo";
import { StartupsSourceChips } from "@/components/investigations/startups-source-chips";
import {
  STARTUP_CATEGORY_LABELS,
  buildStartupJobsPath,
  buildStartupProfilePath,
  displayStartupFounders,
  formatStartupExitBadge,
  presentText,
  sanitizeStartupDescription,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import { cn } from "@/lib/utils";

const stickyCompany =
  "bg-background group-hover:bg-muted/50 sticky left-0 z-10 max-w-sm min-w-52 border-r whitespace-normal sm:min-w-64";
const columnHead =
  "text-muted-foreground font-mono text-xs tracking-wider uppercase";
const cell = "py-3 align-top";

export type StartupsDirectoryTableCopy = {
  companyColumn: string;
  categoryColumn: string;
  regionColumn: string;
  statusColumn: string;
  sourcesColumn: string;
  linksColumn: string;
  foundersColumn: string;
  openRoles: string;
  openHomepage: string;
  edit: string;
  caption: string;
};

/**
 * One row per company. Every cell holds sourced data or stays empty —
 * never a dash or "N/A" — so sparse records read as short, not broken.
 */
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
  copy: StartupsDirectoryTableCopy;
  onEdit?: (card: StartupPublicCard) => void;
}) {
  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <Table className="border-separate border-spacing-0">
        <TableCaption className="sr-only">{copy.caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className={cn(stickyCompany, columnHead)}>
              {copy.companyColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.categoryColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.regionColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.statusColumn}
            </TableHead>
            <TableHead scope="col" className={columnHead}>
              {copy.sourcesColumn}
            </TableHead>
            <TableHead scope="col">
              <span className="sr-only">{copy.linksColumn}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((card) => (
            <CompanyRow
              key={card.id}
              card={card}
              locale={locale}
              isModerator={isModerator}
              copy={copy}
              onEdit={onEdit}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CompanyRow({
  card,
  locale,
  isModerator,
  copy,
  onEdit,
}: {
  card: StartupPublicCard;
  locale: StartupLocale;
  isModerator: boolean;
  copy: StartupsDirectoryTableCopy;
  onEdit?: (card: StartupPublicCard) => void;
}) {
  const region = presentText(card.region);
  const stage = presentText(card.stage);
  const exitBadge = formatStartupExitBadge(card, locale);
  const founders = displayStartupFounders(card.founders);
  const description = sanitizeStartupDescription(card.description);

  return (
    <TableRow id={card.id} data-startup-card={card.id} className="group">
      <TableCell className={cn(stickyCompany, cell)}>
        <div className="flex items-start gap-3">
          <StartupLogo card={card} size="sm" />
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href={buildStartupProfilePath(card.slug)}
              data-startup-profile=""
              className="w-fit font-medium underline-offset-4 hover:underline"
            >
              {card.name}
            </Link>
            {description ? (
              <span
                data-startup-description=""
                className="text-muted-foreground line-clamp-2 text-sm"
              >
                {description}
              </span>
            ) : null}
            {founders.length > 0 ? (
              <div className="pt-1">
                <StartupsFounders
                  founders={founders}
                  label={copy.foundersColumn}
                  compact
                />
              </div>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className={cell}>
        <Badge variant="secondary">
          {STARTUP_CATEGORY_LABELS[card.category][locale]}
        </Badge>
      </TableCell>
      <TableCell className={cn(cell, "min-w-40 whitespace-normal")}>
        {region ? <span data-startup-region={region}>{region}</span> : null}
      </TableCell>
      <TableCell className={cn(cell, "min-w-32 whitespace-normal")}>
        <div className="flex flex-wrap items-center gap-1.5">
          {exitBadge ? (
            <Badge variant="outline" data-startup-exit={card.exitStatus ?? ""}>
              {exitBadge}
            </Badge>
          ) : null}
          {card.openRoleCount > 0 ? (
            <Badge asChild variant="outline">
              <Link
                href={buildStartupJobsPath({ company: card.slug })}
                data-startup-jobs=""
              >
                {copy.openRoles.replace("{count}", String(card.openRoleCount))}
              </Link>
            </Badge>
          ) : null}
          {stage ? (
            <span
              data-startup-stage={stage}
              className="text-muted-foreground text-sm"
            >
              {stage}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className={cn(cell, "min-w-48 whitespace-normal")}>
        <StartupsSourceChips sources={card.sources} locale={locale} />
      </TableCell>
      <TableCell className={cn(cell, "w-0")}>
        <div className="flex items-center justify-end gap-0.5">
          <Button asChild variant="ghost" size="icon-sm">
            <a
              href={card.homepage}
              rel="noopener noreferrer"
              data-startup-homepage=""
              title={copy.openHomepage}
            >
              <ArrowUpRight aria-hidden="true" />
              <span className="sr-only">{copy.openHomepage}</span>
            </a>
          </Button>
          {isModerator ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={copy.edit}
              onClick={() => onEdit?.(card)}
            >
              <Pencil aria-hidden="true" />
              <span className="sr-only">{copy.edit}</span>
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
