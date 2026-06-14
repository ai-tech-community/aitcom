import { notFound } from "next/navigation";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";

import { db } from "@/server/db";
import { challengeEnrollments, memberProfiles } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { resolvePublicHackathonPage } from "@/server/hackathon/resolve-public-hackathon";
import { getHubViewerContext } from "@/server/hackathon/hub-viewer";
import { hubTabStates } from "@/server/hackathon/hub-tabs";
import { TEAM_MEMBER_ENROLLMENT_STATUSES } from "@/server/hackathon/team-membership";
import { LockedTabPanel } from "@/components/hackathon/hub/locked-tab-panel";
import { TeamWorkspace } from "@/components/hackathon/workspace/team-workspace";

export default async function TeamWorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("hackathon");

  // Not a hackathon (no public event / no bound challenge) → no workspace.
  const resolved = await resolvePublicHackathonPage(
    slug,
    locale as "en" | "nl",
  );
  if (!resolved.found) notFound();
  const { challengeId, phase } = resolved;

  // Hub gate via the shared tab state: the workspace is "available" only for a
  // viewer on a locked team. Everyone else (logged-out, enrolled-but-not-locked,
  // non-member) sees the locked panel in-place instead of being redirected away.
  const viewer = await getHubViewerContext(challengeId, phase);
  const workspaceState = hubTabStates(viewer).find(
    (s) => s.key === "workspace",
  )!;
  if (!workspaceState.available) {
    return <LockedTabPanel message={t(workspaceState.lockedReasonKey!)} />;
  }

  // On a locked team — resolve the concrete teamId for the grid. The membership
  // query mirrors ownerOnTeam (team-membership.ts): any non-abandoned
  // enrollment counts. Filtering to status === "active" would eject a member
  // the moment checkEnrollmentCompletion flips them active → completed once
  // their last objective lands — locking them out of their own workspace
  // mid-hackathon (the regression TEAM_MEMBER_ENROLLMENT_STATUSES guards).
  const session = await getSession();
  if (!session?.user) notFound();
  const userId = session.user.id;
  const enrollment = await db.query.challengeEnrollments.findFirst({
    where: and(
      eq(challengeEnrollments.userId, userId),
      eq(challengeEnrollments.challengeId, challengeId),
      inArray(challengeEnrollments.status, [
        ...TEAM_MEMBER_ENROLLMENT_STATUSES,
      ]),
      isNotNull(challengeEnrollments.teamId),
    ),
  });
  // Defensive: isOnLockedTeam already implies an enrolled team, but keep the
  // panel rather than crashing if the active-enrollment narrowing misses.
  if (!enrollment?.teamId) {
    return <LockedTabPanel message={t("lockedWorkspaceNotReady")} />;
  }
  const teamId = enrollment.teamId;

  const memberRows = await db
    .select({
      userId: challengeEnrollments.userId,
      displayName: memberProfiles.displayName,
    })
    .from(challengeEnrollments)
    .innerJoin(
      memberProfiles,
      eq(memberProfiles.userId, challengeEnrollments.userId),
    )
    .where(eq(challengeEnrollments.teamId, teamId));

  const members = memberRows.map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
  }));

  return (
    <TeamWorkspace
      teamId={teamId}
      challengeId={challengeId}
      members={members}
    />
  );
}
