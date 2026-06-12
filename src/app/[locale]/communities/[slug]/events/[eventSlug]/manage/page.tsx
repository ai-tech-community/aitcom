import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { communities, communityMemberships, teams } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getPayloadClient } from "@/server/payload";
import { lexicalToPlainText } from "@/server/challenge-engine/lexical";
import { isCommunityHackathonAdmin } from "@/server/hackathon/community-admin";
import { hackathonPhase } from "@/server/hackathon/phase";
import { HackathonManage } from "@/components/hackathon/hackathon-manage";
import type { CellRow } from "@/components/hackathon/cell-template-editor";

export default async function ManageHackathonPage({
  params,
}: {
  params: Promise<{ slug: string; eventSlug: string }>;
}) {
  const { slug, eventSlug } = await params;
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) redirect(`/communities/${slug}/events`);

  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
  });
  if (!community) notFound();

  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, userId),
    ),
  });
  if (!isCommunityHackathonAdmin(membership ?? null)) {
    redirect(`/communities/${slug}/events`);
  }

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      slug: { equals: eventSlug },
      // Scope to the community from the URL — without this an admin of
      // community A could read community B's draft hackathon by slug.
      communityId: { equals: community.id },
    },
    limit: 1,
    depth: 1, // populate the coverImage media relation (id + url)
  });
  const event = docs[0];
  // No bound challenge → not a hackathon (or not this community's) → 404.
  if (!event?.challengeId) notFound();
  const cover = event.coverImage;
  const coverImageId =
    cover && typeof cover === "object"
      ? Number(cover.id)
      : typeof cover === "number"
        ? cover
        : null;
  const coverImageUrl =
    cover && typeof cover === "object" ? String(cover.url ?? "") : "";
  const challenge = await payload.findByID({
    collection: "challenges",
    id: Number(event.challengeId),
    depth: 0,
  });

  const rewards = (challenge.rewards ?? {}) as {
    xpReward?: number | null;
    sponsorReward?: string | null;
    badgeReward?: string | null;
  };

  // Derive the lifecycle phase from server truth so a reload can't resurrect
  // Lock/Finalize (see hackathonPhase for the marker semantics).
  const challengeTeams = await db
    .select({
      status: teams.status,
      finalRank: teams.finalRank,
      prizeAwardedAt: teams.prizeAwardedAt,
    })
    .from(teams)
    .where(eq(teams.challengeId, Number(challenge.id)));
  const initialPhase = hackathonPhase({
    eventStatus: event.status,
    challengeStatus: challenge.status ?? "",
    teams: challengeTeams,
  });

  return (
    <HackathonManage
      communitySlug={slug}
      eventId={Number(event.id)}
      eventSlug={String(event.slug)}
      initialPhase={initialPhase}
      challengeId={Number(challenge.id)}
      initialName={String(event.title ?? challenge.title ?? "")}
      initialDescription={lexicalToPlainText(event.description)}
      initialDate={event.date ? String(event.date).slice(0, 10) : ""}
      initialStartTime={String(event.startTime ?? "")}
      initialEndTime={String(event.endTime ?? "")}
      initialLocation={String(event.location ?? "")}
      initialCoverImageId={coverImageId}
      initialCoverImageUrl={coverImageUrl}
      initialCells={(challenge.cellTemplate ?? []) as unknown as CellRow[]}
      teamMin={challenge.teamConfig?.minTeamSize ?? 1}
      teamMax={challenge.teamConfig?.maxTeamSize ?? 5}
      initialXpReward={rewards.xpReward ?? 0}
      initialSponsorReward={rewards.sponsorReward ?? ""}
      initialBadgeReward={rewards.badgeReward ?? ""}
    />
  );
}
