"use client";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

export function IntroductionConsent() {
  const t = useTranslations("advisory");
  const utils = api.useUtils();
  const pending = api.advisory.myPendingIntroductions.useQuery();
  const respond = api.advisory.respondToIntroduction.useMutation({
    onSuccess: (res) => {
      if (res.status === "connected") toast.success(t("connected"));
      void utils.advisory.myPendingIntroductions.invalidate();
    },
  });
  if (pending.isLoading || !pending.data || pending.data.length === 0)
    return null;
  return (
    <div className="space-y-3">
      {pending.data.map((p) => (
        <div key={p.introId} className="rounded-lg border p-4">
          <p className="text-sm font-medium">{t("connectTitle")}</p>
          <p className="text-muted-foreground text-xs">{t("connectBody")}</p>
          <div className="mt-3 flex gap-2">
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
        </div>
      ))}
    </div>
  );
}
