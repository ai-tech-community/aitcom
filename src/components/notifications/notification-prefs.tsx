"use client";

import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Switch } from "@/components/ui/switch";

export function NotificationPrefs() {
  const t = useTranslations("notificationPrefs");
  const utils = api.useUtils();
  const prefs = api.notificationPrefs.get.useQuery();
  const communities = api.communities.getMyCommunities.useQuery();
  const setOptout = api.notificationPrefs.setOptout.useMutation({
    onSuccess: () => utils.notificationPrefs.get.invalidate(),
  });

  if (prefs.isLoading || communities.isLoading || !prefs.data) {
    return <div className="h-40 animate-pulse rounded-lg border" />;
  }

  const digestOut = new Set(prefs.data.digestOptOutCommunityIds);
  const bcastOut = new Set(prefs.data.broadcastOptOutCommunityIds);
  const myCommunities = (communities.data ?? []).filter(
    (c) => c.status === "active",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">{t("globalDigest")}</p>
          <p className="text-muted-foreground text-xs">{t("globalDigestHint")}</p>
        </div>
        <Switch
          checked={!prefs.data.globalDigestOptOut}
          onCheckedChange={(on) =>
            setOptout.mutate({
              communityId: null,
              category: "digest",
              optedOut: !on,
            })
          }
        />
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b p-4 text-xs font-medium text-zinc-500">
          <span>{t("perCommunity")}</span>
          <span>{t("digestColumn")}</span>
          <span>{t("broadcastColumn")}</span>
        </div>
        <div className="divide-y">
          {myCommunities.map((c) => (
            <div
              key={c.communityId}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-4 p-4"
            >
              <span className="text-sm font-medium">{c.name}</span>
              <Switch
                checked={!digestOut.has(c.communityId)}
                onCheckedChange={(on) =>
                  setOptout.mutate({
                    communityId: c.communityId,
                    category: "digest",
                    optedOut: !on,
                  })
                }
              />
              <Switch
                checked={!bcastOut.has(c.communityId)}
                onCheckedChange={(on) =>
                  setOptout.mutate({
                    communityId: c.communityId,
                    category: "broadcast",
                    optedOut: !on,
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
