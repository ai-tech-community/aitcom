"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";

interface ChallengeLeaderboardProps {
  challengeId: number;
}

export function ChallengeLeaderboard({
  challengeId,
}: ChallengeLeaderboardProps) {
  const t = useTranslations("challenges");
  const { data, isLoading } = api.challenges.getLeaderboard.useQuery({
    challengeId,
    limit: 10,
  });

  if (isLoading || !data || data.length === 0) return null;

  return (
    <div className="mt-4">
      <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
        {t("leaderboard")}
      </span>
      <div className="mt-2 space-y-1">
        {data.map((entry) => (
          <div
            key={entry.userId}
            className="flex items-center gap-3 rounded px-2 py-1.5 text-sm"
          >
            <span className="w-6 font-mono text-xs text-muted-foreground">
              #{entry.rank}
            </span>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[10px] font-medium text-muted-foreground">
              {entry.displayName.charAt(0).toUpperCase()}
            </div>
            <span className="flex-1 font-medium">{entry.displayName}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {entry.completedObjectives} obj
              {entry.status === "completed" && " \u2713"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
