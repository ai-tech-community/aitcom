"use client";

import { useTranslations } from "next-intl";

export function BuilderConnectionSteps({ current }: { current: 1 | 2 | 3 }) {
  const t = useTranslations("redesign.builder");
  return (
    <ol
      aria-label={t("onboarding.label")}
      className="border-border my-3 grid overflow-hidden rounded-md border sm:grid-cols-3"
    >
      {(["create", "connect", "check"] as const).map((step, index) => {
        const number = index + 1;
        const active = current === number;
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={`border-border flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 sm:border-e sm:border-b-0 sm:last:border-e-0 ${active ? "bg-muted text-foreground font-semibold" : "text-muted-foreground"}`}
          >
            <span
              aria-hidden
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${active ? "border-foreground bg-foreground text-background" : "border-border"}`}
            >
              {number}
            </span>
            {t(`onboarding.${step}`)}
          </li>
        );
      })}
    </ol>
  );
}
