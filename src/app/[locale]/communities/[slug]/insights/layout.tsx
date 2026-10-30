"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

export default function CommunityInsightsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.insights");

  const {
    data: myCommunities,
    isLoading,
    isError,
    refetch,
  } = api.communities.getMyCommunities.useQuery();

  const myMembership = myCommunities?.find((c) => c.slug === slug);
  const hasAccess =
    myMembership?.status === "active" &&
    (myMembership.role === "owner" ||
      myMembership.role === "admin" ||
      myMembership.role === "moderator");

  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  if (isLoading || !myCommunities) {
    return (
      <div role="status" aria-label={t("loading")} className="space-y-4 py-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!hasAccess || !myMembership) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground text-sm">{t("accessDenied")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
