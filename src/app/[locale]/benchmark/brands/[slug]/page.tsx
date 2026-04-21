"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function BrandProfilePage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const profile = api.benchmark.getBrandProfile.useQuery({ slug });
  const trend = api.benchmark.getTrend.useQuery(
    { brandId: profile.data?.brand.id ?? "", windowDays: 90 },
    { enabled: Boolean(profile.data?.brand.id) },
  );

  const trendData = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; pct: number; count: number }
    >();
    for (const r of trend.data ?? []) {
      const date = (r.date as unknown as string).slice(0, 10);
      const cur = byDate.get(date) ?? { date, pct: 0, count: 0 };
      cur.pct += Number(r.mentionPct);
      cur.count += 1;
      byDate.set(date, cur);
    }
    return [...byDate.values()]
      .map((x) => ({
        date: x.date,
        value: x.count > 0 ? x.pct / x.count : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [trend.data]);

  if (profile.isLoading) {
    return (
      <main className="container mx-auto p-6">
        <div className="bg-muted/50 h-40 w-full animate-pulse rounded" />
      </main>
    );
  }
  if (profile.error || !profile.data) {
    return (
      <main className="container mx-auto flex flex-col gap-4 p-6">
        <Link
          href="/benchmark"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <p>Brand not found.</p>
      </main>
    );
  }

  const { brand, mentions } = profile.data;

  const modelSet = new Set(
    mentions.map((m) => `${m.modelProvider}/${m.modelId}`),
  );
  const sentimentCounts = mentions.reduce(
    (acc, m) => {
      acc[m.sentiment] = (acc[m.sentiment] ?? 0) + 1;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 } as Record<string, number>,
  );
  const firstSeen = mentions.length
    ? mentions.reduce((a, b) =>
        new Date(a.capturedAt as unknown as string) <
        new Date(b.capturedAt as unknown as string)
          ? a
          : b,
      ).capturedAt
    : null;
  const lastSeen = mentions.length
    ? mentions.reduce((a, b) =>
        new Date(a.capturedAt as unknown as string) >
        new Date(b.capturedAt as unknown as string)
          ? a
          : b,
      ).capturedAt
    : null;

  const fmtDate = (d: string | Date | null) =>
    d ? new Date(d as unknown as string).toLocaleDateString() : "—";

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <Link
        href="/benchmark"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{brand.canonicalName}</h1>
        {brand.website && (
          <a
            className="text-sm text-blue-600 underline"
            href={brand.website}
            target="_blank"
            rel="noreferrer"
          >
            {brand.website}
          </a>
        )}
        {brand.aliases.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {brand.aliases.map((a) => (
              <Badge key={a} variant="secondary">
                {a}
              </Badge>
            ))}
          </div>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Mentions" value={mentions.length.toLocaleString()} />
        <Stat label="Models" value={modelSet.size.toLocaleString()} />
        <Stat label="Positive" value={`${sentimentCounts.positive}`} />
        <Stat label="First seen" value={fmtDate(firstSeen)} />
        <Stat label="Last seen" value={fmtDate(lastSeen)} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Trend over 90 days</h2>
        <Card className="h-64 p-4">
          {trendData.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground text-sm">
                No trend data yet.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={(v: number) => `${Math.round(v)}%`}
                  fontSize={11}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  formatter={(v: unknown) =>
                    typeof v === "number" ? `${v.toFixed(1)}%` : ""
                  }
                  labelFormatter={(l: unknown) =>
                    typeof l === "string"
                      ? l
                      : typeof l === "number"
                        ? String(l)
                        : ""
                  }
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Recent mentions across models</h2>
        {mentions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No mentions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mentions.map((m, i) => (
              <li
                key={i}
                className="flex flex-col gap-1 rounded-md border p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">
                    {m.modelProvider}/{m.modelId}
                  </span>
                  <Badge
                    variant={
                      m.sentiment === "positive"
                        ? "default"
                        : m.sentiment === "negative"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {m.sentiment}
                  </Badge>
                </div>
                {m.context && (
                  <p className="text-muted-foreground">
                    &ldquo;{m.context}&rdquo;
                  </p>
                )}
                <span className="text-muted-foreground text-xs">
                  {new Date(m.capturedAt as unknown as string).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4 text-center">
      <span className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </span>
      <span className="text-xl tabular-nums">{value}</span>
    </Card>
  );
}
