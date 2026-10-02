import "server-only";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { routing } from "@/i18n/routing";
import { getAvatarUrl } from "@/lib/avatar";
import { calculateLevel } from "@/lib/gamification";
import { buildOgMeta, localeAlternates } from "@/lib/metadata";
import { profileTabHref, type ProfileTab } from "@/lib/member-profile-routes";
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
