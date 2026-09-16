import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StartupsSourceChips } from "@/components/investigations/startups-source-chips";
import {
  STARTUP_CATEGORY_LABELS,
  formatStartupExitBadge,
  presentText,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";

const stickyName = "bg-background sticky left-0 z-10 min-w-40 border-r";
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
    nameColumn: string;
    categoryColumn: string;
    regionColumn: string;
    stageColumn: string;
    exitColumn: string;
    sourcesColumn: string;
    jobsColumn: string;
    openJobs: string;
    edit: string;
  };
  onEdit?: (card: StartupPublicCard) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className={`${stickyName} ${columnHead}`}>
            {copy.nameColumn}
          </TableHead>
          <TableHead scope="col" className={columnHead}>
            {copy.categoryColumn}
          </TableHead>
          <TableHead scope="col" className={columnHead}>
            {copy.regionColumn}
          </TableHead>
          <TableHead scope="col" className={columnHead}>
            {copy.stageColumn}
          </TableHead>
          <TableHead scope="col" className={columnHead}>
            {copy.exitColumn}
          </TableHead>
          <TableHead scope="col" className={columnHead}>
            {copy.sourcesColumn}
          </TableHead>
          <TableHead scope="col" className={columnHead}>
            {copy.jobsColumn}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {companies.map((card) => {
          const region = presentText(card.region);
          const stage = presentText(card.stage);
          const exitBadge = formatStartupExitBadge(card, locale);
          const jobsUrl = presentText(card.jobsUrl);

          return (
            <TableRow key={card.id} id={card.id} data-startup-card={card.id}>
              <TableCell className={stickyName}>
                <div className="flex items-center gap-2">
                  <a
                    href={card.homepage}
                    rel="noopener noreferrer"
                    className="font-medium hover:underline"
                  >
                    {card.name}
                  </a>
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
              </TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {STARTUP_CATEGORY_LABELS[card.category][locale]}
                </Badge>
              </TableCell>
              <TableCell>
                {region ? (
                  <span data-startup-region={region}>{region}</span>
                ) : null}
              </TableCell>
              <TableCell>
                {stage ? <span data-startup-stage={stage}>{stage}</span> : null}
              </TableCell>
              <TableCell>
                {exitBadge ? (
                  <Badge data-startup-exit={card.exitStatus ?? ""}>
                    {exitBadge}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-normal">
                <StartupsSourceChips sources={card.sources} locale={locale} />
              </TableCell>
              <TableCell>
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
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
