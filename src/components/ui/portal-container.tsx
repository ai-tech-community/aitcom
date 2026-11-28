"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Where floating layers (dialogs, menus, popovers, tooltips, selects, sheets)
 * mount. Outside a provider they go to `document.body`, as Radix does by
 * default. A part of the page that re-declares the site's tokens (a community
 * look) provides a host element that carries the same tokens, so a layer it
 * opens matches it instead of falling back to the house look.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
  container,
  children,
}: {
  /** The host element; null until it has mounted. */
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}

/**
 * The host element for a floating layer, or `undefined` for Radix's default
 * (`document.body`). Pass it as the Radix `Portal`'s `container`.
 */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
