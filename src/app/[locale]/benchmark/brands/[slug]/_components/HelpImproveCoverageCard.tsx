"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  BENCHMARK_MODEL_SURFACE_LABELS,
  type BenchmarkModelSurface,
} from "@/lib/benchmark-constants";

type Row = {
  prompt_id: string;
  text: string;
};

/**
 * Funnel from brand profiles back into the Contribute lane. Shown when
 * any of the brand's top prompts have under-covered cells. Each gap
 * surface gets a button that deep-links to /benchmark/contribute with
 * the surface + relevant prompt ids pre-selected. See ADR-0009
 * decision 4.
 */
export function HelpImproveCoverageCard({ topPrompts }: { topPrompts: Row[] }) {
  const promptIds = topPrompts.slice(0, 10).map((p) => p.prompt_id);
  const coverage = api.benchmark.listPromptCoverage.useQuery(
    { promptIds, windowDays: 30 },
    { enabled: promptIds.length > 0 },
  );

  if (!coverage.data || promptIds.length === 0) return null;

  // Aggregate gap prompt ids by surface.
  const gapsBySurface = new Map<BenchmarkModelSurface, string[]>();
  for (const promptId of promptIds) {
    const cells = coverage.data.byPrompt[promptId];
    if (!cells) continue;
    for (const cell of cells) {
      if (cell.meetsThreshold) continue;
      const arr = gapsBySurface.get(cell.modelSurface) ?? [];
      arr.push(promptId);
      gapsBySurface.set(cell.modelSurface, arr);
    }
  }

  if (gapsBySurface.size === 0) return null;

  const entries = Array.from(gapsBySurface.entries()).sort(
    ([, a], [, b]) => b.length - a.length,
  );

  return (
    <section className="bg-primary/5 flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary h-5 w-5" aria-hidden />
        <h2 className="font-medium">Help improve coverage</h2>
      </div>
      <p className="text-muted-foreground text-sm">
        These AI products don&rsquo;t yet have enough community runs for this
        brand. Grabbing a few prompts on any of them will lift the
        headline numbers above the threshold.
      </p>
      <ul className="flex flex-col gap-2">
        {entries.map(([surface, prompts]) => (
          <li
            key={surface}
            className="flex items-center justify-between gap-2 rounded-md border bg-background p-2 text-sm"
          >
            <span>
              <span className="font-medium">
                {BENCHMARK_MODEL_SURFACE_LABELS[surface]}
              </span>{" "}
              <span className="text-muted-foreground">
                · {prompts.length} prompt{prompts.length === 1 ? "" : "s"} need
                more contributors
              </span>
            </span>
            <Button size="sm" asChild>
              <Link
                href={`/benchmark/contribute?surface=${surface}&prompts=${prompts.join(",")}`}
              >
                Help
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
