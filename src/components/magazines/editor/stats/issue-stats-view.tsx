import { ArrowLeft } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { issueBuilderPath } from "@/lib/magazines/paths";
import type { IssueStats } from "@/server/magazines/stats/issue-stats";

/** The editor's reading numbers, inside the existing community frame. */
export function IssueStatsView({
  stats,
  communityName,
  communitySlug,
}: {
  stats: IssueStats;
  communityName: string;
  communitySlug: string;
}) {
  const t = useTranslations("magazineEditor.stats");
  const format = useFormatter();
  const tiles = [
    { label: t("views"), value: stats.views },
    { label: t("readers"), value: stats.readers },
    { label: t("newSubscribers"), value: stats.newSubscribers },
    { label: t("joins", { community: communityName }), value: stats.joins },
  ];
  const empty =
    tiles.every((tile) => tile.value === 0) &&
    stats.articles.every(
      (article) => article.readers === 0 && article.readToEnd === 0,
    );

  return (
    <div className="flex w-full max-w-5xl min-w-0 flex-col gap-8">
      <Button
        variant="ghost"
        size="sm"
        className="self-start whitespace-normal"
        asChild
      >
        <Link href={issueBuilderPath(communitySlug, stats.issue.id)}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("back")}
        </Link>
      </Button>
      <header className="flex flex-col gap-3">
        <SectionLabel as="div">{t("label")}</SectionLabel>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance break-words sm:text-4xl">
          {t("heading", { number: stats.issue.number })}
        </h1>
        <p className="text-muted-foreground text-sm break-words">
          {stats.issue.title}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-5 sm:grid-cols-4">
        {tiles.map(({ label, value }) => (
          <div key={label} className="flex min-w-0 flex-col gap-2">
            <dt className="text-muted-foreground font-sans text-sm break-words">
              {label}
            </dt>
            <dd className="font-mono text-2xl tabular-nums">
              {format.number(value)}
            </dd>
          </div>
        ))}
      </dl>
      {empty && <p className="text-muted-foreground text-sm">{t("empty")}</p>}
      {stats.articles.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noArticles")}</p>
      ) : !empty ? (
        <Table className="table-fixed">
          <TableCaption className="text-foreground mt-0 mb-3 caption-top text-left font-medium">
            {t("articles")}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-1/2 whitespace-normal">
                {t("article")}
              </TableHead>
              <TableHead scope="col" className="text-right whitespace-normal">
                {t("readers")}
              </TableHead>
              <TableHead scope="col" className="text-right whitespace-normal">
                {t("readToEnd")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.articles.map((article) => (
              <TableRow key={article.articleId}>
                <TableHead
                  scope="row"
                  className="py-3 [overflow-wrap:anywhere] whitespace-normal"
                >
                  {article.title}
                </TableHead>
                <TableCell className="text-right font-mono tabular-nums">
                  {format.number(article.readers)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {format.number(article.readToEnd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <p className="text-muted-foreground max-w-prose text-sm">{t("note")}</p>
    </div>
  );
}
