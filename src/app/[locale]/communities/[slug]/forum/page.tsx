"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { ForumPage } from "@/components/forum/forum-page";

export default function CommunityForumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: session } = authClient.useSession();

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );

  const membership = myCommunities?.find((c) => c.slug === slug);
  const memberRole = membership?.status === "active" ? membership.role : null;

  return (
    <ForumPage
      communitySlug={slug}
      memberRole={memberRole}
    />
  );
}
