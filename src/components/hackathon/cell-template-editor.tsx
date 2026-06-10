"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CellRow {
  description: string;
  taskType: string;
  verificationMode:
    | "platform-action"
    | "test"
    | "self-report"
    | "peer-review"
    | "consensus";
  deadlineMinutes: number;
}

export const emptyCell = (): CellRow => ({
  description: "",
  taskType: "",
  verificationMode: "self-report",
  deadlineMinutes: 60,
});

const MODES: { value: CellRow["verificationMode"]; labelKey: string }[] = [
  { value: "platform-action", labelKey: "vmPlatformAction" },
  { value: "test", labelKey: "vmTest" },
  { value: "self-report", labelKey: "vmSelfReport" },
  { value: "peer-review", labelKey: "vmPeerReview" },
  { value: "consensus", labelKey: "vmConsensus" },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export function CellTemplateEditor({
  cells,
  onChange,
}: {
  cells: CellRow[];
  onChange: (next: CellRow[]) => void;
}) {
  const t = useTranslations("hackathon");

  const update = (i: number, patch: Partial<CellRow>) =>
    onChange(cells.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(cells.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {cells.map((cell, i) => (
        <div key={i} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">#{i + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(i)}
            >
              {t("removeTask")}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t("taskDescription")}>
              <Input
                value={cell.description}
                onChange={(e) => update(i, { description: e.target.value })}
              />
            </Field>
            <Field label={t("taskType")}>
              <Input
                value={cell.taskType}
                onChange={(e) => update(i, { taskType: e.target.value })}
              />
            </Field>
            <Field label={t("verificationMode")}>
              <Select
                value={cell.verificationMode}
                onValueChange={(v) =>
                  update(i, {
                    verificationMode: v as CellRow["verificationMode"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {t(m.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("deadlineMinutes")}>
              <Input
                type="number"
                min={1}
                value={cell.deadlineMinutes}
                onChange={(e) =>
                  update(i, { deadlineMinutes: Number(e.target.value) || 1 })
                }
              />
            </Field>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...cells, emptyCell()])}
      >
        {t("addTask")}
      </Button>
    </div>
  );
}
