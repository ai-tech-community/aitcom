"use client";

import { use } from "react";

import { ReelsViewer } from "@/components/communities/reels/reels-viewer";
import { authClient } from "@/server/better-auth/client";
import {
  documentAuthUser,
  memberRoleForSlug,
  membershipStatusForSlug,
  type HubAuthUser,
  type HubMembershipSeed,
} from "@/server/better-auth/hub-session";
import { api } from "@/trpc/react";

export function CommunityReelsPageClient({
  params,
  startAtPostId,
  initialUser,
  initialMemberships,
}: {
  params: Promise<{ slug: string }>;
  startAtPostId: number | null;
  initialUser: HubAuthUser | null;
  initialMemberships: HubMembershipSeed[];
}) {
  const { slug } = use(params);
  const { data: session } = authClient.useSession();
  const user = documentAuthUser(null, initialUser, session?.user);

  const { data: community } = api.communities.getBySlug.useQuery({ slug });
  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!user },
  );
  const memberships = myCommunities ?? initialMemberships;

  return (
    <ReelsViewer
      slug={slug}
      startAtPostId={startAtPostId}
      currentUserId={user?.id ?? null}
      memberRole={memberRoleForSlug(memberships, slug)}
      membershipStatus={membershipStatusForSlug(memberships, slug)}
      joinPolicy={community?.joinPolicy ?? "open"}
    />
  );
}
