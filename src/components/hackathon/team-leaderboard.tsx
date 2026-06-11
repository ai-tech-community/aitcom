"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { TeamHeatmapPublic } from "@/components/hackathon/team-heatmap-public";

export function TeamLeaderboard({
  challengeId,
  eventSlug,
}: {
  challengeId: number;
  eventSlug?: string;
}) {
  const t = useTranslations("hackathon");
  const { data, isLoading } = api.hackathon.teamLeaderboard.useQuery({
    challengeId,
  });
  if (isLoading || !data || data.length === 0) return null;

  // finalRank is only ever stamped by finalizeHackathon, so its presence is
  // the public signal that the hackathon is finalized and winners exist.
  const finalized = data.some((team) => team.finalRank !== null);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          {t("leaderboard")}
        </span>
        {finalized && eventSlug ? (
          <Link
            href={`/events/${eventSlug}/winners`}
            className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider underline underline-offset-4 transition-colors"
          >
            {t("viewWinners")} →
          </Link>
        ) : null}
      </div>
      <div className="mt-2 space-y-1">
        {data.map((team, i) => {
          const privateCount = team.memberCount - team.memberFaces.length;
          return (
            <div key={team.teamId} className="rounded px-2 py-1.5">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-6 font-mono text-xs">
                  #{team.finalRank ?? i + 1}
                </span>
                <span className="flex-1 font-medium">{team.name}</span>
                <span className="text-muted-foreground truncate font-mono text-xs">
                  {team.memberFaces.map((face) => face.displayName).join(", ")}
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
              <div className="mt-1 pl-9">
                <TeamHeatmapPublic teamId={team.teamId} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
