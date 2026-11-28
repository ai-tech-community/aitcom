"use client";

import type { MembershipStatus as ViewerMembershipStatus } from "@/server/communities/invite-policy";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/avatar";
import { CommunityActionsMenu } from "./community-actions-menu";
import { JoinButton } from "./join-button";
import type { RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";

type Community = RouterOutputs["communities"]["getBySlug"];
type MembershipStatus = ViewerMembershipStatus | null;
type MemberRole = "owner" | "admin" | "moderator" | "member";

interface CommunityIdentityProps {
  community: Community;
  membershipStatus: MembershipStatus;
  memberRole?: MemberRole | null;
  compact?: boolean;
  secondaryHeading?: boolean;
}

/**
 * Who the community is, in one row at the top of the community rail: logo,
 * name (the page's one h1), the viewer's role, and the viewer's way in or
 * out — the join control for someone who has not joined, the "⋯" community
 * menu (Leave) for a member. Kept short so every tab stays in view; the
 * banner and the About section live on the Overview.
 */
export function CommunityIdentity({
  community,
  membershipStatus,
  memberRole,
  compact = false,
  secondaryHeading = false,
}: CommunityIdentityProps) {
  const tRoles = useTranslations("communities.roles");
  const isMember = membershipStatus === "active";
  const role = isMember && memberRole ? memberRole : null;
  const Heading = secondaryHeading ? "h2" : "h1";

  // Joining, answering an invitation or leaving swaps the viewer's control
  // (join control ↔ "⋯" menu), and the focused button goes with it. The
  // heading is where keyboard and screen-reader users pick up again.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingOnLeave = useRef(false);
  useEffect(() => {
    // Leaving runs behind a confirmation dialog that hands focus back to the
    // menu button as it closes, so focus moves only once the membership has
    // really dropped and the menu is gone.
    const leaveFinished = focusHeadingOnLeave.current && !isMember;
    focusHeadingOnLeave.current = false;
    if (leaveFinished) headingRef.current?.focus();
  }, [isMember]);

  return (
    <div
      data-community-identity=""
      className={cn(
        "flex flex-col items-start gap-3",
        compact && "max-lg:[&_button]:min-h-11 max-lg:[&_button]:min-w-11",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 self-stretch",
          compact && "gap-2",
        )}
      >
        <Avatar
          className={cn(
            "size-10 shrink-0 rounded-lg",
            compact && "size-8 rounded-md",
          )}
        >
          {community.logoUrl ? (
            <AvatarImage src={community.logoUrl} alt={community.name} />
          ) : null}
          <AvatarFallback className="rounded-lg">
            {getInitials(community.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Heading
            ref={headingRef}
            tabIndex={-1}
            className={cn(
              "font-community-heading min-w-0 text-lg leading-snug font-semibold tracking-tight wrap-break-word outline-none",
              compact && "text-base",
            )}
          >
            {community.name}
          </Heading>
          {role ? <Badge variant="outline">{tRoles(role)}</Badge> : null}
        </div>
        {isMember ? (
          <CommunityActionsMenu
            slug={community.slug}
            name={community.name}
            joinPolicy={community.joinPolicy}
            membershipStatus={membershipStatus}
            memberRole={memberRole}
            compact={compact}
            onLeft={() => {
              focusHeadingOnLeave.current = true;
            }}
          />
        ) : null}
      </div>

      {isMember ? null : (
        <JoinButton
          slug={community.slug}
          name={community.name}
          joinPolicy={community.joinPolicy}
          membershipStatus={membershipStatus}
          memberRole={memberRole}
          focusAfterChange={headingRef}
        />
      )}
    </div>
  );
}
