"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-run the current page's server component (its data loads) without a
 * full reload: the retry for a dashboard section whose data the server
 * loaded. `refreshing` stays true until the fresh render arrives.
 */
export function useServerRefresh(): {
  refresh: () => void;
  refreshing: boolean;
} {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const refresh = useCallback(
    () => startTransition(() => router.refresh()),
    [router],
  );
  return { refresh, refreshing };
}
