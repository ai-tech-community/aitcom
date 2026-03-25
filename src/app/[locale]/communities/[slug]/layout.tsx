"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { CommunityHeader } from "@/components/communities/community-header";
import { CommunityNav } from "@/components/communities/community-nav";
import { Spinner } from "@/components/ui/spinner";

export default function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const { data: session } = authClient.useSession();

  const { data: community, isLoading: communityLoading } =
    api.communities.getBySlug.useQuery({ slug });

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );

  if (communityLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!community) {
    notFound();
  }

  // Derive membership status for this community
  const membership = myCommunities?.find(
    (m) => m.communityId === community.id,
  );
  const membershipStatus = (membership?.status as "active" | "pending_approval" | "invited" | null) ?? null;

  return (
    <div className="flex flex-col">
      <CommunityHeader community={community} membershipStatus={membershipStatus} />
      <CommunityNav slug={slug} />
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        {children}
      </div>
    </div>
  );
}
