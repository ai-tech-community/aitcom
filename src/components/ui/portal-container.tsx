"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Where floating layers (dialogs, menus, popovers, tooltips, selects, sheets)
 * mount. Outside a provider they go to `document.body`, as Radix does by
 * default. A part of the page that re-declares the site's tokens (a community
 * look) provides a host element that carries the same tokens, so a layer it
 * opens matches it instead of falling back to the house look.
 */
type PortalContainerContextValue = {
  /** The host element for rendering; null until it has mounted. */
  container: HTMLElement | null;
  /**
   * The host element at the moment it is called, for code that opens a
   * layer later from an event or effect (`useConfirm`, `useRequireAuth`).
   * It sees the host as soon as the host exists, even from an effect in the
   * same commit, where `container` is still the first render's null.
   */
  resolve: () => HTMLElement | undefined;
};

const resolveNothing = () => undefined;

const PortalContainerContext = createContext<PortalContainerContextValue>({
  container: null,
  resolve: resolveNothing,
});

export function PortalContainerProvider({
  container,
  resolve,
  children,
}: {
  /** The host element; null until it has mounted. */
  container: HTMLElement | null;
  /**
   * Reads the host element when called. Pass a stable function (one that
   * reads a ref the host's owner sets when it creates the host); defaults
   * to returning `container`.
   */
  resolve?: () => HTMLElement | undefined;
  children: ReactNode;
}) {
  return (
    <PortalContainerContext.Provider
      value={{
        container,
        resolve: resolve ?? (() => container ?? undefined),
      }}
    >
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
 * A function that returns the host element when called, for opening a
 * layer from an event or effect. Stable when the provider's `resolve` is.
 */
export function usePortalContainerResolver(): () => HTMLElement | undefined {
  return useContext(PortalContainerContext).resolve;
}
