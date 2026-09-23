"use client";

import * as React from "react";

import { Link, useRouter } from "@/i18n/navigation";
import { LIVE_INVESTIGATION_PATH } from "@/lib/investigations/datacenter-flag-method";
import { cn } from "@/lib/utils";

type Navigate = (query: string, options?: { replace?: boolean }) => void;

const FacilitiesNavigationContext = React.createContext<{
  isPending: boolean;
  navigate: Navigate;
} | null>(null);

export function facilitiesHref(query: string): string {
  return query
    ? `${LIVE_INVESTIGATION_PATH}?${query}`
    : LIVE_INVESTIGATION_PATH;
}

/**
 * Every control that changes the table's URL (filters, sort headers, pages)
 * navigates through one transition, so the results can show they are updating
 * while the server renders the next view.
 */
export function FacilitiesNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const navigate = React.useCallback<Navigate>(
    (query, options) => {
      startTransition(() => {
        const href = facilitiesHref(query);
        if (options?.replace) router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [router],
  );

  const value = React.useMemo(
    () => ({ isPending, navigate }),
    [isPending, navigate],
  );
  return (
    <FacilitiesNavigationContext.Provider value={value}>
      {children}
    </FacilitiesNavigationContext.Provider>
  );
}

export function useFacilitiesNavigation() {
  const ctx = React.useContext(FacilitiesNavigationContext);
  if (!ctx) {
    throw new Error(
      "useFacilitiesNavigation must be used inside <FacilitiesNavigationProvider>",
    );
  }
  return ctx;
}

/** Dims the results while the next view renders. Content stays readable and in place. */
export function FacilitiesResults({ children }: { children: React.ReactNode }) {
  const { isPending } = useFacilitiesNavigation();
  return (
    <div
      aria-busy={isPending}
      className={cn(
        "flex flex-col gap-4 transition-opacity duration-200 motion-reduce:transition-none",
        isPending && "opacity-60",
      )}
    >
      {children}
    </div>
  );
}

/**
 * A real link to another table view (works without JavaScript, opens in a new
 * tab on modifier-click) that routes plain clicks through the shared transition.
 */
export function FacilitiesLink({
  query,
  onClick,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { query: string }) {
  const { navigate } = useFacilitiesNavigation();
  return (
    <Link
      href={facilitiesHref(query)}
      scroll={false}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        navigate(query);
      }}
      {...props}
    />
  );
}
