export type ClassroomCreatePolicy = "all_members" | "admins_only";
export type CommunityRole = "owner" | "admin" | "moderator" | "member";

/** Completed lessons / total, rounded, clamped 0..100. */
export function courseProgressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/** May this role create a course under the community's policy? null = not a member. */
export function canCreateCourse(
  policy: ClassroomCreatePolicy,
  role: CommunityRole | null,
): boolean {
  if (role === null) return false;
  if (policy === "admins_only") return role === "owner" || role === "admin";
  return true; // all_members: any active member
}

/** Convert a YouTube watch/youtu.be URL to an embed URL, or null if not YouTube/malformed. */
export function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.endsWith("youtube.com")) {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
