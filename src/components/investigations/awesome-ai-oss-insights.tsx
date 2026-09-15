import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import {
  AwesomeAddedOverTimeChart,
  AwesomeCategoryMixChart,
  AwesomeHostMixChart,
  AwesomeStarDistributionChart,
  AwesomeTopLiveStarsChart,
} from "@/components/investigations/awesome-ai-oss-insights-charts";
import type { AwesomeInsightsStats } from "@/lib/investigations/awesome-ai-oss-insights";
import { cn } from "@/lib/utils";

export type AwesomeAiOssInsightsCopy = {
  categoryMixTitle: string;
  hostMixTitle: string;
  addedOverTimeTitle: string;
  starDistributionTitle: string;
  topStarsTitle: string;
  chartCaption: string;
  starsOmitted: string;
  categoryColumn: string;
  hostColumn: string;
  monthColumn: string;
  countColumn: string;
  projectColumn: string;
  liveStarColumn: string;
  empty: string;
};

export function AwesomeAiOssInsights({
  stats,
  copy,
}: {
  stats: AwesomeInsightsStats;
  copy: AwesomeAiOssInsightsCopy;
}) {
  if (stats.total === 0) {
    return <EmptyState title={copy.empty} />;
  }

  return (
    <div
      data-awesome-insights-bento
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
    >
      <InsightTile
        tile="added-over-time"
        wide
        title={copy.addedOverTimeTitle}
        caption={copy.chartCaption}
        columns={[copy.monthColumn, copy.countColumn]}
        rows={stats.addedOverTime.map((row) => [row.label, String(row.count)])}
      >
        <AwesomeAddedOverTimeChart
          data={stats.addedOverTime}
          label={copy.addedOverTimeTitle}
          className="h-80"
        />
      </InsightTile>

      <InsightTile
        tile="category-mix"
        title={copy.categoryMixTitle}
        caption={copy.chartCaption}
        columns={[copy.categoryColumn, copy.countColumn]}
        rows={stats.categoryMix.map((row) => [row.label, String(row.count)])}
      >
        <AwesomeCategoryMixChart
          data={stats.categoryMix}
          label={copy.categoryMixTitle}
        />
      </InsightTile>

      <InsightTile
        tile="host-mix"
        title={copy.hostMixTitle}
        caption={copy.chartCaption}
        columns={[copy.hostColumn, copy.countColumn]}
        rows={stats.hostMix.map((row) => [row.label, String(row.count)])}
      >
        <AwesomeHostMixChart data={stats.hostMix} label={copy.hostMixTitle} />
      </InsightTile>

      {stats.starDistribution ? (
        <InsightTile
          tile="star-distribution"
          title={copy.starDistributionTitle}
          caption={copy.chartCaption}
          columns={[copy.liveStarColumn, copy.countColumn]}
          rows={stats.starDistribution.map((row) => [
            row.label,
            String(row.count),
          ])}
        >
          <AwesomeStarDistributionChart
            data={stats.starDistribution}
            label={copy.starDistributionTitle}
          />
        </InsightTile>
      ) : (
        <p
          data-awesome-stars-omitted
          className="text-muted-foreground text-sm leading-relaxed md:col-span-2"
        >
          {copy.starsOmitted}
        </p>
      )}

      {stats.topLiveStars ? (
        <InsightTile
          tile="top-stars"
          title={copy.topStarsTitle}
          caption={copy.chartCaption}
          columns={[copy.projectColumn, copy.liveStarColumn]}
          rows={stats.topLiveStars.map((row) => [
            row.name,
            String(row.starCount),
          ])}
        >
          <AwesomeTopLiveStarsChart
            data={stats.topLiveStars}
            label={copy.topStarsTitle}
          />
        </InsightTile>
      ) : null}
    </div>
  );
}

function InsightTile({
  tile,
  wide = false,
  title,
  caption,
  columns,
  rows,
  children,
}: {
  tile: string;
  wide?: boolean;
  title: string;
  caption: string;
  columns: [string, string];
  rows: Array<[string, string]>;
  children: ReactNode;
}) {
  const headingId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section
      data-awesome-insight-tile={tile}
      aria-labelledby={headingId}
      className={cn(
        "bg-card text-card-foreground flex h-full flex-col gap-4 rounded-xl border p-6 shadow-sm",
        wide && "md:col-span-2",
      )}
    >
      <div className="space-y-1">
        <h2 id={headingId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{caption}</p>
      </div>
      {children}
      <div
        data-awesome-insight-table
        className={cn("overflow-auto", wide ? "max-h-56" : "max-h-48")}
      >
        <table className="w-full min-w-56 text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-border text-muted-foreground border-b text-left font-mono text-xs tracking-wider uppercase">
              <th scope="col" className="py-2 pr-4 font-medium">
                {columns[0]}
              </th>
              <th scope="col" className="py-2 font-medium">
                {columns[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, count]) => (
              <tr
                key={`${name}-${count}`}
                className="border-border border-b last:border-0"
              >
                <th scope="row" className="py-2 pr-4 font-normal">
                  {name}
                </th>
                <td className="font-mono tabular-nums">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
