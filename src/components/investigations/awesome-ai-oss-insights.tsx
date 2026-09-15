import { EmptyState } from "@/components/ui/empty-state";
import {
  AwesomeAddedOverTimeChart,
  AwesomeCategoryMixChart,
  AwesomeHostMixChart,
  AwesomeStarDistributionChart,
  AwesomeTopLiveStarsChart,
} from "@/components/investigations/awesome-ai-oss-insights-charts";
import type { AwesomeInsightsStats } from "@/lib/investigations/awesome-ai-oss-insights";

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
    <div className="flex flex-col gap-10">
      <InsightBlock
        title={copy.categoryMixTitle}
        caption={copy.chartCaption}
        columns={[copy.categoryColumn, copy.countColumn]}
        rows={stats.categoryMix.map((row) => [row.label, String(row.count)])}
      >
        <AwesomeCategoryMixChart
          data={stats.categoryMix}
          label={copy.categoryMixTitle}
        />
      </InsightBlock>

      <InsightBlock
        title={copy.hostMixTitle}
        caption={copy.chartCaption}
        columns={[copy.hostColumn, copy.countColumn]}
        rows={stats.hostMix.map((row) => [row.label, String(row.count)])}
      >
        <AwesomeHostMixChart data={stats.hostMix} label={copy.hostMixTitle} />
      </InsightBlock>

      <InsightBlock
        title={copy.addedOverTimeTitle}
        caption={copy.chartCaption}
        columns={[copy.monthColumn, copy.countColumn]}
        rows={stats.addedOverTime.map((row) => [row.label, String(row.count)])}
      >
        <AwesomeAddedOverTimeChart
          data={stats.addedOverTime}
          label={copy.addedOverTimeTitle}
        />
      </InsightBlock>

      {stats.starDistribution && stats.topLiveStars ? (
        <>
          <InsightBlock
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
          </InsightBlock>
          <InsightBlock
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
          </InsightBlock>
        </>
      ) : (
        <p
          data-awesome-stars-omitted
          className="text-muted-foreground text-sm leading-relaxed"
        >
          {copy.starsOmitted}
        </p>
      )}
    </div>
  );
}

function InsightBlock({
  title,
  caption,
  columns,
  rows,
  children,
}: {
  title: string;
  caption: string;
  columns: [string, string];
  rows: Array<[string, string]>;
  children: React.ReactNode;
}) {
  const headingId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div className="space-y-1">
        <h2 id={headingId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{caption}</p>
      </div>
      <div className="overflow-x-auto">
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
      {children}
    </section>
  );
}
