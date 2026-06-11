import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getLocale } from "next-intl/server";

import { db } from "@/server/db";
import {
  challengeEnrollments,
  memberProfiles,
  workGrids,
  teams,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getPayloadClient } from "@/server/payload";
import { TEAM_MEMBER_ENROLLMENT_STATUSES } from "@/server/hackathon/team-membership";
import { TeamWorkspace } from "@/components/hackathon/workspace/team-workspace";
import { cellTemplateSchema } from "@/server/hackathon/cell-template";
import { getToolCatalog } from "@/server/mcp/catalog";
import { groupBySurface } from "@/server/mcp/catalog-meta";
import { HackathonBriefing } from "@/components/hackathon/briefing/hackathon-briefing";

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

  // Pre-lock: no competitive grid yet (the same condition requireTeamGridId
  // enforces) → render the briefing instead of the live workspace.
  const [grid] = await db
    .select({ id: workGrids.id })
    .from(workGrids)
    .where(
      and(eq(workGrids.teamId, teamId), eq(workGrids.mode, "competitive")),
    )
    .limit(1);

  if (!grid) {
    const [team] = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    const challenge = await payload.findByID({
      collection: "challenges",
      id: challengeId,
      depth: 0,
    });
    const parsed = cellTemplateSchema.safeParse(challenge.cellTemplate ?? []);
    const cellTemplate = parsed.success ? parsed.data : [];
    const rankingMode =
      challenge.rankingMode === "thoroughness" ||
      challenge.rankingMode === "collaboration"
        ? challenge.rankingMode
        : "speed";
    const rewards = challenge.rewards as
      | { xpReward?: number; badgeReward?: string }
      | undefined;

    const BRIEFING_SURFACES = ["commissions", "challenges", "inbox"];
    const catalogGroups = groupBySurface(await getToolCatalog()).filter((g) =>
      BRIEFING_SURFACES.includes(g.surface),
    );

    return (
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 sm:py-16">
        <HackathonBriefing
          eventSlug={slug}
          challengeId={challengeId}
          challengeSlug={challenge.slug ?? ""}
          cellTemplate={cellTemplate}
          rankingMode={rankingMode}
          xpReward={rewards?.xpReward ?? 0}
          badgeReward={rewards?.badgeReward ?? null}
          members={members}
          teamName={team?.name ?? ""}
          catalogGroups={catalogGroups}
        />
      </div>
    );
  }

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
