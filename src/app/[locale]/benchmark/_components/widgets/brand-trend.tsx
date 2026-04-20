"use client";

import { useMemo, useState } from "react";
import { api } from "@/trpc/react";
import {
  Line,
  LineChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

export function BrandTrendWidget() {
  const t = useTranslations("benchmark");
  const [slug, setSlug] = useState("openai");
  const brand = api.benchmark.getBrandProfile.useQuery(
    { slug },
    { enabled: slug.length > 0, retry: false },
  );
  const [windowDays, setWindowDays] = useState<number>(90);
  const trend = api.benchmark.getTrend.useQuery(
    { brandId: brand.data?.brand.id ?? "", windowDays },
    { enabled: Boolean(brand.data?.brand.id) },
  );

  const chartData = useMemo(() => {
    const grouped = new Map<string, Record<string, number | string>>();
    for (const row of trend.data ?? []) {
      const date = (row.date as unknown as string).slice(0, 10);
      if (!grouped.has(date)) grouped.set(date, { date });
      grouped.get(date)![row.modelId] = Number(row.mentionPct);
    }
    return [...grouped.values()].sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [trend.data]);

  const modelIds = Array.from(
    new Set((trend.data ?? []).map((r) => r.modelId)),
  );

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t("widgets.brandTrend.title")}</h3>
        <Select
          value={String(windowDays)}
          onValueChange={(v) => setWindowDays(Number(v))}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30d</SelectItem>
            <SelectItem value="90">90d</SelectItem>
            <SelectItem value="365">1y</SelectItem>
          </SelectContent>
        </Select>
      </header>
      <Input
        placeholder={t("widgets.brandTrend.slugPlaceholder")}
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
      />
      <div className="h-64">
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              {modelIds.map((m) => (
                <Line key={m} type="monotone" dataKey={m} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
