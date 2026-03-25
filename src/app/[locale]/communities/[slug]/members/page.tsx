"use client";
import { use } from "react";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export default function CommunityMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const t = useTranslations("communities");
  const { data, isLoading } = api.communities.getMembers.useQuery({ slug, limit: 50 });

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">{t("profile.members")}</h2>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-muted h-14 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {data?.items.map((member) => (
            <div key={member.userId} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                {member.image ? (
                  <img src={member.image} alt={member.displayName ?? ""} className="h-10 w-10 rounded-full" />
                ) : (
                  <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full font-bold">
                    {(member.displayName ?? "?")[0]}
                  </div>
                )}
                <div>
                  <p className="font-medium">{member.displayName}</p>
                  {member.bio && <p className="text-muted-foreground line-clamp-1 text-sm">{member.bio}</p>}
                </div>
              </div>
              {member.role !== "member" && (
                <Badge variant="secondary" className="capitalize">{t(`roles.${member.role}`)}</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
