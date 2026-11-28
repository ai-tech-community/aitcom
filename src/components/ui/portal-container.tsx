"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * Where floating layers (dialogs, menus, popovers, tooltips, selects, sheets)
 * mount. Outside a provider they go to `document.body`, as Radix does by
 * default. A part of the page that re-declares the site's tokens (a community
 * look) provides a host element that carries the same tokens, so a layer it
 * opens matches it instead of falling back to the house look.
 */

/**
 * The host as code that opens a layer later (from an event or an effect)
 * sees it: `useConfirm` and `useRequireAuth`, whose dialogs the site root
 * renders, outside the part of the page that asked.
 */
export type PortalHost = {
  /**
   * The host element now, if it is attached. A passive effect of the
   * commit that creates the host already sees it; a layout effect of that
   * commit does not, and its layer opens on `body`.
   */
  resolve: () => HTMLElement | undefined;
  /**
   * Calls `listener` whenever the host is attached or detached (its owner
   * left the page, Strict Mode re-ran its effects, a Suspense boundary hid
   * it). A layer rendered into the host re-checks `resolve()` then, so it
   * moves to `body` instead of staying, unseen, in a detached node.
   */
  subscribe: (listener: () => void) => () => void;
};

const NO_HOST: PortalHost = {
  resolve: () => undefined,
  subscribe: () => () => undefined,
};

type PortalContainerContextValue = {
  /** The host element for rendering; null until it has mounted. */
  container: HTMLElement | null;
  host: PortalHost;
};

const PortalContainerContext = createContext<PortalContainerContextValue>({
  container: null,
  host: NO_HOST,
});

export function PortalContainerProvider({
  container,
  host,
  children,
}: {
  /** The host element; null until it has mounted. */
  container: HTMLElement | null;
  /**
   * The host for code that opens a layer later. Pass a stable object whose
   * `resolve` reads the element its owner attaches and whose `subscribe`
   * reports attach and detach; defaults to `container`, never changing.
   */
  host?: PortalHost;
  children: ReactNode;
}) {
  const resolveContainer = useCallback(
    () => container ?? undefined,
    [container],
  );
  const value = useMemo(
    () => ({
      container,
      host: host ?? { resolve: resolveContainer, subscribe: NO_HOST.subscribe },
    }),
    [container, host, resolveContainer],
  );
  return (
    <PortalContainerContext.Provider value={value}>
      {children}
    </PortalContainerContext.Provider>
  );
}

/**
 * The host element for a floating layer, or `undefined` for Radix's default
 * (`document.body`). Pass it as the Radix `Portal`'s `container`.
 */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext).container ?? undefined;
}

/**
 * The host for opening a layer from an event or effect. Stable when the
 * provider's `host` is.
 */
export function usePortalHost(): PortalHost {
  return useContext(PortalContainerContext).host;
}

const noHost = () => null;

/**
 * The element of `host` while it is attached, else null (`body`), kept
 * current as the host attaches and detaches. For a site-root dialog that
 * renders into the host of the part of the page that asked for it.
 */
export function useAttachedHost(
  host: PortalHost | undefined,
): HTMLElement | null {
  const subscribe = host?.subscribe ?? NO_HOST.subscribe;
  const getSnapshot = useCallback(() => host?.resolve() ?? null, [host]);
  return useSyncExternalStore(subscribe, getSnapshot, noHost);
}
