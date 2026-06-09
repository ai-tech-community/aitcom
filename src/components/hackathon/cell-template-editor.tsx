"use client";

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

const MODES: CellRow["verificationMode"][] = [
  "platform-action",
  "test",
  "self-report",
  "peer-review",
  "consensus",
];

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
        <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
          <Input
            placeholder={t("taskDescription")}
            value={cell.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <Input
            placeholder={t("taskType")}
            value={cell.taskType}
            onChange={(e) => update(i, { taskType: e.target.value })}
          />
          <Select
            value={cell.verificationMode}
            onValueChange={(v) =>
              update(i, { verificationMode: v as CellRow["verificationMode"] })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("verificationMode")} />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            placeholder={t("deadlineMinutes")}
            value={cell.deadlineMinutes}
            onChange={(e) =>
              update(i, { deadlineMinutes: Number(e.target.value) || 1 })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove(i)}
          >
            {t("removeTask")}
          </Button>
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
