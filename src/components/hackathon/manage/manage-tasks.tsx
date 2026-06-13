"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CellTemplateEditor,
  type CellRow,
} from "@/components/hackathon/cell-template-editor";

/**
 * Tasks tab: the CellTemplateEditor. Saves only the cellTemplate slice via
 * updateHackathon. Editable in draft; the template is frozen once published
 * (lockRosters materializes it into team grids), so the editor goes read-only
 * and Save is hidden.
 */
export function ManageTasks({
  challengeId,
  phase,
  initialCells,
}: {
  challengeId: number;
  phase: "draft" | "live" | "locked" | "judging" | "finalized";
  initialCells: CellRow[];
}) {
  const t = useTranslations("hackathon");
  const isDraft = phase === "draft";
  const [cells, setCells] = useState<CellRow[]>(initialCells);

  const save = api.hackathon.updateHackathon.useMutation({
    onSuccess: () => toast.success(t("saveChanges")),
    onError: (e) => toast.error(e.message),
  });

  const onSave = () => save.mutate({ challengeId, cellTemplate: cells });

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">{t("tasks")}</h2>
        <p className="text-muted-foreground text-xs">{t("tasksHint")}</p>
        {!isDraft ? (
          <p className="text-muted-foreground text-xs">{t("manageFrozen")}</p>
        ) : null}
        {isDraft ? (
          <CellTemplateEditor cells={cells} onChange={setCells} />
        ) : (
          <ul className="space-y-2">
            {cells.map((cell, i) => (
              <li
                key={i}
                className="border-border rounded-md border px-3 py-2 text-sm"
              >
                {cell.description || `#${i + 1}`}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isDraft ? (
        <Button className="w-full" disabled={save.isPending} onClick={onSave}>
          {t("saveChanges")}
        </Button>
      ) : null}
    </div>
  );
}
