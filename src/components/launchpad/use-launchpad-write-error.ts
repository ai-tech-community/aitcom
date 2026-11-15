"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRulesModal } from "@/components/community/rules-provider";

/** What the server says when a write needs the community's rules accepted. */
export const RULES_NOT_ACCEPTED = "RULES_NOT_ACCEPTED";

/** The server's neutral refusal for a non-member (content-access.ts). */
const NOT_AN_ACTIVE_MEMBER = "Must be an active community member";

type WriteError = {
  message: string;
  data?: { code?: string } | null;
};

/**
 * The answer to a refused vote or comment on a Launchpad project. A
 * project of a community needs that community's rules accepted and an
 * active member (ADR-0050): the rules prompt opens for the project's own
 * community, not the Hub's, and a non-member is told to join. Returns
 * whether the error was one of these, so callers keep their own fallback.
 */
export function useLaunchpadWriteError() {
  const t = useTranslations("launchpad.vote");
  const { openRulesModal } = useRulesModal();
  return useCallback(
    (error: WriteError, communitySlug: string | null | undefined): boolean => {
      if (error.message === RULES_NOT_ACCEPTED) {
        openRulesModal(communitySlug ?? undefined);
        return true;
      }
      if (
        error.data?.code === "FORBIDDEN" &&
        error.message === NOT_AN_ACTIVE_MEMBER
      ) {
        toast.error(t("membersOnly"));
        return true;
      }
      return false;
    },
    [openRulesModal, t],
  );
}
