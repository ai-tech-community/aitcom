"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";

export function LatestRunsFeedWidget() {
  const t = useTranslations("benchmark");
  const runs = api.benchmark.getLatestRunsFeed.useQuery({ limit: 20 });
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <h3 className="text-sm font-medium">{t("widgets.latestRuns.title")}</h3>
      <ul className="flex flex-col divide-y text-xs">
        {runs.data?.map((r) => (
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
    </div>
  );
}
