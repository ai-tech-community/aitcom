"use client";

import { useEffect, useRef } from "react";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import {
  CREATE_COMMUNITY_ANCHOR_PARAM,
  CREATE_COMMUNITY_PARAM,
  createCommunityReturnTo,
} from "./create-community-link";

/**
 * Opens the create-community dialog when the page was reached through
 * `?create=1` (e.g. the homepage "Host your community" button).
 *
 * - Acts only once the session is known (not pending, not a failed fetch),
 *   so a signed-in member never sees the guest prompt.
 * - Guests get the standard sign-in dialog; its return path keeps
 *   `?create=1`, so the dialog opens once they come back signed in.
 * - The param is removed from the URL right away (history.replaceState), so
 *   refresh / back does not reopen the dialog unexpectedly.
 */
export function useCreateCommunityDeepLink(
  open: () => void,
  intent: string,
  description?: string,
): void {
  const { requireAuth, authStatus } = useRequireAuth();
  const handled = useRef(false);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    // Only act once we know who this is; a failed session fetch ("unknown")
    // must not send a signed-in member to sign-in.
    if (
      handled.current ||
      (authStatus !== "authenticated" && authStatus !== "guest")
    ) {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get(CREATE_COMMUNITY_PARAM) !== "1") return;
    handled.current = true;

    const redesigned = isOpenCommunitiesEnabled();
    const returnTo = redesigned
      ? createCommunityReturnTo(url)
      : `${url.pathname}${url.search}`;
    url.searchParams.delete(CREATE_COMMUNITY_PARAM);
    const anchor = redesigned
      ? url.searchParams.get(CREATE_COMMUNITY_ANCHOR_PARAM)
      : null;
    if (redesigned) url.searchParams.delete(CREATE_COMMUNITY_ANCHOR_PARAM);
    if (anchor && !url.hash) {
      url.hash = anchor;
      document.getElementById(anchor)?.scrollIntoView();
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );

    requireAuth(() => openRef.current(), intent, {
      returnTo,
      ...(redesigned && { description }),
    });
  }, [authStatus, intent, description, requireAuth]);
}
