import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import {
  StartupAddedOverTimeChart,
  StartupCategoryMixChart,
  StartupRegionMixChart,
  StartupSourcesCoverageChart,
  StartupStageMixChart,
} from "@/components/investigations/startups-insights-charts";
import type { StartupsInsightsStats } from "@/lib/investigations/startups-insights";
import { cn } from "@/lib/utils";

export type StartupsInsightsCopy = {
  categoryMixTitle: string;
  regionMixTitle: string;
  stageMixTitle: string;
  sourcesCoverageTitle: string;
  addedOverTimeTitle: string;
  chartCaption: string;
  regionOmitted: string;
  stageOmitted: string;
  sourcesOmitted: string;
  categoryColumn: string;
  regionColumn: string;
  stageColumn: string;
  sourcesColumn: string;
  monthColumn: string;
  countColumn: string;
  empty: string;
  emptyHelp?: string;
};

export function StartupsInsights({
  stats,
  copy,
}: {
  stats: StartupsInsightsStats;
  copy: StartupsInsightsCopy;
}) {
  if (stats.total === 0) {
    return (
      <div data-startups-insights-empty="">
        <EmptyState title={copy.empty} description={copy.emptyHelp} />
      </div>
    );
  }

  return (
    <div
      data-startups-insights-bento
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
        <StartupAddedOverTimeChart
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
        <StartupCategoryMixChart
          data={stats.categoryMix}
          label={copy.categoryMixTitle}
        />
      </InsightTile>

      {stats.regionMix ? (
        <InsightTile
          tile="region-mix"
          title={copy.regionMixTitle}
          caption={copy.chartCaption}
          columns={[copy.regionColumn, copy.countColumn]}
          rows={stats.regionMix.map((row) => [row.region, String(row.count)])}
        >
          <StartupRegionMixChart
            data={stats.regionMix}
            label={copy.regionMixTitle}
          />
        </InsightTile>
      ) : (
        <OmittedTile
          tile="region-mix"
          title={copy.regionMixTitle}
          message={copy.regionOmitted}
        />
      )}

      {stats.stageMix ? (
        <InsightTile
          tile="stage-mix"
          title={copy.stageMixTitle}
          caption={copy.chartCaption}
          columns={[copy.stageColumn, copy.countColumn]}
          rows={stats.stageMix.map((row) => [row.stage, String(row.count)])}
        >
          <StartupStageMixChart
            data={stats.stageMix}
            label={copy.stageMixTitle}
          />
        </InsightTile>
      ) : (
        <OmittedTile
          tile="stage-mix"
          title={copy.stageMixTitle}
          message={copy.stageOmitted}
        />
      )}

      {stats.sourcesCoverage ? (
        <InsightTile
          tile="sources-coverage"
          title={copy.sourcesCoverageTitle}
          caption={copy.chartCaption}
          columns={[copy.sourcesColumn, copy.countColumn]}
          rows={stats.sourcesCoverage.map((row) => [
            row.label,
            String(row.count),
          ])}
        >
          <StartupSourcesCoverageChart
            data={stats.sourcesCoverage}
            label={copy.sourcesCoverageTitle}
          />
        </InsightTile>
      ) : (
        <OmittedTile
          tile="sources-coverage"
          title={copy.sourcesCoverageTitle}
          message={copy.sourcesOmitted}
        />
      )}
    </div>
  );
}

function OmittedTile({
  tile,
  title,
  message,
}: {
  tile: string;
  title: string;
  message: string;
}) {
  const headingId = `${tile}-omitted`;
  return (
    <section
      data-startups-insight-tile={tile}
      data-startups-insight-omitted=""
      aria-labelledby={headingId}
      className="bg-card text-card-foreground flex flex-col gap-4 self-stretch rounded-xl border p-6 shadow-sm"
    >
      <h2 id={headingId} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <p
        data-startups-insight-omitted-copy=""
        className="text-muted-foreground text-sm leading-relaxed"
      >
        {message}
      </p>
    </section>
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
      data-startups-insight-tile={tile}
      aria-labelledby={headingId}
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-4 self-stretch rounded-xl border p-6 shadow-sm",
        wide && "md:col-span-2",
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{caption}</p>
      </div>
      {children}
      <div
        data-startups-insight-table
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
