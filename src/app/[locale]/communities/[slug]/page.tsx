"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";

export default function CommunityOverviewPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.profile");
  const tRoles = useTranslations("communities.roles");

  const { data: community } = api.communities.getBySlug.useQuery({ slug });

  const { data: membersData, isLoading: membersLoading } =
    api.communities.getMembers.useQuery({ slug, limit: 12 });

  if (!community) {
    return null; // Layout handles the loading state
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Description section */}
      {community.description ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("overview")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">
              {community.description}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Recent members section */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("members")} ({community.memberCount})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-6" />
            </div>
          ) : membersData?.items.length ? (
            <div className="flex flex-col gap-6">
              {/* Avatar preview row */}
              <AvatarGroup>
                {membersData.items.slice(0, 8).map((member) => (
                  <Avatar key={member.userId}>
                    {member.image ? (
                      <AvatarImage
                        src={member.image}
                        alt={member.displayName ?? ""}
                      />
                    ) : null}
                    <AvatarFallback>
                      {(member.displayName ?? "?")[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </AvatarGroup>

              {/* Member list */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {membersData.items.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <Avatar>
                      {member.image ? (
                        <AvatarImage
                          src={member.image}
                          alt={member.displayName ?? ""}
                        />
                      ) : null}
                      <AvatarFallback>
                        {(member.displayName ?? "?")[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {member.displayName ?? "Member"}
                      </p>
                      <Badge variant="secondary" className="mt-0.5 text-xs">
                        {tRoles(member.role)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {/* View all link */}
              {community.memberCount > 12 ? (
                <Link
                  href={`/communities/${slug}/members` as never}
                  className="text-primary text-sm font-medium hover:underline"
                >
                  {t("members")} ({community.memberCount})
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No members yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
