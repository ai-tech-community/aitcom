"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Lifecycle tab: publish → lock rosters → finalize. Each owns its mutation and
 * advances the local phase optimistically (the server is the source of truth on
 * reload — see hackathonPhase). `hasCells` gates publish (needs ≥1 task) without
 * pulling the whole task editor into this tab.
 */
export function ManageLifecycle({
  challengeId,
  eventId,
  initialPhase,
  hasCells,
}: {
  challengeId: number;
  eventId: number;
  initialPhase: "draft" | "live" | "locked" | "finalized";
  hasCells: boolean;
}) {
  const t = useTranslations("hackathon");
  const utils = api.useUtils();
  const [phase, setPhase] = useState(initialPhase);
  const isDraft = phase === "draft";

  const publish = api.hackathon.publishHackathon.useMutation({
    onSuccess: () => {
      setPhase("live");
      toast.success(t("statusLive"));
    },
    onError: (e) => toast.error(e.message),
  });
  const lock = api.hackathon.lockRosters.useMutation({
    onSuccess: () => {
      setPhase("locked");
      toast.success(t("statusLocked"));
    },
    onError: (e) => toast.error(e.message),
  });
  const finalize = api.hackathon.finalizeHackathon.useMutation({
    onSuccess: () => {
      setPhase("finalized");
      void utils.hackathon.teamLeaderboard.invalidate({ challengeId });
      toast.success(t("statusFinalized"));
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="space-y-4 p-4">
      <h2 className="text-sm font-medium">{t("lifecycle")}</h2>

      <div className="space-y-1">
        <Button
          className="w-full"
          disabled={publish.isPending || !isDraft || !hasCells}
          onClick={() => publish.mutate({ challengeId, eventId })}
        >
          {t("publish")}
        </Button>
        <p className="text-muted-foreground text-xs">{t("publishDesc")}</p>
      </div>

      <div className="space-y-1">
        <Button
          className="w-full"
          variant="secondary"
          disabled={lock.isPending || isDraft || phase === "finalized"}
          onClick={() => lock.mutate({ challengeId })}
        >
          {t("lockRosters")}
        </Button>
        <p className="text-muted-foreground text-xs">
          {isDraft ? t("publishFirst") : t("lockRostersDesc")}
        </p>
      </div>

      <div className="space-y-1">
        <Button
          className="w-full"
          variant="destructive"
          disabled={finalize.isPending || isDraft || phase === "finalized"}
          onClick={() => {
            if (window.confirm(t("finalizeConfirm"))) {
              finalize.mutate({ challengeId });
            }
          }}
        >
          {t("finalize")}
        </Button>
        <p className="text-muted-foreground text-xs">
          {isDraft ? t("publishFirst") : t("finalizeDesc")}
        </p>
      </div>
    </Card>
  );
}
