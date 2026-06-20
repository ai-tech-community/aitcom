"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useRouter } from "@/i18n/navigation";
import { Loader2 } from "lucide-react";

export function RedeemInviteClient({ token }: { token: string }) {
  const router = useRouter();
  const hasFired = useRef(false);
  const t = useTranslations("communities.invite");

  const mutation = api.communities.redeemInvite.useMutation({
    onSuccess: (data) => {
      if (data.status === "active") {
        router.replace(`/communities/${data.communitySlug}`);
      }
      // pending_approval falls through to the pending message below
    },
  });

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    mutation.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (mutation.data?.status === "pending_approval") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">{t("pendingTitle")}</p>
          <p className="text-muted-foreground mt-2 text-sm">{t("pendingBody")}</p>
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
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-destructive text-lg font-medium">
            {mutation.error.message}
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

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
