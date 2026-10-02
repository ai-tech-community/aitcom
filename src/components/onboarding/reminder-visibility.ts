import type { OnboardingChecklistView } from "./checklist-view";

/**
 * Routes where the floating reminder stays out of the way. Paths are
 * locale-less (next-intl's usePathname).
 * - /auth/*: sign-in, sign-up and password flows need the member's full focus.
 * - /dashboard and /dashboard/*: every member dashboard tab shows the "Get
 *   started" card in its side panel, and /dashboard/onboarding is where the
 *   member answers the welcome questions.
 * - Except /dashboard/agent/*: the agent workspace sits outside the member
 *   dashboard frame, so it has no side panel and the reminder shows there.
 */
const HIDDEN_ROUTE_PREFIXES = ["/auth", "/dashboard"] as const;
const SHOWN_ROUTE_PREFIXES = ["/dashboard/agent"] as const;

function normalize(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function isUnder(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function isReminderRoute(pathname: string): boolean {
  const path = normalize(pathname);
  if (isUnder(path, SHOWN_ROUTE_PREFIXES)) return true;
  return !isUnder(path, HIDDEN_ROUTE_PREFIXES);
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
