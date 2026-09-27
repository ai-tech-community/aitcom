import type { RouterOutputs } from "@/trpc/react";

export type OnboardingStatus = RouterOutputs["onboarding"]["getStatus"];
export type OnboardingStep = OnboardingStatus["checklist"][number];

/**
 * What the getting-started checklist should show, derived from the server
 * status. The one place that decides "hidden vs welcome vs checklist", so the
 * dashboard card and the site-wide reminder can never disagree.
 */
export type OnboardingChecklistView =
  | { kind: "hidden" }
  /** Member has not answered the intent questions yet. */
  | { kind: "welcome" }
  | {
      kind: "checklist";
      steps: OnboardingStep[];
      completedCount: number;
      totalCount: number;
      /** 0–100, for the progress bar. */
      percent: number;
    };

export function presentOnboardingChecklist(
  status: OnboardingStatus | undefined,
): OnboardingChecklistView {
  if (!status) return { kind: "hidden" };
  if (status.onboardingCompleted || status.dismissed) return { kind: "hidden" };
  if (!status.hasIntent) return { kind: "welcome" };

  const steps = status.checklist;
  const totalCount = steps.length;
  const completedCount = steps.filter((step) => step.completed).length;
  // Every step reads as done but the server has not flipped
  // onboardingCompleted yet (auto-detected steps not synced): nothing is
  // left to do, so there is nothing to show.
  if (totalCount === 0 || completedCount === totalCount) {
    return { kind: "hidden" };
  }

  return {
    kind: "checklist",
    steps,
    completedCount,
    totalCount,
    percent: Math.round((completedCount / totalCount) * 100),
  };
}

/**
 * True when every step reads as done (auto-detected included) but the server
 * has not recorded completion. Syncing then lets the server mark onboarding
 * complete and award the badge.
 */
export function isAwaitingCompletionSync(
  status: OnboardingStatus | undefined,
): boolean {
  if (!status?.hasProfile || status.onboardingCompleted) return false;
  const steps = status.checklist;
  return steps.length > 0 && steps.every((step) => step.completed);
}
