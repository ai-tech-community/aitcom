"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { FeedPage } from "@/components/communities/feed/feed-page";

export default function CommunityOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: session } = authClient.useSession();

  const { data: community } = api.communities.getBySlug.useQuery({ slug });

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );

  const membership = myCommunities?.find((c) => c.slug === slug);
  const memberRole = membership?.status === "active" ? membership.role : null;

  return (
    <FeedPage
      slug={slug}
      communityDescription={community?.description}
      memberRole={memberRole}
      currentUserId={session?.user?.id}
      feedPostPolicy={community?.feedPostPolicy ?? "all_members"}
    />
  );
}
