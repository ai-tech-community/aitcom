import { createHash } from "crypto";

/**
 * Get avatar URL for a user. Priority:
 * 1. GitHub OAuth image (user.image)
 * 2. Gravatar via email hash
 * 3. null (render initials in component)
 */
export function getAvatarUrl(
  email: string,
  image?: string | null,
  size = 80,
): string | null {
  if (image) return image;

  if (email) {
    const hash = createHash("md5")
      .update(email.trim().toLowerCase())
      .digest("hex");
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
  }

  return null;
}

/**
 * Get initials from a display name for fallback avatar.
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
