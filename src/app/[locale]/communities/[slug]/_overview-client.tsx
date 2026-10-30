"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import {
  documentAuthUser,
  memberRoleForSlug,
  type HubAuthUser,
  type HubMembershipSeed,
} from "@/server/better-auth/hub-session";
import { FeedPage } from "@/components/communities/feed/feed-page";
import { Activity } from "lucide-react";

export function CommunityOverviewPageClient({
  params,
  initialUser,
  initialMemberships,
}: {
  params: Promise<{ slug: string }>;
  initialUser: HubAuthUser | null;
  initialMemberships: HubMembershipSeed[];
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.profile");
  const { data: session } = authClient.useSession();
  const user = documentAuthUser(null, initialUser, session?.user);

  const { data: community } = api.communities.getBySlug.useQuery({ slug });

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!user },
  );

  const memberRole = memberRoleForSlug(
    myCommunities ?? initialMemberships,
    slug,
  );
  const isMember = !!memberRole;

  return (
    <>
      {/* Liveness preview — visible to non-members above the feed.
          Member count + join CTA already live in the header. */}
      {community &&
        !isMember &&
        (community.liveness.activeContributors > 0 ||
          community.liveness.recentThreads > 0) && (
          <div className="bg-primary/5 border-primary/20 mb-4 rounded-lg border p-4">
            <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Activity className="size-4 shrink-0" />
              <span>
                {community.liveness.activeContributors > 0 && (
                  <>
                    <strong className="text-foreground">
                      {community.liveness.activeContributors}
                    </strong>{" "}
                    {t("activeThisWeek", {
                      count: community.liveness.activeContributors,
                    })}
                  </>
                )}
                {community.liveness.activeContributors > 0 &&
                  community.liveness.recentThreads > 0 &&
                  " · "}
                {community.liveness.recentThreads > 0 && (
                  <>
                    <strong className="text-foreground">
                      {community.liveness.recentThreads}
                    </strong>{" "}
                    {t("newDiscussions", {
                      count: community.liveness.recentThreads,
                    })}
                  </>
                )}
              </span>
            </div>
          </div>
        )}

      <FeedPage
        slug={slug}
        memberRole={memberRole}
        currentUserId={user?.id}
        feedPostPolicy={community?.feedPostPolicy ?? "all_members"}
      />
    </>
  );
}
