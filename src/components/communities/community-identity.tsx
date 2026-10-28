"use client";

import type { MembershipStatus as ViewerMembershipStatus } from "@/server/communities/invite-policy";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/avatar";
import { JoinButton } from "./join-button";
import { MemberStack } from "./member-stack";
import type { RouterOutputs } from "@/trpc/react";

type Community = RouterOutputs["communities"]["getBySlug"];
type MembershipStatus = ViewerMembershipStatus | null;

interface CommunityIdentityProps {
  community: Community;
  membershipStatus: MembershipStatus;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

/**
 * Who the community is and the way in: logo, name (the page's one h1),
 * tagline, members, and the join control. A header row on small screens;
 * from `lg` it stacks into the top of the community rail.
 */
export function CommunityIdentity({
  community,
  membershipStatus,
  memberRole,
}: CommunityIdentityProps) {
  const t = useTranslations("communities.profile");
  const tRoles = useTranslations("communities.roles");

  const initials = getInitials(community.name);
  const active = community.liveness?.activeContributors ?? 0;
  // Focus lands here after answering an invitation: the heading gains the
  // Member badge (or stays as it was, after a decline).
  const headingRef = useRef<HTMLHeadingElement>(null);

  return (
    <div
      data-community-identity=""
      className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between lg:flex-col lg:justify-start lg:gap-4"
    >
      {community.bannerUrl ? (
        // Uploaded hosts are not limited to next/image's allow list.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={community.bannerUrl}
          alt=""
          data-community-banner=""
          className="border-border aspect-[3/1] w-full rounded-lg border object-cover"
        />
      ) : null}

      <div className="flex items-start gap-4 lg:flex-col lg:gap-3">
        <Avatar className="size-16 rounded-xl text-lg sm:size-20">
          {community.logoUrl ? (
            <AvatarImage src={community.logoUrl} alt={community.name} />
          ) : null}
          <AvatarFallback className="rounded-xl text-lg">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-col gap-1 lg:gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight outline-none sm:text-3xl lg:text-2xl"
            >
              {community.name}
            </h1>
            {membershipStatus === "active" && memberRole ? (
              <Badge variant="outline">{tRoles(memberRole)}</Badge>
            ) : null}
          </div>

          {community.description ? (
            <p
              data-community-tagline=""
              className="text-muted-foreground line-clamp-2 max-w-2xl text-sm leading-relaxed sm:text-base lg:line-clamp-6 lg:text-sm"
            >
              {community.description}
            </p>
          ) : null}

          <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Users className="size-4" />
            <span>
              {t("membersSentence", { count: community.memberCount })}
              {active > 0 ? (
                <> · {t("activeSentence", { count: active })}</>
              ) : null}
            </span>
          </div>

          <MemberStack slug={community.slug} className="mt-1" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <JoinButton
          slug={community.slug}
          name={community.name}
          joinPolicy={community.joinPolicy}
          membershipStatus={membershipStatus}
          memberRole={memberRole}
          focusAfterAnswer={headingRef}
        />
      </div>
    </div>
  );
}
