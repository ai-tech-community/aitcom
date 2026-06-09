"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export function TeamLeaderboard({ challengeId }: { challengeId: number }) {
  const t = useTranslations("hackathon");
  const { data, isLoading } = api.hackathon.teamLeaderboard.useQuery({
    challengeId,
  });
  if (isLoading || !data || data.length === 0) return null;

  return (
    <div className="mt-4">
      <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        {t("leaderboard")}
      </span>
      <div className="mt-2 space-y-1">
        {data.map((team, i) => {
          const privateCount = team.memberCount - team.memberFaces.length;
          return (
            <div
              key={team.teamId}
              className="flex items-center gap-3 rounded px-2 py-1.5 text-sm"
            >
              <span className="text-muted-foreground w-6 font-mono text-xs">
                #{team.finalRank ?? i + 1}
              </span>
              <span className="flex-1 font-medium">{team.name}</span>
              <span className="text-muted-foreground truncate font-mono text-xs">
                {team.memberFaces.join(", ")}
                {privateCount > 0 ? ` +${privateCount}` : ""}
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                {team.score} {t("score")}
              </span>
              {team.finalRank === 1 ? (
                <Badge
                  variant="secondary"
                  className="bg-green-500/15 text-green-600 dark:text-green-400"
                >
                  {t("winner")}
                </Badge>
              ) : null}
              {team.submitted ? (
                <Badge variant="secondary">{t("submitted")}</Badge>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
