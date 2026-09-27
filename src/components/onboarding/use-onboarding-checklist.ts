"use client";

import { useCallback, useEffect, useRef } from "react";

import { api } from "@/trpc/react";
import {
  isAwaitingCompletionSync,
  presentOnboardingChecklist,
  type OnboardingChecklistView,
} from "./checklist-view";

/**
 * The browser-only dismiss flag the dashboard card used before dismissal
 * moved to the account. Read once to carry an old choice over, then removed.
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
  const dismissMutation = api.onboarding.dismiss.useMutation({
    // Hide at once; the server write follows. Roll back if it fails so the
    // member is not told "hidden" when the account did not record it.
    onMutate: async () => {
      await utils.onboarding.getStatus.cancel();
      const previous = utils.onboarding.getStatus.getData();
      utils.onboarding.getStatus.setData(undefined, (old) =>
        old ? { ...old, dismissed: true } : old,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        utils.onboarding.getStatus.setData(undefined, context.previous);
      }
    },
    onSettled: refresh,
  });

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

  // Carry an old browser-only dismissal over to the account, once.
  const { mutate: runDismiss } = dismissMutation;
  const legacyChecked = useRef(false);
  useEffect(() => {
    if (!data || legacyChecked.current) return;
    legacyChecked.current = true;
    try {
      const legacy = window.localStorage.getItem(LEGACY_DISMISS_KEY);
      if (legacy === null) return;
      // No profile row yet: nothing to write the choice to. Keep the flag
      // so the next visit (after the profile exists) can carry it over.
      if (legacy === "true" && !data.dismissed && !data.hasProfile) return;
      if (legacy === "true" && !data.dismissed) runDismiss();
      window.localStorage.removeItem(LEGACY_DISMISS_KEY);
    } catch {
      // Storage blocked (private mode, policy): nothing to carry over.
    }
  }, [data, runDismiss]);

  const { mutate: runComplete } = completeMutation;
  const completeStep = useCallback(
    (stepSlug: string) => runComplete({ stepSlug }),
    [runComplete],
  );
  const dismiss = useCallback(() => runDismiss(), [runDismiss]);

  return {
    view: presentOnboardingChecklist(data),
    isLoading,
    completeStep,
    dismiss,
  };
}
