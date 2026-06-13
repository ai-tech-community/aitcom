import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { challengeEnrollments, teams } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import type { HackathonPhase } from "@/server/hackathon/phase";
import type { HubViewerContext } from "@/server/hackathon/hub-tabs";

// better-auth session read for a server module (mirrors the events sub-pages,
// e.g. team/page.tsx). getSession() is React-cache()d in better-auth/server.
async function currentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/**
 * Resolve the current viewer's hub context: are they enrolled in this
 * hackathon, and are they on a team whose roster is locked? Anonymous viewers
 * get { isEnrolled: false, isOnLockedTeam: false }.
 */
export async function getHubViewerContext(
  challengeId: number,
  phase: HackathonPhase,
): Promise<HubViewerContext> {
  const userId = await currentUserId();
  if (!userId) {
    return { phase, isEnrolled: false, isOnLockedTeam: false };
  }

  const [enrollment] = await db
    .select({ teamId: challengeEnrollments.teamId })
    .from(challengeEnrollments)
    .where(
      and(
        eq(challengeEnrollments.challengeId, challengeId),
        eq(challengeEnrollments.userId, userId),
      ),
    );

  if (!enrollment) {
    return { phase, isEnrolled: false, isOnLockedTeam: false };
  }

  let isOnLockedTeam = false;
  if (enrollment.teamId) {
    const [team] = await db
      .select({ status: teams.status })
      .from(teams)
      .where(eq(teams.id, enrollment.teamId));
    isOnLockedTeam = team?.status === "locked";
  }

  return { phase, isEnrolled: true, isOnLockedTeam };
}
