/**
 * Routes where the earning moment waits instead of interrupting. Paths are
 * locale-less (next-intl's usePathname).
 * - /auth/*: sign-in, sign-up and password flows need the member's focus.
 * - /dashboard/onboarding: the member is answering the welcome questions.
 */
const QUIET_ROUTE_PREFIXES = ["/auth", "/dashboard/onboarding"] as const;

export function isCelebrationRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return !QUIET_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
