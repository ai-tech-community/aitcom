"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

export function NewsRumorActions({
  id,
  hidden,
}: {
  id: string;
  hidden: boolean;
}) {
  const t = useTranslations("newsPage");
  const router = useRouter();
  const moderate = api.news.moderateRumor.useMutation({
    onSuccess: () => router.refresh(),
  });

  return (
    <div className="mt-3 flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={moderate.isPending}
        onClick={() =>
          moderate.mutate({ id, action: hidden ? "show" : "hide" })
        }
      >
        {hidden ? t("show") : t("hide")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={moderate.isPending}
        onClick={() => moderate.mutate({ id, action: "delete" })}
      >
        {t("delete")}
      </Button>
    </div>
  );
}
