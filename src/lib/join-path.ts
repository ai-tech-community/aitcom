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
 * Locale-prefixed public join door: `/en/join`, `/nl/join`.
 *
 * Bare `/join` is left for next-intl so it can prefix `en` or `nl` from
 * the cookie / Accept-Language (same hop prod already does). After that
 * prefix, middleware resolves the door so the request does not depend on
 * `join/page.tsx` being in the route table. `/join/:code` stays an invite
 * alias.
 */
export function getJoinDoorRedirect(
  pathname: string,
  hasSession: boolean,
  search = "",
): string | null {
  const localeMatch = /^\/(en|nl)(?=\/|$)/.exec(pathname);
  if (!localeMatch) return null;
  const locale = localeMatch[1]!;
  const pathWithoutLocale = pathname.slice(locale.length + 1) || "/";
  const joinDoor = pathWithoutLocale.replace(/\/+$/, "") || "/";
  if (joinDoor !== "/join") return null;
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
