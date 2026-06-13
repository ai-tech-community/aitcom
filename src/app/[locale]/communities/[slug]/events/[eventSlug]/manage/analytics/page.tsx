import { loadManageData } from "@/server/hackathon/load-manage";
import { HackathonAnalytics } from "@/components/hackathon/hackathon-analytics";

export default async function ManageAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  const { slug, eventSlug } = await params;
  const data = await loadManageData(slug, eventSlug);

  return (
    <HackathonAnalytics challengeId={data.challengeId} phase={data.phase} />
  );
}
