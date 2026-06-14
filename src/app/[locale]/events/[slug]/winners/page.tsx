import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { api } from "@/trpc/server";
import {
  findPublicEvent,
  resolvePublicHackathonPage,
} from "@/server/hackathon/resolve-public-hackathon";
import { splitPodium, prizeRecipients } from "@/server/hackathon/winners";
import { getHubViewerContext } from "@/server/hackathon/hub-viewer";
import { hubTabStates } from "@/server/hackathon/hub-tabs";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { Link } from "@/i18n/navigation";
import { LockedTabPanel } from "@/components/hackathon/hub/locked-tab-panel";
import { Badge } from "@/components/ui/badge";
import { MemberFaces } from "@/components/hackathon/member-faces";
import type { MemberFace } from "@/components/hackathon/member-faces";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const [event, t] = await Promise.all([
    findPublicEvent(slug, locale as "en" | "nl"),
    getTranslations("hackathon"),
  ]);
  if (!event?.challengeId) return {};

  const title = `${event.title} — ${t("winners")}`;
  const description = t("winnersIntro");
  return {
    title,
    description,
    ...buildOgMeta(title, description),
    alternates: buildAlternates(`/events/${slug}/winners`),
  };
}

export default async function HackathonWinnersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("hackathon");

  // Not a hackathon (no public event / no bound challenge) → no winners page.
  const resolved = await resolvePublicHackathonPage(
    slug,
    locale as "en" | "nl",
  );
  if (!resolved.found) notFound();
  const { challenge, challengeId, phase } = resolved;

  // Finalized-only gate via the shared hub tab state: pre-finalized phases show
  // the locked panel in-place (the tab stays clickable) rather than bouncing
  // back to Overview — winners still must not leak before they exist.
  const viewer = await getHubViewerContext(challengeId, phase);
  const winnersState = hubTabStates(viewer).find((t) => t.key === "winners")!;
  if (!winnersState.available) {
    return <LockedTabPanel message={t(winnersState.lockedReasonKey!)} />;
  }

  const [leaderboard, peoplesChoiceState] = await Promise.all([
    api.hackathon.teamLeaderboard({ challengeId }),
    api.hackathon.peoplesChoiceState({ challengeId }),
  ]);
  const { podium, field } = splitPodium(leaderboard);

  // People's Choice (#169): a parallel community award — surfaced next to the
  // results but never an input to scores or final ranks (ADR-0029 intact).
  const peoplesChoiceTeam = peoplesChoiceState.peoplesChoiceTeamId
    ? (leaderboard.find(
        (t) => t.teamId === peoplesChoiceState.peoplesChoiceTeamId,
      ) ?? null)
    : null;
  const peoplesChoiceVotes = peoplesChoiceTeam
    ? (peoplesChoiceState.counts.find(
        (c) => c.teamId === peoplesChoiceTeam.teamId,
      )?.votes ?? 0)
    : 0;
  // The prize follows the disbursement marker, not the (re-computable) rank:
  // after a re-finalize the current rank-1 team may not be the team that was
  // actually paid. Falls back to rank 1 for legacy data without the marker.
  const prizeTeamIds = new Set(
    prizeRecipients(leaderboard).map((t) => t.teamId),
  );

  const rewards = (challenge.rewards ?? {}) as {
    xpReward?: number | null;
    sponsorReward?: string | null;
    badgeReward?: string | null;
  };
  const prizeParts: string[] = [];
  if (rewards.xpReward) prizeParts.push(`${rewards.xpReward} XP`);
  if (rewards.badgeReward)
    prizeParts.push(`${t("badge")}: ${rewards.badgeReward}`);
  if (rewards.sponsorReward)
    prizeParts.push(`${t("sponsorPrize")}: ${rewards.sponsorReward}`);

  return (
    <div>
      <div className="border-border flex flex-wrap items-center gap-3 border-b pb-4">
        <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("winners").toUpperCase()}
        </h2>
        <Badge variant="secondary">{t("statusFinalized")}</Badge>
      </div>
      <p className="text-muted-foreground mt-4 text-sm">{t("winnersIntro")}</p>

      {/* Podium */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {podium.map((team) => (
          <div
            key={team.teamId}
            className={`border-border bg-card rounded-lg border p-5 ${
              team.finalRank === 1 ? "sm:col-span-3" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground font-mono text-xs tracking-wider">
                {t("rank")} #{team.finalRank}
              </span>
              {prizeTeamIds.has(team.teamId) ? (
                <Badge
                  variant="secondary"
                  className="bg-green-500/15 text-green-600 dark:text-green-400"
                >
                  {t("winner")}
                </Badge>
              ) : null}
            </div>
            <h2 className="mt-2 text-xl font-bold">{team.name}</h2>
            <div className="text-muted-foreground mt-1 font-mono text-xs tracking-wider">
              {team.score} {t("score")}
            </div>

            <MemberFaces
              faces={team.memberFaces}
              privateCount={team.memberCount - team.memberFaces.length}
            />

            {prizeTeamIds.has(team.teamId) && prizeParts.length > 0 ? (
              <div className="border-border mt-4 border-t pt-3">
                <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
                  {t("prize")}
                </span>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {prizeParts.map((part) => (
                    <li key={part}>{part}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* People's Choice — community-voted, parallel to the scored podium */}
      {peoplesChoiceTeam ? (
        <div className="border-border bg-card mt-6 rounded-lg border p-5">
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-600 dark:text-amber-400"
            >
              {t("peoplesChoice")}
            </Badge>
            <span className="text-muted-foreground font-mono text-xs tracking-wider">
              {t("voteCount", { count: peoplesChoiceVotes })}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-bold">{peoplesChoiceTeam.name}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("peoplesChoiceIntro")}
          </p>
          <MemberFaces
            faces={peoplesChoiceTeam.memberFaces}
            privateCount={
              peoplesChoiceTeam.memberCount -
              peoplesChoiceTeam.memberFaces.length
            }
          />
        </div>
      ) : null}

      {/* All participating teams */}
      {field.length > 0 ? (
        <div className="border-border mt-10 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / {t("allTeams").toUpperCase()}
            </h2>
          </div>
          <div className="mt-4 space-y-1">
            {field.map((team) => (
              <div
                key={team.teamId}
                className="flex items-center gap-3 rounded px-2 py-2 text-sm"
              >
                <span className="text-muted-foreground w-8 font-mono text-xs">
                  {team.finalRank !== null ? `#${team.finalRank}` : "—"}
                </span>
                <span className="flex-1 font-medium">{team.name}</span>
                <span className="text-muted-foreground hidden truncate font-mono text-xs sm:inline">
                  <FaceLinks
                    faces={team.memberFaces}
                    privateCount={team.memberCount - team.memberFaces.length}
                  />
                </span>
                <span className="text-muted-foreground font-mono text-xs">
                  {team.score} {t("score")}
                </span>
                {/* A re-finalize can push the paid team below the podium; keep
                    the prize attributed to it rather than dropping it. */}
                {prizeTeamIds.has(team.teamId) && prizeParts.length > 0 ? (
                  <Badge variant="secondary" title={prizeParts.join(" · ")}>
                    {t("prize")}
                  </Badge>
                ) : null}
                {team.finalRank === null ? (
                  <Badge variant="outline">{t("notRanked")}</Badge>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Inline comma-separated member links (public profiles only) + private count. */
function FaceLinks({
  faces,
  privateCount,
}: {
  faces: MemberFace[];
  privateCount: number;
}) {
  return (
    <>
      {faces.map((face, i) => (
        <span key={face.userId}>
          {i > 0 ? ", " : ""}
          <Link
            href={`/members/${face.userId}`}
            className="hover:text-foreground underline underline-offset-4 transition-colors"
          >
            {face.displayName}
          </Link>
        </span>
      ))}
      {privateCount > 0 ? ` +${privateCount}` : ""}
    </>
  );
}
