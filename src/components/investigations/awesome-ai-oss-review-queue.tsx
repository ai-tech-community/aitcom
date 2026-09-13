"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AWESOME_CATEGORY_LABELS,
  type AwesomeCategoryId,
  type AwesomeLocale,
} from "@/lib/investigations/awesome-ai-oss";
import { api } from "@/trpc/react";

export function AwesomeAiOssReviewQueue({ locale }: { locale: AwesomeLocale }) {
  const t = useTranslations("investigationsAwesomeAiOss");
  const utils = api.useUtils();
  const queue = api.awesomeAiOss.pendingQueue.useQuery();
  const moderate = api.awesomeAiOss.moderate.useMutation({
    onSuccess: async () => {
      await utils.awesomeAiOss.pendingQueue.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const [reasons, setReasons] = useState<Record<string, string>>({});

  if (queue.error) {
    return <EmptyState title={queue.error.message} />;
  }

  const items = queue.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {items.length === 0 ? (
        <EmptyState title={t("queueEmpty")} />
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="border-border flex flex-col gap-4 rounded-xl border p-6 shadow-sm"
            >
              <div className="flex flex-col gap-1">
                <p className="font-semibold">{item.name}</p>
                <a
                  href={item.repoUrl}
                  className="text-muted-foreground text-sm break-all underline-offset-4 hover:underline"
                >
                  {item.repoUrl}
                </a>
                <p className="text-muted-foreground text-sm">
                  {
                    AWESOME_CATEGORY_LABELS[item.category as AwesomeCategoryId][
                      locale
                    ]
                  }
                </p>
                <p className="text-sm">{item.blurbEn}</p>
                {item.reviewerNote ? (
                  <p className="text-muted-foreground text-sm">
                    {item.reviewerNote}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`reject-reason-${item.id}`}>
                  {t("rejectReason")}
                </Label>
                <Textarea
                  id={`reject-reason-${item.id}`}
                  value={reasons[item.id] ?? ""}
                  onChange={(event) =>
                    setReasons((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    moderate.mutate({
                      projectId: item.id,
                      action: "approve",
                    })
                  }
                  disabled={moderate.isPending}
                >
                  {t("approveList")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    moderate.mutate({
                      projectId: item.id,
                      action: "reject",
                      reason: reasons[item.id]?.trim() || undefined,
                    })
                  }
                  disabled={moderate.isPending}
                >
                  {t("reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
