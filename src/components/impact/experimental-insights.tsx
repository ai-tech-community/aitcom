"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type MetricLabel = {
  title: string;
  definition: string;
  calculation: string;
  why: string;
  caveats: string;
};

type ExperimentalItem = {
  key: string;
  value: unknown;
  displayType?: string;
  suffix?: string;
  data?: unknown;
};

type ExperimentalInsightsProps = {
  title: string;
  badge: string;
  openDetails: string;
  labels: Record<string, MetricLabel>;
  values: ExperimentalItem[];
};

const PERSONALITY_COLORS: Record<string, { bg: string; text: string }> = {
  builder: { bg: "bg-emerald-500", text: "text-emerald-600" },
  researcher: { bg: "bg-blue-500", text: "text-blue-600" },
  critic: { bg: "bg-amber-500", text: "text-amber-600" },
  teacher: { bg: "bg-purple-500", text: "text-purple-600" },
};

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  if (typeof value === "string") return value;
  if (value == null) return "-";
  return JSON.stringify(value);
}

function renderDistribution(value: unknown) {
  if (typeof value !== "object" || value == null) {
    return <span className="text-zinc-400">-</span>;
  }
  const dist = value as Record<string, number>;
  const entries = Object.entries(dist);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) {
    return <p className="mt-2 text-sm text-zinc-400">No data yet</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {entries.map(([personality, count]) => {
        const pct = Math.round((count / total) * 100);
        const colors = PERSONALITY_COLORS[personality] ?? {
          bg: "bg-zinc-400",
          text: "text-zinc-600",
        };
        return (
          <div key={personality} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-medium capitalize ${colors.text}`}>
                {personality}
              </span>
              <span className="text-zinc-500 tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full ${colors.bg}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderPercentage(value: unknown) {
  if (typeof value !== "number") {
    return <span className="text-zinc-400">-</span>;
  }
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="mt-2">
      <p className="text-2xl font-bold text-zinc-900">{formatValue(value)}%</p>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-zinc-900"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function renderNumber(value: unknown, suffix?: string) {
  return (
    <p className="mt-2 flex items-baseline gap-1.5">
      <span className="text-2xl font-bold text-zinc-900">
        {formatValue(value)}
      </span>
      {suffix ? <span className="text-sm text-zinc-500">{suffix}</span> : null}
    </p>
  );
}

function renderDuration(value: unknown, suffix?: string) {
  let display: string;
  if (typeof value !== "number" || value == null) {
    display = "-";
  } else if (value < 60) {
    display = `${formatValue(value)} min`;
  } else if (value < 1440) {
    display = `${formatValue(value / 60)} hr`;
  } else {
    display = `${formatValue(value / 1440)} days`;
  }

  return (
    <p className="mt-2 flex items-baseline gap-1.5">
      <span className="text-2xl font-bold text-zinc-900">{display}</span>
      {suffix && display !== "-" ? (
        <span className="text-sm text-zinc-500">{suffix}</span>
      ) : null}
    </p>
  );
}

function renderPairings(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return <p className="mt-2 text-sm text-zinc-400">No pairings yet</p>;
  }
  const pairings = value as Array<{ pair: [string, string]; count: number }>;

  return (
    <ul className="mt-2 space-y-1.5">
      {pairings.map((entry) => {
        const [a, b] = entry.pair;
        const colorA = PERSONALITY_COLORS[a]?.text ?? "text-zinc-600";
        const colorB = PERSONALITY_COLORS[b]?.text ?? "text-zinc-600";
        return (
          <li
            key={`${a}-${b}`}
            className="flex items-center justify-between text-sm"
          >
            <span>
              <span className={`font-medium capitalize ${colorA}`}>{a}</span>
              <span className="mx-1 text-zinc-300">&amp;</span>
              <span className={`font-medium capitalize ${colorB}`}>{b}</span>
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 tabular-nums">
              {entry.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function renderTrend(value: unknown, data: unknown) {
  const trend = typeof value === "string" ? value : "stable";
  const colorMap: Record<string, string> = {
    improving: "bg-emerald-100 text-emerald-800",
    stable: "bg-zinc-100 text-zinc-700",
    declining: "bg-red-100 text-red-800",
  };
  const badge = colorMap[trend] ?? colorMap.stable;

  const trendData =
    data != null && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  const current =
    trendData && typeof trendData.approvalRate4w === "number"
      ? trendData.approvalRate4w
      : null;
  const prev =
    trendData && typeof trendData.approvalRate4wPrev === "number"
      ? trendData.approvalRate4wPrev
      : null;

  return (
    <div className="mt-2 space-y-1.5">
      <span
        className={`inline-block rounded-full px-3 py-1 text-xs font-medium capitalize ${badge}`}
      >
        {trend}
      </span>
      {current != null && prev != null ? (
        <p className="text-xs text-zinc-500">
          {formatValue(current)}% (prev {formatValue(prev)}%)
        </p>
      ) : null}
    </div>
  );
}

function renderMetricValue(item: ExperimentalItem) {
  switch (item.displayType) {
    case "distribution":
      return renderDistribution(item.value);
    case "percentage":
      return renderPercentage(item.value);
    case "number":
      return renderNumber(item.value, item.suffix);
    case "duration":
      return renderDuration(item.value, item.suffix);
    case "pairings":
      return renderPairings(item.value);
    case "trend":
      return renderTrend(item.value, item.data);
    default:
      return (
        <p className="mt-2 text-2xl font-bold text-zinc-900">
          {formatValue(item.value)}
          {item.suffix ? ` ${item.suffix}` : ""}
        </p>
      );
  }
}

export function ExperimentalInsights({
  title,
  badge,
  openDetails,
  labels,
  values,
}: ExperimentalInsightsProps) {
  const detailsByKey = labels;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-zinc-900">{title}</h3>
        <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 font-mono text-[9px] tracking-widest text-zinc-600 uppercase">
          {badge}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {values.map((item) => {
          const detail = detailsByKey[item.key];
          if (!detail) {
            return (
              <article
                key={item.key}
                className="rounded-lg border border-zinc-200 bg-white/80 p-4"
              >
                <p className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                  {item.key}
                </p>
                {renderMetricValue(item)}
              </article>
            );
          }
          return (
            <article
              key={item.key}
              className="rounded-lg border border-zinc-200 bg-white/80 p-4"
            >
              <p className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                {detail.title}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{detail.definition}</p>
              {renderMetricValue(item)}
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    className="mt-3 font-mono text-[10px] tracking-widest text-zinc-600 uppercase underline underline-offset-2"
                    type="button"
                  >
                    {openDetails}
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{detail.title}</DialogTitle>
                    <DialogDescription>{detail.definition}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 text-sm text-zinc-700">
                    <p>
                      <strong>Calculation:</strong> {detail.calculation}
                    </p>
                    <p>
                      <strong>Why:</strong> {detail.why}
                    </p>
                    <p>
                      <strong>Caveats:</strong> {detail.caveats}
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </article>
          );
        })}
      </div>
    </section>
  );
}
