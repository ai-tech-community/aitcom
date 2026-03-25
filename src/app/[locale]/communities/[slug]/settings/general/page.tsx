"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { SettingsForm } from "@/components/communities/manage/settings-form";
import { Spinner } from "@/components/ui/spinner";

export default function GeneralSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.manage");

  const { data: community, isLoading } = api.communities.getBySlug.useQuery({
    slug,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!community) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {t("settings")}
        </h2>
        <p className="text-muted-foreground text-sm">{community.name}</p>
      </div>
      <SettingsForm
        key={slug}
        slug={slug}
        initialData={{
          name: community.name,
          description: community.description,
          logoUrl: community.logoUrl,
          joinPolicy: community.joinPolicy,
          isListedInDirectory: community.isListedInDirectory,
        }}
      />
    </div>
  );
}
