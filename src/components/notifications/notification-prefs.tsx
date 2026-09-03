"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Switch } from "@/components/ui/switch";
import { SectionLabel } from "@/components/ui/section-label";
import type { HubMailCase } from "@/server/notifications/hub-mail-prefs";

const HUB_MAIL_ROWS: {
  case: HubMailCase;
  label:
    | "hubMailDm"
    | "hubMailMention"
    | "hubMailForumReply"
    | "hubMailDigest"
    | "hubMailAgentJob";
  hint:
    | "hubMailDmHint"
    | "hubMailMentionHint"
    | "hubMailForumReplyHint"
    | "hubMailDigestHint"
    | "hubMailAgentJobHint";
}[] = [
  { case: "dm", label: "hubMailDm", hint: "hubMailDmHint" },
  { case: "mention", label: "hubMailMention", hint: "hubMailMentionHint" },
  {
    case: "forumReply",
    label: "hubMailForumReply",
    hint: "hubMailForumReplyHint",
  },
  { case: "digest", label: "hubMailDigest", hint: "hubMailDigestHint" },
  { case: "agentJob", label: "hubMailAgentJob", hint: "hubMailAgentJobHint" },
];

export function NotificationPrefs() {
  const t = useTranslations("notificationPrefs");
  const utils = api.useUtils();
  const prefs = api.notificationPrefs.get.useQuery();
  const communities = api.communities.getMyCommunities.useQuery();
  const setOptout = api.notificationPrefs.setOptout.useMutation({
    onSuccess: () => {
      void utils.notificationPrefs.get.invalidate();
      toast.success(t("saved"));
    },
  });
  const setHubMail = api.notificationPrefs.setHubMail.useMutation({
    onSuccess: () => {
      void utils.notificationPrefs.get.invalidate();
      toast.success(t("saved"));
    },
  });

  if (prefs.isLoading || communities.isLoading || !prefs.data) {
    return <div className="h-40 animate-pulse rounded-lg border" />;
  }

  const digestOut = new Set(prefs.data.digestOptOutCommunityIds);
  const bcastOut = new Set(prefs.data.broadcastOptOutCommunityIds);
  const myCommunities = (communities.data ?? []).filter(
    (c) => c.status === "active",
  );
  const hubMail = prefs.data.hubMail;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>{t("hubMailKicker")}</SectionLabel>
        <p className="text-muted-foreground text-xs">{t("hubMailHint")}</p>
        <div className="divide-y rounded-lg border">
          {HUB_MAIL_ROWS.map((row) => (
            <div
              key={row.case}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div>
                <p className="text-sm font-medium">{t(row.label)}</p>
                <p className="text-muted-foreground text-xs">{t(row.hint)}</p>
              </div>
              <Switch
                aria-label={t(row.label)}
                checked={hubMail[row.case]}
                disabled={setHubMail.isPending}
                onCheckedChange={(on) =>
                  setHubMail.mutate({ case: row.case, enabled: on })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">{t("globalDigest")}</p>
          <p className="text-muted-foreground text-xs">
            {t("globalDigestHint")}
          </p>
        </div>
        <Switch
          aria-label={t("globalDigest")}
          checked={!prefs.data.globalDigestOptOut}
          disabled={setOptout.isPending}
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
        <div className="text-muted-foreground grid grid-cols-[1fr_auto_auto] gap-4 border-b p-4 text-xs font-medium">
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
                aria-label={`${c.name} – ${t("digestColumn")}`}
                checked={!digestOut.has(c.communityId)}
                disabled={setOptout.isPending}
                onCheckedChange={(on) =>
                  setOptout.mutate({
                    communityId: c.communityId,
                    category: "digest",
                    optedOut: !on,
                  })
                }
              />
              <Switch
                aria-label={`${c.name} – ${t("broadcastColumn")}`}
                checked={!bcastOut.has(c.communityId)}
                disabled={setOptout.isPending}
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
