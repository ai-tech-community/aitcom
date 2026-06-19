"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { getInitials } from "@/lib/avatar";

interface ChallengeLeaderboardProps {
  challengeId: number;
}

type BadgeVariant = "secondary" | "success" | "info";

const statusBadgeConfig: Record<
  string,
  { label: string; variant: BadgeVariant }
> = {
  active: { label: "Active", variant: "secondary" },
  completed: { label: "Completed", variant: "success" },
  submitted: { label: "Submitted", variant: "info" },
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
      <SectionLabel bordered={false} marker={false}>
        {t("leaderboard")}
      </SectionLabel>
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
              <Avatar className="size-6">
                {entry.image && <AvatarImage src={entry.image} alt="" />}
                <AvatarFallback className="font-mono text-xs">
                  {getInitials(entry.displayName)}
                </AvatarFallback>
              </Avatar>
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
                <Badge variant={badgeConfig.variant}>{badgeConfig.label}</Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
