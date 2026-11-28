import type { AppLocale } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { db } from "@/server/db";
import { loadEventHost } from "@/server/events/event-hosts-queries";
import { getTranslations } from "next-intl/server";

import { resolvePublicHackathonPage } from "@/server/hackathon/resolve-public-hackathon";
import { hubTabStates, type HubTabKey } from "@/server/hackathon/hub-tabs";
import { HackathonBreadcrumb } from "@/components/hackathon/hub/hackathon-breadcrumb";
import { HackathonHeader } from "@/components/hackathon/hub/hackathon-header";
import { HackathonTabBar } from "@/components/hackathon/hub/hackathon-tab-bar";
import { getHubViewerContext } from "@/server/hackathon/hub-viewer";

export const dynamic = "force-dynamic";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: AppLocale; slug: string }>;
}) {
  const { locale, slug } = await params;
  const resolved = await resolvePublicHackathonPage(slug, locale);

  // Regular event (no bound challenge), or not found here → no hub chrome; the
  // page renders alone. resolvePublicHackathonPage returns found:false for any
  // non-hackathon event (it gates on event.challengeId), so regular events are
  // never wrapped.
  if (!resolved.found) return <>{children}</>;

  const t = await getTranslations("hackathon");
  const viewer = await getHubViewerContext(
    resolved.challengeId,
    resolved.phase,
  );
  const tabs = hubTabStates(viewer);
  const labels: Record<HubTabKey, string> = {
    overview: t("tabOverview"),
    timeline: t("tabTimeline"),
    projects: t("tabProjects"),
    participants: t("tabParticipants"),
    team: t("tabTeam"),
    workspace: t("tabWorkspace"),
    agents: t("tabAgents"),
    winners: t("tabWinners"),
  };

  const redesign = isOpenCommunitiesEnabled();
  const community =
    redesign && resolved.event.communityId
      ? await loadEventHost(db, resolved.event.communityId).catch(
          (error: unknown) => {
            console.error("[events] loading the hackathon host failed", {
              slug,
              error,
            });
            return null;
          },
        )
      : null;
  return (
    <div
      className={cn(
        "mx-auto px-4 py-6",
        redesign ? "max-w-6xl sm:px-8 sm:py-9" : "max-w-5xl",
      )}
    >
      <HackathonBreadcrumb
        slug={slug}
        title={resolved.event.title}
        labels={labels}
        community={redesign ? community : undefined}
      />
      <HackathonHeader event={resolved.event} phase={resolved.phase} />
      <div className="mt-6">
        <HackathonTabBar slug={slug} tabs={tabs} labels={labels} />
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
