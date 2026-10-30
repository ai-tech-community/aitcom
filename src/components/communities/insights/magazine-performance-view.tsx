"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  communityMagazinePath,
  issueStatsPath,
  magazineSettingsPath,
} from "@/lib/magazines/paths";
import type { MagazinePerformance } from "@/server/magazines/stats/community-stats";

export function MagazinePerformanceView({
  data,
  slug,
  onPageChange,
  busy = false,
}: {
  data: MagazinePerformance;
  slug: string;
  onPageChange: (page: number) => void;
  busy?: boolean;
}) {
  const t = useTranslations("communities.insights.magazine");
  const format = useFormatter();
  if (!data.magazine)
    return (
      <EmptyState
        title={t("noMagazine")}
        description={t("noMagazineHelp")}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={magazineSettingsPath(slug)}>{t("createMagazine")}</Link>
          </Button>
        }
      />
    );
  const metrics = [
    { label: t("published"), value: data.summary.publishedIssues },
    { label: t("views"), value: data.summary.views },
    { label: t("readers"), value: data.summary.readers },
    { label: t("subscribers"), value: data.summary.subscribers },
  ];
  return (
    <div className="min-w-0 space-y-5" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium break-words">{data.magazine.name}</h3>
          <p className="text-muted-foreground mt-1 max-w-prose text-sm">
            {t("scopeHelp")}
          </p>
        </div>
        <Link
          href={communityMagazinePath(slug)}
          className="focus-visible:ring-ring/50 shrink-0 rounded-sm text-sm underline underline-offset-4 outline-none focus-visible:ring-[3px]"
        >
          {t("manage")}
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-5 @3xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dt className="text-muted-foreground min-h-10 text-sm">
              {metric.label}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {format.number(metric.value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-sm">
        {t("joinsSummary", { count: data.summary.joins })}
      </p>
      {data.summary.publishedIssues === 0 ? (
        <EmptyState
          title={t("noIssues")}
          description={t("noIssuesHelp")}
          className="py-6"
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t("issues")}</h3>
            <p className="text-muted-foreground text-xs">{t("issueScope")}</p>
          </div>
          {busy && (
            <p role="status" className="text-muted-foreground text-sm">
              {t("loadingPage")}
            </p>
          )}
          <div
            role="region"
            aria-label={t("tableLabel")}
            tabIndex={0}
            className="focus-visible:ring-ring/50 min-w-0 overflow-x-auto rounded-sm outline-none focus-visible:ring-[3px]"
          >
            <table className="w-full min-w-160 text-left text-sm tabular-nums">
              <caption className="sr-only">{t("tableLabel")}</caption>
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th scope="col" className="w-2/5 py-3 pr-4 font-medium">
                    {t("issue")}
                  </th>
                  {["views", "readers", "issueSubscribers", "joins"].map(
                    (key) => (
                      <th
                        scope="col"
                        key={key}
                        className="px-3 py-3 text-right font-medium"
                      >
                        {t(key)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.issues.map((issue) => (
                  <tr key={issue.id}>
                    <th scope="row" className="py-4 pr-4 font-normal">
                      <Link
                        href={issueStatsPath(slug, issue.id)}
                        className="focus-visible:ring-ring/50 decoration-border rounded-sm font-medium break-words underline underline-offset-4 outline-none hover:decoration-current focus-visible:ring-[3px]"
                      >
                        {issue.title}
                      </Link>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t("issueNumber", { number: issue.number })}
                        {issue.publishedAt
                          ? ` · ${format.dateTime(new Date(issue.publishedAt), { dateStyle: "medium" })}`
                          : ""}
                      </p>
                    </th>
                    {[
                      issue.views,
                      issue.readers,
                      issue.subscribers,
                      issue.joins,
                    ].map((value, i) => (
                      <td key={i} className="px-3 py-4 text-right">
                        {format.number(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            aria-label={t("pagination")}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p role="status" className="text-muted-foreground text-sm">
              {t("page", { page: data.page, total: data.totalPages })}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || data.page <= 1}
                onClick={() => onPageChange(data.page - 1)}
              >
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || data.page >= data.totalPages}
                onClick={() => onPageChange(data.page + 1)}
              >
                {t("next")}
              </Button>
            </div>
          </nav>
        </>
      )}
      <details className="border-y py-4 text-sm">
        <summary className="focus-visible:ring-ring/50 w-fit cursor-pointer rounded-sm font-medium outline-none focus-visible:ring-[3px]">
          {t("definitions")}
        </summary>
        <div className="text-muted-foreground mt-3 max-w-prose space-y-3 leading-relaxed">
          <p>{t("viewsHelp")}</p>
          <p>{t("readersHelp")}</p>
          <p>{t("subscribersHelp")}</p>
          <p>{t("joinsHelp")}</p>
        </div>
      </details>
    </div>
  );
}
