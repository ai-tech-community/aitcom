"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  OnboardingProgress,
  OnboardingStepList,
  OnboardingWelcome,
} from "@/components/onboarding/onboarding-steps";
import { useOnboardingChecklist } from "@/components/onboarding/use-onboarding-checklist";
import { DashboardSection } from "@/components/dashboard/dashboard-section";

/**
 * The getting-started checklist in the side panel, on every dashboard tab
 * until the member finishes or dismisses it. Data, step logic and the
 * account-level dismissal come from useOnboardingChecklist, shared with the
 * site-wide OnboardingReminder. Before the intent questions are answered it
 * points to /dashboard/onboarding.
 *
 * Supplementary: the checklist presenter reads "hidden" while loading, on a
 * failed load, and once onboarding is done, so the card stays out of the way
 * in all three cases instead of flashing a skeleton most members never need.
 */
export function GetStartedCard() {
  const t = useTranslations("onboarding");
  const tDashboard = useTranslations("dashboard");
  const { view, completeStep, dismiss } = useOnboardingChecklist({
    sync: "on-mount",
  });

  return (
    <DashboardSection
      variant="card"
      optional
      title={tDashboard("getStarted.title")}
      status={view.kind === "hidden" ? { kind: "empty" } : { kind: "ready" }}
      action={
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary/50 focus-visible:ring-ring/50 -my-1 inline-flex size-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px]"
          aria-label={t("reminder.dontShowAgain")}
          title={t("reminder.dontShowAgain")}
        >
          <X aria-hidden className="size-4" />
        </button>
      }
    >
      {view.kind === "welcome" && <OnboardingWelcome />}
      {view.kind === "checklist" && (
        <div className="space-y-2">
          <OnboardingProgress
            completedCount={view.completedCount}
            totalCount={view.totalCount}
            percent={view.percent}
          />
          <div className="-mx-4 -mb-4">
            <OnboardingStepList
              steps={view.steps}
              onFollowStep={completeStep}
            />
          </div>
        </div>
      )}
    </DashboardSection>
  );
}
