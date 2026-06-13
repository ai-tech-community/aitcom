import { loadManageData } from "@/server/hackathon/load-manage";
import { ManageLifecycle } from "@/components/hackathon/manage/manage-lifecycle";

export default async function ManageLifecyclePage({
  params,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  const { slug, eventSlug } = await params;
  const data = await loadManageData(slug, eventSlug);

  return (
    <ManageLifecycle
      challengeId={data.challengeId}
      eventId={data.eventId}
      initialPhase={data.phase}
      hasCells={data.cells.length > 0}
    />
  );
}
