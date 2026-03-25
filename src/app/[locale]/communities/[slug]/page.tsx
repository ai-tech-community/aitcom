"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
    return null;
  }

  return (
    <div className="flex flex-col gap-10">
      {/* About */}
      {community.description ? (
        <section>
          <h2 className="text-muted-foreground border-border border-b pb-2 font-mono text-xs font-medium tracking-wider">
            / ABOUT
          </h2>
          <p className="text-muted-foreground mt-4 whitespace-pre-wrap text-sm leading-relaxed">
            {community.description}
          </p>
        </section>
      ) : null}

      {/* Members */}
      <section>
        <div className="border-border flex items-center justify-between border-b pb-2">
          <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("members").toUpperCase()} ({community.memberCount})
          </h2>
          {community.memberCount > 12 ? (
            <Link
              href={`/communities/${slug}/members` as never}
              className="text-muted-foreground hover:text-foreground font-mono text-[10px] tracking-wider transition-colors"
            >
              VIEW ALL +
            </Link>
          ) : null}
        </div>

        {membersLoading ? (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-muted h-14 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : membersData?.items.length ? (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {membersData.items.map((member) => (
              <div
                key={member.userId}
                className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
              >
                <Avatar className="size-8">
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
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.displayName ?? "Member"}
                  </p>
                </div>
                {member.role !== "member" && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {tRoles(member.role)}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-6 text-center font-mono text-xs tracking-wider">
            No members yet.
          </p>
        )}
      </section>
    </div>
  );
}
