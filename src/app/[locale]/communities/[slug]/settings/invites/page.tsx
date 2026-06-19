"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { InvitesSettings } from "@/components/communities/settings/invites-settings";

export default function InvitesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const {
    data: community,
    isLoading,
    isError,
    refetch,
  } = api.communities.getBySlug.useQuery({
    slug,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (isError) return <ErrorState onRetry={refetch} />;
  if (!community) return null;

  return <InvitesSettings slug={slug} joinPolicy={community.joinPolicy} />;
}
