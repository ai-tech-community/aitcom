import type { Metadata } from "next";

import { getSession } from "@/server/better-auth/server";
import {
  badgePageMetadata,
  getBadgeRarityReport,
  requireMemberBadge,
} from "@/server/members/profile-page";
import {
  BadgeShare,
  type BadgeShareViewer,
} from "@/components/badges/badge-share";

type Params = Promise<{ id: string; slug: string; locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, slug, locale } = await params;
  return badgePageMetadata({ userId: id, slug, locale });
}

/**
 * A badge's share page (ADR-0039, the earning moment): what the member
 * shares to LinkedIn or X, inside their profile frame. It follows the
 * profile's visibility (the frame shows the owner a notice when visitors
 * cannot see it), and is a 404 when the member does not hold the badge.
 */
export default async function MemberBadgePage({ params }: { params: Params }) {
  const { id, slug } = await params;
  const [share, session] = await Promise.all([
    requireMemberBadge(id, slug),
    getSession(),
  ]);
  // Rarity is a caption: a failure drops it, not the page.
  const rarity = await getBadgeRarityReport().catch((error: unknown) => {
    console.error("Badge page: rarity failed to load", error);
    return null;
  });
  const viewerId = session?.user.id ?? null;
  const viewer: BadgeShareViewer =
    share.data.audience === "owner"
      ? { kind: "owner" }
      : viewerId
        ? { kind: "member", userId: viewerId }
        : { kind: "guest" };

  return (
    <BadgeShare
      badge={share.badge}
      earnedAt={share.earnedAt}
      member={{
        userId: id,
        displayName: share.data.profile.displayName,
        avatarUrl: share.data.user?.avatarUrl ?? share.data.user?.image ?? null,
      }}
      rarity={rarity}
      viewer={viewer}
    />
  );
}
