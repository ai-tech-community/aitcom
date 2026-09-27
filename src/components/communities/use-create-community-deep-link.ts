"use client";

import { useEffect, useRef } from "react";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { CREATE_COMMUNITY_PARAM } from "./create-community-link";

/**
 * Opens the create-community dialog when the page was reached through
 * `?create=1` (e.g. the homepage "Host your community" button).
 *
 * - Waits until the client session is known, so a signed-in member never
 *   sees the guest prompt.
 * - Guests get the standard sign-in dialog; its return path keeps
 *   `?create=1`, so the dialog opens once they come back signed in.
 * - The param is removed from the URL right away (history.replaceState), so
 *   refresh / back does not reopen the dialog unexpectedly.
 */
export function useCreateCommunityDeepLink(
  open: () => void,
  intent: string,
): void {
  const { requireAuth, authStatus } = useRequireAuth();
  const handled = useRef(false);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });

  useEffect(() => {
    if (handled.current || authStatus === "pending") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(CREATE_COMMUNITY_PARAM) !== "1") return;
    handled.current = true;

    const returnTo = `${url.pathname}${url.search}`;
    url.searchParams.delete(CREATE_COMMUNITY_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );

    requireAuth(() => openRef.current(), intent, { returnTo });
  }, [authStatus, intent, requireAuth]);
}
