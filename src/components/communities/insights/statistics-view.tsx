"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import type {
  CommunityStatistics,
  CountComparison,
} from "@/server/communities/statistics";
import { StatisticsChart } from "./statistics-charts";

function Comparison({ value }: { value: CountComparison }) {
  const t = useTranslations("communities.insights.statistics");
  const format = useFormatter();
  return (
    <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
      {value.percentChange === null
        ? t("noPriorActivity", {
            change: format.number(value.change, { signDisplay: "exceptZero" }),
          })
        : t("change", {
            change: format.number(value.change, { signDisplay: "exceptZero" }),
            percent: format.number(value.percentChange / 100, {
              style: "percent",
              maximumFractionDigits: 0,
              signDisplay: "exceptZero",
            }),
          })}
    </p>
  );
}

export function StatisticsView({
  data,
  slug,
}: {
  data: CommunityStatistics;
  slug: string;
}) {
  const t = useTranslations("communities.insights.statistics");
  const format = useFormatter();
  const date = (iso: string) =>
    format.dateTime(new Date(iso), {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const periodEnd = new Date(+new Date(data.period.end) - 1).toISOString();
  const previousEnd = new Date(+new Date(data.period.start) - 1).toISOString();
  const hasActivity = data.daily.some(
    (day) =>
      day.memberContributions +
        day.agentContributions +
        day.joins +
        day.leaves >
      0,
  );
  const maxArea = Math.max(
    1,
    ...data.areas.map(
      (area) => area.memberContributions + area.agentContributions,
    ),
  );
  const columns = [
    {
      label: t("currentMembers"),
      value: data.members.active,
      comparison: null,
    },
    {
      label: t("contributors"),
      value: data.metrics.contributors.current,
      comparison: data.metrics.contributors,
    },
    {
      label: t("contributions"),
      value: data.metrics.contributions.current,
      comparison: data.metrics.contributions,
    },
    {
      label: t("recordedJoins"),
      value: data.metrics.joins.current,
      comparison: data.metrics.joins,
    },
  ];
  return (
    <div className="space-y-7">
      <div
        className="text-muted-foreground space-y-1 text-sm"
        aria-live="polite"
      >
        <p className="text-foreground font-medium">
          {t("period", {
            start: date(data.period.start),
            end: date(periodEnd),
          })}
        </p>
        <p>
          {t("comparedWith", {
            start: date(data.period.previousStart),
            end: date(previousEnd),
          })}
        </p>
      </div>
      <dl className="grid grid-cols-2 border-y @3xl:grid-cols-4">
        {columns.map((item, i) => (
          <div
            key={item.label}
            className={`min-w-0 py-5 ${i % 2 === 0 ? "pr-4" : "border-l pl-4"} ${i >= 2 ? "border-t @3xl:border-t-0 @3xl:border-l @3xl:pl-4" : ""}`}
          >
            <dt className="text-muted-foreground min-h-10 text-sm">
              {item.label}
            </dt>
            <dd className="mt-2">
              <span className="block text-3xl font-semibold tracking-tight tabular-nums">
                {format.number(item.value)}
              </span>
              {item.comparison ? (
                <Comparison value={item.comparison} />
              ) : (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("liveSnapshot")}
                </p>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {!hasActivity && (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          className="bg-muted/30 rounded-lg py-6"
        />
      )}
      {data.members.active === 0 && (
        <EmptyState
          title={t("noMembersTitle")}
          description={t("noMembersDescription")}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={`/communities/${slug}/settings/members` as never}>
                {t("manageMembers")}
              </Link>
            </Button>
          }
          className="py-4"
        />
      )}
      <div className="grid gap-8 @4xl:grid-cols-2">
        <StatisticsChart data={data.daily} kind="participation" />
        <StatisticsChart data={data.daily} kind="growth" />
      </div>
      <div className="grid gap-8 border-t pt-6 @3xl:grid-cols-[3fr_2fr]">
        <section className="min-w-0">
          <SectionLabel>{t("areasTitle")}</SectionLabel>
          <p className="text-muted-foreground mt-3 text-sm">
            {t("areasDescription")}
          </p>
          <table className="mt-4 w-full text-sm tabular-nums">
            <caption className="sr-only">{t("areasTitle")}</caption>
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th scope="col" className="pb-3 text-left font-normal">
                  {t("area")}
                </th>
                <th scope="col" className="pb-3 text-right font-normal">
                  {t("memberSeries")}
                </th>
                <th scope="col" className="pb-3 pl-3 text-right font-normal">
                  {t("agentSeries")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.areas.map((area) => (
                <tr key={area.key}>
                  <th
                    scope="row"
                    className="w-1/2 py-2 pr-4 text-left font-normal"
                  >
                    <span>{t(`areas.${area.key}`)}</span>
                    <div
                      aria-hidden="true"
                      className="bg-muted mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full"
                    >
                      <span
                        className="bg-chart-2 h-full"
                        style={{
                          width: `${(area.memberContributions / maxArea) * 100}%`,
                        }}
                      />
                      <span
                        className="bg-chart-3 h-full"
                        style={{
                          width: `${(area.agentContributions / maxArea) * 100}%`,
                        }}
                      />
                    </div>
                  </th>
                  <td className="py-2 text-right">
                    {format.number(area.memberContributions)}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    {format.number(area.agentContributions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="min-w-0">
          <SectionLabel>{t("contextTitle")}</SectionLabel>
          <dl className="mt-2 divide-y text-sm">
            <div className="flex items-start justify-between gap-4 py-3">
              <dt>
                <span>{t("returning")}</span>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("returningHelp")}
                </p>
              </dt>
              <dd className="font-medium tabular-nums">
                {format.number(data.returningContributors)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <dt>{t("agentContributions")}</dt>
              <dd className="text-right font-medium tabular-nums">
                {format.number(data.metrics.agentContributions.current)}
                <Comparison value={data.metrics.agentContributions} />
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <dt>{t("recordedLeaves")}</dt>
              <dd className="text-right font-medium tabular-nums">
                {format.number(data.metrics.leaves.current)}
                <Comparison value={data.metrics.leaves} />
              </dd>
            </div>
          </dl>
          <div className="mt-4 border-t pt-4">
            <p className="text-muted-foreground text-xs">
              {t("snapshotAt", {
                at: format.dateTime(new Date(data.generatedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                }),
              })}
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt>{t("pending")}</dt>
                <dd className="tabular-nums">
                  {format.number(data.members.pending)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t("invited")}</dt>
                <dd className="tabular-nums">
                  {format.number(data.members.invited)}
                </dd>
              </div>
            </dl>
            <Link
              href={`/communities/${slug}/settings/members` as never}
              className="focus-visible:ring-ring/50 mt-4 inline-block rounded-sm text-sm underline underline-offset-4 outline-none focus-visible:ring-[3px]"
            >
              {t("manageMembers")}
            </Link>
          </div>
        </section>
      </div>
      <details className="border-y py-4 text-sm">
        <summary className="focus-visible:ring-ring/50 w-fit cursor-pointer rounded-sm font-medium outline-none focus-visible:ring-[3px]">
          {t("definitionsTitle")}
        </summary>
        <div className="text-muted-foreground mt-3 max-w-prose space-y-3 leading-relaxed">
          <p>{t("definitionsActivity")}</p>
          <p>{t("definitionsContributors")}</p>
          <p>{t("definitionsGrowth")}</p>
          <p>{t("definitionsCoverage")}</p>
        </div>
      </details>
    </div>
  );
}
