import { GetStartedCard } from "./get-started-card";
import { PeopleToMeet } from "./people-to-meet";
import { YouCard } from "./you-card";

/**
 * The member dashboard's side panel, the same on every tab so profile and
 * progress always live in one place. Each card owns its own query and data
 * states (through DashboardSection) and hides itself when it has nothing to
 * say, so the panel itself holds no data logic.
 */
export function DashboardSidePanel({
  fallbackName,
  avatarUrl,
}: {
  fallbackName: string;
  avatarUrl: string | null;
}) {
  return (
    <div className="space-y-4">
      <YouCard fallbackName={fallbackName} avatarUrl={avatarUrl} />
      <GetStartedCard />
      <PeopleToMeet />
    </div>
  );
}
