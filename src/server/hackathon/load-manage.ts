import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { communities, communityMemberships, teams } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getPayloadClient } from "@/server/payload";
import { lexicalToPlainText } from "@/server/challenge-engine/lexical";
import { isCommunityHackathonAdmin } from "@/server/hackathon/community-admin";
import { hackathonPhase, type HackathonPhase } from "@/server/hackathon/phase";
import type { CellRow } from "@/components/hackathon/cell-template-editor";

export interface ManageData {
  communitySlug: string;
  eventId: number;
  eventSlug: string;
  phase: HackathonPhase;
  challengeId: number;
  name: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  coverImageId: number | null;
  coverImageUrl: string;
  cells: CellRow[];
  teamMin: number;
  teamMax: number;
  xpReward: number;
  sponsorReward: string;
  badgeReward: string;
}

/**
 * Shared loader for the organizer manage tabs (Setup/Tasks/Analytics/Lifecycle).
 * Enforces the admin access gate (ADR-0031) + scopes the hackathon to the URL's
 * community, then returns the full manage snapshot. Each tab route calls this so
 * the gate + fetch stay identical across tabs (a refetch per tab keeps every tab
 * reading server truth — notably `phase`, which a reload must never resurrect).
 * Redirects/404s exactly like the original single-page manage route did.
 */
export async function loadManageData(
  slug: string,
  eventSlug: string,
): Promise<ManageData> {
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
  const phase = hackathonPhase({
    eventStatus: event.status,
    challengeStatus: challenge.status ?? "",
    teams: challengeTeams,
  });

  return {
    communitySlug: slug,
    eventId: Number(event.id),
    eventSlug: String(event.slug),
    phase,
    challengeId: Number(challenge.id),
    name: String(event.title ?? challenge.title ?? ""),
    description: lexicalToPlainText(event.description),
    date: event.date ? String(event.date).slice(0, 10) : "",
    startTime: String(event.startTime ?? ""),
    endTime: String(event.endTime ?? ""),
    location: String(event.location ?? ""),
    coverImageId,
    coverImageUrl,
    cells: (challenge.cellTemplate ?? []) as unknown as CellRow[],
    teamMin: challenge.teamConfig?.minTeamSize ?? 1,
    teamMax: challenge.teamConfig?.maxTeamSize ?? 5,
    xpReward: rewards.xpReward ?? 0,
    sponsorReward: rewards.sponsorReward ?? "",
    badgeReward: rewards.badgeReward ?? "",
  };
}
