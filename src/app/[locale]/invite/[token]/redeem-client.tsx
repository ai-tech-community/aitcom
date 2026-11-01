"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useRouter } from "@/i18n/navigation";
import { z } from "zod";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

export function RedeemInviteClient({
  token,
  attribution = "",
}: {
  token: string;
  attribution?: string;
}) {
  const router = useRouter();
  const hasFired = useRef(false);
  const t = useTranslations("communities.invite");

  const mutation = api.communities.redeemInvite.useMutation({
    onSuccess: (data) => {
      if (data.status === "active") {
        router.replace(`/communities/${data.communitySlug}${attribution}`);
      }
      // pending_approval falls through to the pending message below
    },
  });

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    const delivery = new URLSearchParams(attribution).get("delivery");
    mutation.mutate({
      token,
      deliveryId:
        delivery && z.uuid().safeParse(delivery).success ? delivery : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (mutation.data?.status === "pending_approval") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">{t("pendingTitle")}</p>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("pendingBody")}
          </p>
          <button
            onClick={() => router.replace("/communities")}
            className="text-muted-foreground mt-4 underline"
          >
            {t("browse")}
          </button>
        </div>
      </div>
    );
  }

  if (mutation.error) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={t("errorBody")}
        onRetry={() => {
          const delivery = new URLSearchParams(attribution).get("delivery");
          mutation.mutate({
            token,
            deliveryId:
              delivery && z.uuid().safeParse(delivery).success
                ? delivery
                : undefined,
          });
        }}
      />
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Skeleton className="h-24 w-full max-w-md" />
    </div>
  );
}
