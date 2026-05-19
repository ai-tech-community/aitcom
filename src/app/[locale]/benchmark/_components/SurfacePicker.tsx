"use client";

import { cn } from "@/lib/utils";
import {
  BENCHMARK_MODEL_SURFACES,
  BENCHMARK_MODEL_SURFACE_LABELS,
  type BenchmarkModelSurface,
} from "@/lib/benchmark-constants";

/**
 * The 8 surfaces as a wrapping grid of selectable buttons. Used as the
 * first action on /benchmark/contribute and as the "Change" affordance
 * once a surface is picked. See ADR-0009 decision 2.
 */
export function SurfacePicker({
  value,
  onChange,
}: {
  value: BenchmarkModelSurface | null;
  onChange: (next: BenchmarkModelSurface) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {BENCHMARK_MODEL_SURFACES.map((s) => {
        const selected = s === value;
        return (
          <li key={s}>
            <button
              type="button"
              onClick={() => onChange(s)}
              aria-pressed={selected}
              className={cn(
                "w-full rounded-md border p-3 text-left text-sm transition-colors",
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "hover:border-foreground/30 hover:bg-muted/50",
              )}
            >
              <span className="font-medium">
                {BENCHMARK_MODEL_SURFACE_LABELS[s]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
