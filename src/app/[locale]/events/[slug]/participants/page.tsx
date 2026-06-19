import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { resolvePublicHackathonPage } from "@/server/hackathon/resolve-public-hackathon";
import { getHubViewerContext } from "@/server/hackathon/hub-viewer";
import { hubTabStates } from "@/server/hackathon/hub-tabs";
import { LockedTabPanel } from "@/components/hackathon/hub/locked-tab-panel";
import { SectionLabel } from "@/components/ui/section-label";
import { EventAttendees } from "@/components/event-attendees";
import { TeamLeaderboard } from "@/components/hackathon/team-leaderboard";
import { MatchmakingPanel } from "@/components/hackathon/hub/matchmaking-panel";

export default async function ParticipantsTabPage({
  params,
}: {
  params: Promise<{ locale: "en" | "nl"; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations("hackathon");

  const resolved = await resolvePublicHackathonPage(slug, locale);
  if (!resolved.found) notFound();
  const { event, challengeId, phase } = resolved;

  const viewer = await getHubViewerContext(challengeId, phase);
  const tabs = hubTabStates(viewer);
  const tab = tabs.find((tabState) => tabState.key === "participants")!;

  // `participants` is always available per hub-tabs, but keep the gate wiring
  // uniform with the other tab pages.
  if (!tab.available) {
    return <LockedTabPanel message={t(tab.lockedReasonKey!)} />;
  }

  const eventId = Number(event.id);
  const maxAttendees = (event.maxAttendees as number | undefined) ?? null;
  const isExternal =
    typeof event.sourceUrl === "string" && event.sourceUrl.length > 0;

  return (
    <div className="space-y-10">
      {/* People / attendees */}
      <section>
        <SectionLabel className="pb-4">{t("participantsPeople")}</SectionLabel>
        <div className="mt-4">
          <EventAttendees
            eventId={eventId}
            maxAttendees={maxAttendees}
            isExternal={isExternal}
          />
        </div>
      </section>

      {/* Teams + leaderboard (renders nothing until teams exist) */}
      <section>
        <SectionLabel className="pb-4">{t("participantsTeams")}</SectionLabel>
        <TeamLeaderboard challengeId={challengeId} eventSlug={slug} />
      </section>

      {/* Matchmaking — self-gates to the forming/live window. */}
      <MatchmakingPanel challengeId={challengeId} />
    </div>
  );
}
