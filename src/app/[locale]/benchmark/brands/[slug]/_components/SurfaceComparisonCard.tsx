"use client";

import type { ModelSurface } from "@/server/db/schema";

interface Row {
  modelSurface: ModelSurface;
  visibilityPct: number;
  mentionsCount: number;
  runsTotal: number;
}

interface Props {
  rows: Row[];
  windowDays: number;
}

const SURFACE_LABELS: Record<ModelSurface, string> = {
  chatgpt_grounded: "ChatGPT (grounded)",
  chatgpt_ungrounded: "ChatGPT (ungrounded)",
  claude_grounded: "Claude (grounded)",
  claude_ungrounded: "Claude (ungrounded)",
  gemini_grounded: "Gemini (grounded)",
  gemini_ungrounded: "Gemini (ungrounded)",
  perplexity: "Perplexity",
  kimi_grounded: "Kimi (grounded)",
  legacy_unverified: "Legacy (unverified)",
};

export function SurfaceComparisonCard({ rows, windowDays }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No proxy-grade runs yet in the last {windowDays} days. Surface
        comparison populates as auto-seeded runs land.
      </p>
    );
  }

  const max = Math.max(...rows.map((r) => r.visibilityPct), 1);
  const sorted = rows.slice().sort((a, b) => b.visibilityPct - a.visibilityPct);

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((r) => (
        <div
          key={r.modelSurface}
          className="flex items-center gap-3 px-2 py-1 text-sm"
        >
          <span className="w-40 truncate">{SURFACE_LABELS[r.modelSurface]}</span>
          <div className="bg-muted relative h-4 flex-1 overflow-hidden rounded">
            <div
              className="bg-primary absolute inset-y-0 left-0"
              style={{ width: `${(r.visibilityPct / max) * 100}%` }}
            />
          </div>
          <span className="w-14 text-right tabular-nums">
            {r.visibilityPct.toFixed(1)}%
          </span>
          <span className="text-muted-foreground w-20 text-right text-xs tabular-nums">
            {r.mentionsCount}/{r.runsTotal}
          </span>
        </div>
      ))}
    </div>
  );
}
