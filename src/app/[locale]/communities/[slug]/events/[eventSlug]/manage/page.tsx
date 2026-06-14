import { loadManageData } from "@/server/hackathon/load-manage";
import { ManageSetup } from "@/components/hackathon/manage/manage-setup";

export default async function ManageSetupPage({
  params,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  const { slug, eventSlug } = await params;
  const data = await loadManageData(slug, eventSlug);

  return (
    <ManageSetup
      challengeId={data.challengeId}
      eventId={data.eventId}
      phase={data.phase}
      initialName={data.name}
      initialDescription={data.description}
      initialDate={data.date}
      initialStartTime={data.startTime}
      initialEndTime={data.endTime}
      initialLocation={data.location}
      initialCoverImageId={data.coverImageId}
      initialCoverImageUrl={data.coverImageUrl}
      initialTeamMin={data.teamMin}
      initialTeamMax={data.teamMax}
      initialXpReward={data.xpReward}
      initialSponsorReward={data.sponsorReward}
      initialBadgeReward={data.badgeReward}
      isAdmin={data.isAdmin}
    />
  );
}
