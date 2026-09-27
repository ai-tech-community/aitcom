"use client";

import { useCallback, useEffect, useRef } from "react";

import { api } from "@/trpc/react";
import {
  isAwaitingCompletionSync,
  presentOnboardingChecklist,
  type OnboardingChecklistView,
} from "./checklist-view";
import { useOnboardingDismissal } from "./use-onboarding-dismissal";

/**
 * The browser-only dismiss flag the dashboard card used before dismissal
 * moved to the account. Removed on sight; never read.
 */
export const LEGACY_DISMISS_KEY = "onboarding-dismissed";

/**
 * When to persist auto-detected steps (profile filled, agent set up, first
 * thread, ...). Syncing writes rows and awards XP, so it is not free:
 * - "on-mount": every mount while onboarding is open (the dashboard card,
 *   which is where members check their progress).
 * - "on-finish": only once every step already reads as done, so a member who
 *   never opens the dashboard still gets onboarding closed out. Used by the
 *   site-wide reminder, which mounts on every page.
 * - "off": never; another surface on the page owns syncing.
 */
export type OnboardingSyncPolicy = "on-mount" | "on-finish" | "off";

export interface OnboardingChecklistController {
  view: OnboardingChecklistView;
  isLoading: boolean;
  /** Record a manual step (the member followed its link). */
  completeStep: (stepSlug: string) => void;
  /** "Don't show again": stored on the account, hides every surface. */
  dismiss: () => void;
}

/**
 * Shared data + behaviour for every getting-started surface. The dashboard
 * card and the floating reminder render different shells around the same
 * controller, so progress, completion and dismissal have one source of truth.
 */
export function useOnboardingChecklist({
  sync,
}: {
  sync: OnboardingSyncPolicy;
}): OnboardingChecklistController {
  const utils = api.useUtils();
  const { data, isLoading } = api.onboarding.getStatus.useQuery();

  const refresh = useCallback(
    () => void utils.onboarding.getStatus.invalidate(),
    [utils],
  );

  const syncMutation = api.onboarding.syncAutoDetected.useMutation({
    onSuccess: refresh,
  });
  const completeMutation = api.onboarding.completeStep.useMutation({
    onSuccess: refresh,
  });
  const { dismiss } = useOnboardingDismissal();

  // Auto-detected steps: sync at most once per mount, per policy.
  const synced = useRef(false);
  const shouldSync =
    sync === "on-mount"
      ? !!data?.hasProfile && !data.onboardingCompleted
      : sync === "on-finish" && isAwaitingCompletionSync(data);
  const { mutate: runSync } = syncMutation;
  useEffect(() => {
    if (!shouldSync || synced.current) return;
    synced.current = true;
    runSync();
  }, [shouldSync, runSync]);

  // Drop the old browser-only flag. It is not carried over to the account:
  // it belongs to the browser, not the member, so on a shared computer it
  // would dismiss for the wrong person. Members who dismissed before see the
  // checklist once more and can dismiss it for good.
  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_DISMISS_KEY);
    } catch {
      // Storage blocked (private mode, policy): nothing to clean up.
    }
  }, []);

  const { mutate: runComplete } = completeMutation;
  const completeStep = useCallback(
    (stepSlug: string) => runComplete({ stepSlug }),
    [runComplete],
  );

  return {
    view: presentOnboardingChecklist(data),
    isLoading,
    completeStep,
    dismiss,
  };
}
