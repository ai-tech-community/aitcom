"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { authClient } from "@/server/better-auth/client";

import { api } from "@/trpc/react";
import type { RouterOutputs } from "@/trpc/react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Cell = RouterOutputs["teamWorkspace"]["cells"][number];

const UNASSIGNED = "__unassigned__";

const heatStateKey: Record<Cell["heatState"], string> = {
  pending: "cellPending",
  claimed: "cellClaimed",
  completed: "cellCompleted",
  verified: "cellVerified",
  failed: "cellFailed",
};

export function CellDrawer({
  teamId,
  cellId,
  members,
  onClose,
}: {
  teamId: string;
  cellId: string | null;
  members: { userId: string; displayName: string }[];
  onClose: () => void;
}) {
  const t = useTranslations("hackathon");
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;
  const utils = api.useUtils();
  const [output, setOutput] = useState("");

  const { data: cells } = api.teamWorkspace.cells.useQuery({ teamId });
  const cell = cellId ? cells?.find((c) => c.id === cellId) : undefined;

  const invalidate = async () => {
    await Promise.all([
      utils.teamWorkspace.cells.invalidate({ teamId }),
      utils.teamWorkspace.activity.invalidate({ teamId }),
    ]);
  };

  const assignCell = api.teamWorkspace.assignCell.useMutation({
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const claimCell = api.teamWorkspace.claimCellAsMember.useMutation({
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const releaseCell = api.teamWorkspace.releaseCell.useMutation({
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const reportResult = api.teamWorkspace.reportResult.useMutation({
    onSuccess: () => {
      setOutput("");
      void invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Sheet
      open={cellId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="gap-0 overflow-y-auto">
        {!cell ? (
          <SheetHeader>
            <SheetTitle>{t("cellPending")}</SheetTitle>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{cell.taskType}</SheetTitle>
              <SheetDescription>{cell.verificationMode}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-4 p-4">
              <div>
                <Badge>{t(heatStateKey[cell.heatState])}</Badge>
              </div>

              <dl className="text-muted-foreground space-y-1 font-mono text-xs">
                <div className="flex justify-between gap-2">
                  <dt>claimedByUserId</dt>
                  <dd className="truncate">{cell.claimedByUserId ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>assignedToUserId</dt>
                  <dd className="truncate">{cell.assignedToUserId ?? "—"}</dd>
                </div>
              </dl>

              {cell.result?.output ? (
                <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                  {cell.result.output}
                </pre>
              ) : null}

              {/* Assign */}
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs">
                  {t("assignTo")}
                </span>
                <Select
                  value={cell.assignedToUserId ?? UNASSIGNED}
                  disabled={assignCell.isPending}
                  onValueChange={(value) =>
                    assignCell.mutate({
                      cellId: cell.id,
                      teamId,
                      userId: value === UNASSIGNED ? null : value,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("assignTo")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>
                      {t("unassigned")}
                    </SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Claim */}
              {cell.heatState === "pending" ? (
                <Button
                  disabled={claimCell.isPending}
                  onClick={() =>
                    claimCell.mutate({ cellId: cell.id, teamId })
                  }
                >
                  {t("claim")}
                </Button>
              ) : null}

              {/* Release + Report */}
              {cell.heatState === "claimed" &&
              cell.claimedByUserId === currentUserId ? (
                <>
                  <Button
                    variant="outline"
                    disabled={releaseCell.isPending}
                    onClick={() =>
                      releaseCell.mutate({ cellId: cell.id, teamId })
                    }
                  >
                    {t("release")}
                  </Button>

                  <div className="flex flex-col gap-1.5">
                    <Textarea
                      placeholder={t("reportPlaceholder")}
                      value={output}
                      onChange={(e) => setOutput(e.target.value)}
                    />
                    <Button
                      disabled={reportResult.isPending || output.trim() === ""}
                      onClick={() =>
                        reportResult.mutate({
                          cellId: cell.id,
                          teamId,
                          output,
                        })
                      }
                    >
                      {t("report")}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
