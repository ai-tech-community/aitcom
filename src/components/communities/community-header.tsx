"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { JoinButton } from "./join-button";
import type { RouterOutputs } from "@/trpc/react";

type Community = RouterOutputs["communities"]["getBySlug"];
type MembershipStatus = "active" | "pending_approval" | "invited" | null;

interface CommunityHeaderProps {
  community: Community;
  membershipStatus: MembershipStatus;
}

export function CommunityHeader({ community, membershipStatus }: CommunityHeaderProps) {
  const t = useTranslations("communities.profile");

  const initials = community.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="border-b bg-background/60 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="size-16 rounded-xl text-lg sm:size-20">
              {community.logoUrl ? (
                <AvatarImage src={community.logoUrl} alt={community.name} />
              ) : null}
              <AvatarFallback className="rounded-xl text-lg">{initials}</AvatarFallback>
            </Avatar>

            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {community.name}
              </h1>

              <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Users className="size-4" />
                <span>
                  {community.memberCount} {t("members")}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <JoinButton
              slug={community.slug}
              joinPolicy={community.joinPolicy}
              membershipStatus={membershipStatus}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
