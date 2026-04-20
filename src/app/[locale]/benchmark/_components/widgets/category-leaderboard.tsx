"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

export function CategoryLeaderboardWidget() {
  const t = useTranslations("benchmark");
  const categories = api.benchmark.listCategories.useQuery();
  const [categoryId, setCategoryId] = useState("");
  const lb = api.benchmark.getCategoryLeaderboard.useQuery(
    { categoryId, windowDays: 30 },
    { enabled: !!categoryId },
  );

  const rows =
    (lb.data as
      | Array<{ id: string; canonical_name: string; total_weighted: string }>
      | undefined) ?? [];
  const data = rows.map((r) => ({
    name: r.canonical_name,
    score: Number(r.total_weighted),
  }));

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <header>
        <h3 className="text-sm font-medium">{t("widgets.categoryLeaderboard.title")}</h3>
      </header>
      <Select value={categoryId} onValueChange={setCategoryId}>
        <SelectTrigger>
          <SelectValue placeholder={t("widgets.categoryLeaderboard.pickCategory")} />
        </SelectTrigger>
        <SelectContent>
          {categories.data?.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="h-64">
        {data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={140} />
              <Tooltip />
              <Bar dataKey="score" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
