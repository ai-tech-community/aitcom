"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { FeedPage } from "@/components/communities/feed/feed-page";
import { JoinButton } from "@/components/communities/join-button";
import { Users, Activity } from "lucide-react";

export function CommunityOverviewPageClient({
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
  const membershipStatus =
    (membership?.status as "active" | "pending_approval" | "invited" | null) ??
    null;
  const memberRole = membership?.status === "active" ? membership.role : null;
  const isMember = !!memberRole;

  return (
    <>
      {/* Liveness preview + join CTA — visible to non-members above the feed */}
      {community && !isMember && (
        <div className="bg-primary/5 border-primary/20 mb-4 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            {(community.liveness.activeContributors > 0 ||
              community.liveness.recentThreads > 0) && (
              <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Activity className="size-4 shrink-0" />
                <span>
                  {community.liveness.activeContributors > 0 && (
                    <>
                      <strong className="text-foreground">
                        {community.liveness.activeContributors}
                      </strong>{" "}
                      {community.liveness.activeContributors === 1
                        ? "person"
                        : "people"}{" "}
                      active this week
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
                      new{" "}
                      {community.liveness.recentThreads === 1
                        ? "discussion"
                        : "discussions"}
                    </>
                  )}
                </span>
              </div>
            )}
            <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Users className="size-4 shrink-0" />
              <span>
                <strong className="text-foreground">
                  {community.memberCount}
                </strong>{" "}
                {community.memberCount === 1 ? "member" : "members"}
              </span>
            </div>
          </div>
          {community.joinPolicy !== "invite_only" && (
            <div className="shrink-0">
              <JoinButton
                slug={slug}
                joinPolicy={community.joinPolicy}
                membershipStatus={membershipStatus}
                memberRole={memberRole}
              />
            </div>
          )}
        </div>
      )}

      <FeedPage
        slug={slug}
        communityDescription={community?.description}
        memberRole={memberRole}
        currentUserId={session?.user?.id}
        feedPostPolicy={community?.feedPostPolicy ?? "all_members"}
      />
    </>
  );
}
