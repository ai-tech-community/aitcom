"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  DashboardSection,
  SectionBody,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { NOTIFICATION_SETTINGS_ANCHOR } from "@/lib/dashboard-routes";
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

/** One setting: its name and hint on the left, the switch on the right. */
function PrefRow({
  label,
  hint,
  control,
}: {
  label: string;
  hint?: string;
  control: (ids: { hintId?: string }) => React.ReactNode;
}) {
  const hintId = React.useId();
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && (
          <p id={hintId} className="text-muted-foreground text-xs text-pretty">
            {hint}
          </p>
        )}
      </div>
      {control({ hintId: hint ? hintId : undefined })}
    </li>
  );
}

function PrefsSkeleton() {
  return (
    <ul className="divide-border divide-y" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="flex items-center justify-between gap-4 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-5 w-9 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Email preferences, a section of the Settings tab: Hub emails, the weekly
 * digest, and per community the digest section and announcements. Saves
 * on each switch; a failed save says so.
 */
export function NotificationPrefs() {
  const t = useTranslations("notificationPrefs");
  const utils = api.useUtils();
  const prefs = api.notificationPrefs.get.useQuery();
  const communities = api.communities.getMyCommunities.useQuery();
  const mutationOptions = {
    onSuccess: () => {
      void utils.notificationPrefs.get.invalidate();
      toast.success(t("saved"));
    },
    onError: () => {
      toast.error(t("saveFailed"));
    },
  };
  const setOptout =
    api.notificationPrefs.setOptout.useMutation(mutationOptions);
  const setHubMail =
    api.notificationPrefs.setHubMail.useMutation(mutationOptions);

  const data = prefs.data;
  const digestOut = new Set(data?.digestOptOutCommunityIds ?? []);
  const bcastOut = new Set(data?.broadcastOptOutCommunityIds ?? []);
  const myCommunities = (communities.data ?? []).filter(
    (c) => c.status === "active",
  );

  return (
    <DashboardSection
      id={NOTIFICATION_SETTINGS_ANCHOR}
      title={t("settingsTitle")}
      // The community list only feeds the per-community switches: if it
      // fails, the Hub and digest switches still show.
      status={statusFromQueries(prefs)}
      skeleton={<PrefsSkeleton />}
    >
      {data && (
        <div className="space-y-8">
          <p className="text-muted-foreground max-w-prose text-sm text-pretty">
            {t("description")}
          </p>

          <div>
            <h3 className="text-sm font-semibold">{t("hubMailTitle")}</h3>
            <p className="text-muted-foreground mt-1 max-w-prose text-xs text-pretty">
              {t("hubMailHint")}
            </p>
            <ul className="divide-border mt-2 divide-y">
              {HUB_MAIL_ROWS.map((row) => (
                <PrefRow
                  key={row.case}
                  label={t(row.label)}
                  hint={t(row.hint)}
                  control={({ hintId }) => (
                    <Switch
                      aria-label={t(row.label)}
                      aria-describedby={hintId}
                      checked={data.hubMail[row.case]}
                      disabled={setHubMail.isPending}
                      onCheckedChange={(on) =>
                        setHubMail.mutate({ case: row.case, enabled: on })
                      }
                    />
                  )}
                />
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">{t("digestTitle")}</h3>
            <ul className="divide-border mt-2 divide-y">
              <PrefRow
                label={t("globalDigest")}
                hint={t("globalDigestHint")}
                control={({ hintId }) => (
                  <Switch
                    aria-label={t("globalDigest")}
                    aria-describedby={hintId}
                    checked={!data.globalDigestOptOut}
                    disabled={setOptout.isPending}
                    onCheckedChange={(on) =>
                      setOptout.mutate({
                        communityId: null,
                        category: "digest",
                        optedOut: !on,
                      })
                    }
                  />
                )}
              />
            </ul>

            <SectionBody
              status={statusFromQueries(communities, {
                isEmpty: myCommunities.length === 0,
              })}
              size="compact"
            >
              <div className="mt-4">
                <div className="text-muted-foreground border-border grid grid-cols-[1fr_auto_auto] gap-4 border-b pb-2 text-xs font-medium">
                  <span>{t("perCommunity")}</span>
                  <span>{t("digestColumn")}</span>
                  <span>{t("broadcastColumn")}</span>
                </div>
                <ul className="divide-border divide-y">
                  {myCommunities.map((c) => (
                    <li
                      key={c.communityId}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">
                        {c.name}
                      </span>
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
                    </li>
                  ))}
                </ul>
              </div>
            </SectionBody>
          </div>
        </div>
      )}
    </DashboardSection>
  );
}
