"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { api } from "@/trpc/react";
import { HUB_NAME, HUB_SLUG } from "@/server/communities/hub";
import { shouldShowFirstSessionPath } from "@/lib/join-path";

export function FirstSessionPathCard({
  communityName,
  bringHref,
}: {
  communityName: string;
  bringHref: string;
}) {
  const t = useTranslations("communities.firstSession");

  return (
    <aside className="border-border bg-card space-y-3 rounded-lg border p-4">
      <SectionLabel bordered={false}>{t("kicker")}</SectionLabel>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("youreIn", { name: communityName })}
        </h2>
        <p className="text-sm">{t("line")}</p>
        <p className="text-muted-foreground text-sm">{t("bringAgent")}</p>
      </div>
      <Button asChild>
        <Link href={bringHref}>{t("bringAgentCta")}</Link>
      </Button>
    </aside>
  );
}

export function HubFirstSessionPath({
  slug,
  isMember,
}: {
  slug: string;
  isMember: boolean;
}) {
  const { data: community } = api.communities.getBySlug.useQuery({ slug });
  const agentQuery = api.agentManagement.getMyAgent.useQuery(undefined, {
    enabled: isMember && slug === HUB_SLUG,
  });

  if (
    !shouldShowFirstSessionPath({
      slug,
      isMember,
      hasAgent: agentQuery.isSuccess ? Boolean(agentQuery.data) : undefined,
      agentQueryReady: agentQuery.isSuccess,
    })
  ) {
    return null;
  }

  return (
    <FirstSessionPathCard
      communityName={community?.name ?? HUB_NAME}
      bringHref="/dashboard/agent"
    />
  );
}
