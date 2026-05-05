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
  const [data, setData] = useState<{
    recommendations: Array<{
      title: string;
      priority: "low" | "medium" | "high";
      why: string;
      evidence: string[];
      suggestedAction: string;
      relatedPrompts: string[];
      relatedCompetitors: string[];
      relatedSources: string[];
      expectedMetricImpact: string;
    }>;
    cached: boolean;
  } | null>(null);

  const getStrategy = api.benchmark.brands.getStrategy.useMutation({
    onSuccess: (r) => {
      setData(r);
    },
    onError: (err) => toast.error(err.message),
  });

  if (!data) {
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

  const priorityColor = {
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
        {data.recommendations.map((r) => (
          <li
            key={`${r.priority}-${r.title}-${r.suggestedAction}`}
            className="rounded border p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{r.title}</p>
              <Badge className={priorityColor[r.priority]} variant="outline">
                {r.priority}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{r.why}</p>
            {r.suggestedAction && (
              <p className="mt-2 text-xs">
                <span className="font-medium">Action: </span>
                {r.suggestedAction}
              </p>
            )}
            {r.evidence.length > 0 && (
              <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-4 text-xs">
                {r.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {(r.relatedPrompts.length > 0 ||
              r.relatedSources.length > 0 ||
              r.relatedCompetitors.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.relatedPrompts.map((prompt) => (
                  <Badge key={`prompt-${prompt}`} variant="secondary">
                    {prompt}
                  </Badge>
                ))}
                {r.relatedSources.map((source) => (
                  <Badge key={`source-${source}`} variant="outline">
                    {source}
                  </Badge>
                ))}
                {r.relatedCompetitors.map((competitor) => (
                  <Badge key={`competitor-${competitor}`} variant="outline">
                    {competitor}
                  </Badge>
                ))}
              </div>
            )}
            {r.expectedMetricImpact && (
              <p className="text-muted-foreground mt-2 text-xs">
                {r.expectedMetricImpact}
              </p>
            )}
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
