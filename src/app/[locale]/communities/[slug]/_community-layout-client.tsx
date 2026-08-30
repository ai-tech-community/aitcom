"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { api } from "@/trpc/react";
import { usePublishDocumentAuthUser } from "@/components/auth/session-provider";
import { authClient } from "@/server/better-auth/client";
import {
  membershipStatusForSlug,
  memberRoleForSlug,
  resolveHubAuthUser,
  type HubAuthUser,
  type HubMembershipSeed,
} from "@/server/better-auth/hub-session";
import { CommunityHeader } from "@/components/communities/community-header";
import { CommunityNav } from "@/components/communities/community-nav";
import { Spinner } from "@/components/ui/spinner";

export function CommunityLayoutClient({
  children,
  params,
  initialUser,
  initialMemberships,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
  initialUser: HubAuthUser | null;
  initialMemberships: HubMembershipSeed[];
}) {
  const { slug } = use(params);
  const { data: session } = authClient.useSession();
  usePublishDocumentAuthUser(initialUser);
  const user = resolveHubAuthUser(initialUser, session?.user);

  const { data: community, isLoading: communityLoading } =
    api.communities.getBySlug.useQuery({ slug });

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!user },
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

  const memberships = myCommunities ?? initialMemberships;
  const membershipStatus = membershipStatusForSlug(memberships, slug);
  const memberRole = memberRoleForSlug(memberships, slug);

  return (
    <div className="flex flex-col">
      <CommunityHeader
        community={community}
        membershipStatus={membershipStatus}
        memberRole={memberRole}
      />
      <CommunityNav slug={slug} memberRole={memberRole} />
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        {children}
      </div>
    </div>
  );
}
