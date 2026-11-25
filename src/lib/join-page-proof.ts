import { stripLocalePrefix } from "@/i18n/locale-path";
import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

/**
 * Public join-page proof. Both lists ship empty.
 *
 * Add a member only after they agree to be named on /join. Set
 * `testimonialConsent` to true and leave `photoUrl` unset when they have
 * no photo — the strip draws initials and never a broken image.
 *
 * Point the weekly question at a discussion that already exists, using
 * its path (`/communities/ait/forum/the-thread` or `/forum/the-thread`)
 * or the same path on https://www.aitcommunity.org. Leave it null to hide
 * the block. Do not invent a thread.
 */
export type JoinMemberProofInput = {
  name: string;
  role: string;
  /** One line they agreed to show. */
  line: string;
  /** https URL or a site path. Omit when there is no photo. */
  photoUrl?: string;
  /** Explicit yes to be quoted on the public join page. */
  testimonialConsent: boolean;
};

export type ConsentedJoinMember = {
  name: string;
  role: string;
  line: string;
  photoUrl?: string;
  testimonialConsent: true;
};

export type JoinWeeklyQuestionInput = {
  /** On-site forum thread path, or the same thread's public URL. */
  threadPath: string;
  /** The question, as the thread states it. */
  title: string;
};

export type JoinWeeklyQuestion = {
  href: string;
  title: string;
};

/** Consented quotes. Empty until a real member agrees. */
export const JOIN_MEMBER_PROOF: readonly JoinMemberProofInput[] = [];

/** This week's thread. Null hides the block. */
export const JOIN_WEEKLY_QUESTION: JoinWeeklyQuestionInput | null = null;

const SITE_ORIGINS = new Set([
  CANONICAL_PRODUCTION_ORIGIN,
  "https://aitcommunity.org",
]);

const THREAD_SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";

/** A discussion thread, not the forum index or the composer. */
const THREAD_PATH = new RegExp(
  `^/(?:forum/(?!new$)(?:${THREAD_SLUG})|communities/(?:${THREAD_SLUG})/forum/(?:${THREAD_SLUG}))$`,
);

export function consentedJoinMembers(
  entries: readonly JoinMemberProofInput[],
): ConsentedJoinMember[] {
  const members: ConsentedJoinMember[] = [];
  for (const entry of entries) {
    if (entry.testimonialConsent !== true) continue;
    const name = entry.name.trim();
    const role = entry.role.trim();
    const line = entry.line.trim();
    if (!name || !role || !line) continue;
    const photoUrl = publicPhotoUrl(entry.photoUrl);
    members.push({
      name,
      role,
      line,
      ...(photoUrl ? { photoUrl } : {}),
      testimonialConsent: true,
    });
  }
  return members;
}

export function resolveJoinWeeklyQuestion(
  question: JoinWeeklyQuestionInput | null,
): JoinWeeklyQuestion | null {
  if (!question) return null;
  const title = question.title.trim();
  if (title.length < 3) return null;
  const href = forumThreadPath(question.threadPath);
  if (!href) return null;
  return { title, href };
}

/** Up to two letters for the initials tile. */
export function joinMemberInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
}

function publicPhotoUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.startsWith("//")) return undefined;
  if (trimmed.startsWith("/")) {
    if (
      trimmed.includes("?") ||
      trimmed.includes("#") ||
      trimmed.includes("\\")
    ) {
      return undefined;
    }
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function forumThreadPath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let path = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    if (!SITE_ORIGINS.has(url.origin)) return null;
    path = url.pathname;
  } else if (
    trimmed.includes("?") ||
    trimmed.includes("#") ||
    trimmed.includes("\\")
  ) {
    return null;
  }
  if (!path.startsWith("/")) return null;
  const localeFree = stripLocalePrefix(path);
  const normalized = localeFree.replace(/\/+$/, "") || "/";
  if (!THREAD_PATH.test(normalized)) return null;
  return normalized;
}
