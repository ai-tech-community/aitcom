"use client";

import {
  BENCHMARK_MODEL_SURFACE_LABELS,
  type BenchmarkModelSurface,
} from "@/lib/benchmark-constants";
import { cn } from "@/lib/utils";

export type CoverageCell = {
  modelSurface: BenchmarkModelSurface;
  distinctContributors: number;
  runsTotal: number;
  meetsThreshold: boolean;
  needed: number;
};

/**
 * Per-prompt coverage strip. Renders one chip per supported model
 * surface showing whether that (prompt, surface) cell has enough
 * distinct contributors to surface aggregated metrics
 * ([[adr-0007-byoa-trust-model]] decision 2).
 *
 * Informational only — no claim button, no transactional state. See
 * [[adr-0008-byoa-coverage-strategy]] decision 2.
 *
 * When `onlySurface` is set, only that surface's chip is rendered.
 * Used by /benchmark/contribute under the surface-first model
 * (ADR-0009 decision 2).
 */
export function PromptCoverageStrip({
  cells,
  threshold,
  onlySurface,
}: {
  cells: CoverageCell[] | undefined;
  threshold: number;
  onlySurface?: BenchmarkModelSurface;
}) {
  if (!cells) return null;
  const filtered = onlySurface
    ? cells.filter((c) => c.modelSurface === onlySurface)
    : cells;
  if (filtered.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {filtered.map((c) => (
        <CoverageChip key={c.modelSurface} cell={c} threshold={threshold} />
      ))}
    </ul>
  );
}

function CoverageChip({
  cell,
  threshold,
}: {
  cell: CoverageCell;
  threshold: number;
}) {
  const label = BENCHMARK_MODEL_SURFACE_LABELS[cell.modelSurface];
  const filled = cell.meetsThreshold;
  const partial = !filled && cell.distinctContributors > 0;
  const empty = cell.distinctContributors === 0;

  return (
    <li
      title={
        filled
          ? `${label} — ${cell.distinctContributors} contributors, ${cell.runsTotal} runs (surfaced)`
          : empty
            ? `${label} — needs ${threshold} contributors to surface`
            : `${label} — ${cell.distinctContributors}/${threshold} contributors, needs ${cell.needed} more`
      }
      className={cn(
        "rounded px-1.5 py-0.5 text-xs",
        filled && "bg-emerald-100 text-emerald-900",
        partial && "bg-amber-100 text-amber-900",
        empty && "bg-muted text-muted-foreground",
      )}
    >
      <span className="font-medium">{shortLabel(cell.modelSurface)}</span>{" "}
      <span>
        {cell.distinctContributors}/{threshold}
      </span>
    </li>
  );
}

function shortLabel(s: BenchmarkModelSurface): string {
  switch (s) {
    case "chatgpt_grounded":
      return "ChatGPT+web";
    case "chatgpt_ungrounded":
      return "ChatGPT";
    case "claude_grounded":
      return "Claude+web";
    case "claude_ungrounded":
      return "Claude";
    case "gemini_grounded":
      return "Gemini+web";
    case "gemini_ungrounded":
      return "Gemini";
    case "perplexity":
      return "Perplexity";
    case "kimi_grounded":
      return "Kimi";
  }
}
