"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { SettingsSidebar } from "@/components/communities/settings/settings-sidebar";

export default function CommunitySettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.manage");

  const { data: myCommunities, isLoading } =
    api.communities.getMyCommunities.useQuery();

  const myMembership = myCommunities?.find((c) => c.slug === slug);
  const isAdminOrOwner =
    myMembership?.role === "owner" || myMembership?.role === "admin";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!isAdminOrOwner || !myMembership) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground text-sm">{t("accessDenied")}</p>
      </div>
    );
  }

  return (
    // Columns follow the settings area's own width, not the screen's: the
    // community rail takes part of the screen from `lg`.
    <div className="@container">
      <div className="flex flex-col gap-6 @3xl:flex-row @3xl:items-start @3xl:gap-8">
        <SettingsSidebar slug={slug} memberRole={myMembership.role} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
