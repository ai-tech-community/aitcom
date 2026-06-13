import { loadManageData } from "@/server/hackathon/load-manage";
import { ManageTasks } from "@/components/hackathon/manage/manage-tasks";

export default async function ManageTasksPage({
  params,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  const { slug, eventSlug } = await params;
  const data = await loadManageData(slug, eventSlug);

  return (
    <ManageTasks
      challengeId={data.challengeId}
      phase={data.phase}
      initialCells={data.cells}
    />
  );
}
