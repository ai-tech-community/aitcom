"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  DashboardSection,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";

/**
 * Introductions an organizer suggested, waiting for the member's yes or no.
 * Supplementary and usually absent: nothing renders (no heading, no
 * skeleton) until there is one to answer, and a failed load leaves it out
 * instead of taking space from the notifications.
 */
export function IntroductionConsent() {
  const t = useTranslations("advisory");
  const tSection = useTranslations("dashboard.notifications");
  const utils = api.useUtils();
  const pending = api.advisory.myPendingIntroductions.useQuery();
  const respond = api.advisory.respondToIntroduction.useMutation({
    onSuccess: (res) => {
      if (res.status === "connected") toast.success(t("connected"));
      void utils.advisory.myPendingIntroductions.invalidate();
    },
    onError: () => {
      toast.error(tSection("actionFailed"));
    },
  });
  const items = pending.data ?? [];

  return (
    <DashboardSection
      title={tSection("introductionsTitle")}
      status={statusFromQueries(pending, { isEmpty: items.length === 0 })}
      optional
      appearWhenReady
    >
      <ul className="divide-border -mt-3 divide-y">
        {items.map((p) => (
          <li
            key={p.introId}
            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("connectTitle")}</p>
              <p className="text-muted-foreground text-sm text-pretty">
                {t("connectBody")}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                disabled={respond.isPending}
                onClick={() =>
                  respond.mutate({ introId: p.introId, accept: true })
                }
              >
                {t("accept")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={respond.isPending}
                onClick={() =>
                  respond.mutate({ introId: p.introId, accept: false })
                }
              >
                {t("decline")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </DashboardSection>
  );
}
