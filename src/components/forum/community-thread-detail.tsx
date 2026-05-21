"use client";

import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { ThreadDetail } from "@/components/forum/thread-detail";

type Props = {
  communitySlug: string;
  threadSlug: string;
};

export function CommunityThreadDetail({ communitySlug, threadSlug }: Props) {
  const { data: session } = authClient.useSession();
  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );

  const membership = myCommunities?.find((c) => c.slug === communitySlug);
  const memberRole = membership?.status === "active" ? membership.role : null;

  return (
    <ThreadDetail
      slug={threadSlug}
      memberRole={memberRole}
      communitySlug={communitySlug}
    />
  );
}
