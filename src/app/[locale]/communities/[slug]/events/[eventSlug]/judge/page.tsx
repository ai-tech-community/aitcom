import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { communities, hackathonStaff } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { getPayloadClient } from "@/server/payload";
import {
  hasActiveGrant,
  type StaffGrantRow,
} from "@/server/hackathon/staff-roles";
import { JudgeWorkspace } from "@/components/hackathon/judge/judge-workspace";

export default async function JudgePage({
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

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      slug: { equals: eventSlug },
      // Scope to the community from the URL so a judge grant on one
      // community's hackathon can't read another's draft by slug.
      communityId: { equals: community.id },
    },
    limit: 1,
  });
  const event = docs[0];
  if (!event?.challengeId) notFound();
  const challengeId = Number(event.challengeId);

  // Judge gate (ADR-0031): ranking is gated on a non-revoked judge grant
  // directly — an admin/organizer is NOT implicitly a judge.
  const grants = await db
    .select({ role: hackathonStaff.role, revokedAt: hackathonStaff.revokedAt })
    .from(hackathonStaff)
    .where(
      and(
        eq(hackathonStaff.challengeId, challengeId),
        eq(hackathonStaff.userId, userId),
      ),
    );
  if (!hasActiveGrant(grants as StaffGrantRow[], "judge")) {
    redirect(`/communities/${slug}/events`);
  }

  return <JudgeWorkspace challengeId={challengeId} />;
}
