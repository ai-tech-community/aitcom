"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { MembersSettings } from "@/components/communities/settings/members-settings";

export default function MembersSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const { data: community, isLoading: communityLoading } =
    api.communities.getBySlug.useQuery({ slug });

  const { data: myCommunities, isLoading: roleLoading } =
    api.communities.getMyCommunities.useQuery();

  if (communityLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!community) return null;

  const myMembership = myCommunities?.find((c) => c.slug === slug);

  return (
    <MembersSettings
      slug={slug}
      joinPolicy={community.joinPolicy}
      myRole={(myMembership?.role as "owner" | "admin") ?? "member"}
    />
  );
}
