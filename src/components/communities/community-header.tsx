"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/avatar";
import { JoinButton } from "./join-button";
import { MemberStack } from "./member-stack";
import type { RouterOutputs } from "@/trpc/react";

type Community = RouterOutputs["communities"]["getBySlug"];
type MembershipStatus = "active" | "pending_approval" | "invited" | null;

interface CommunityHeaderProps {
  community: Community;
  membershipStatus: MembershipStatus;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

export function CommunityHeader({
  community,
  membershipStatus,
  memberRole,
}: CommunityHeaderProps) {
  const t = useTranslations("communities.profile");

  const initials = getInitials(community.name);

  return (
    <div className="bg-background/60 border-b backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="size-16 rounded-xl text-lg sm:size-20">
              {community.logoUrl ? (
                <AvatarImage src={community.logoUrl} alt={community.name} />
              ) : null}
              <AvatarFallback className="rounded-xl text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {community.name}
                </h1>
                {membershipStatus === "active" ? (
                  <Badge variant="outline">{t("memberBadge")}</Badge>
                ) : null}
              </div>

              <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Users className="size-4" />
                <span>
                  {community.memberCount} {t("members")}
                </span>
              </div>

              <MemberStack slug={community.slug} className="mt-1" />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <JoinButton
              slug={community.slug}
              joinPolicy={community.joinPolicy}
              membershipStatus={membershipStatus}
              memberRole={memberRole}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
