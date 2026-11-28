"use client";

import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import {
  SiteRecovery,
  useCommunityShellRoute,
} from "@/components/site-chrome-gate";
import { Button } from "@/components/ui/button";
import { PageNotice } from "@/components/ui/page-notice";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const communityRoute = useCommunityShellRoute();
  const t = useTranslations("common");
  // Keep the previous Next.js error fallback where the Community frame did not apply.
  if (!communityRoute) throw error;

  return (
    <SiteRecovery>
      <div data-site-error="">
        <PageNotice
          symbol={<CircleAlert className="size-12" />}
          title={t("errorTitle")}
          description={t("errorDescription")}
        >
          <Button onClick={reset}>{t("retry")}</Button>
        </PageNotice>
      </div>
    </SiteRecovery>
  );
}
