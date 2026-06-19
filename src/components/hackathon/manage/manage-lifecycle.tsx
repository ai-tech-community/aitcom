"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/confirm-dialog";

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
  initialPhase: "draft" | "live" | "locked" | "judging" | "finalized";
  hasCells: boolean;
}) {
  const t = useTranslations("hackathon");
  const confirm = useConfirm();
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
  const openJudging = api.hackathon.openJudging.useMutation({
    onSuccess: () => {
      setPhase("judging");
      toast.success(t("toastJudgingOpened"));
    },
    onError: (e) => toast.error(e.message),
  });
  // Only meaningful once judging is open; gating the query keeps it from
  // firing (and 403-ing on the organizer gate) during earlier phases.
  const progress = api.hackathon.judgingProgress.useQuery(
    { challengeId },
    { enabled: phase === "judging" },
  );

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

      {phase === "locked" && (
        <div className="space-y-1">
          <Button
            className="w-full"
            variant="secondary"
            disabled={openJudging.isPending}
            onClick={() => openJudging.mutate({ challengeId })}
          >
            Open judging
          </Button>
          <p className="text-muted-foreground text-xs">
            Open judging to let assigned judges rank submitted teams.
          </p>
        </div>
      )}

      {phase === "judging" && progress.data && (
        <p className="text-sm">
          {progress.data.submitted} of {progress.data.total} judges submitted
        </p>
      )}

      <div className="space-y-1">
        <Button
          className="w-full"
          variant="destructive"
          disabled={finalize.isPending || isDraft || phase === "finalized"}
          onClick={async () => {
            if (await confirm({ description: t("finalizeConfirm") })) {
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
