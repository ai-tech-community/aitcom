// src/app/[locale]/benchmark/_components/dashboard/runner-up-note.tsx
"use client";

import { useTranslations } from "next-intl";

type Props = {
  runnerUp: {
    canonicalName: string;
    sharePct: number | null;
  } | null;
};

export function RunnerUpNote({ runnerUp }: Props) {
  const t = useTranslations("benchmark");
  if (runnerUp?.sharePct == null) return null;
  return (
    <p className="text-muted-foreground mt-2 text-sm italic">
      {t("hero.runnerUp", {
        brand: runnerUp.canonicalName,
        pct: runnerUp.sharePct.toFixed(1),
      })}
    </p>
  );
}
