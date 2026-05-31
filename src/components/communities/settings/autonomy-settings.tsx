"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Switch } from "@/components/ui/switch";

export function AutonomySettings({ slug }: { slug: string }) {
  const t = useTranslations("autonomy");
  const utils = api.useUtils();
  const communities = api.communities.getMyCommunities.useQuery();
  const setLevel = api.communities.setAutonomyLevel.useMutation({
    onSuccess: () => utils.communities.getMyCommunities.invalidate(),
  });
  const community = communities.data?.find((c) => c.slug === slug);
  if (communities.isLoading || !community) {
    return <div className="h-24 animate-pulse rounded-lg border" />;
  }
  const on = community.autonomyLevel === "suggest";
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">{t("enabled")}</p>
          <p className="text-muted-foreground text-xs">{t("enabledHint")}</p>
        </div>
        <Switch
          aria-label={t("enabled")}
          checked={on}
          disabled={setLevel.isPending}
          onCheckedChange={(checked) =>
            setLevel.mutate({ slug, level: checked ? "suggest" : "off" })
          }
        />
      </div>
    </div>
  );
}
