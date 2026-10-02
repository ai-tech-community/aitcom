"use client";

import { useTranslations } from "next-intl";

import { calculateLevel, xpForNextLevel } from "@/lib/gamification";
import { Progress } from "@/components/ui/progress";

/**
 * XP toward the next level, in ink (not the accent: the bar is a reading,
 * not the screen's one action). The value text says "120 of 200 XP".
 */
export function XpProgress({ xp }: { xp: number }) {
  const t = useTranslations("memberProfile");
  const level = calculateLevel(xp);
  const toNext = xpForNextLevel(xp);
  const percent = Math.round((toNext.current / toNext.needed) * 100);
  const valueLabel = t("xpToNext", {
    current: toNext.current,
    needed: toNext.needed,
  });

  return (
    <div className="space-y-1.5">
      <Progress
        value={percent}
        aria-label={t("xpLabel", { next: level + 1 })}
        getValueLabel={() => valueLabel}
        className="bg-muted h-1.5"
        indicatorClassName="bg-foreground motion-reduce:transition-none"
      />
      <p className="text-muted-foreground flex justify-between font-mono text-xs tabular-nums">
        <span>{t("xpTotal", { xp })}</span>
        <span aria-hidden>
          {toNext.current}/{toNext.needed}
        </span>
      </p>
    </div>
  );
}
