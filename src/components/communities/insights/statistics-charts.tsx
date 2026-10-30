"use client";

import { useId } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyStatistics } from "@/server/communities/statistics";

/** Geometry is supplementary: the same values are available in a native table. */
export function StatisticsChart({
  data,
  kind,
}: {
  data: DailyStatistics[];
  kind: "participation" | "growth";
}) {
  const t = useTranslations("communities.insights.statistics");
  const format = useFormatter();
  const headingId = useId();
  const participation = kind === "participation";
  const series = participation
    ? [
        { key: "memberContributions", label: t("memberSeries") },
        { key: "agentContributions", label: t("agentSeries") },
      ]
    : [
        { key: "joins", label: t("joinsSeries") },
        { key: "leaves", label: t("leavesSeries") },
      ];
  const dateLabel = (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const title = t(participation ? "participationTitle" : "growthTitle");
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-4">
      <div>
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm @4xl:min-h-16">
          {t(participation ? "participationDescription" : "growthDescription")}
        </p>
      </div>
      <div
        className="flex flex-wrap gap-x-5 gap-y-2 text-xs"
        aria-hidden="true"
      >
        {series.map((item, i) => (
          <span key={item.key} className="flex items-center gap-2">
            <span
              className={
                i === 0
                  ? "border-chart-2 w-5 border-t-2"
                  : "border-chart-3 w-5 border-t-2 border-dashed"
              }
            />
            {item.label}
          </span>
        ))}
      </div>
      <div className="h-56 w-full min-w-0 text-xs" aria-hidden="true">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          initialDimension={{ width: 1, height: 224 }}
        >
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
            accessibilityLayer={false}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={dateLabel}
              minTickGap={36}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tickFormatter={(value: number) =>
                format.number(value, { notation: "compact" })
              }
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              labelFormatter={(label) => dateLabel(String(label))}
              formatter={(value) => format.number(Number(value))}
              contentStyle={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--foreground)",
              }}
            />
            {series.map((item, i) => (
              <Line
                key={item.key}
                dataKey={item.key}
                name={item.label}
                type="linear"
                stroke={i === 0 ? "var(--chart-2)" : "var(--chart-3)"}
                strokeWidth={2}
                strokeDasharray={i === 0 ? undefined : "5 4"}
                dot={false}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="group border-t pt-3">
        <summary className="focus-visible:ring-ring/50 hover:text-foreground text-muted-foreground w-fit cursor-pointer rounded-sm text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]">
          {t("showTable")}
        </summary>
        <div
          role="region"
          aria-label={t("tableLabel", { title })}
          tabIndex={0}
          className="focus-visible:ring-ring/50 mt-3 max-h-72 overflow-auto rounded-sm outline-none focus-visible:ring-[3px]"
        >
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="sr-only">{t("tableLabel", { title })}</caption>
            <thead className="bg-background sticky top-0">
              <tr>
                <th className="p-2 font-medium" scope="col">
                  {t("dateUtc")}
                </th>
                {series.map((item) => (
                  <th
                    key={item.key}
                    className="p-2 text-right font-medium"
                    scope="col"
                  >
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((day) => (
                <tr key={day.date}>
                  <th scope="row" className="p-2 font-normal whitespace-nowrap">
                    {dateLabel(day.date)}
                  </th>
                  {series.map((item) => (
                    <td key={item.key} className="p-2 text-right">
                      {format.number(
                        day[item.key as keyof Omit<DailyStatistics, "date">],
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
