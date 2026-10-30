import { HUB_FORUM_PATH } from "@/server/communities/forum-scope";
import { HUB_SLUG } from "@/server/communities/hub";
import { routing } from "@/i18n/routing";
import { localeFromPathname, stripLocalePrefix } from "@/i18n/locale-path";

/** Locale-free Hub community path. Middleware prefixes `/en` or `/nl`. */
export const HUB_COMMUNITY_PATH = `/communities/${HUB_SLUG}`;

/** Signed-in chrome: Open Hub (forum). Never the /en/join door. */
export const HUB_OPEN_HREF = HUB_FORUM_PATH;

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
  return stripLocalePrefix(path) === "/";
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
  const pathWithoutLocale = stripLocalePrefix(pathname);
  const alias = resolveAuthAlias(pathWithoutLocale);
  if (!alias) return null;
  const locale = localeFromPathname(pathname) ?? routing.defaultLocale;
  return `/${locale}${alias}${search}`;
}

/**
 * `/join` is the indexable Hub door. Guests stay on the page (200).
 * Signed-in members go to Hub. Invite codes stay on `/join/:code` →
 * `/invite/:code`. The signup form itself stays under `/auth/`.
 */
export function getJoinPageRedirect(args: {
  hasSession: boolean;
  locale: string;
}): string | null {
  if (args.hasSession) return getHubCommunityPath(args.locale);
  return null;
}

/** Locale-free signup path for the join-door CTA. Preserves invite query. */
export function getJoinSignupHref(search = ""): string {
  return `/auth/signup${search}`;
}

/**
 * Locale-prefixed public join door: `/en/join`, `/nl/join`.
 *
 * Guests are not redirected — the page is the indexable door. Signed-in
 * members still hop to Hub. Bare `/join` is left for next-intl so it can
 * prefix `en` or `nl`. `/join/:code` stays an invite alias.
 */
export function getJoinDoorRedirect(
  pathname: string,
  hasSession: boolean,
  search = "",
): string | null {
  const locale = localeFromPathname(pathname);
  if (!locale) return null;
  const pathWithoutLocale = stripLocalePrefix(pathname);
  const joinDoor = pathWithoutLocale.replace(/\/+$/, "") || "/";
  if (joinDoor !== "/join") return null;
  const dest = getJoinPageRedirect({ hasSession, locale });
  return dest ? `${dest}${search}` : null;
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
