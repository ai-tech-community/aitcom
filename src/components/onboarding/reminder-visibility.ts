import type { OnboardingChecklistView } from "./checklist-view";

/**
 * Routes where the floating reminder stays out of the way. Paths are
 * locale-less (next-intl's usePathname).
 * - /auth/*: sign-in, sign-up and password flows need the member's full focus.
 * - /dashboard: the full checklist card is already on the page.
 * - /dashboard/onboarding: the member is answering the welcome questions.
 */
const HIDDEN_ROUTE_PREFIXES = ["/auth"] as const;
const HIDDEN_ROUTES = ["/dashboard", "/dashboard/onboarding"] as const;

function normalize(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function isReminderRoute(pathname: string): boolean {
  const path = normalize(pathname);
  if ((HIDDEN_ROUTES as readonly string[]).includes(path)) return false;
  return !HIDDEN_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Whether the floating "Getting started" pill shows. Guests never reach
 * this (SessionChrome mounts it for signed-in members only).
 */
export function shouldShowReminder({
  pathname,
  view,
  hiddenForVisit,
}: {
  pathname: string;
  view: OnboardingChecklistView;
  /** Member chose "hide until next visit" in this browser session. */
  hiddenForVisit: boolean;
}): boolean {
  if (hiddenForVisit) return false;
  if (!isReminderRoute(pathname)) return false;
  return view.kind !== "hidden";
}
