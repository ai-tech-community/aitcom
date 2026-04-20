"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PromptFocusWidget() {
  const prompts = api.benchmark.listApprovedPrompts.useQuery({ page: 1, pageSize: 50 });
  const [promptId, setPromptId] = useState<string>("");
  const [mode, setMode] = useState<"weighted" | "raw">("weighted");
  const dash = api.benchmark.getPromptDashboard.useQuery(
    { promptId, windowDays: 30 },
    { enabled: !!promptId },
  );

  const chartData = (dash.data?.rankRows ?? [])
    .map((r) => ({
      brandId: r.brandId,
      score: mode === "weighted" ? Number(r.weightedScore) : r.mentionCount,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Top brands by prompt</h3>
        <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="weighted">Weighted</SelectItem>
            <SelectItem value="raw">Raw count</SelectItem>
          </SelectContent>
        </Select>
      </header>
      <Select value={promptId} onValueChange={setPromptId}>
        <SelectTrigger><SelectValue placeholder="Pick a prompt…" /></SelectTrigger>
        <SelectContent>
          {prompts.data?.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.text}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="h-64">
        {promptId && chartData.length === 0 && dash.isFetched && (
          <p className="py-10 text-center text-sm text-muted-foreground">No mentions yet for this prompt.</p>
        )}
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="brandId" type="category" width={120} />
              <Tooltip />
              <Bar dataKey="score" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
