"use client";

import { useCallback } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import type { OnboardingStatus } from "./checklist-view";
import { clearHiddenForVisit } from "./use-hidden-for-visit";

export interface OnboardingDismissal {
  /** "Don't show again": stored on the account, hides every surface. */
  dismiss: () => void;
  /** Undo "Don't show again": the card and the reminder come back. */
  restore: () => void;
  /** A dismiss or restore is on its way to the server. */
  isPending: boolean;
}

/**
 * The one owner of the account-level "show the getting-started checklist"
 * choice. The checklist surfaces (dismiss) and the settings switch (both
 * directions) go through here, so the optimistic cache update, rollback and
 * failure message are written once.
 *
 * Both writes update the shared onboarding.getStatus cache at once and then
 * refetch it, so every mounted surface (dashboard card, floating reminder,
 * settings switch) follows without a reload.
 */
export function useOnboardingDismissal(): OnboardingDismissal {
  const utils = api.useUtils();
  const t = useTranslations("onboarding");

  const refresh = useCallback(
    () => void utils.onboarding.getStatus.invalidate(),
    [utils],
  );

  // Write the expected server state into the cache now; hand back the old
  // value so a failed write can be rolled back.
  const optimistic = useCallback(
    async (patch: (old: OnboardingStatus) => OnboardingStatus) => {
      await utils.onboarding.getStatus.cancel();
      const previous = utils.onboarding.getStatus.getData();
      utils.onboarding.getStatus.setData(undefined, (old) =>
        old ? patch(old) : old,
      );
      return { previous };
    },
    [utils],
  );
  const rollback = useCallback(
    (context: { previous?: OnboardingStatus } | undefined) => {
      if (context?.previous) {
        utils.onboarding.getStatus.setData(undefined, context.previous);
      }
    },
    [utils],
  );

  const dismissMutation = api.onboarding.dismiss.useMutation({
    // Same shape the server returns for a dismissed member.
    onMutate: () =>
      optimistic((old) => ({ ...old, dismissed: true, checklist: [] })),
    onError: (_error, _input, context) => {
      rollback(context);
      toast.error(t("reminder.dismissFailed"));
    },
    onSettled: refresh,
  });

  const restoreMutation = api.onboarding.restore.useMutation({
    // The steps are not in the cache for a dismissed member (the server skips
    // them); the refetch in onSettled brings them.
    onMutate: () => optimistic((old) => ({ ...old, dismissed: false })),
    onSuccess: () => {
      // The member asked to see the checklist: an earlier "hide until next
      // visit" in this browser session no longer applies.
      clearHiddenForVisit();
    },
    onError: (_error, _input, context) => {
      rollback(context);
      toast.error(t("setting.restoreFailed"));
    },
    onSettled: refresh,
  });

  const { mutate: runDismiss } = dismissMutation;
  const { mutate: runRestore } = restoreMutation;
  const dismiss = useCallback(() => runDismiss(), [runDismiss]);
  const restore = useCallback(() => runRestore(), [runRestore]);

  return {
    dismiss,
    restore,
    isPending: dismissMutation.isPending || restoreMutation.isPending,
  };
}
