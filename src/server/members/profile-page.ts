import "server-only";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { routing } from "@/i18n/routing";
import { getAvatarUrl } from "@/lib/avatar";
import { catalogBadge, type CatalogBadge } from "@/lib/badges/catalog";
import { calculateLevel } from "@/lib/gamification";
import {
  buildAlternates,
  buildOgImageMeta,
  buildOgMeta,
  localeAlternates,
} from "@/lib/metadata";
import {
  badgeShareHref,
  badgeShareImageHref,
  profileTabHref,
  type ProfileTab,
} from "@/lib/member-profile-routes";
import type { DisplayableBadge } from "@/server/members/displayable-badges";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import {
  loadAgentPageAccess,
  loadAgentProfilePage,
} from "@/server/members/agent-profile";
import { api } from "@/trpc/server";

/**
 * Loaders for the member profile frame (`/members/[id]` and its tabs). Each
 * is cached per request, so the layout, the tab page and their metadata
 * share one read.
 *
 * Visibility is decided once, by `members.getPublicProfile`. The layout and
 * every tab page call `requireMemberFrame` or `requireMemberProfile`
 * themselves (a layout does not re-run on tab navigation), and the tab
 * procedures apply the same rule on the server, so no page re-implements it.
 */

type Locale = (typeof routing.locales)[number];

function toLocale(locale: string): Locale {
  return routing.locales.find((l) => l === locale) ?? routing.defaultLocale;
}

export const getMemberProfile = cache((userId: string) =>
  api.members.getPublicProfile({ userId }),
);

export type MemberProfileData = NonNullable<
  Awaited<ReturnType<typeof getMemberProfile>>
>;

/** The profile this viewer may see, or a 404. */
export async function requireMemberProfile(
  userId: string,
): Promise<MemberProfileData> {
  const data = await getMemberProfile(userId);
  if (!data) notFound();
  return data;
}

/**
 * What the frame shows: the profile, or — only for the signed-in owner who
 * has no profile yet — their account name and avatar, so they can reach
 * their agent and set up the profile. Null (a 404) for everyone else.
 */
export type MemberFrame =
  | { kind: "profile"; data: MemberProfileData }
  | { kind: "setup"; name: string; avatarUrl: string | null };

export const getMemberFrame = cache(
  async (userId: string): Promise<MemberFrame | null> => {
    const data = await getMemberProfile(userId);
    if (data) return { kind: "profile", data };
    // The owner always loads their own profile when it exists, so this is
    // an owner without a profile row.
    const viewer = (await getSession())?.user;
    if (viewer?.id !== userId) return null;
    return {
      kind: "setup",
      name: viewer.name || viewer.email,
      avatarUrl: getAvatarUrl(viewer.email, viewer.image),
    };
  },
);

/** The frame this viewer may see, or a 404. */
export async function requireMemberFrame(userId: string): Promise<MemberFrame> {
  const frame = await getMemberFrame(userId);
  if (!frame) notFound();
  return frame;
}

/**
 * Whether this viewer may see the member's agent page (the Agent tab),
 * from a minimal read. Null when they may not.
 */
export const getMemberAgentAccess = cache(async (ownerId: string) => {
  const session = await getSession();
  return loadAgentPageAccess(db, {
    ownerId,
    viewerId: session?.user.id ?? null,
  });
});

/** The full agent page for this viewer, or null when they may not see it. */
export const getMemberAgentPage = cache(async (ownerId: string) => {
  const session = await getSession();
  return loadAgentProfilePage(db, {
    ownerId,
    viewerId: session?.user.id ?? null,
  });
});

export const getMemberCommunities = cache((userId: string) =>
  api.members.getPublicCommunities({ userId }),
);

export const getMemberActivity = cache((userId: string) =>
  api.members.getPublicActivity({ userId }),
);

export const getMemberWork = cache((userId: string, locale: string) =>
  api.members.getPublicWork({ userId, locale: toLocale(locale) }),
);

export const getMemberRecentWork = cache((userId: string, locale: string) =>
  api.members.getPublicRecentWork({ userId, locale: toLocale(locale) }),
);

export const getMemberAwards = cache((userId: string) =>
  api.members.getPublicAwards({ userId }),
);

/** Badge rarity for every catalog badge (cached for an hour on the server). */
export const getBadgeRarityReport = cache(() => api.badges.rarity());

/**
 * The signed-in member's own progress on every track. Call it only for the
 * owner's view: it is the caller's progress, never the profile's member's.
 */
export const getMyBadgeProgress = cache(() => api.badges.myProgress());

/**
 * Metadata for a profile tab: the member's name (with the tab for the
 * others), their bio as description, and no indexing while visitors cannot
 * see the profile (only the owner can load it then).
 */
export async function profileTabMetadata({
  userId,
  locale,
  tab,
}: {
  userId: string;
  locale: string;
  tab: Exclude<ProfileTab, "agent">;
}): Promise<Metadata> {
  const data = await getMemberProfile(userId);
  if (!data) {
    // The owner setting up their profile: their own page, never indexed.
    const frame = await getMemberFrame(userId);
    return frame?.kind === "setup"
      ? { title: frame.name, robots: { index: false, follow: false } }
      : {};
  }
  const t = await getTranslations({
    locale: toLocale(locale),
    namespace: "memberProfile.meta",
  });
  const name = data.profile.displayName;
  const title = tab === "overview" ? name : t(tab, { name });
  const description = data.profile.bio
    ? data.profile.bio.slice(0, 160)
    : t("description", { level: calculateLevel(data.profile.xp) });

  return {
    title,
    description,
    ...buildOgMeta(title, description),
    alternates: await localeAlternates(profileTabHref(userId, tab)),
    ...(data.reach.kind !== "public"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

/** A badge a member holds, as its share page shows it. */
export interface MemberBadgeShare {
  data: MemberProfileData;
  badge: CatalogBadge;
  earnedAt: DisplayableBadge["earnedAt"];
}

/**
 * A badge's share page: the member's profile (under the same visibility
 * rule as every tab) and the badge, when the member holds it and it is
 * displayable. Null otherwise, so the page, its metadata and its image all
 * 404 alike.
 */
export const getMemberBadge = cache(
  async (userId: string, slug: string): Promise<MemberBadgeShare | null> => {
    const badge = catalogBadge(slug);
    if (!badge) return null;
    const data = await getMemberProfile(userId);
    const held = data?.badges.find((entry) => entry.slug === badge.slug);
    return data && held ? { data, badge, earnedAt: held.earnedAt } : null;
  },
);

/** The badge share this viewer may see, or a 404. */
export async function requireMemberBadge(
  userId: string,
  slug: string,
): Promise<MemberBadgeShare> {
  const share = await getMemberBadge(userId, slug);
  if (!share) notFound();
  return share;
}

/**
 * Metadata for a badge's share page: "{name} earned {badge}", the badge's
 * description, the badge's own Open Graph image, and no indexing while
 * visitors cannot see the profile.
 */
export async function badgePageMetadata({
  userId,
  slug,
  locale,
}: {
  userId: string;
  slug: string;
  locale: string;
}): Promise<Metadata> {
  const share = await getMemberBadge(userId, slug);
  if (!share) return {};
  const resolved = toLocale(locale);
  const [t, tBadges] = await Promise.all([
    getTranslations({ locale: resolved, namespace: "badgeMoment.share" }),
    getTranslations({ locale: resolved, namespace: "badges" }),
  ]);
  const { badge, data } = share;
  const title = t("metaTitle", {
    name: data.profile.displayName,
    badge: tBadges(badge.nameKey),
  });
  const description = tBadges(badge.descriptionKey, badge.descriptionValues);
  return {
    title,
    description,
    ...buildOgImageMeta(
      title,
      description,
      `/${resolved}${badgeShareImageHref(userId, badge.slug)}`,
    ),
    alternates: buildAlternates(badgeShareHref(userId, badge.slug), resolved),
    ...(data.reach.kind !== "public"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
