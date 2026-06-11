import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getLocale } from "next-intl/server";

import { db } from "@/server/db";
import { challengeEnrollments, memberProfiles } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getPayloadClient } from "@/server/payload";
import { TEAM_MEMBER_ENROLLMENT_STATUSES } from "@/server/hackathon/team-membership";
import { TeamWorkspace } from "@/components/hackathon/workspace/team-workspace";

export default async function TeamWorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();

  const session = await getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) redirect(`/events/${slug}`);

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: { slug: { equals: slug } },
    locale: locale as "en" | "nl",
    limit: 1,
    depth: 0,
  });
  const event = docs[0];
  if (!event?.challengeId) redirect(`/events/${slug}`);
  const challengeId = Number(event.challengeId);

  // Membership gate must mirror ownerOnTeam (team-membership.ts): any
  // non-abandoned enrollment carrying the teamId counts — completing your
  // objectives must not lock you out of the workspace mid-hackathon.
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
  if (!enrollment?.teamId) redirect(`/events/${slug}`);
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
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 sm:py-16">
      <TeamWorkspace
        teamId={teamId}
        challengeId={challengeId}
        members={members}
      />
    </div>
  );
}
