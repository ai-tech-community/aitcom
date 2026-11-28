import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";

export function LearningProgress({
  percent,
  completed,
  total,
}: {
  percent: number;
  completed?: number;
  total?: number;
}) {
  const t = useTranslations("redesign.classroom");
  const label = t("percentComplete", { percent });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {completed !== undefined && total !== undefined ? (
          <span className="text-muted-foreground text-sm">
            {t("lessonsComplete", { completed, total })}
          </span>
        ) : null}
        <span className="font-mono text-xs font-medium tabular-nums">
          {label}
        </span>
      </div>
      <Progress
        value={percent}
        aria-label={t("courseProgress")}
        className="bg-muted h-1.5"
        indicatorClassName="bg-foreground motion-reduce:transition-none"
      />
    </div>
  );
}
