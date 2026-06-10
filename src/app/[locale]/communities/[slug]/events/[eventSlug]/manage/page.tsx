import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getPayloadClient } from "@/server/payload";
import { lexicalToPlainText } from "@/server/challenge-engine/lexical";
import { isCommunityHackathonAdmin } from "@/server/hackathon/community-admin";
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
    where: { slug: { equals: eventSlug } },
    limit: 1,
    depth: 0,
  });
  const event = docs[0];
  if (!event?.challengeId) notFound();
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

  return (
    <HackathonManage
      communitySlug={slug}
      eventId={Number(event.id)}
      eventSlug={String(event.slug)}
      eventStatus={String(event.status)}
      challengeId={Number(challenge.id)}
      challengeStatus={String(challenge.status)}
      initialName={String(event.title ?? challenge.title ?? "")}
      initialDescription={lexicalToPlainText(event.description)}
      initialDate={event.date ? String(event.date).slice(0, 10) : ""}
      initialStartTime={String(event.startTime ?? "")}
      initialEndTime={String(event.endTime ?? "")}
      initialLocation={String(event.location ?? "")}
      initialCells={(challenge.cellTemplate ?? []) as unknown as CellRow[]}
      teamMin={challenge.teamConfig?.minTeamSize ?? 1}
      teamMax={challenge.teamConfig?.maxTeamSize ?? 5}
      initialXpReward={rewards.xpReward ?? 0}
      initialSponsorReward={rewards.sponsorReward ?? ""}
      initialBadgeReward={rewards.badgeReward ?? ""}
    />
  );
}
