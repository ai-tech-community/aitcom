/**
 * The bottom-right dock (owned by InboxRoot). A dock item that removes itself
 * while it has focus (e.g. the getting-started reminder after "hide") hands
 * focus to the dock's home control instead of dropping it on <body>
 * (WCAG 2.4.3).
 */
export const DOCK_HOME_ATTR = "data-dock-home";

/** Focus the dock's home control (the inbox pill), else the page's <main>. */
export function focusDockHome(): void {
  const home = document.querySelector<HTMLElement>(`[${DOCK_HOME_ATTR}]`);
  if (home) {
    home.focus();
    return;
  }
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return;
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: true });
}
