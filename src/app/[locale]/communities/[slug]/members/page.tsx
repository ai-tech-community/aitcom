"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export default function CommunityMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities");
  const { data, isLoading } = api.communities.getMembers.useQuery({
    slug,
    limit: 50,
  });

  return (
    <div>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted h-14 animate-pulse rounded-lg"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {data?.items.map((member) => (
            <div
              key={member.userId}
              className="border-border hover:bg-secondary/50 flex items-center justify-between rounded-lg border px-4 py-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Avatar className="size-9">
                  {member.image ? (
                    <AvatarImage
                      src={member.image}
                      alt={member.displayName ?? ""}
                    />
                  ) : null}
                  <AvatarFallback className="text-xs">
                    {(member.displayName ?? "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {member.displayName ?? "Member"}
                  </p>
                  {member.bio && (
                    <p className="text-muted-foreground line-clamp-1 text-xs">
                      {member.bio}
                    </p>
                  )}
                </div>
              </div>
              {member.role !== "member" && (
                <Badge variant="secondary" className="capitalize">
                  {t(`roles.${member.role}`)}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
