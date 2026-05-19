"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BENCHMARK_STAT_DEFINITIONS,
  type BenchmarkStatKey,
} from "@/lib/benchmark-stat-definitions";
import { cn } from "@/lib/utils";

/**
 * Stat label with a (i) icon that opens a popover containing a short
 * plain-English definition and a "Read more →" link to the relevant
 * section of /benchmark/about. Use this anywhere a benchmark stat name
 * is rendered. See ADR-0009 decision 3.
 */
export function StatLabel({
  stat,
  className,
  size = "default",
}: {
  stat: BenchmarkStatKey;
  className?: string;
  size?: "default" | "sm";
}) {
  const def = BENCHMARK_STAT_DEFINITIONS[stat];
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span>{def.label}</span>
      <Popover>
        <PopoverTrigger
          aria-label={`What is ${def.label}?`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center"
        >
          <Info
            className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")}
            aria-hidden
          />
        </PopoverTrigger>
        <PopoverContent className="text-sm" align="start" sideOffset={4}>
          <p className="font-medium">{def.label}</p>
          <p className="text-muted-foreground mt-1">{def.shortDef}</p>
          <Link
            href={`/benchmark/about#${def.anchor}`}
            className="text-primary mt-2 inline-block text-xs underline-offset-4 hover:underline"
          >
            Read more →
          </Link>
        </PopoverContent>
      </Popover>
    </span>
  );
}
