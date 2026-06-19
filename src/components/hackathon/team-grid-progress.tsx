"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";

export function TeamGridProgress({ teamId }: { teamId: string }) {
  const t = useTranslations("hackathon");
  const { data, isError } = api.hackathon.teamGridStatus.useQuery({ teamId });
  if (isError) return null; // supplementary — may stay absent (No-Silent-Failure)
  if (!data || data.total === 0) return null;

  const done = data.byStatus.completed ?? 0;
  const pct = Math.round((done / data.total) * 100);

  return (
    <div className="mt-3">
      <div className="text-muted-foreground flex items-center justify-between font-mono text-xs">
        <span>{t("progress")}</span>
        <span>{t("cellsDone", { done, total: data.total })}</span>
      </div>
      <Progress value={pct} className="mt-1" />
    </div>
  );
}
