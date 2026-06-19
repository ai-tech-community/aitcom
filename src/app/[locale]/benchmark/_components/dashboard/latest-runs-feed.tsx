"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export function LatestRunsFeedWidget() {
  const t = useTranslations("benchmark");
  const runs = api.benchmark.getLatestRunsFeed.useQuery({ limit: 20 });

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <h3 className="text-sm font-medium">Latest runs</h3>
      {runs.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-2 p-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : // Supplementary — a query error leaves this widget absent rather than
      // surfacing an error state (No-Silent-Failure: intentional).
      runs.isError ? null : !runs.data || runs.data.length === 0 ? (
        <EmptyState title={t("noRuns")} />
      ) : (
        <ul className="flex flex-col divide-y text-xs">
          {runs.data.map((r) => (
            <li key={r.id} className="flex justify-between gap-2 p-2">
              <span className="font-mono">
                {r.modelProvider}/{r.modelId}
              </span>
              <span className="text-muted-foreground">
                {new Date(r.capturedAt as unknown as string).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
