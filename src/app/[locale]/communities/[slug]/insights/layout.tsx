"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";

export default function CommunityInsightsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.insights");

  const { data: myCommunities, isLoading } =
    api.communities.getMyCommunities.useQuery();

  const myMembership = myCommunities?.find((c) => c.slug === slug);
  const hasAccess =
    myMembership?.status === "active" &&
    (myMembership.role === "owner" ||
      myMembership.role === "admin" ||
      myMembership.role === "moderator");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
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
