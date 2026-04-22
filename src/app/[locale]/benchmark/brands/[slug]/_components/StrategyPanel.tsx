"use client";
import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Props {
  brandSlug: string;
  window: 7 | 30 | 90;
}

export function StrategyPanel({ brandSlug, window }: Props) {
  const [hasFetched, setHasFetched] = useState(false);
  const [data, setData] = useState<{
    recommendations: Array<{
      title: string;
      rationale: string;
      severity: "low" | "medium" | "high";
    }>;
    cached: boolean;
  } | null>(null);

  const getStrategy = api.benchmark.brands.getStrategy.useMutation({
    onSuccess: (r) => {
      setData(r);
      setHasFetched(true);
    },
    onError: (err) => toast.error(err.message),
  });

  if (!hasFetched) {
    return (
      <div className="rounded border p-4 text-sm">
        <p className="text-muted-foreground mb-3">
          Get AI-driven strategy recommendations based on this brand&apos;s
          visibility data.
        </p>
        <Button
          size="sm"
          disabled={getStrategy.isPending}
          onClick={() => getStrategy.mutate({ brandSlug, window })}
        >
          {getStrategy.isPending ? "Analyzing…" : "Generate strategy"}
        </Button>
      </div>
    );
  }

  if (!data || data.recommendations.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No recommendations produced. Try again later.
      </p>
    );
  }

  const sevColor = {
    high: "bg-red-100 text-red-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-slate-100 text-slate-700",
  } as const;

  return (
    <div className="flex flex-col gap-3">
      {data.cached && (
        <span className="text-muted-foreground text-xs">
          Cached result (1h TTL)
        </span>
      )}
      <ul className="flex flex-col gap-2">
        {data.recommendations.map((r, i) => (
          <li key={i} className="rounded border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{r.title}</p>
              <Badge className={sevColor[r.severity]} variant="outline">
                {r.severity}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{r.rationale}</p>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="ghost"
        disabled={getStrategy.isPending}
        onClick={() => getStrategy.mutate({ brandSlug, window })}
      >
        {getStrategy.isPending ? "Analyzing…" : "Regenerate"}
      </Button>
    </div>
  );
}
