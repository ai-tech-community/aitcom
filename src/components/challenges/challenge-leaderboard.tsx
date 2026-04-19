"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

interface ChallengeLeaderboardProps {
  challengeId: number;
}

const statusBadgeConfig: Record<string, { label: string; className: string }> =
  {
    active: { label: "Active", className: "" },
    completed: {
      label: "Completed",
      className: "bg-green-500/15 text-green-600 dark:text-green-400",
    },
    submitted: {
      label: "Submitted",
      className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    },
  };

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
      <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        {t("leaderboard")}
      </span>
      <div className="mt-2 space-y-1">
        {data.map((entry) => {
          const badgeConfig = statusBadgeConfig[entry.status];

          return (
            <div
              key={entry.userId}
              className="flex items-center gap-3 rounded px-2 py-1.5 text-sm"
            >
              <span className="text-muted-foreground w-6 font-mono text-xs">
                #{entry.rank}
              </span>
              {entry.image ? (
                <Image
                  src={entry.image}
                  alt={entry.displayName}
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="bg-secondary text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-medium">
                  {entry.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="flex-1 font-medium">{entry.displayName}</span>
              <span className="text-muted-foreground font-mono text-xs">
                {entry.completedObjectives} obj
              </span>
              {entry.testScore > 0 && (
                <span className="text-muted-foreground font-mono text-xs">
                  {entry.testScore} tests
                </span>
              )}
              {entry.channelContributions > 0 && (
                <span className="text-muted-foreground font-mono text-xs">
                  {entry.channelContributions} contrib
                </span>
              )}
              {badgeConfig && (
                <Badge variant="secondary" className={badgeConfig.className}>
                  {badgeConfig.label}
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
