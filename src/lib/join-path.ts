import { HUB_SLUG } from "@/server/communities/hub";

/** Locale-free Hub community path. Middleware prefixes `/en` or `/nl`. */
export const HUB_COMMUNITY_PATH = `/communities/${HUB_SLUG}`;

const AUTH_ALIASES: Record<string, "/auth/signup" | "/auth/signin"> = {
  "/signup": "/auth/signup",
  "/sign-up": "/auth/signup",
  "/signin": "/auth/signin",
  "/sign-in": "/auth/signin",
};

/** Locale-prefixed Hub path for post-auth / verify callbacks. */
export function getHubCommunityPath(locale?: string): string {
  if (!locale) return HUB_COMMUNITY_PATH;
  return `/${locale}${HUB_COMMUNITY_PATH}`;
}

/** Marketing homepage paths — never a post-auth landing. */
export function isMarketingHomePath(value: string): boolean {
  const path = (value.split("?")[0] ?? value).replace(/\/+$/, "") || "/";
  return path === "/" || path === "/en" || path === "/nl";
}

/**
 * Map guessed URLs (`/signup`, `/sign-in`) onto the real auth routes.
 * `pathWithoutLocale` is `/signup` even when the request was `/nl/signup`.
 */
export function resolveAuthAlias(
  pathWithoutLocale: string,
): "/auth/signup" | "/auth/signin" | null {
  return AUTH_ALIASES[pathWithoutLocale] ?? null;
}

/** Locale-prefixed redirect for guessed `/signup` / `/sign-in` URLs. */
export function getAuthAliasRedirect(
  pathname: string,
  search = "",
): string | null {
  const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, "") || "/";
  const alias = resolveAuthAlias(pathWithoutLocale);
  if (!alias) return null;
  const locale = pathname.startsWith("/nl") ? "nl" : "en";
  return `/${locale}${alias}${search}`;
}

/**
 * `/join` is the human entry: guests start signup, members land in Hub.
 * Invite codes stay on `/join/:code` → `/invite/:code`.
 */
export function getJoinPageRedirect(args: {
  hasSession: boolean;
  locale: string;
}): string {
  if (args.hasSession) return getHubCommunityPath(args.locale);
  return `/${args.locale}/auth/signup`;
}

/**
 * Public join door at the edge: `/join`, `/en/join`, `/nl/join`.
 *
 * The page at `app/[locale]/join/page.tsx` does the same redirect, but a
 * request that never receives a locale prefix is matched as
 * `[locale]=join` and `hasLocale` 404s. Middleware must resolve the door
 * before next-intl, the same way `/signup` is aliased. `/join/:code`
 * stays an invite alias.
 */
export function getJoinDoorRedirect(
  pathname: string,
  hasSession: boolean,
  search = "",
): string | null {
  const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, "") || "/";
  const joinDoor = pathWithoutLocale.replace(/\/+$/, "") || "/";
  if (joinDoor !== "/join") return null;
  const locale = pathname.startsWith("/nl") ? "nl" : "en";
  return `${getJoinPageRedirect({ hasSession, locale })}${search}`;
}

/** First-session bring-an-agent card: Hub members who have not brought one in. */
export function shouldShowFirstSessionPath(args: {
  slug: string;
  isMember: boolean;
  hasAgent: boolean | undefined;
  agentQueryReady: boolean;
}): boolean {
  return (
    args.slug === HUB_SLUG &&
    args.isMember &&
    args.agentQueryReady &&
    args.hasAgent === false
  );
}
