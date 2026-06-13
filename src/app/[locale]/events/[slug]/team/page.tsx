import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { resolvePublicHackathonPage } from "@/server/hackathon/resolve-public-hackathon";
import { getHubViewerContext } from "@/server/hackathon/hub-viewer";
import { hubTabStates } from "@/server/hackathon/hub-tabs";
import { LockedTabPanel } from "@/components/hackathon/hub/locked-tab-panel";
import { MyTeamPanel } from "@/components/hackathon/hub/my-team-panel";
import { EventRegisterButton } from "@/components/event-register-button";

export default async function MyTeamTabPage({
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
  const tab = tabs.find((tabState) => tabState.key === "team")!;

  // Non-enrolled viewers get the locked panel — but with a register CTA right
  // below it so they can act (the `team` tab is available only when enrolled).
  if (!tab.available) {
    const eventId = Number(event.id);
    const price = (event.price as number | undefined) ?? null;
    return (
      <div className="space-y-4">
        <LockedTabPanel message={t(tab.lockedReasonKey!)} />
        <div className="mx-auto max-w-xs">
          <EventRegisterButton eventId={eventId} price={price} />
        </div>
      </div>
    );
  }

  return <MyTeamPanel challengeId={challengeId} eventSlug={slug} />;
}
