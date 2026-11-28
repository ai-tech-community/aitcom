import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function showCommunityFirstWeek(
  memberRole: string | null | undefined,
  createdAt: Date | string | undefined,
  now = Date.now(),
): boolean {
  if (!isOpenCommunitiesEnabled() || memberRole !== "owner" || !createdAt)
    return false;
  const age = now - new Date(createdAt).getTime();
  return age >= 0 && age < WEEK_MS;
}
