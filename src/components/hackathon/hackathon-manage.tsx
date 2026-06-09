"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  CellTemplateEditor,
  type CellRow,
} from "@/components/hackathon/cell-template-editor";

export function HackathonManage({
  communitySlug,
  eventId,
  eventStatus,
  challengeId,
  challengeStatus,
  initialCells,
  teamMin,
  teamMax,
}: {
  communitySlug: string;
  eventId: number;
  eventStatus: string;
  challengeId: number;
  challengeStatus: string;
  initialCells: CellRow[];
  teamMin: number;
  teamMax: number;
}) {
  const t = useTranslations("hackathon");
  const [cells, setCells] = useState<CellRow[]>(initialCells);
  const [status, setStatus] = useState({
    event: eventStatus,
    challenge: challengeStatus,
  });

  const save = api.hackathon.updateHackathon.useMutation({
    onSuccess: () => toast.success(t("saveTasks")),
    onError: (e) => toast.error(e.message),
  });
  const publish = api.hackathon.publishHackathon.useMutation({
    onSuccess: () => {
      setStatus((s) => ({ ...s, event: "published", challenge: "active" }));
      toast.success(t("statusPublished"));
    },
    onError: (e) => toast.error(e.message),
  });
  const lock = api.hackathon.lockRosters.useMutation({
    onSuccess: () => toast.success(t("statusLocked")),
    onError: (e) => toast.error(e.message),
  });
  const finalize = api.hackathon.finalizeHackathon.useMutation({
    onSuccess: () => toast.success(t("finalize")),
    onError: (e) => toast.error(e.message),
  });

  const isDraft = status.event === "draft";

  return (
    <section className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/communities/${communitySlug}/events`}
            className="text-muted-foreground text-sm hover:underline"
          >
            ← {t("manage")}
          </Link>
          <p className="text-muted-foreground text-xs">
            {t("teamMin")}: {teamMin} · {t("teamMax")}: {teamMax}
          </p>
        </div>
        <Badge variant={isDraft ? "outline" : "secondary"}>
          {isDraft ? t("statusDraft") : t("statusPublished")}
        </Badge>
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">{t("tasks")}</h2>
        <CellTemplateEditor cells={cells} onChange={setCells} />
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() => save.mutate({ challengeId, cellTemplate: cells })}
        >
          {t("saveTasks")}
        </Button>
      </Card>

      <Card className="flex flex-wrap gap-2 p-4">
        <Button
          disabled={publish.isPending || !isDraft || cells.length === 0}
          onClick={() => publish.mutate({ challengeId, eventId })}
        >
          {t("publish")}
        </Button>
        <Button
          variant="secondary"
          disabled={lock.isPending || isDraft}
          onClick={() => lock.mutate({ challengeId })}
        >
          {t("lockRosters")}
        </Button>
        <Button
          variant="destructive"
          disabled={finalize.isPending || isDraft}
          onClick={() => finalize.mutate({ challengeId })}
        >
          {t("finalize")}
        </Button>
      </Card>
    </section>
  );
}
