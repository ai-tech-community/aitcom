"use client";

import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { TeamHeatmapPublic } from "@/components/hackathon/team-heatmap-public";
import { prizeRecipients } from "@/server/hackathon/winners";

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
  // The gallery only ever shows submitted teams, so link it as soon as the
  // first submission exists (post-lock by construction).
  const hasSubmissions = data.some((team) => team.submitted);
  // The winner badge follows the disbursement marker (prizeAwarded), not
  // finalRank === 1: a re-finalize recomputes ranks but never re-pays, so the
  // current rank-1 team may not be the team that received the prize. Legacy
  // data without the marker falls back to rank 1; pre-finalize both are empty.
  const prizeTeamIds = new Set(prizeRecipients(data).map((t) => t.teamId));

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <SectionLabel as="span" bordered={false}>
          {t("leaderboard")}
        </SectionLabel>
        <span className="flex items-center gap-4">
          {hasSubmissions && eventSlug ? (
            <Link
              href={`/events/${eventSlug}/projects`}
              className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider underline underline-offset-4 transition-colors"
            >
              {t("viewGallery")} →
            </Link>
          ) : null}
          {finalized && eventSlug ? (
            <Link
              href={`/events/${eventSlug}/winners`}
              className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider underline underline-offset-4 transition-colors"
            >
              {t("viewWinners")} →
            </Link>
          ) : null}
        </span>
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
                {prizeTeamIds.has(team.teamId) ? (
                  <Badge variant="success">{t("winner")}</Badge>
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
