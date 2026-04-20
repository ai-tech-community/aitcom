"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ModelBiasMatrixWidget() {
  const prompts = api.benchmark.listApprovedPrompts.useQuery({
    page: 1,
    pageSize: 50,
  });
  const [promptId, setPromptId] = useState<string>("");
  const dash = api.benchmark.getPromptDashboard.useQuery(
    { promptId, windowDays: 30 },
    { enabled: !!promptId },
  );

  const matrix = dash.data?.matrixRows ?? [];
  const allBrands = Array.from(
    new Set(matrix.flatMap((m) => (m.topBrandIds as string[]) ?? [])),
  ).slice(0, 8);
  const models = matrix.map((m) => m.modelId);

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Model bias matrix</h3>
      </header>
      <Select value={promptId} onValueChange={setPromptId}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a prompt…" />
        </SelectTrigger>
        <SelectContent>
          {prompts.data?.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {models.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="border p-1 text-left">Model</th>
                {allBrands.map((b) => (
                  <th key={b} className="border p-1">
                    {b.slice(0, 8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => {
                const top = (row.topBrandIds as string[]) ?? [];
                return (
                  <tr key={row.modelId}>
                    <td className="border p-1 font-mono">{row.modelId}</td>
                    {allBrands.map((b) => {
                      const idx = top.indexOf(b);
                      const intensity = idx < 0 ? 0 : 1 - idx / 5;
                      return (
                        <td
                          key={b}
                          className="border p-1 text-center"
                          style={{
                            background: `rgba(37, 99, 235, ${intensity})`,
                            color: intensity > 0.5 ? "white" : undefined,
                          }}
                        >
                          {idx < 0 ? "·" : `#${idx + 1}`}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
