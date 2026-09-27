"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { SectionLabel } from "@/components/ui/section-label";
import {
  OnboardingProgress,
  OnboardingStepList,
  OnboardingWelcome,
} from "@/components/onboarding/onboarding-steps";
import { useOnboardingChecklist } from "@/components/onboarding/use-onboarding-checklist";

/**
 * Dashboard card for the getting-started checklist. Data, step logic and the
 * account-level dismissal come from useOnboardingChecklist, shared with the
 * site-wide OnboardingReminder.
 */
export function OnboardingChecklist() {
  const t = useTranslations("onboarding");
  const { view, completeStep, dismiss } = useOnboardingChecklist({
    sync: "on-mount",
  });

  if (view.kind === "hidden") return null;

  const dismissButton = (
    <button
      type="button"
      onClick={dismiss}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded p-1 transition-colors outline-none focus-visible:ring-[3px]"
      aria-label={t("reminder.dontShowAgain")}
      title={t("reminder.dontShowAgain")}
    >
      <X aria-hidden className="h-3.5 w-3.5" />
    </button>
  );

  if (view.kind === "welcome") {
    return (
      <div className="border-border bg-card relative rounded-lg border border-dashed px-4 py-5">
        <div className="absolute top-2 right-2">{dismissButton}</div>
        <OnboardingWelcome />
      </div>
    );
  }

  return (
    <div className="border-border bg-card rounded-lg border">
      <div className="border-border border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <SectionLabel bordered={false}>{t("checklistTitle")}</SectionLabel>
          {dismissButton}
        </div>
        <OnboardingProgress
          completedCount={view.completedCount}
          totalCount={view.totalCount}
          percent={view.percent}
          className="mt-2"
        />
      </div>
      <OnboardingStepList steps={view.steps} onFollowStep={completeStep} />
    </div>
  );
}
