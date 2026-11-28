"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
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
   * The host element now, if it is attached. Called directly inside a
   * layout effect of the commit that attaches the host, it returns
   * undefined (the owner's effect runs after its children's); everywhere
   * else, including a dialog asked for from that layout effect and
   * rendered later, it sees the host.
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

// Two contexts: the element changes once (null, then the attached node) and
// re-renders the portals that render into it; the scope's host never
// changes, so code that only opens layers later is not re-rendered by it.
const ContainerContext = createContext<HTMLElement | null>(null);
const HostContext = createContext<PortalHost>(NO_HOST);

export function PortalContainerProvider({
  container,
  host,
  children,
}: {
  /** The host element; null until it has mounted. */
  container: HTMLElement | null;
  /**
   * The host for code that opens a layer later: a stable object whose
   * `resolve` reads the element its owner attaches and whose `subscribe`
   * reports attach and detach. Defaults to `container`, never reporting.
   */
  host?: PortalHost;
  children: ReactNode;
}) {
  const containerHost = useMemo<PortalHost>(
    () => ({
      resolve: () => container ?? undefined,
      subscribe: NO_HOST.subscribe,
    }),
    [container],
  );
  return (
    <HostContext.Provider value={host ?? containerHost}>
      <ContainerContext.Provider value={container}>
        {children}
      </ContainerContext.Provider>
    </HostContext.Provider>
  );
}

/**
 * The host element for a floating layer, or `undefined` for Radix's default
 * (`document.body`). Pass it as the Radix `Portal`'s `container`.
 *
 * Undefined on the first render, like Radix's own guard: given a container,
 * Radix portals at once, so content in a Suspense boundary that hydrates
 * after the host exists would render markup the server did not. It flips
 * in the same layout phase as Radix's guard, so nothing shows on `body`
 * first.
 */
export function usePortalContainer(): HTMLElement | undefined {
  const container = useContext(ContainerContext);
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => {
    setMounted(true);
  }, []);
  return mounted ? (container ?? undefined) : undefined;
}

/** The host for opening a layer from an event or effect. */
export function usePortalHost(): PortalHost {
  return useContext(HostContext);
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
